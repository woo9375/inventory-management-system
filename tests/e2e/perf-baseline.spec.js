const { test, expect } = require('./fixtures/browser');
const { hasCredentials, missingEnvReason, login, SEED_ITEMS } = require('./fixtures/env');

/**
 * 웹앱 API 응답 시간 벤치마크 — DEV 전용, 기본 실행에서 제외.
 *
 *   E2E_PERF=1 npx playwright test tests/e2e/perf-baseline.spec.js
 *
 * 화면이 부르는 서버 함수를 그대로 호출해 **콜드(캐시 비운 직후)** 와 **웜(캐시 적중)** 응답 시간을
 * 밀리초로 찍는다. 성능 작업의 전/후를 같은 잣대로 비교하기 위한 도구이며, 단정(assert)은
 * "호출이 실패하지 않는다"까지만 한다 — 응답 시간은 네트워크·GAS 상태에 따라 흔들리므로
 * 임계값으로 실패시키지 않는다.
 *
 * 데이터 영향: 시드 품목(ITEM-TEST-001)에 입고 (REPEAT+1)건 → 출고 1건(같은 수량)을 기록한다(재고 순변화 0).
 */

const ENABLED = process.env.E2E_PERF === '1';
const REPEAT = Number(process.env.E2E_PERF_REPEAT) || 3;

async function callServer(app, fnName, args) {
  return app.locator('body').evaluate(
    (_el, [fn, rest]) =>
      new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler((e) => reject(new Error(String((e && e.message) || e))))
          [fn](getToken(), ...rest);
      }),
    [fnName, args || []]
  );
}

async function timed(app, fnName, args) {
  const t0 = Date.now();
  const result = await callServer(app, fnName, args);
  return { ms: Date.now() - t0, result };
}

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
}

test.describe('웹앱 API 응답 시간 벤치마크', () => {
  test.skip(!ENABLED, 'E2E_PERF=1 일 때만 실행');
  test.skip(!hasCredentials(), missingEnvReason());
  test.setTimeout(20 * 60 * 1000);

  test('콜드/웜 응답 시간 표', async ({ page }) => {
    const rows = [];
    const record = (label, cold, warm, note) => rows.push({ label, cold, warm: median(warm), note: note || '' });

    const tLogin = Date.now();
    const app = await login(page);
    const loginMs = Date.now() - tLogin;

    // 로그인 직후 화면이 쏘는 호출들이 끝나길 기다린 뒤 측정 시작
    await page.waitForTimeout(8000);

    // 왕복 기준선 — 시트를 읽지 않는 함수
    const base = [];
    for (let i = 0; i < REPEAT; i++) base.push((await timed(app, 'getSessionUser')).ms);
    record('getSessionUser (왕복 기준선)', null, base);

    const shops = await callServer(app, 'getShopList');
    const shopName = shops[0].name;

    const READS = [
      ['getShopList', []],
      ['getConfigData', []],
      ['getDashboardData', []],
      ['getBaseData', []],
      ['getVendors', []],
      ['getItemCodes', []],
      ['getItemMasterData', []],
      ['getRecentTransactions', [shopName, 50]],
      ['getClosingCutoffInfo', []],
      ['searchItemCodes', ['테스트']]
    ];
    for (const [fn, args] of READS) {
      await callServer(app, 'forceRefreshData');
      const cold = (await timed(app, fn, args)).ms;
      const warm = [];
      for (let i = 0; i < REPEAT; i++) warm.push((await timed(app, fn, args)).ms);
      record(fn, cold, warm);
    }

    // 쓰기 — 입고 콜드 1 + 웜 REPEAT건 → 출고 1건(FIFO 분할 경로, 입고분 전부 소진)
    const today = new Date().toISOString().slice(0, 10);
    // 시드 품목이 DEV에 없으면(버전 복원 등) 활성 품목 첫 건을 쓴다 — 입고 3·출고 3으로 재고 순변화는 0이다
    const codes = await callServer(app, 'getItemCodes');
    const hasSeed = codes.some((c) => c.code === SEED_ITEMS.ITEM_1);
    const txCode = hasSeed ? SEED_ITEMS.ITEM_1 : codes[0].code;
    const tx = (type, qty) => [shopName, { date: today, code: txCode, type, qty, person: 'PERF', note: 'perf-baseline' }];
    const printTable = () => console.log('\n[PERF]\n' + [
      'login → appContainer: ' + loginMs + ' ms',
      'API | cold(ms) | warm median(ms)',
      ...rows.map((r) => r.label + ' | ' + (r.cold == null ? '-' : r.cold) + ' | ' + r.warm)
    ].join('\n') + '\n');
    printTable(); // 쓰기 측정이 실패해도 읽기 결과는 남긴다

    await callServer(app, 'forceRefreshData');
    const addCold = await timed(app, 'addTransaction', tx('입고', 1));
    expect(addCold.result && addCold.result.success, JSON.stringify(addCold.result)).toBe(true);
    const addWarm = [];
    for (let i = 0; i < REPEAT; i++) {
      const r = await timed(app, 'addTransaction', tx('입고', 1));
      expect(r.result && r.result.success, JSON.stringify(r.result)).toBe(true);
      addWarm.push(r.ms);
    }
    record('addTransaction 입고', addCold.ms, addWarm);

    const out = await timed(app, 'addTransaction', tx('출고', REPEAT + 1));
    expect(out.result && out.result.success, JSON.stringify(out.result)).toBe(true);
    record('addTransaction 출고(FIFO)', null, [out.ms]);

    // 저장 직후 화면이 다시 부르는 목록 조회 (저장 체감 시간 = 저장 + 이 호출)
    const after = [];
    for (let i = 0; i < REPEAT; i++) after.push((await timed(app, 'getRecentTransactions', [shopName, 50])).ms);
    record('getRecentTransactions (저장 직후)', null, after);

    printTable();
  });
});
