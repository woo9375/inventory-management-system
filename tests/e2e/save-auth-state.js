/**
 * [사용자가 직접 실행] Google 인증 세션 저장 스크립트 (TASK-004)
 *
 * 왜 필요한가:
 *   DEV Web App 배포의 접근 권한이 "Google 계정이 있는 모든 사용자"이므로
 *   Playwright가 앱에 도달하려면 먼저 Google 로그인이 되어 있어야 한다.
 *   Production과 manifest(appsscript.json)를 공유하기 때문에 접근 권한을
 *   "모든 사용자(익명 허용)"로 바꾸면 Production까지 공개되어 버린다.
 *   따라서 manifest는 그대로 두고, 인증된 브라우저 세션을 1회 저장해 재사용한다.
 *
 * 보안:
 *   - 비밀번호는 이 스크립트가 다루지 않는다. 열리는 실제 브라우저 창에
 *     사용자가 직접 입력한다.
 *   - 저장되는 파일에는 세션 쿠키가 들어 있다. .gitignore에 등록되어 있으며
 *     절대 커밋하거나 공유하지 말 것.
 *
 * 사용법:
 *   1) node tests/e2e/save-auth-state.js
 *   2) 열린 브라우저에서 Google 계정으로 로그인하고 DEV 앱 화면이 보일 때까지 진행
 *   3) 터미널에서 Enter를 누르면 세션이 저장된다
 *   4) .env 에 PLAYWRIGHT_STORAGE_STATE=./.playwright/dev-auth.json 추가
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { chromium } = require('@playwright/test');

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
const OUT_DIR = path.join(__dirname, '..', '..', '.playwright');
const OUT_FILE = path.join(OUT_DIR, 'dev-auth.json');

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

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('\n브라우저를 열었습니다. 다음을 진행하십시오:');
  console.log('  1) Google 계정으로 로그인');
  console.log('  2) DEV 재고관리 시스템 로그인 화면이 보일 때까지 대기');
  console.log('  3) 이 터미널로 돌아와 Enter\n');

  await page.goto(BASE_URL, { waitUntil: 'load' }).catch(() => {});

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question('로그인을 마쳤으면 Enter를 누르세요... ', resolve));
  rl.close();

  const finalUrl = page.url();
  if (finalUrl.includes('accounts.google.com')) {
    console.error('\n✗ 아직 Google 로그인 화면입니다. 세션을 저장하지 않았습니다.');
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: OUT_FILE });
  await browser.close();

  console.log(`\n✓ 인증 세션 저장 완료: ${OUT_FILE}`);
  console.log('  .env 에 아래 줄을 추가하십시오:');
  console.log('  PLAYWRIGHT_STORAGE_STATE=./.playwright/dev-auth.json');
  console.log('  ⚠️ 이 파일은 세션 쿠키를 포함합니다. 절대 커밋하지 마십시오.');
})();
