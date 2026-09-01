/**
 * [TASK-006] 영속 프로필 기반 브라우저 픽스처 — Google 인증 세션이 매일 만료되던 문제 해결
 *
 * ## 왜 storageState로는 안 되는가
 * `storageState`(`.playwright/dev-auth.json`)는 저장 시점의 **정지된 스냅샷**이다.
 * 그런데 Google의 로그인 세션은 `__Secure-1PSIDTS` / `__Secure-1PSIDRTS` 라는
 * **회전(rotating) 쿠키**로 유지되며, 실제 저장 파일을 열어보면 이 두 쿠키의 만료가
 * 저장 시각 +10분이다. 브라우저는 이 쿠키를 주기적으로 갱신해 새 값을 받아오지만,
 * storageState는 파일에 되쓰기가 없으므로 매 실행이 **같은 만료된 회전 토큰**을 재생한다.
 * Google은 이를 잠시 눈감아 주다가 결국 세션을 무효화하고 accounts.google.com으로 돌린다.
 * → 그래서 하루만 지나면 다시 로그인해야 했다.
 *
 * ## 해결
 * 실제 Chrome 프로필 디렉터리(`.playwright/user-data`)를 쓰는 `launchPersistentContext`로 바꾼다.
 * 회전된 쿠키가 매 실행마다 디스크에 되쓰기되므로, 일반 브라우저처럼 세션이 스스로 갱신된다.
 * 사용자는 `node tests/e2e/save-auth-state.js`로 **최초 1회만** 로그인하면 된다.
 *
 * 프로필에 로그인 쿠키가 없고 기존 `PLAYWRIGHT_STORAGE_STATE` 파일이 있으면 그 쿠키를 1회 이식한다.
 * 단, 스냅샷의 회전 쿠키가 이미 만료됐다면(대개 저장 10분 후) 이식해도 되살아나지 않으므로
 * 그때는 save-auth-state.js로 한 번 로그인해야 한다.
 *
 * 사용법: 스펙에서 `require('@playwright/test')` 대신 `require('./fixtures/browser')`.
 */

const fs = require('fs');
const path = require('path');
const base = require('@playwright/test');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..', '..', '..');
const PROFILE_DIR = process.env.PLAYWRIGHT_USER_DATA_DIR
  ? path.resolve(ROOT, process.env.PLAYWRIGHT_USER_DATA_DIR)
  : path.join(ROOT, '.playwright', 'user-data');
const CHANNEL_MARKER = path.join(PROFILE_DIR, '.channel');

/** 자동화 탐지를 줄이는 공통 실행 옵션 (save-auth-state.js와 동일하게 유지할 것) */
const ANTI_DETECTION_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-setuid-sandbox'
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

/**
 * 프로필을 만든 브라우저 채널을 고정한다.
 * Chrome 프로필과 번들 Chromium 프로필은 호환되지 않으므로 매 실행 같은 채널을 써야 한다.
 */
function preferredChannels() {
  if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) return [process.env.PLAYWRIGHT_BROWSER_CHANNEL];
  if (fs.existsSync(CHANNEL_MARKER)) {
    const saved = fs.readFileSync(CHANNEL_MARKER, 'utf8').trim();
    return saved === 'bundled' ? [null] : [saved];
  }
  return ['chrome', 'msedge', null]; // null = Playwright 번들 Chromium
}

/**
 * 영속 프로필로 브라우저 컨텍스트를 연다.
 * @param {{headless?: boolean, viewport?: object|null}} [opts]
 */
async function launchProfileContext(opts) {
  const options = opts || {};
  const headless = options.headless !== false;

  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const launchOptions = {
    headless: headless,
    ignoreDefaultArgs: ['--enable-automation'],
    args: headless ? ANTI_DETECTION_ARGS : ANTI_DETECTION_ARGS.concat(['--start-maximized']),
    userAgent: USER_AGENT,
    acceptDownloads: true,
    viewport: options.viewport !== undefined ? options.viewport : { width: 1440, height: 900 }
  };

  let context = null;
  let usedChannel;
  let lastError = null;
  for (const channel of preferredChannels()) {
    try {
      context = await chromium.launchPersistentContext(
        PROFILE_DIR,
        channel ? { ...launchOptions, channel } : launchOptions
      );
      usedChannel = channel;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!context) throw lastError || new Error('브라우저를 실행하지 못했습니다.');

  fs.writeFileSync(CHANNEL_MARKER, usedChannel || 'bundled', 'utf8');

  // navigator.webdriver 탐지 제거
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    await seedFromLegacyStorageState(context);
  } catch (e) {
    await context.close();
    throw e;
  }

  return context;
}

/** 프로필에 Google 로그인 쿠키가 아직 없을 때만, 기존 storageState 스냅샷을 이식한다 */
async function seedFromLegacyStorageState(context) {
  const legacy = process.env.PLAYWRIGHT_STORAGE_STATE;
  if (!legacy) return;

  const legacyPath = path.resolve(ROOT, legacy);
  if (!fs.existsSync(legacyPath)) return;

  // 프로필 생성 여부(디렉터리 존재)가 아니라 **실제 로그인 쿠키 유무**로 판단한다.
  // 실행이 중간에 실패해 빈 프로필만 남는 경우가 있기 때문이다.
  const existing = await context.cookies('https://accounts.google.com');
  if (existing.some((c) => c.name === '__Secure-1PSID' || c.name === 'SID')) return;

  try {
    const state = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    if (state.cookies && state.cookies.length) {
      await context.addCookies(state.cookies);
      console.log(
        `[auth] 프로필에 기존 세션 쿠키 ${state.cookies.length}개를 이식했습니다 (${legacy}).\n` +
        '       이후에는 프로필이 스스로 세션을 갱신하므로 재로그인이 필요 없습니다.'
      );
    }
  } catch (e) {
    console.warn(`[auth] storageState 이식 실패(무시하고 계속): ${e.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
//  Playwright 픽스처
//  trace/screenshot 은 Playwright가 우리가 만든 컨텍스트에도 자동으로 붙여주므로
//  여기서 따로 시작/저장하지 않는다 (중복 시 "Tracing has been already started").
// ─────────────────────────────────────────────────────────────

const test = base.test.extend({
  context: async ({ headless }, use) => {
    const context = await launchProfileContext({
      headless: headless,
      // viewport: null 은 deviceScaleFactor 기본값과 충돌해 launchPersistentContext가 거부한다
      viewport: headless ? { width: 1440, height: 900 } : { width: 1920, height: 1080 }
    });
    await use(context);
    await context.close();
  },

  page: async ({ context }, use) => {
    await use(context.pages()[0] || (await context.newPage()));
  }
});

module.exports = {
  test,
  expect: base.expect,
  launchProfileContext,
  PROFILE_DIR
};
