// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// .env 파일 자동 로드
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key] && val) {
        process.env[key] = val;
      }
    }
  }
}

/**
 * Playwright 설정 (TASK-004)
 *
 * 테스트 대상 URL은 반드시 환경변수로 주입한다. Production URL을 기본값으로 두지 않는다.
 *   PLAYWRIGHT_BASE_URL = DEV Web App URL (.../exec)
 *
 * 안전장치: Production Web App 배포 ID가 URL에 포함되면 즉시 실행을 중단한다.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || '';

// Production 배포 ID는 tests/e2e/fixtures/production-guard.js 한 곳에서만 정의한다.
// (예전에는 이 파일과 save-auth-state.js에 각각 복사돼 있었고, 대상 배포가 삭제되자 둘 다 무력화됐다)
const { isProductionUrl, PRODUCTION_BLOCKED_MESSAGE } = require('./tests/e2e/fixtures/production-guard');

if (isProductionUrl(BASE_URL)) {
  throw new Error(PRODUCTION_BLOCKED_MESSAGE);
}

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,     // GAS 웹앱은 동일 스프레드시트를 공유하므로 순차 실행
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 180 * 1000,       // GAS google.script.run 왕복은 느릴 수 있음
  expect: { timeout: 45 * 1000 },

  use: {
    baseURL: BASE_URL || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 45 * 1000,
    // [TASK-006] 인증은 tests/e2e/fixtures/browser.js의 영속 프로필(.playwright/user-data)이 담당한다.
    // storageState는 정지된 스냅샷이라 Google의 회전 쿠키를 갱신하지 못해 하루 만에 만료됐다.
    // PLAYWRIGHT_STORAGE_STATE는 신규 프로필 생성 시 기존 쿠키를 1회 이식하는 용도로만 남아 있다.
    storageState: undefined,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
