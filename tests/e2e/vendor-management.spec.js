const { test, expect } = require('./fixtures/browser');
const { hasBaseUrl, hasCredentials, missingEnvReason, login, waitForIdle } = require('./fixtures/env');

/**
 * [TASK-018] 거래처 관리 화면 E2E
 *
 * 전제: DEV 스프레드시트가 v17까지 마이그레이션되어 "🤝 거래처관리" 시트가 있어야 한다.
 *       (없으면 서버가 "마이그레이션을 먼저 실행하세요"를 돌려주고 목록이 비어 있다 —
 *        그 경우도 조용히 통과시키지 않고 명확한 메시지로 실패시킨다.)
 *
 * 등록 테스트는 DEV 시트에 실제 행을 만든다. 매 실행마다 이름이 겹치지 않도록
 * 타임스탬프를 붙이고, 끝나면 만든 거래처를 지워 시트를 원래대로 되돌린다.
 */
test.describe('DEV 거래처 관리', () => {
  test.skip(!hasBaseUrl() || !hasCredentials(), missingEnvReason());

  /**
   * 목록의 **데이터 행**만 고른다.
   *
   * 목록이 비면 renderVendors가 안내 문구를 담은 행을 하나 그린다(td.empty-state).
   * 그 행까지 세면 "거래처 0건"인 상태가 "1건"으로 잡혀,
   * 데이터가 없을 때 건너뛰어야 할 테스트가 그냥 실행되다 엉뚱한 곳에서 타임아웃 난다.
   */
  function dataRows(app) {
    return app.locator("#vendorTableBody tr:not(:has(td.empty-state))");
  }

  /**
   * evaluate는 FrameLocator가 아니라 실제 Frame에서만 부를 수 있다.
   * login()이 돌려주는 app은 locator 전용이라 app.evaluate는 없다(smoke.spec.js와 같은 방식).
   */
  function appFrame(page) {
    return page.frame({ name: "userHtmlFrame" })
      || page.frames().find((fr) => fr.name() === "userHtmlFrame");
  }

  /** 거래처 탭으로 이동하고 목록 로딩이 끝날 때까지 기다린다 */
  async function openVendorTab(page, app) {
    await app.locator('#navVendor').click();
    await waitForIdle(page, app);
    await expect(app.locator('#tab-vendor')).toHaveClass(/active/);
  }

  test('admin 로그인 시 거래처 관리 탭이 노출되고 목록이 로드된다', async ({ page }) => {
    const app = await login(page);

    await expect(app.locator('#navVendor')).toBeVisible();
    await openVendorTab(page, app);

    // 시트가 없으면 서버가 마이그레이션 안내를 돌려준다 — 그 상태를 통과로 두면 안 된다
    const emptyText = await app.locator('#vendorTableBody').innerText();
    expect(
      emptyText,
      'DEV 스프레드시트에 거래처관리 시트가 없습니다. 메뉴에서 스키마 마이그레이션(v17)을 먼저 실행하십시오.'
    ).not.toContain('마이그레이션');

    await expect(app.locator('#vendorSearch')).toBeVisible();
    await expect(app.locator('#vendorUsageFilter')).toBeVisible();
  });

  test('신규 등록 시 거래처코드가 서버에서 자동 채번된다', async ({ page }) => {
    const app = await login(page);
    await openVendorTab(page, app);

    const name = 'E2E테스트거래처_' + Date.now();

    await app.locator('#tab-vendor button:has-text("추가")').click();
    await expect(app.locator('#vdName')).toBeVisible();

    // 신규 등록 모달의 거래처코드는 읽기 전용이고 비어 있어야 한다 (서버가 정한다)
    await expect(app.locator('#vdCode')).toHaveAttribute('readonly', '');
    await expect(app.locator('#vdCode')).toHaveValue('');

    await app.locator('#vdName').fill(name);
    await app.locator('#vdCeo').fill('E2E대표');
    await app.locator('#modalFooter button:has-text("등록")').click();
    await waitForIdle(page, app);

    // 목록에서 방금 등록한 거래처를 찾아 VND-형식 코드가 붙었는지 본다
    await app.locator('#vendorSearch').fill(name);
    await app.locator('#vendorSearch').dispatchEvent('input');

    const row = app.locator('#vendorTableBody tr', { hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').first()).toHaveText(/^VND-\d{3,}$/);

    // 정리: 만든 거래처를 지운다 (품목이 참조하지 않으므로 물리 삭제된다)
    await row.locator('button[title="삭제"]').click();
    await app.locator('#modalFooter button:has-text("삭제")').click();
    await waitForIdle(page, app);

    await app.locator('#vendorSearch').fill(name);
    await app.locator('#vendorSearch').dispatchEvent('input');
    await expect(app.locator('#vendorTableBody tr', { hasText: name })).toHaveCount(0);
  });

  test('거래처명 중복 등록은 거절된다', async ({ page }) => {
    const app = await login(page);
    await openVendorTab(page, app);

    // 목록의 첫 거래처 이름을 그대로 다시 등록해 본다
    const rows = dataRows(app);
    test.skip(await rows.count() === 0, 'DEV 거래처 시트가 비어 있어 중복 검사를 확인할 수 없습니다.');

    const existingName = (await rows.first().locator('td').nth(1).innerText()).trim();
    test.skip(!existingName, '거래처명을 읽지 못했습니다.');

    await app.locator('#tab-vendor button:has-text("추가")').click();
    await app.locator('#vdName').fill(existingName);
    await app.locator('#modalFooter button:has-text("등록")').click();
    await waitForIdle(page, app);

    await expect(app.locator('#toastContainer')).toContainText('이미 등록된');
  });

  test('검색과 사용여부 필터가 목록을 좁힌다', async ({ page }) => {
    const app = await login(page);
    await openVendorTab(page, app);

    const total = await dataRows(app).count();
    test.skip(total === 0, 'DEV 거래처 시트가 비어 있어 필터를 확인할 수 없습니다.');

    // 있을 수 없는 검색어를 넣으면 빈 상태가 나와야 한다
    await app.locator('#vendorSearch').fill('__없는거래처__' + Date.now());
    await app.locator('#vendorSearch').dispatchEvent('input');
    await expect(app.locator('#vendorTableBody')).toContainText('검색 조건에 맞는 거래처가 없습니다');
    await expect(dataRows(app)).toHaveCount(0);

    await app.locator('#vendorSearch').fill('');
    await app.locator('#vendorSearch').dispatchEvent('input');
    await expect(dataRows(app)).toHaveCount(total);

    // 사용 + 미사용 = 전체 (두 상태는 서로 배타적이다)
    await app.locator('#vendorUsageFilter').selectOption('사용');
    const used = await dataRows(app).count();
    await app.locator('#vendorUsageFilter').selectOption('미사용');
    const unused = await dataRows(app).count();
    expect(used + unused).toBe(total);
  });

  test('품목이 사용 중인 거래처는 삭제되지 않고 안내 모달이 뜬다', async ({ page }) => {
    const app = await login(page);
    await openVendorTab(page, app);

    // 어떤 거래처가 사용 중인지 **읽기만으로** 알아낸다.
    //   삭제를 하나씩 시도해 보며 찾으면, 사용 중이 아닌 거래처는 그대로 지워져
    //   DEV 시트의 실제 거래처 데이터(Human이 입력한 59건)가 사라진다.
    //   getItemMasterData 응답에는 TASK-017에서 추가한 vendorCode가 들어 있으므로 그것으로 충분하다.
    const usedCode = await appFrame(page).evaluate(() => new Promise((resolve) => {
      google.script.run
        .withSuccessHandler((items) => {
          if (!Array.isArray(items)) return resolve(null);
          const hit = items.find((it) => it.vendorCode && String(it.vendorCode).trim());
          resolve(hit ? String(hit.vendorCode).trim() : null);
        })
        .withFailureHandler(() => resolve(null))
        .getItemMasterData(getToken());
    }));

    test.skip(!usedCode, '품목에 거래처가 지정된 건이 없어 삭제 제약을 확인할 수 없습니다.');

    // 이 거래처는 반드시 거절된다 — 삭제되지 않으므로 DEV 데이터는 그대로다
    const row = app.locator('#vendorTableBody tr', { hasText: usedCode });
    await expect(row).toHaveCount(1);
    await row.locator('button[title="삭제"]').click();
    await app.locator('#modalFooter button:has-text("삭제")').click();
    await waitForIdle(page, app);

    // 삭제 거절은 토스트로 흘리지 않고 모달에 남긴다 (무엇이 막는지 + 다음 행동)
    await expect(app.locator('#modalTitle')).toHaveText(/삭제할 수 없습니다/);
    await expect(app.locator('#modalBody')).toContainText('미사용');
    await expect(app.locator('#modalFooter')).toContainText('미사용으로 변경');

    await app.locator('.modal-close').click();

    // 거래처가 실제로 남아 있는지 확인
    await app.locator('#vendorSearch').fill('');
    await app.locator('#vendorSearch').dispatchEvent('input');
    await expect(app.locator('#vendorTableBody tr', { hasText: usedCode })).toHaveCount(1);
  });
});
