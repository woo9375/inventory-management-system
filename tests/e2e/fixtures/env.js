/**
 * E2E 공통 환경/헬퍼 (TASK-004)
 *
 * 인증정보는 소스에 하드코딩하지 않고 환경변수로만 주입한다.
 *   PLAYWRIGHT_BASE_URL   DEV Web App URL (.../exec)
 *   DEV_TEST_USERNAME     DEV 테스트 계정 아이디
 *   DEV_TEST_PASSWORD     DEV 테스트 계정 비밀번호
 * "실행하지 않은 테스트를 통과로 보고하지 않는다"는 원칙을 코드로 강제한다.
 */
const path = require('path');
const fs = require('fs');

// .env 파일 자동 로드
// (이 파일은 tests/e2e/fixtures/ 에 있으므로 저장소 루트는 세 단계 위다.
//  두 단계만 올라가면 tests/.env 를 보게 되어 로드가 조용히 실패한다.
//  Playwright 실행 시에는 playwright.config.js가 따로 .env를 읽어 가려져 있던 버그)
const envPath = path.join(__dirname, '..', '..', '..', '.env');
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

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || '';
const USERNAME = process.env.DEV_TEST_USERNAME || '';
const PASSWORD = process.env.DEV_TEST_PASSWORD || '';

/** DEV 시드 품목 코드 — src/DevTools.gs의 seedDevData()와 일치해야 한다 */
const SEED_ITEMS = {
  ITEM_1: 'ITEM-TEST-001',
  ITEM_2: 'ITEM-TEST-002',
  ITEM_3: 'ITEM-TEST-003',
};

function hasBaseUrl() {
  return Boolean(BASE_URL);
}

function hasCredentials() {
  return Boolean(BASE_URL && USERNAME && PASSWORD);
}

/** 환경변수 누락 시 사람이 읽을 수 있는 skip 사유 */
function missingEnvReason() {
  const missing = [];
  if (!BASE_URL) missing.push('PLAYWRIGHT_BASE_URL');
  if (!USERNAME) missing.push('DEV_TEST_USERNAME');
  if (!PASSWORD) missing.push('DEV_TEST_PASSWORD');
  return `DEV 환경변수 미설정: ${missing.join(', ')} (.env.example 참고)`;
}

/**
 * 앱 자체 로그인 화면을 통과한다.
 * 주의: DEV Web App 배포의 접근 권한이 "Google 계정이 있는 모든 사용자"인 경우
 * 이 단계 이전에 Google 로그인이 먼저 요구되며, 그 경우 이 헬퍼는 실패한다.
 * (해결: 배포 접근 권한을 "모든 사용자"로 변경하거나 storageState 사용)
 */
function getAppFrame(page) {
  return page.frameLocator('iframe#sandboxFrame').frameLocator('iframe#userHtmlFrame');
}

/**
 * 앱 진입. baseURL이 `/macros/s/<id>/exec` 형태의 경로를 포함하므로
 * page.goto('/')를 쓰면 경로가 잘려 script.google.com 루트로 가버린다.
 * 반드시 절대 URL로 이동한 후 앱의 iframe FrameLocator를 반환한다.
 */
async function gotoApp(page) {
  await page.goto(BASE_URL, { waitUntil: 'load' });
  const app = getAppFrame(page);
  await app.locator('body').waitFor({ state: 'attached', timeout: 30000 }).catch(() => {});
  return app;
}

async function login(page) {
  const app = await gotoApp(page);

  // Google 로그인 화면으로 리다이렉트된 경우를 명확한 메시지로 구분한다
  if (page.url().includes('accounts.google.com')) {
    throw new Error(
      'DEV Web App이 Google 계정 로그인을 요구합니다.\n' +
      '`node tests/e2e/save-auth-state.js`를 1회 실행해 인증 프로필(.playwright/user-data)을 만드십시오.\n' +
      '영속 프로필이므로 이후 실행에서는 세션이 스스로 갱신되어 재로그인이 필요 없습니다.'
    );
  }

  await app.locator('#loginUsername').fill(USERNAME);
  await app.locator('#loginPassword').fill(PASSWORD);
  await app.locator('#loginBtn').click();

  // 로그인 성공 시 앱 컨테이너가 표시된다
  await app.locator('#appContainer').waitFor({ state: 'visible', timeout: 60000 });
  return app;
}

/**
 * 로딩 오버레이가 사라질 때까지 대기 (google.script.run 완료 신호)
 *
 * 주의: `#loadingOverlay`는 항상 DOM에 있고 뷰포트를 덮은 채 `opacity`로만 숨겨진다
 * (`.loading-overlay { opacity: 0 }` → `.active`일 때 `opacity: 1`).
 * Playwright의 visible 판정은 opacity를 보지 않으므로 `state:'hidden'`은 절대 만족되지
 * 않아 매 호출이 타임아웃(60초)을 통째로 소모했다. `.active` 클래스 유무로 판정한다.
 */
async function waitForIdle(page, app, timeout = 60000) {
  const target = app || getAppFrame(page);
  const busy = target.locator('#loadingOverlay.active');
  // 요청이 시작돼 오버레이가 뜨는 것을 짧게 기다린 뒤(이미 끝났으면 즉시 통과),
  // 오버레이가 걷힐 때까지 대기한다.
  await busy.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  await busy.waitFor({ state: 'detached', timeout }).catch(() => {});
}

module.exports = {
  BASE_URL,
  USERNAME,
  PASSWORD,
  SEED_ITEMS,
  hasBaseUrl,
  hasCredentials,
  missingEnvReason,
  getAppFrame,
  gotoApp,
  login,
  waitForIdle,
};
