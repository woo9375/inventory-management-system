/**
 * E2E 공통 환경/헬퍼 (TASK-004)
 *
 * 인증정보는 소스에 하드코딩하지 않고 환경변수로만 주입한다.
 *   PLAYWRIGHT_BASE_URL   DEV Web App URL (.../exec)
 *   DEV_TEST_USERNAME     DEV 테스트 계정 아이디
 *   DEV_TEST_PASSWORD     DEV 테스트 계정 비밀번호
 *
 * 값이 없으면 테스트는 실패가 아니라 skip 되어야 한다 —
 * "실행하지 않은 테스트를 통과로 보고하지 않는다"는 원칙을 코드로 강제한다.
 */

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
/**
 * 앱 진입. baseURL이 `/macros/s/<id>/exec` 형태의 경로를 포함하므로
 * page.goto('/')를 쓰면 경로가 잘려 script.google.com 루트로 가버린다.
 * 반드시 절대 URL로 이동한다.
 */
async function gotoApp(page) {
  await page.goto(BASE_URL, { waitUntil: 'load' });
}

async function login(page) {
  await gotoApp(page);

  // Google 로그인 화면으로 리다이렉트된 경우를 명확한 메시지로 구분한다
  if (page.url().includes('accounts.google.com')) {
    throw new Error(
      'DEV Web App이 Google 계정 로그인을 요구합니다.\n' +
      '배포 설정의 접근 권한을 "모든 사용자(Anyone)"로 변경하거나, ' +
      'PLAYWRIGHT_STORAGE_STATE로 인증된 세션을 주입하십시오.'
    );
  }

  await page.locator('#loginUsername').fill(USERNAME);
  await page.locator('#loginPassword').fill(PASSWORD);
  await page.locator('#loginBtn').click();

  // 로그인 성공 시 앱 컨테이너가 표시된다
  await page.locator('#appContainer').waitFor({ state: 'visible', timeout: 60000 });
}

/** 로딩 오버레이가 사라질 때까지 대기 (google.script.run 완료 신호) */
async function waitForIdle(page) {
  await page.locator('#loadingOverlay').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
}

module.exports = {
  BASE_URL,
  USERNAME,
  PASSWORD,
  SEED_ITEMS,
  hasBaseUrl,
  hasCredentials,
  missingEnvReason,
  gotoApp,
  login,
  waitForIdle,
};
