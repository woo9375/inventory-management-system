const { test, expect } = require('./fixtures/browser');
const { hasCredentials, missingEnvReason, login } = require('./fixtures/env');

/**
 * [TASK-027] 서버 기본 연산 소요 시간 — DEV 전용, 기본 실행에서 제외.
 *
 *   E2E_PERF=1 npx playwright test tests/e2e/perf-server-ops.spec.js
 *
 * DevTools.gs devProfileServerOps()를 3회 불러 연산별 중앙값(ms)을 찍는다.
 * "API 하나가 왜 n초인가"를 연산 단위로 나눠 보기 위한 도구다. 단정은 호출 성공까지만.
 */
const ENABLED = process.env.E2E_PERF === '1';

test.describe('서버 기본 연산 소요 시간', () => {
  test.skip(!ENABLED, 'E2E_PERF=1 일 때만 실행');
  test.skip(!hasCredentials(), missingEnvReason());
  test.setTimeout(10 * 60 * 1000);

  test('연산별 소요 시간 표', async ({ page }) => {
    const app = await login(page);
    await page.waitForTimeout(5000);
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const r = await app.locator('body').evaluate(() => new Promise((resolve, reject) => {
        google.script.run.withSuccessHandler(resolve).withFailureHandler((e) => reject(new Error(String((e && e.message) || e))))
          .devProfileServerOps(getToken());
      }));
      expect(r && typeof r === 'object').toBe(true);
      runs.push(r);
    }
    const keys = Object.keys(runs[0]);
    const med = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    console.log('\n[PERF-OPS] 연산 | 중앙값(ms) | 3회');
    keys.forEach((k) => {
      const vals = runs.map((r) => r[k]);
      console.log(k + ' | ' + med(vals) + ' | ' + vals.join(', '));
    });
  });
});
