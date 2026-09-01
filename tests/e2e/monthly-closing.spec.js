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
 * 참고: 월마감 버튼에는 별도 id가 없다(`Index.html` 입출고 기록 탭 헤더의 `.admin-only` 버튼).
 *       또한 모달/로딩 오버레이는 `display`가 아니라 `opacity`로만 숨겨지므로
 *       Playwright의 visible 판정이 아니라 `.active` 클래스 유무로 열림/닫힘을 판정한다.
 */

const CLOSING_BUTTON = /수동 월마감/;
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

test.describe('DEV 수동 월마감 UI', () => {
  test.skip(!hasCredentials(), missingEnvReason());

  test.setTimeout(5 * 60 * 1000);

  test('비관리자는 월마감 버튼이 숨겨지고, 강제 호출해도 차단 토스트가 뜬다', async ({ page }) => {
    const app = await login(page);
    await gotoTransactionTab(page, app);

    const closingButton = app.getByRole('button', { name: CLOSING_BUTTON });
    await expect(closingButton, 'admin에게는 월마감 버튼이 보여야 한다').toBeVisible();

    // staff 계정 자격증명 없이 클라이언트 가드를 검증한다.
    // (staff로 실제 로그인하면 .admin-only가 display:none이 되어 클릭 자체가 불가능하다)
    // 주의: 앱의 currentUser는 `let` 선언이라 window 프로퍼티가 아니다.
    // evaluate 콜백은 페이지의 전역 렉시컬 스코프에서 평가되므로 식별자를 그대로 참조한다.
    await app.locator('body').evaluate(() => {
      currentUser.role = 'staff';
      applyRolePermissions();
    });
    await expect(closingButton, 'staff에게는 버튼이 숨겨져야 한다').toBeHidden();

    await app.locator('body').evaluate(() => openMonthlyClosingModal());

    expect(await lastToastText(app)).toContain('최고 관리자만 실행할 수 있습니다.');
    await expect(app.locator('#modalOverlay'), '차단 시 모달이 열리면 안 된다').not.toHaveClass(/active/);
  });

  test('1차 모달 → 2차 확인 모달로 이어지고, "동의" 오입력 시 실행이 차단된다', async ({ page }) => {
    const app = await login(page);
    await gotoTransactionTab(page, app);

    // ── 1차 모달: 연/월 선택 ──
    await app.getByRole('button', { name: CLOSING_BUTTON }).click();
    await expect(app.locator('#modalOverlay')).toHaveClass(/active/);
    await expect(app.locator('#modalTitle')).toContainText('월마감 및 재고 이월 실행');
    await expect(app.locator('#modalBody')).toContainText('⚠️ 경고');

    const lastYear = String(new Date().getFullYear() - 1);
    await app.locator('#closingYear').selectOption(lastYear);
    await app.locator('#closingMonth').selectOption('1');
    await expect(app.locator('#closingYear')).toHaveValue(lastYear);

    // ── 2차 모달: 최종 확인 ──
    await app.locator('#modalFooter').getByRole('button', { name: '실행', exact: true }).click();
    await expect(app.locator('#modalOverlay')).toHaveClass(/active/);
    await expect(app.locator('#modalTitle')).toContainText('월마감 최종 확인');
    await expect(app.locator('#modalBody')).toContainText(`${lastYear}년 1월 마감`);

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
   * 실제 `executeMonthlyClosing` 호출 검증.
   * DEV 시트가 마감돼도 무방함을 E2E_ALLOW_MONTHLY_CLOSING=1 로 승인한 경우에만 실행한다.
   */
  test('마감 실행: 서버 응답 토스트를 수신한다 (E2E_ALLOW_MONTHLY_CLOSING=1 필요)', async ({ page }) => {
    test.skip(
      !ALLOW_REAL_CLOSING,
      '실제 월마감은 DEV 시트를 비가역적으로 변경한다. 승인 시 E2E_ALLOW_MONTHLY_CLOSING=1 로 실행할 것.'
    );

    const app = await login(page);
    await gotoTransactionTab(page, app);

    await app.getByRole('button', { name: CLOSING_BUTTON }).click();
    const lastYear = String(new Date().getFullYear() - 1);
    await app.locator('#closingYear').selectOption(lastYear);
    await app.locator('#closingMonth').selectOption('1');
    await app.locator('#modalFooter').getByRole('button', { name: '실행', exact: true }).click();

    await app.locator('#closingConfirmText').fill('동의');
    await app.locator('#modalFooter').getByRole('button', { name: '최종 마감 실행' }).click();

    // 진행 안내 토스트 → 이후 서버 결과 토스트
    expect(await lastToastText(app)).toContain('마감 및 이월 데이터 생성 중');
    await waitForIdle(page, app, 5 * 60 * 1000);

    const result = await lastToastText(app);
    console.log(`[월마감 ${lastYear}-01] 서버 응답: ${result}`);

    // 대상 데이터가 없으면 실패 토스트, 있으면 마감 완료 토스트 — 둘 중 하나여야 한다
    expect(
      /아카이브할 입출고 데이터나 초기 재고가 없습니다|마감 완료/.test(result),
      `예상치 못한 서버 응답: ${result}`
    ).toBe(true);

    if (/마감 완료/.test(result)) {
      expect(result, '이중 계상 위험이 감지되면 마감 결과를 신뢰할 수 없다').not.toContain('이중 계상 위험');
    }
  });
});
