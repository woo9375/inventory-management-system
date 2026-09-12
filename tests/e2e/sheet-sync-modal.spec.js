const { test, expect } = require('./fixtures/browser');
const { hasBaseUrl, hasCredentials, missingEnvReason, login, waitForIdle } = require('./fixtures/env');

/**
 * [TASK-023] 「시트 동기화」 안내 모달 E2E
 *
 * 대시보드·입출고 기록 헤더의 「시트 동기화」는 이제 확인 없이 바로 돌지 않고
 *   안내 모달(제목 · 설명 · 주의사항 2개 · [취소] [동기화]) → [동기화] → 캐시 무효화 → 성공 토스트 1회 → 화면 재조회
 * 순서로 간다. 안내 문구는 서버 SYSTEM_ACTIONS(Config.gs)가 Index.html에 주입한 것이므로,
 * 모달에 보이는 문장이 곧 시트 관리자 도구 대화상자가 쓰는 문장이다.
 *
 * 권한: 시트 동기화는 admin 전용이 아니다. 마지막 테스트가 DEV에 임시 manager 계정을 만들어 확인하고 지운다.
 */
test.describe('DEV 시트 동기화 안내 모달', () => {
  test.skip(!hasBaseUrl() || !hasCredentials(), missingEnvReason());

  const SUCCESS_TOAST = '구글 시트 동기화가 완료되었습니다.';

  function appFrame(page) {
    return page.frame({ name: 'userHtmlFrame' }) || page.frames().find((fr) => fr.name() === 'userHtmlFrame');
  }

  /** 앱 프레임 안에서 google.script.run을 직접 부른다 (토큰은 앱의 getToken()) */
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

  /** 서버가 주입한 SYSTEM_ACTIONS.forceRefresh — 모달 문구의 기준값 */
  async function injectedAction(page) {
    return appFrame(page).evaluate(() => SYSTEM_ACTIONS.forceRefresh);
  }

  /** 입출고 기록 탭 — 선택된 업장이 없으면 업장 선택 모달이 먼저 뜨므로 첫 업장을 골라 닫는다 */
  async function openTransactionsTab(page, app) {
    await app.locator('.sidebar-nav .nav-item', { hasText: '입출고 기록' }).click();
    await waitForIdle(page, app);
    await expect(app.locator('#tab-transactions')).toHaveClass(/active/);
    const shopButton = app.locator('#modalOverlay.active #shopSelectionList button').first();
    if (await shopButton.isVisible().catch(() => false)) {
      await shopButton.click();
      await waitForIdle(page, app);
    }
    await expect(app.locator('#modalOverlay')).not.toHaveClass(/active/);
  }

  /** 탭 헤더의 「시트 동기화」 버튼 */
  function syncButton(app, tabId) {
    return app.locator('#' + tabId + ' .page-header button', { hasText: '시트 동기화' });
  }

  /** 모달이 열려 있고 안내문이 SSOT와 일치하는지 확인한 뒤 모달 locator를 돌려준다 */
  async function expectSyncModal(page, app) {
    const action = await injectedAction(page);
    const overlay = app.locator('#modalOverlay');
    await expect(overlay).toHaveClass(/active/);
    await expect(app.locator('#modalTitle')).toHaveText(action.title);
    await expect(app.locator('#modalTitle')).toHaveText('시트 동기화');

    const guide = app.locator('#modalBody .action-guide');
    await expect(guide.locator('.desc')).toHaveText(action.desc);
    await expect(guide.locator('li')).toHaveCount(2);
    for (let i = 0; i < action.bullets.length; i++) {
      await expect(guide.locator('li').nth(i)).toHaveText(action.bullets[i]);
    }

    const cancel = app.locator('#modalFooter button', { hasText: '취소' });
    const submit = app.locator('#btnForceRefreshSubmit');
    await expect(cancel).toHaveClass(/btn-outline/);
    await expect(submit).toHaveClass(/btn-primary/);
    await expect(submit).toHaveText(action.btnText);
    return { overlay, cancel, submit };
  }

  /** [취소] → 모달이 닫히고 서버 호출(로딩)도 성공 토스트도 없어야 한다 */
  async function expectCancelDoesNothing(page, app, modal) {
    await modal.cancel.click();
    await expect(modal.overlay).not.toHaveClass(/active/);
    await page.waitForTimeout(1500);
    await expect(app.locator('#loadingOverlay.active')).toHaveCount(0);
    await expect(app.locator('#toastContainer .toast', { hasText: SUCCESS_TOAST })).toHaveCount(0);
  }

  /** [동기화] → 모달 닫힘 → 성공 토스트 정확히 1회 → 로딩 종료 */
  async function expectRunSucceeds(page, app, modal) {
    await modal.submit.click();
    await expect(modal.overlay).not.toHaveClass(/active/);
    const toast = app.locator('#toastContainer .toast.success', { hasText: SUCCESS_TOAST });
    await toast.first().waitFor({ state: 'visible', timeout: 60000 });
    // 토스트는 4초 뒤 사라지므로 화면 재조회(로딩)가 끝나기 전에 개수를 센다
    await expect(toast).toHaveCount(1);
    await waitForIdle(page, app);
  }

  test('대시보드: 시트 동기화 버튼 → 안내 모달 → 취소/동기화', async ({ page }) => {
    const app = await login(page);
    await waitForIdle(page, app);
    await expect(app.locator('#tab-dashboard')).toHaveClass(/active/);

    // 예전처럼 클릭 즉시 로딩이 뜨면 안 된다 — 모달이 먼저다
    await syncButton(app, 'tab-dashboard').click();
    let modal = await expectSyncModal(page, app);
    await expectCancelDoesNothing(page, app, modal);

    await syncButton(app, 'tab-dashboard').click();
    modal = await expectSyncModal(page, app);
    await expectRunSucceeds(page, app, modal);

    // 동기화 뒤 대시보드가 다시 그려져 있어야 한다 (KPI가 비지 않음)
    await expect(app.locator('#tab-dashboard')).toHaveClass(/active/);
    await expect(app.locator('#dashDate')).not.toHaveText('-');
  });

  test('입출고 기록: 시트 동기화 버튼 → 안내 모달 → 취소/동기화', async ({ page }) => {
    const app = await login(page);
    await waitForIdle(page, app);
    await openTransactionsTab(page, app);

    await syncButton(app, 'tab-transactions').click();
    let modal = await expectSyncModal(page, app);
    await expectCancelDoesNothing(page, app, modal);

    await syncButton(app, 'tab-transactions').click();
    modal = await expectSyncModal(page, app);
    await expectRunSucceeds(page, app, modal);
    await expect(app.locator('#tab-transactions')).toHaveClass(/active/);
  });

  test('manager 계정도 시트 동기화 모달을 열고 실행할 수 있다 (admin 게이트 없음)', async ({ page }) => {
    test.setTimeout(240000);
    const username = 'e2e-mgr-' + Date.now().toString(36);
    const password = 'E2e-pass-' + Date.now();

    // admin으로 임시 manager 계정을 만든다
    let app = await login(page);
    await waitForIdle(page, app);
    const created = await callServer(page, 'createUser', [{ username, password, name: 'E2E 매니저', dept: 'E2E', role: 'manager' }]);
    expect(created && created.success, '임시 계정 생성 실패: ' + JSON.stringify(created)).toBe(true);

    try {
      await app.locator('.logout-btn').click();
      await expect(app.locator('#loginUsername')).toBeVisible();

      app = await login(page, { username, password });
      await waitForIdle(page, app);
      // manager에게는 관리자 전용 컨트롤이 숨겨진다 — 그래도 시트 동기화는 보여야 한다
      await expect(app.locator('#navUser')).toBeHidden();
      await expect(syncButton(app, 'tab-dashboard')).toBeVisible();

      await syncButton(app, 'tab-dashboard').click();
      let modal = await expectSyncModal(page, app);
      await expectRunSucceeds(page, app, modal);
      await expect(app.locator('#toastContainer .toast', { hasText: '최고 관리자만' })).toHaveCount(0);

      await openTransactionsTab(page, app);
      await syncButton(app, 'tab-transactions').click();
      modal = await expectSyncModal(page, app);
      await expectCancelDoesNothing(page, app, modal);
    } finally {
      // admin으로 돌아가 임시 계정을 지운다
      await app.locator('.logout-btn').click().catch(() => {});
      await expect(app.locator('#loginUsername')).toBeVisible();
      app = await login(page);
      await waitForIdle(page, app);
      const deleted = await callServer(page, 'deleteUser', [username]);
      expect(deleted && deleted.success, '임시 계정 삭제 실패: ' + JSON.stringify(deleted)).toBe(true);
    }
  });
});
