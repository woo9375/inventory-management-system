/**
 * Production Web App 차단 가드 — **배포 ID의 단일 정의처**.
 *
 * 이 목록은 원래 `playwright.config.js`와 `tests/e2e/save-auth-state.js`에 각각 복사돼 있었고,
 * 2026-09-02 배포 정리로 대상 배포(@17)가 삭제되자 **양쪽 다 아무것도 막지 못하는 상태**가 됐다.
 * 사본은 반드시 낡으므로 여기 한 곳에서만 정의하고 두 곳이 이것을 가져다 쓴다.
 *
 * Production 배포 목록은 `npm run prod:status`로 확인한다.
 * 배포를 새로 만들거나 교체하면 **이 파일을 함께 갱신할 것.**
 */

/**
 * E2E가 절대 붙으면 안 되는 Production 배포 ID.
 *
 * 상시 배포뿐 아니라 **HEAD 배포도 포함해야 한다** — 둘 다 같은 Production 스프레드시트를
 * 읽고 쓰기 때문이다. 하나만 막으면 나머지 경로로 실데이터가 오염될 수 있다.
 */
const PRODUCTION_DEPLOYMENT_IDS = [
  'AKfycbyjoryKydzwRJoLzzgzgcgmLZYASjTjWyl8fidtJhXikudFnlqCb1-4j-zPdlwRZ7Y9hA', // @버전 (상시 배포)
  'AKfycbyrEUSrQC5ZMGfTHuwL5nhzGKDW7JBQx2hiWE2wEeJc' // @HEAD (테스트 배포)
];

/** 주어진 URL이 Production 웹앱을 가리키는가 */
function isProductionUrl(url) {
  if (!url) return false;
  return PRODUCTION_DEPLOYMENT_IDS.some((id) => url.includes(id));
}

const PRODUCTION_BLOCKED_MESSAGE =
  '⛔ PLAYWRIGHT_BASE_URL이 Production Web App을 가리키고 있습니다.\n' +
  'E2E 테스트는 DEV 환경에서만 실행해야 합니다. .env의 PLAYWRIGHT_BASE_URL을 확인하십시오.\n' +
  '(DEV 웹앱 URL은 Docs/Deployment.md의 "웹앱 URL" 표 참고)';

module.exports = {
  PRODUCTION_DEPLOYMENT_IDS,
  isProductionUrl,
  PRODUCTION_BLOCKED_MESSAGE
};
