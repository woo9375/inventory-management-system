const fs = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures/browser');
const { hasBaseUrl, hasCredentials, missingEnvReason, login, waitForIdle } = require('./fixtures/env');

/**
 * [TASK-025] 웹앱 품목 관리 탭 E2E
 *
 * 목록은 서버 페이징(queryItems)이다 — 검색·필터를 바꾸면 서버를 다시 부르므로, 카드 캡션(#itemQueryState.is-busy)이
 * 걷힐 때까지 기다린 뒤 행을 센다. 오버레이(#loadingOverlay)는 탭 첫 진입과 쓰기에만 뜬다.
 *
 * 데이터: 품목 1건(ITEM-TEST-E2E-…)을 등록 → 수정 → 이력 → 미사용 → 재사용까지 한 흐름으로 돌린다.
 *   CSV 테스트는 2건을 더 등록한다. 품목은 물리 삭제가 없으므로 DEV 마스터에 남는다 —
 *   접두어가 DEV_TEST_ITEM_PREFIX(ITEM-TEST-)라 DevTools.resetDevEnvironment()가 정리한다.
 *   미사용 전환은 마스터 정렬(4천 행 되쓰기)과 재계산을 돌리므로 오래 걸린다(대기 150초).
 *
 * 스크린샷(UIGuidelines §7): AI/audits/UI-AUDIT-001/after/TASK-025/ 에 1440 / 768 실측을 남긴다.
 */
test.describe('DEV 품목 관리', () => {
  test.skip(!hasBaseUrl() || !hasCredentials(), missingEnvReason());

  const SHOT_DIR = path.join(__dirname, '..', '..', 'AI', 'audits', 'UI-AUDIT-001', 'after', 'TASK-025');
  const WRITE_TIMEOUT = 150000;

  function shot(page, name) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    return page.screenshot({ path: path.join(SHOT_DIR, name + '.png'), fullPage: false });
  }

  function appFrame(page) {
    return page.frame({ name: 'userHtmlFrame' }) || page.frames().find((fr) => fr.name() === 'userHtmlFrame');
  }

  async function callServer(page, fnName, args) {
    return appFrame(page).evaluate(
      ([fn, rest]) =>
        new Promise((resolve, reject) => {
          google.script.run
            .withSuccessHandler(resolve)
            .withFailureHandler((e) => reject(new Error(String((e && e.message) || e))))
            [fn](getToken(), ...rest);
        }),
      [fnName, args || []]
    );
  }

  /** 목록의 데이터 행만 (엠프티 스테이트 행 제외) */
  function dataRows(app) {
    return app.locator('#itemTableBody tr:not(:has(td.empty-state))');
  }

  /** 서버 조회가 끝날 때까지 — 캡션이 busy가 됐다가 걷힌다 (이미 끝났으면 바로 통과) */
  async function waitForItemsIdle(app, timeout) {
    const busy = app.locator('#itemQueryState.is-busy');
    await busy.waitFor({ state: 'attached', timeout: 3000 }).catch(() => {});
    await busy.waitFor({ state: 'detached', timeout: timeout || 60000 });
  }

  async function openItemsTab(page, app) {
    await app.locator('#navItems').click();
    await waitForIdle(page, app);
    await waitForItemsIdle(app);
    await expect(app.locator('#tab-items')).toHaveClass(/active/);
  }

  async function search(app, text) {
    await app.locator('#itemSearch').fill(text);
    await app.locator('#itemSearch').dispatchEvent('input');
    await app.locator('body').evaluate(() => new Promise((r) => setTimeout(r, 450))); // 디바운스(350ms)
    await waitForItemsIdle(app);
  }

  async function setUsageFilter(app, value) {
    await app.locator('#itemUsageFilter').selectOption(value);
    await waitForItemsIdle(app);
  }

  function csvFile(name, lines) {
    return { name, mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n'), 'utf8') };
  }

  test('admin: 품목 관리 탭이 보이고 목록이 25건 페이징 · 검색 · 사용유무 필터로 좁혀진다', async ({ page }) => {
    const app = await login(page);
    await expect(app.locator('#navItems')).toBeVisible();
    await openItemsTab(page, app);

    // 첫 페이지는 최대 25건, 건수 뱃지는 "N건" 또는 "N / M건"
    await expect(app.locator('#itemCount')).toHaveText(/^\d+( \/ \d+)?건$/);
    const firstPage = await dataRows(app).count();
    expect(firstPage).toBeLessThanOrEqual(25);
    if (firstPage === 0) {
      // 행이 없으면 "정말 비었는가"와 "조회가 실패했는가"를 구분한다 — 실패를 skip으로 삼키지 않는다
      const toast = (await app.locator('#toastContainer').innerText().catch(() => '')).trim();
      expect(toast, '품목 목록 조회가 실패했습니다: ' + toast).not.toMatch(/실패|오류|권한/);
      test.skip(true, 'DEV 품목 마스터가 비어 있어 목록 동작을 확인할 수 없습니다.');
    }
    await shot(page, 'D01-items-1440');

    // 더 보기 — 전체가 25건을 넘으면 푸터가 있고 누르면 25건이 더 붙는다
    const badge = (await app.locator('#itemCount').innerText()).trim();
    const total = Number(/^(\d+)/.exec(badge)[1]);
    if (total > 25) {
      await expect(app.locator('#itemMoreWrap button')).toBeVisible();
      await app.locator('#itemMoreWrap button').click();
      await waitForItemsIdle(app);
      expect(await dataRows(app).count()).toBe(Math.min(total, 50));
    } else {
      await expect(app.locator('#itemMoreWrap')).toHaveCount(0);
    }

    // 검색: 첫 행의 품목코드로 검색하면 그 행이 나오고, 없는 검색어는 빈 상태
    const firstCode = (await dataRows(app).first().locator('td').first().innerText()).trim();
    await search(app, firstCode);
    await expect(app.locator('#itemTableBody tr[data-code="' + firstCode + '"]')).toHaveCount(1);
    await expect(app.locator('#itemQueryState')).toContainText('검색');

    await search(app, '__없는품목__' + Date.now());
    await expect(app.locator('#itemTableBody')).toContainText('검색 조건에 맞는 품목이 없습니다');
    await expect(dataRows(app)).toHaveCount(0);
    await search(app, '');

    // 사용유무: 사용 + 미사용 = 전체 (두 상태는 배타적)
    const countOf = async () => Number(/^(\d+)/.exec((await app.locator('#itemCount').innerText()).trim())[1]);
    await setUsageFilter(app, '사용');
    const used = await countOf();
    await setUsageFilter(app, '미사용');
    const unused = await countOf();
    await setUsageFilter(app, 'all');
    const all = await countOf();
    expect(used + unused).toBe(all);
    await setUsageFilter(app, '사용');
  });

  test('품목 생애주기: 등록 → diff·사유 필수 수정 → 이력(웹앱 경로) → 미사용 → 재사용', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    const app = await login(page);
    await openItemsTab(page, app);

    const stamp = Date.now().toString(36).toUpperCase();
    const code = 'ITEM-TEST-E2E-' + stamp;
    const name = 'E2E 품목 ' + stamp;

    // ── 등록 ──
    await app.locator('#btnItemAdd').click();
    await expect(app.locator('#modalTitle')).toHaveText('품목 등록');
    await expect(app.locator('#itemCode')).not.toHaveAttribute('readonly', '');
    // 카테고리·단위 드롭다운이 기초데이터로 채워져 있다
    expect(await app.locator('#itemCategory option').count()).toBeGreaterThan(1);
    expect(await app.locator('#itemUnit option').count()).toBeGreaterThan(1);

    // 필수값 누락은 서버를 부르기 전에 막는다
    await app.locator('#btnItemAddSubmit').click();
    await expect(app.locator('#toastContainer')).toContainText('품목코드');

    await app.locator('#itemCode').fill(code);
    await app.locator('#itemName').fill(name);
    await app.locator('#itemCategory').selectOption({ index: 1 });
    await app.locator('#itemUnit').selectOption({ index: 1 });
    await app.locator('#itemUnitPrice').fill('1000');
    await shot(page, 'D02-items-add-modal-1440');
    await app.locator('#btnItemAddSubmit').click();
    await waitForIdle(page, app, WRITE_TIMEOUT);
    await expect(app.locator('#toastContainer')).toContainText('등록 완료');
    await expect(app.locator('#modalOverlay')).not.toHaveClass(/active/);

    // 목록을 다시 받지 않고 맨 위에 끼워 넣는다
    const row = app.locator('#itemTableBody tr[data-code="' + code + '"]');
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').nth(1)).toHaveText(name);
    await expect(row.locator('td').nth(7)).toHaveText('1,000');

    // ── 수정: 변경 없음은 저장하지 않는다 ──
    await row.locator('button[title="수정"]').click();
    await expect(app.locator('#modalTitle')).toContainText('품목 수정');
    await expect(app.locator('#itemCode')).toHaveAttribute('readonly', '');
    await expect(app.locator('#itemCode')).toHaveValue(code);
    await app.locator('#btnItemEditSubmit').click();
    await expect(app.locator('#toastContainer')).toContainText('변경된 내용이 없습니다');
    await expect(app.locator('#modalTitle')).toContainText('품목 수정');

    // ── 수정: 단가 변경 → diff 확인 → 사유 없이는 저장 불가 ──
    await app.locator('#itemUnitPrice').fill('2500');
    await app.locator('#btnItemEditSubmit').click();
    await expect(app.locator('#modalTitle')).toHaveText('변경 내용 확인');
    await expect(app.locator('#itemDiffBody tr')).toHaveCount(1);
    await expect(app.locator('#itemDiffBody tr td').nth(0)).toHaveText('매입단가');
    await expect(app.locator('#itemDiffBody tr td').nth(1)).toHaveText('1,000');
    await expect(app.locator('#itemDiffBody tr td').nth(2)).toHaveText('2,500');
    await expect(app.locator('#btnItemSaveConfirm')).toBeDisabled();

    // [뒤로]는 입력하던 값을 지킨다
    await app.locator('#modalFooter button:has-text("뒤로")').click();
    await expect(app.locator('#modalTitle')).toContainText('품목 수정');
    await expect(app.locator('#itemUnitPrice')).toHaveValue('2500');
    await app.locator('#btnItemEditSubmit').click();
    await expect(app.locator('#modalTitle')).toHaveText('변경 내용 확인');

    const reason = 'E2E 단가 인상 ' + stamp;
    await app.locator('#itemEditReason').fill(reason);
    await expect(app.locator('#btnItemSaveConfirm')).toBeEnabled();
    await shot(page, 'D03-items-diff-modal-1440');
    await app.locator('#btnItemSaveConfirm').click();
    await waitForIdle(page, app, WRITE_TIMEOUT);
    await expect(app.locator('#toastContainer')).toContainText('수정 완료');
    await expect(row.locator('td').nth(7)).toHaveText('2,500');

    // ── 이력: 신규 등록 + 매입단가, 사유와 경로(웹앱) ──
    await row.locator('button[title="이력"]').click();
    await expect(app.locator('#modalTitle')).toContainText('변경이력');
    const history = app.locator('#itemChangelogBody tr:not(:has(td.empty-state))');
    await expect(history).toHaveCount(2);
    await expect(history.nth(0)).toContainText('매입단가');      // 최신순
    await expect(history.nth(0)).toContainText(reason);
    await expect(history.nth(0).locator('.status-badge')).toHaveText('웹앱');
    await expect(history.nth(1)).toContainText('신규 등록');
    await shot(page, 'D04-items-history-modal-1440');
    await app.locator('.modal-close').click();

    // ── 미사용 전환 (사유 필수) → 사용 목록에서 사라진다 ──
    await row.locator('.action-btn.disable').click();
    await expect(app.locator('#modalTitle')).toHaveText('미사용 전환');
    await expect(app.locator('#btnItemUsageConfirm')).toBeDisabled();
    await app.locator('#disableReason').fill('E2E 단종 ' + stamp);
    await app.locator('#btnItemUsageConfirm').click();
    await waitForIdle(page, app, WRITE_TIMEOUT);
    await expect(app.locator('#toastContainer')).toContainText('비활성화');
    await expect(app.locator('#itemTableBody tr[data-code="' + code + '"]')).toHaveCount(0);

    // ── 미사용 필터에서 보이고, 재사용으로 되돌린다 ──
    await setUsageFilter(app, '미사용');
    const disabledRow = app.locator('#itemTableBody tr[data-code="' + code + '"]');
    await expect(disabledRow).toHaveCount(1);
    await expect(disabledRow.locator('.status-badge')).toHaveText('미사용');
    await disabledRow.locator('.action-btn.enable').click();
    await expect(app.locator('#modalTitle')).toHaveText('재사용 전환');
    await app.locator('#enableReason').fill('E2E 재사용 ' + stamp);
    await app.locator('#btnItemUsageConfirm').click();
    await waitForIdle(page, app, WRITE_TIMEOUT);
    await expect(app.locator('#toastContainer')).toContainText('수정 완료');
    await expect(app.locator('#itemTableBody tr[data-code="' + code + '"]')).toHaveCount(0);

    await setUsageFilter(app, '사용');
    await search(app, code);
    await expect(app.locator('#itemTableBody tr[data-code="' + code + '"] .status-badge')).toHaveText('사용');

    // 정리: 남겨 두지 않고 미사용으로 — resetDevEnvironment가 지운다
    await app.locator('#itemTableBody tr[data-code="' + code + '"] .action-btn.disable').click();
    await app.locator('#disableReason').fill('E2E 정리');
    await app.locator('#btnItemUsageConfirm').click();
    await waitForIdle(page, app, WRITE_TIMEOUT);
  });

  test('CSV 일괄 등록: 사전 검증 미리보기(신규/건너뜀) → 등록 → 목록 반영', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    const app = await login(page);
    await openItemsTab(page, app);

    // 이미 있는 코드 하나 (건너뜀 대상) — 첫 행
    await expect(dataRows(app).first()).toBeVisible();
    const existing = (await dataRows(app).first().locator('td').first().innerText()).trim();
    const stamp = Date.now().toString(36).toUpperCase();
    const c1 = 'ITEM-TEST-E2E-CSV-' + stamp + '-1';
    const c2 = 'ITEM-TEST-E2E-CSV-' + stamp + '-2';

    // 드롭다운의 실제 카테고리·단위를 파일에 쓴다 (기초데이터에 있는 값만 통과한다)
    const catalog = await callServer(page, 'getItemCatalog');
    expect(catalog && catalog.success).toBe(true);
    const category = catalog.categories[0];
    const unit = catalog.units[0];

    await app.locator('#btnItemCsvUpload').click();
    await expect(app.locator('#modalTitle')).toHaveText('품목마스터 CSV 업로드');
    // 안내문은 서버 SYSTEM_ACTIONS(SSOT)와 같다
    const action = await appFrame(page).evaluate(() => SYSTEM_ACTIONS.uploadItemCsv);
    await expect(app.locator('#modalBody .action-guide .desc')).toHaveText(action.desc);
    await expect(app.locator('#modalBody .action-guide li')).toHaveCount(action.bullets.length);
    await shot(page, 'D05-items-csv-guide-1440');

    // 형식 오류 파일 → 서버를 부르지 않고 거절
    await app.locator('#itemCsvFile').setInputFiles(csvFile('bad.csv', [
      '품목코드,품목명,카테고리,단위,매입단가',
      `${c1},CSV 오류행,${category},${unit},-5`
    ]));
    await expect(app.locator('#modalTitle')).toHaveText(/검증 실패/);
    await expect(app.locator('#itemCsvErrorBody')).toContainText('매입단가');

    // 정상 파일: 신규 2 + 기존 1
    await app.locator('#modalFooter button:has-text("다른 파일 선택")').click();
    await app.locator('#itemCsvFile').setInputFiles(csvFile('ok.csv', [
      '품목코드,품목명,카테고리,규격,단위,초기재고,과세구분,매입단가',
      `${c1},CSV 품목 ${stamp} 1,${category},,${unit},0,과세,1200`,
      `${c2},CSV 품목 ${stamp} 2,${category},20kg,${unit},,비과세,`,
      `${existing},이미 있는 품목,${category},,${unit},,,`
    ]));
    await expect(app.locator('#modalTitle')).toHaveText('업로드 확인', { timeout: 90000 });
    await expect(app.locator('.stat-chip.normal')).toContainText('2');
    await expect(app.locator('#modalBody')).toContainText('건너뜀(기존 코드) 1');
    await expect(app.locator('#itemCsvPreviewBody tr')).toHaveCount(2);
    await expect(app.locator('#itemCsvIgnored')).toContainText(existing);
    await shot(page, 'D06-items-csv-preview-1440');

    await app.locator('#btnItemCsvRun').click();
    await expect(app.locator('#modalTitle')).toHaveText('등록 완료', { timeout: WRITE_TIMEOUT });
    await expect(app.locator('#modalBody')).toContainText('2건 신규 등록');
    await expect(app.locator('#modalBody')).toContainText('1건 무시');
    await app.locator('#modalFooter button:has-text("확인")').click();
    await waitForIdle(page, app);

    await search(app, 'ITEM-TEST-E2E-CSV-' + stamp);
    await expect(dataRows(app)).toHaveCount(2);
    await expect(app.locator('#itemTableBody tr[data-code="' + c2 + '"] td').nth(6)).toHaveText('비과세');
  });

  test('권한: manager에게는 보이고 목록이 열리며, staff에게는 숨겨진다', async ({ page }) => {
    test.setTimeout(6 * 60 * 1000);
    const suffix = Date.now().toString(36);
    const accounts = [
      { username: 'e2e-items-mgr-' + suffix, password: 'E2e-pass-' + suffix, name: 'E2E 구매팀', dept: '구매', role: 'manager' },
      { username: 'e2e-items-stf-' + suffix, password: 'E2e-pass-' + suffix, name: 'E2E 직원', dept: '업장', role: 'staff' }
    ];

    let app = await login(page);
    await waitForIdle(page, app);
    for (const a of accounts) {
      const created = await callServer(page, 'createUser', [a]);
      expect(created && created.success, '임시 계정 생성 실패: ' + JSON.stringify(created)).toBe(true);
    }

    try {
      // manager
      await app.locator('.logout-btn').click();
      await expect(app.locator('#loginUsername')).toBeVisible();
      app = await login(page, accounts[0]);
      await waitForIdle(page, app);
      await expect(app.locator('#navItems')).toBeVisible();
      await expect(app.locator('#navUser')).toBeHidden(); // admin 전용은 여전히 숨김
      await openItemsTab(page, app);
      await expect(app.locator('#btnItemAdd')).toBeVisible();
      await expect(app.locator('#btnItemCsvUpload')).toBeVisible();
      await expect(app.locator('#itemTableBody')).not.toContainText('권한');

      // staff
      await app.locator('.logout-btn').click();
      await expect(app.locator('#loginUsername')).toBeVisible();
      app = await login(page, accounts[1]);
      await waitForIdle(page, app);
      await expect(app.locator('#navItems')).toBeHidden();
      // 화면이 숨겨도 API는 막는다
      const denied = await callServer(page, 'queryItems', [{}]);
      expect(denied && denied.success).toBe(false);
    } finally {
      await app.locator('.logout-btn').click().catch(() => {});
      await expect(app.locator('#loginUsername')).toBeVisible();
      app = await login(page);
      await waitForIdle(page, app);
      for (const a of accounts) {
        const deleted = await callServer(page, 'deleteUser', [a.username]);
        expect(deleted && deleted.success, '임시 계정 삭제 실패: ' + JSON.stringify(deleted)).toBe(true);
      }
    }
  });

  test('768px 세로: 목록이 가로로 넘치지 않는다 (UIGuidelines §1)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const app = await login(page);
    await app.locator('.hamburger').click();
    await openItemsTab(page, app);
    await shot(page, 'D07-items-768');
    const overflow = await appFrame(page).evaluate(() => {
      const el = document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
