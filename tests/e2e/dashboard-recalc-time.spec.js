const fs = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures/browser');
const { hasBaseUrl, hasCredentials, missingEnvReason, login, waitForIdle } = require('./fixtures/env');

/**
 * [TASK-029] 대시보드 헤더 「재고 계산 기준」 · 통합 갱신 직후 화면 재조회
 *
 * 헤더 시각은 "재고를 마지막으로 재계산한 시각"(recalcStockAndUsage가 남긴 LAST_SYNC_TIMESTAMP)이어야 한다 —
 * 예전 「최신 갱신일」은 서버가 대시보드를 읽어 캐시한 시각이라 KPI가 언제 계산됐는지와 무관했다.
 *
 * 1) 읽기만: 헤더 텍스트 == 서버 recalcAtText, recalcAt == getLastSyncTime, 24시간 경과 배지는 나이와 일치.
 * 2) 쓰기(게이트): 「통합갱신」을 실제로 돌린다 — DEV 시트를 취합·재계산하며 수 분 걸릴 수 있다.
 *      E2E_ALLOW_REFRESH=1  일 때만 실행.
 * 스크린샷(UIGuidelines §7): AI/audits/UI-AUDIT-001/after/TASK-029/ 에 1440 / 768 실측(평상시·배지)을 남긴다.
 */
const ALLOW_REFRESH = process.env.E2E_ALLOW_REFRESH === '1';
const STALE_MS = 24 * 60 * 60 * 1000;

test.describe('DEV 대시보드 재고 계산 기준', () => {
  test.skip(!hasBaseUrl() || !hasCredentials(), missingEnvReason());

  const SHOT_DIR = path.join(__dirname, '..', '..', 'AI', 'audits', 'UI-AUDIT-001', 'after', 'TASK-029');
  function shot(page, name) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    return page.screenshot({ path: path.join(SHOT_DIR, name + '.png'), fullPage: false });
  }
  /** 배포된 renderDashboard로 "N시간 전 재계산" 상태를 흉내 낸다 (서버 데이터와 무관하게 배지 판정을 본다) */
  function renderAged(page, hoursAgo, text) {
    return appFrame(page).evaluate(([ms, t]) => {
      renderDashboard({ recalcAt: new Date(Date.now() - ms).toISOString(), recalcAtText: t,
        season: '비수기', seasonMultiplier: 1, kpi: { total: 0, risk: 0, order: 0, normal: 0 }, alertItems: [] });
    }, [hoursAgo * 60 * 60 * 1000, text]);
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

  /** 헤더·배지가 서버 응답과 맞는지 — 대시보드 응답을 돌려준다 */
  async function expectHeaderMatchesServer(page, app) {
    const dash = await callServer(page, 'getDashboardData');
    expect(dash.success, '서버 대시보드 응답').toBe(true);
    expect(dash, '옛 date 필드는 없어야 한다').not.toHaveProperty('date');
    await expect(app.locator('#dashDate')).toHaveText('재고 계산 기준: ' + (dash.recalcAtText || '기록 없음'));

    const last = await callServer(page, 'getLastSyncTime');
    expect(last.timestamp, 'recalcAt은 LAST_SYNC_TIMESTAMP 그대로').toBe(dash.recalcAt);

    const stale = !!dash.recalcAt && Date.now() - new Date(dash.recalcAt).getTime() > STALE_MS;
    const badge = app.locator('#dashStaleBadge');
    if (stale) {
      await expect(badge, '하루 넘게 재계산이 없으면 배지').toBeVisible();
      await expect(badge).toHaveText('하루 이상 지난 계산');
    } else {
      await expect(badge, '24시간 안이면 배지 없음').toBeHidden();
    }
    return dash;
  }

  test('로그인 직후 헤더 시각은 서버의 재고 재계산 시각이고, 배지는 24시간 경과 여부와 일치한다', async ({ page }) => {
    const app = await login(page);
    await waitForIdle(page, app);
    const dash = await expectHeaderMatchesServer(page, app);
    if (dash.recalcAtText) {
      expect(dash.recalcAtText).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      expect(dash.recalcAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    await shot(page, 'E01-dashboard-recalc-1440');

    // 25시간 전 값을 흉내 내면 배포된 렌더링 코드가 배지를 띄우는지 (서버 데이터와 무관하게 검증)
    await renderAged(page, 25, '2000-01-01 00:00');
    await expect(app.locator('#dashStaleBadge')).toBeVisible();
    await expect(app.locator('#dashDate')).toHaveText('재고 계산 기준: 2000-01-01 00:00');
    // 이모지 없이 색+텍스트 pill (UIGuidelines §3·§5) — 앰버(--order-text #d97706)
    const color = await app.locator('#dashStaleBadge').evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(217, 119, 6)');
    await shot(page, 'E02-dashboard-stale-badge-1440');
    await renderAged(page, 1, '2000-01-01 00:00');
    await expect(app.locator('#dashStaleBadge')).toBeHidden();
  });

  test('768px: 헤더(시각·배지)가 가로로 넘치지 않는다 (UIGuidelines §1)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const app = await login(page);
    await waitForIdle(page, app);
    await expectHeaderMatchesServer(page, app);
    await shot(page, 'E03-dashboard-recalc-768');
    await renderAged(page, 25, '2000-01-01 00:00');
    await expect(app.locator('#dashStaleBadge')).toBeVisible();
    await shot(page, 'E04-dashboard-stale-badge-768');
    const overflow = await appFrame(page).evaluate(() => {
      const el = document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });

  test('「통합갱신」 실행 → 완료 토스트 → 헤더 시각이 실행 시각으로 바뀌고 KPI가 다시 그려진다 (E2E_ALLOW_REFRESH=1 필요)', async ({ page }) => {
    test.skip(!ALLOW_REFRESH, 'DEV 시트를 실제로 취합·재계산한다(수 분). 동의 시 E2E_ALLOW_REFRESH=1 로 실행하십시오.');
    test.setTimeout(6 * 60 * 1000);

    const app = await login(page);
    await waitForIdle(page, app);
    const before = await expectHeaderMatchesServer(page, app);
    const startedAt = Date.now();

    await app.locator('#tab-dashboard .page-header button', { hasText: '통합갱신' }).click();
    await expect(app.locator('#modalOverlay')).toHaveClass(/active/);
    await expect(app.locator('#modalTitle')).toHaveText('통합 갱신');
    await app.locator('#btnSystemCommandSubmit').click();
    await expect(app.locator('#modalOverlay')).not.toHaveClass(/active/);

    // 웹앱 경로의 문구는 runSystemCommand(WebApp.gs)가 정한다 — "대시보드 및 재고 갱신이 완료되었습니다."
    const toast = app.locator('#toastContainer .toast.success', { hasText: '재고 갱신이 완료되었습니다' });
    await toast.first().waitFor({ state: 'visible', timeout: 5 * 60 * 1000 });
    // 성공 뒤 loadDashboard가 다시 돌므로 오버레이가 걷힐 때까지 기다린다
    await waitForIdle(page, app, 120000);

    const after = await expectHeaderMatchesServer(page, app);
    expect(after.recalcAt, '재계산 시각이 새로 기록돼야 한다').not.toBe(before.recalcAt);
    expect(new Date(after.recalcAt).getTime()).toBeGreaterThanOrEqual(startedAt - 60000);
    await expect(app.locator('#dashStaleBadge')).toBeHidden();
    await expect(app.locator('#kpiTotal')).toHaveText(String(after.kpi.total));
    await expect(app.locator('#alertTableBody')).not.toContainText('데이터를 불러오는 중');
  });
});
