const { test, expect } = require('./fixtures/browser');
const { hasBaseUrl, missingEnvReason, gotoApp } = require('./fixtures/env');

/**
 * Smoke: 인증정보 없이도 확인 가능한 것만 검증한다.
 * DEV Web App에 도달할 수 있는지, 로그인 화면이 렌더링되는지까지.
 */
test.describe('DEV Web App smoke', () => {
  test.skip(!hasBaseUrl(), missingEnvReason());

  test('DEV Web App에 접속되고 로그인 화면이 렌더링된다', async ({ page }) => {
    const app = await gotoApp(page);

    // Google 로그인으로 튕기면 인증 세션이 없는 것이므로 명확히 실패시킨다
    expect(
      page.url(),
      'DEV Web App이 Google 계정 로그인을 요구합니다. ' +
      '`node tests/e2e/save-auth-state.js`를 1회 실행해 인증 프로필을 만드십시오 ' +
      '(.playwright/user-data). 이후에는 프로필이 세션을 스스로 갱신합니다.'
    ).not.toContain('accounts.google.com');

    await expect(app.locator('#loginContainer')).toBeVisible();
    await expect(app.locator('#loginUsername')).toBeVisible();
    await expect(app.locator('#loginPassword')).toBeVisible();
    await expect(app.locator('#loginBtn')).toBeVisible();
  });

  test('SheetJS(XLSX) 라이브러리가 로드된다', async ({ page }) => {
    // 실사 Excel 다운로드(TASK-001B)의 전제 조건
    await gotoApp(page);
    expect(page.url(), 'Google 로그인 필요 — 위 테스트 참고').not.toContain('accounts.google.com');
    const userFrame = page.frame({ name: 'userHtmlFrame' }) || page.frames().find(f => f.name() === 'userHtmlFrame');
    const hasXlsx = await userFrame.evaluate(() => typeof window.XLSX !== 'undefined');
    expect(hasXlsx, 'CDN에서 XLSX 라이브러리가 로드되지 않았습니다').toBe(true);
  });
});
