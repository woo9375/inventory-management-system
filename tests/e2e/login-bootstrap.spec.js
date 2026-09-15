const { test, expect } = require('./fixtures/browser');
const { hasBaseUrl, hasCredentials, missingEnvReason, login, waitForIdle, getAppFrame } = require('./fixtures/env');

/**
 * 로그인 직후 첫 화면(대시보드)이 「시트 동기화」 없이 채워지는지 — 2026-09-15 핫픽스 회귀 방지
 *
 * 증상: 로그인·재접속마다 KPI가 '-', 알림 표가 "데이터를 불러오는 중..."에 멈춰 있고 시트 동기화를 눌러야 채워졌다.
 * 원인: loadBootstrap 성공 핸들러가 사라진 요소(#lastSyncTimeText)에 쓰다 TypeError → 뒤의 renderDashboard 미실행.
 * 서버 응답(getBootstrapData)은 정상이었으므로 서버 값과 화면 값을 직접 맞춰 본다.
 */
test.describe('DEV 로그인 부트스트랩', () => {
  test.skip(!hasBaseUrl() || !hasCredentials(), missingEnvReason());

  function appFrame(page) {
    return page.frame({ name: 'userHtmlFrame' }) || page.frames().find((fr) => fr.name() === 'userHtmlFrame');
  }

  async function serverDashboard(page) {
    return appFrame(page).evaluate(
      () =>
        new Promise((resolve, reject) => {
          google.script.run
            .withSuccessHandler((b) => resolve(b.dashboard))
            .withFailureHandler((e) => reject(new Error(String((e && e.message) || e))))
            .getBootstrapData(getToken());
        })
    );
  }

  async function expectDashboardRendered(page, app) {
    const dash = await serverDashboard(page);
    expect(dash.success, '서버 대시보드 응답').toBe(true);
    await expect(app.locator('#kpiTotal')).toHaveText(String(dash.kpi.total));
    await expect(app.locator('#kpiRisk')).toHaveText(String(dash.kpi.risk));
    await expect(app.locator('#kpiOrder')).toHaveText(String(dash.kpi.order));
    await expect(app.locator('#kpiNormal')).toHaveText(String(dash.kpi.normal));
    // [TASK-029] 헤더 시각은 서버가 포맷한 재고 재계산 시각(없으면 '기록 없음')
    await expect(app.locator('#dashDate')).toHaveText('재고 계산 기준: ' + (dash.recalcAtText || '기록 없음'));
    const stale = !!dash.recalcAt && Date.now() - new Date(dash.recalcAt).getTime() > 24 * 60 * 60 * 1000;
    await expect(app.locator('#dashStaleBadge'))[stale ? 'toBeVisible' : 'toBeHidden']();
    await expect(app.locator('#alertTableBody')).not.toContainText('데이터를 불러오는 중');
    if (dash.alertItems.length === 0) {
      await expect(app.locator('#alertTableBody')).toContainText('발주 필요 품목이 없습니다');
    } else {
      await expect(app.locator('#alertTableBody tr')).toHaveCount(dash.alertItems.length);
    }
  }

  test('로그인 직후 대시보드 KPI·알림 표가 서버 값으로 채워지고, 새로고침(세션 복원) 뒤에도 그렇다', async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    const app = await login(page);
    await waitForIdle(page, app);
    await expectDashboardRendered(page, app);
    // 업장 목록·마감 기준일도 같은 응답에서 적용된다 (부트스트랩의 나머지 항목)
    expect(await app.locator('#txShopSelect option').count()).toBeGreaterThan(1);

    // 세션 복원 경로(getSessionUser → onLoginSuccess → loadBootstrap)
    await page.reload({ waitUntil: 'load' });
    const app2 = getAppFrame(page);
    await app2.locator('#appContainer').waitFor({ state: 'visible', timeout: 60000 });
    await waitForIdle(page, app2);
    await expectDashboardRendered(page, app2);

    // 부트스트랩 적용 실패는 console.error('[bootstrap] …')로 남는다 — 하나도 없어야 한다
    expect(consoleErrors.filter((t) => t.indexOf('[bootstrap]') >= 0)).toEqual([]);
    // 옛 코드에서는 TypeError가 호스트를 거쳐 pageerror(메시지 'Tr'/'Qr')로 잡혔다
    expect(pageErrors, 'pageerror').toEqual([]);
  });
});
