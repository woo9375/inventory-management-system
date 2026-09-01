/**
 * [사용자가 직접 실행] Google 인증 프로필 생성 스크립트 (TASK-004 / TASK-006 개편)
 *
 * 왜 필요한가:
 *   DEV Web App 배포의 접근 권한이 "Google 계정이 있는 모든 사용자"이므로
 *   Playwright가 앱에 도달하려면 먼저 Google 로그인이 되어 있어야 한다.
 *   Production과 manifest(appsscript.json)를 공유하기 때문에 접근 권한을
 *   "모든 사용자(익명 허용)"로 바꾸면 Production까지 공개되어 버린다.
 *
 * [TASK-006 변경] storageState 스냅샷 → 영속 브라우저 프로필
 *   기존 방식(`.playwright/dev-auth.json`)은 저장 시점의 정지된 스냅샷이라,
 *   Google의 회전 쿠키(`__Secure-1PSIDTS`/`__Secure-1PSIDRTS`, 저장 +10분 만료)가
 *   갱신되지 못해 하루 이내에 세션이 무효화됐다.
 *   이제 `.playwright/user-data` 프로필을 그대로 재사용하므로 회전 쿠키가 매 실행
 *   디스크에 되쓰기되고, **최초 1회 로그인 후에는 재로그인이 필요 없다.**
 *
 * 보안:
 *   - 비밀번호는 이 스크립트가 다루지 않는다. 열리는 실제 브라우저 창에 사용자가 직접 입력한다.
 *   - 프로필 디렉터리에는 로그인 세션이 들어 있다. `.gitignore`의 `.playwright/`로
 *     제외되어 있으며 절대 커밋하거나 공유하지 말 것.
 *
 * 사용법:
 *   1) node tests/e2e/save-auth-state.js
 *   2) 열린 브라우저에서 Google 계정으로 로그인하고 DEV 앱 화면이 보일 때까지 진행
 *   3) 터미널에서 Enter를 누르면 프로필이 저장된다
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { launchProfileContext, PROFILE_DIR } = require('./fixtures/browser');

// .env 파일이 있으면 자동 로드
const envPath = path.join(__dirname, '..', '..', '.env');
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

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL;

const PRODUCTION_DEPLOYMENT_ID =
  'AKfycbyi8O68axsIkBF-6yipKnV_6uSF-Q4zvbEhJKYVuObRX7c5V_Qzv3LnjOXZpbSosNTAbw';

(async () => {
  if (!BASE_URL) {
    console.error('✗ PLAYWRIGHT_BASE_URL 환경변수가 필요합니다 (DEV Web App URL).');
    process.exit(1);
  }
  if (BASE_URL.includes(PRODUCTION_DEPLOYMENT_ID)) {
    console.error('⛔ Production Web App URL입니다. DEV URL만 사용하십시오.');
    process.exit(1);
  }

  // 테스트가 사용하는 것과 **동일한** 프로필/실행 옵션으로 연다 (headed).
  const context = await launchProfileContext({ headless: false, viewport: null });
  const page = context.pages()[0] || (await context.newPage());

  console.log(`\n프로필 위치: ${PROFILE_DIR}`);
  console.log('브라우저를 열었습니다. 다음을 진행하십시오:');
  console.log('  1) Google 계정으로 로그인');
  console.log('  2) DEV 재고관리 시스템 로그인 화면이 보일 때까지 대기');
  console.log('  3) 이 터미널로 돌아와 Enter\n');

  await page.goto(BASE_URL, { waitUntil: 'load' }).catch(() => {});

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question('로그인을 마쳤으면 Enter를 누르세요... ', resolve));
  rl.close();

  const finalUrl = page.url();
  if (finalUrl.includes('accounts.google.com')) {
    console.error('\n✗ 아직 Google 로그인 화면입니다. 프로필을 신뢰할 수 없습니다. 다시 실행하십시오.');
    await context.close();
    process.exit(1);
  }

  // 프로필은 컨텍스트를 닫을 때 디스크에 확정 저장된다.
  await context.close();

  console.log(`\n✓ 인증 프로필 저장 완료: ${PROFILE_DIR}`);
  console.log('  이제 `npx playwright test` 가 이 프로필을 그대로 재사용하며,');
  console.log('  세션 쿠키가 실행할 때마다 갱신되므로 재로그인이 필요 없습니다.');
  console.log('  ⚠️ 이 디렉터리는 로그인 세션을 포함합니다. 절대 커밋하지 마십시오.');
})();
