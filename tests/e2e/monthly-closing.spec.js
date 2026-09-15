const { test, expect } = require('./fixtures/browser');
const { hasCredentials, missingEnvReason, login, waitForIdle } = require('./fixtures/env');

/**
 * [TASK-006] 수동 월마감 UI E2E — DEV Web App 전용.
 *
 * 이 스펙의 기본 테스트는 **마감을 실제로 실행하지 않는다.**
 * `executeMonthlyClosing`은 비가역 작업이며, DEV 시트라도 실행되면
 *   - 마감 기준일 이전 입출고 행이 메인 시트에서 사라지고 Drive로 이관되며
 *   - 품목 마스터의 초기재고(G열)가 전부 0으로 리셋된다.
 * "과거 기간이라 어차피 데이터가 없다"는 가정은 성립하지 않는다.
 * 서버는 초기재고가 남아있는 품목이 하나라도 있으면 마감을 **정상 수행**하기 때문이다
 * (`Archive.gs` — `archiveRows.length === 0 && masterData.every(초기재고 === 0)` 일 때만 실패 반환).
 * 따라서 실제 실행 검증(FR-4의 "데이터 부재 실패 토스트")은 아래 환경변수로 명시 동의한 경우에만 돈다.
 *
 *   E2E_ALLOW_MONTHLY_CLOSING=1   # DEV 시트가 마감돼도 무방함을 명시적으로 승인
 *
 * 되돌릴 때는 스프레드시트 버전 복원 **+ 스크립트 속성 `LAST_CLOSED_CUTOFF` 삭제**가 모두 필요하다
 * (속성은 시트 복원으로 지워지지 않는다 — TASK-028).
 *
 * [TASK-028] 서버가 마감 대상 월을 검증한다(재마감·미종료 월·건너뜀·동명 파일 거절). 이 중 "아직 끝나지 않은 달"
 *   거절은 **아무것도 쓰지 않으므로** 승인 없이 항상 돌린다 — 이번 달을 강제로 골라 서버 거절 토스트를 받는다.
 *
 * 참고: 월마감 버튼은 입출고 기록 탭 헤더의 「관리 ▾」 드롭다운(`#btnTxAdminMenu` → `#txAdminMenu`, `.admin-only`) 안에 있다 (TASK-021 C-7).
 *       메뉴는 [hidden]으로 닫혀 있으므로 먼저 열어야 항목이 보인다.
 *       또한 모달/로딩 오버레이는 `display`가 아니라 `opacity`로만 숨겨지므로
 *       Playwright의 visible 판정이 아니라 `.active` 클래스 유무로 열림/닫힘을 판정한다.
 *       [TASK-028] 모달은 열 때 마감 기준일을 서버에서 다시 읽는다(왕복 1회) — 열림 판정은 auto-wait에 맡긴다.
 */

const CLOSING_BUTTON = /수동 월마감/;

/** [TASK-021] 「관리 ▾」 드롭다운을 열고 월마감 항목 locator를 돌려준다 */
async function openClosingMenu(app) {
  await app.locator('#btnTxAdminMenu').click();
  await expect(app.locator('#txAdminMenu')).toBeVisible();
  return app.locator('#txAdminMenu').getByRole('menuitem', { name: CLOSING_BUTTON });
}
const ALLOW_REAL_CLOSING = process.env.E2E_ALLOW_MONTHLY_CLOSING === '1';

/** 입출고 기록 탭으로 이동하고, 자동으로 뜨는 업장 선택 모달을 닫는다 */
async function gotoTransactionTab(page, app) {
  await app.getByRole('button', { name: /입출고 기록/ }).click();
  await waitForIdle(page, app);

  const shopButton = app.locator('#shopSelectionList button').first();
  const shopModalOpened = await shopButton
    .waitFor({ state: 'visible', timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  if (shopModalOpened) {
    await shopButton.click();
    await waitForIdle(page, app);
  }
  await expect(app.locator('#modalOverlay')).not.toHaveClass(/active/);
}

/** 마지막 토스트 문구 (토스트는 4초 뒤 사라지므로 즉시 읽는다) */
async function lastToastText(app, timeout = 30000) {
  const toast = app.locator('#toastContainer .toast').last();
  await toast.waitFor({ state: 'visible', timeout });
  return (await toast.innerText()).replace(/\s+/g, ' ').trim();
}

/** 앱 프레임에서 서버 함수를 호출한다 (google.script.run → Promise). 세션 토큰은 자동 주입한다. */
async function callServer(app, fnName, args) {
  return app.locator('body').evaluate(
    (_el, [fn, rest]) =>
      new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler((e) => reject(new Error(String((e && e.message) || e))))
          [fn](getToken(), ...rest);
      }),
    [fnName, args || []]
  );
}

/** 1차 모달을 열고 열림을 확인한다 ([TASK-028] 기준일 재조회 왕복 뒤에 열린다) */
async function openClosingModal(page, app) {
  await (await openClosingMenu(app)).click();
  await expect(app.locator('#modalOverlay')).toHaveClass(/active/);
  await expect(app.locator('#modalTitle')).toContainText('월마감 및 재고 이월 실행');
}

/** "쓰기 없음" 판정용 스냅샷 — 마감 기준일과 첫 업장의 최근 내역 */
async function snapshotServerState(app) {
  const closing = await callServer(app, 'getClosingCutoffInfo');
  const shops = await callServer(app, 'getShopList');
  const shopName = Array.isArray(shops) && shops.length ? shops[0].name : null;
  const recent = shopName ? await callServer(app, 'getRecentTransactions', [shopName, 20]) : [];
  // google.script.run 직렬화는 객체 키 순서를 보장하지 않으므로 필드를 골라 비교한다
  const rows = (recent || []).map((r) => [r.txId, r.date, r.code, r.type, r.qty].join('|'));
  return { cutoff: closing && closing.cutoff, shopName, recent: rows.join('\n') };
}

test.describe('DEV 수동 월마감 UI', () => {
  test.skip(!hasCredentials(), missingEnvReason());

  test.setTimeout(5 * 60 * 1000);

  test('비관리자는 월마감 버튼이 숨겨지고, 강제 호출해도 차단 토스트가 뜬다', async ({ page }) => {
    const app = await login(page);
    await gotoTransactionTab(page, app);

    const adminMenuButton = app.locator('#btnTxAdminMenu');
    await expect(adminMenuButton, 'admin에게는 「관리」 드롭다운이 보여야 한다').toBeVisible();
    const closingButton = await openClosingMenu(app);
    await expect(closingButton, 'admin에게는 월마감 항목이 보여야 한다').toBeVisible();
    await app.locator('body').evaluate(() => closeTxAdminMenu());

    // staff 계정 자격증명 없이 클라이언트 가드를 검증한다.
    // (staff로 실제 로그인하면 .admin-only가 display:none이 되어 클릭 자체가 불가능하다)
    // 주의: 앱의 currentUser는 `let` 선언이라 window 프로퍼티가 아니다.
    // evaluate 콜백은 페이지의 전역 렉시컬 스코프에서 평가되므로 식별자를 그대로 참조한다.
    await app.locator('body').evaluate(() => {
      currentUser.role = 'staff';
      applyRolePermissions();
    });
    await expect(adminMenuButton, 'staff에게는 「관리」 드롭다운이 숨겨져야 한다').toBeHidden();
    await expect(closingButton, 'staff에게는 월마감 항목이 숨겨져야 한다').toBeHidden();

    await app.locator('body').evaluate(() => openMonthlyClosingModal());

    expect(await lastToastText(app)).toContain('최고 관리자만 실행할 수 있습니다.');
    await expect(app.locator('#modalOverlay'), '차단 시 모달이 열리면 안 된다').not.toHaveClass(/active/);
  });

  test('1차 모달(기준일 안내·기본값은 끝난 달) → 2차 확인 모달로 이어지고, "동의" 오입력 시 실행이 차단된다', async ({ page }) => {
    const app = await login(page);
    await gotoTransactionTab(page, app);

    // ── 1차 모달: 기준일 안내 + 연/월 선택 ──
    await openClosingModal(page, app);
    await expect(app.locator('#modalBody')).toContainText('경고');

    // [TASK-028] 기준일·다음 대상 안내
    const guide = app.locator('#closingGuide');
    await expect(guide).toContainText('현재 마감 기준일');
    await expect(guide).toContainText('다음 마감 대상');
    const info = await callServer(app, 'getClosingCutoffInfo');
    if (info && info.cutoff) {
      await expect(guide).toContainText(info.cutoff);
      await expect(guide).toContainText(`${info.nextClosable.year}년 ${info.nextClosable.month}월`);
    } else {
      await expect(guide).toContainText('마감 이력 없음');
    }

    // [TASK-028] 기본 선택은 "이번 달"이 아니다 — 이력 없으면 지난달, 있으면 다음 마감 대상
    const now = new Date();
    const currYear = now.getFullYear(), currMonth = now.getMonth() + 1;
    const year = Number(await app.locator('#closingYear').inputValue());
    const month = Number(await app.locator('#closingMonth').inputValue());
    console.log(`[월마감 모달] 기준일=${info && info.cutoff} 기본 선택=${year}-${month} 오늘=${currYear}-${currMonth}`);
    if (info && info.cutoff) {
      expect([year, month]).toEqual([info.nextClosable.year, info.nextClosable.month]);
      // 지난달까지 마감된 상태면 다음 대상이 곧 이번 달이다 — 그때는 "N월 1일 이후 가능" 안내와 disabled로 막는다
      if (year === currYear && month === currMonth) {
        await expect(guide).toContainText('1일 이후 가능');
        await expect(app.locator(`#closingMonth option[value="${currMonth}"]`)).toBeDisabled();
      }
    } else {
      expect(`${year}-${month}`, '기본 선택이 진행 중인 이번 달이면 안 된다').not.toBe(`${currYear}-${currMonth}`);
      const prev = new Date(currYear, currMonth - 2, 1);
      expect([year, month]).toEqual([prev.getFullYear(), prev.getMonth() + 1]);
    }

    // [TASK-028] 이번 달(및 미래 달)은 고를 수 없다 — 올해로 바꿔 보고 확인한다
    await app.locator('body').evaluate((_el, y) => {
      const sel = document.getElementById('closingYear');
      const opt = Array.from(sel.options).find((o) => Number(o.value) === y);
      if (opt) { opt.disabled = false; sel.value = String(y); refreshClosingMonthOptions(); }
    }, currYear);
    const currentMonthOption = app.locator(`#closingMonth option[value="${currMonth}"]`);
    await expect(currentMonthOption, '진행 중인 달은 disabled').toBeDisabled();
    if (currMonth < 12) {
      await expect(app.locator(`#closingMonth option[value="${currMonth + 1}"]`), '미래 달은 disabled').toBeDisabled();
    }
    // 기본 선택으로 되돌린다
    await app.locator('body').evaluate((_el, [y, m]) => {
      const sel = document.getElementById('closingYear');
      sel.value = String(y); refreshClosingMonthOptions();
      document.getElementById('closingMonth').value = String(m);
    }, [year, month]);

    // ── 2차 모달: 최종 확인 ──
    await app.locator('#modalFooter').getByRole('button', { name: '실행', exact: true }).click();
    await expect(app.locator('#modalOverlay')).toHaveClass(/active/);
    await expect(app.locator('#modalTitle')).toContainText('월마감 최종 확인');
    await expect(app.locator('#modalBody')).toContainText(`${year}년 ${month}월 마감`);

    const confirmInput = app.locator('#closingConfirmText');
    const submitButton = app.locator('#modalFooter').getByRole('button', { name: '최종 마감 실행' });

    // 빈 입력 → 차단
    await submitButton.click();
    expect(await lastToastText(app)).toContain('"동의"라고 입력하셔야 실행됩니다.');

    // 오타 입력 → 차단
    await confirmInput.fill('동의합니다');
    await submitButton.click();
    expect(await lastToastText(app)).toContain('"동의"라고 입력하셔야 실행됩니다.');

    // 차단된 경우 서버 호출이 없어야 한다: 모달이 그대로 열려 있고 로딩도 뜨지 않는다
    await expect(app.locator('#modalOverlay')).toHaveClass(/active/);
    await expect(app.locator('#loadingOverlay')).not.toHaveClass(/active/);
    await expect(confirmInput).toBeVisible();

    // 실행하지 않고 종료
    await app.locator('#modalFooter').getByRole('button', { name: '취소' }).click();
    await expect(app.locator('#modalOverlay')).not.toHaveClass(/active/);
  });

  /**
   * [TASK-028] 서버 검증 — 진행 중인 이번 달을 강제로 골라 "동의"까지 하면 서버가 거절하고 아무것도 쓰지 않는다.
   * disabled 옵션은 사람이 고를 수 없으므로 evaluate로 풀어 서버까지 도달시킨다(모달은 보조, 서버가 1차 방어).
   * 승인 환경변수 없이 항상 돌린다 — 거절 경로는 시트·Drive·속성을 건드리지 않기 때문이다.
   */
  test('미종료 월을 강제 선택하면 서버가 "아직 끝나지 않았습니다"로 거절하고 아무것도 쓰지 않는다', async ({ page }) => {
    const app = await login(page);
    await gotoTransactionTab(page, app);

    const before = await snapshotServerState(app);

    await openClosingModal(page, app);
    const now = new Date();
    const currYear = now.getFullYear(), currMonth = now.getMonth() + 1;
    await app.locator('body').evaluate((_el, [y, m]) => {
      const yearSel = document.getElementById('closingYear');
      const monthSel = document.getElementById('closingMonth');
      Array.from(yearSel.options).forEach((o) => { o.disabled = false; });
      yearSel.value = String(y);
      Array.from(monthSel.options).forEach((o) => { o.disabled = false; });
      monthSel.value = String(m);
    }, [currYear, currMonth]);
    await expect(app.locator('#closingMonth')).toHaveValue(String(currMonth));

    await app.locator('#modalFooter').getByRole('button', { name: '실행', exact: true }).click();
    await expect(app.locator('#modalTitle')).toContainText('월마감 최종 확인');
    await expect(app.locator('#modalBody')).toContainText(`${currYear}년 ${currMonth}월 마감`);
    await app.locator('#closingConfirmText').fill('동의');
    await app.locator('#modalFooter').getByRole('button', { name: '최종 마감 실행' }).click();

    expect(await lastToastText(app)).toContain('마감 및 이월 데이터 생성 중');
    await waitForIdle(page, app, 3 * 60 * 1000);

    const result = await lastToastText(app);
    console.log(`[월마감 ${currYear}-${currMonth} 강제 시도] 서버 응답: ${result}`);
    expect(result).toContain('마감 실패');
    expect(result).toContain(`${currYear}년 ${currMonth}월은 아직 끝나지 않았습니다`);
    expect(result, '토스트에 서버 메시지의 앞 이모지를 내지 않는다').not.toMatch(/[❌⛔✅]/);

    // 거절 시 모달은 그대로 열려 있고(재시도 가능), 서버 상태는 변하지 않았다
    await expect(app.locator('#modalOverlay')).toHaveClass(/active/);
    await app.locator('#modalFooter').getByRole('button', { name: '취소' }).click();

    const after = await snapshotServerState(app);
    expect(after.cutoff, '마감 기준일이 바뀌면 안 된다').toBe(before.cutoff);
    expect(after.recent, '입출고 내역이 바뀌면 안 된다').toBe(before.recent);
  });

  /**
   * 실제 `executeMonthlyClosing` 호출 검증.
   * DEV 시트가 마감돼도 무방함을 E2E_ALLOW_MONTHLY_CLOSING=1 로 승인한 경우에만 실행한다.
   * [TASK-028] 모달 기본 선택(다음 마감 대상)을 그대로 실행한다 — 결과는 마감 완료이거나 서버 거절 문구 중 하나다.
   */
  test('마감 실행: 서버 응답 토스트를 수신한다 (E2E_ALLOW_MONTHLY_CLOSING=1 필요)', async ({ page }) => {
    test.skip(
      !ALLOW_REAL_CLOSING,
      '실제 월마감은 DEV 시트를 비가역적으로 변경한다. 승인 시 E2E_ALLOW_MONTHLY_CLOSING=1 로 실행할 것.'
    );

    const app = await login(page);
    await gotoTransactionTab(page, app);

    await openClosingModal(page, app);
    const year = await app.locator('#closingYear').inputValue();
    const month = await app.locator('#closingMonth').inputValue();
    await app.locator('#modalFooter').getByRole('button', { name: '실행', exact: true }).click();

    await app.locator('#closingConfirmText').fill('동의');
    await app.locator('#modalFooter').getByRole('button', { name: '최종 마감 실행' }).click();

    // 진행 안내 토스트 → 이후 서버 결과 토스트
    expect(await lastToastText(app)).toContain('마감 및 이월 데이터 생성 중');
    await waitForIdle(page, app, 5 * 60 * 1000);

    const result = await lastToastText(app);
    console.log(`[월마감 ${year}-${month}] 서버 응답: ${result}`);

    // 대상 데이터가 없으면 실패 토스트, 있으면 마감 완료 토스트, [TASK-028] 대상 월 검증 거절 — 이 중 하나여야 한다
    expect(
      /아카이브할 입출고 데이터나 초기 재고가 없습니다|마감 완료|이미 마감된 월입니다|아직 끝나지 않았습니다|순서대로 마감하세요|파일이 이미 있습니다/.test(result),
      `예상치 못한 서버 응답: ${result}`
    ).toBe(true);

    if (/마감 완료/.test(result)) {
      expect(result, '이중 계상 위험이 감지되면 마감 결과를 신뢰할 수 없다').not.toContain('이중 계상 위험');
    }
  });
});
