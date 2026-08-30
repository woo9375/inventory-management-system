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

// Production Web App 배포 ID (이 값이 baseURL에 있으면 테스트 금지)
const PRODUCTION_DEPLOYMENT_ID =
  'AKfycbyi8O68axsIkBF-6yipKnV_6uSF-Q4zvbEhJKYVuObRX7c5V_Qzv3LnjOXZpbSosNTAbw';

if (BASE_URL && BASE_URL.includes(PRODUCTION_DEPLOYMENT_ID)) {
  throw new Error(
    '⛔ PLAYWRIGHT_BASE_URL이 Production Web App을 가리키고 있습니다.\n' +
    'E2E 테스트는 DEV 환경에서만 실행해야 합니다. .env의 PLAYWRIGHT_BASE_URL을 확인하십시오.'
  );
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
    // 로그인 상태를 재사용할 경우에만 사용 (절대 커밋 금지 - .gitignore 처리됨)
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE || undefined,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
