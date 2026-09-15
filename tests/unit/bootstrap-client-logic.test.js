/**
 * 로그인 직후 묶음 응답 적용(src/JS_Auth.html applyBootstrap · loadBootstrap · onLoginSuccess) — 순수 로직
 *
 * 2026-09-15 핫픽스 회귀 방지. 옛 코드는 applyShopList → applyClosingCutoff → applyLastSyncTime → renderDashboard를
 * 한 줄로 이어 불렀고, applyLastSyncTime이 사라진 요소(#lastSyncTimeText)에 쓰다 TypeError를 내면 대시보드가
 * 그려지지 않았다. 이제는 항목별 try/catch + 대시보드 우선이어야 한다.
 *
 * JS_Auth.html의 <script> 본문을 vm에 넣고 돌린다. 그리기 함수(renderDashboard 등)와 google.script.run은 스텁으로
 * 바꿔 호출 순서·인자·예외 격리만 본다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');
const html = fs.readFileSync(path.join(SRC, 'JS_Auth.html'), 'utf8');
const m = /<script>([\s\S]*)<\/script>/.exec(html);
assert.ok(m, 'JS_Auth.html에 <script> 블록이 없다');

/** 어떤 id를 물어도 요소 흉내를 돌려주는 document — MISSING에 든 id만 null */
const MISSING = new Set(['lastSyncTimeText']);
function fakeEl() {
  return { classList: { add() {}, remove() {} }, value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, min: '' };
}
const calls = [];
const errors = [];
let serverImpl = null; // (fnName, args) → { ok: data } | { fail: err }

const ctx = vm.createContext({
  console: { log() {}, warn() {}, error: (msg) => errors.push(String(msg)) },
  document: {
    getElementById: (id) => (MISSING.has(id) ? null : fakeEl()),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}
  },
  window: {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setInterval: () => { calls.push(['setInterval']); return 1; },
  clearInterval() {},
  setTimeout, clearTimeout,
  google: { script: { run: null } },
  renderDashboard: (d) => calls.push(['renderDashboard', d]),
  applyShopList: (s) => calls.push(['applyShopList', s]),
  applyClosingCutoff: (c) => calls.push(['applyClosingCutoff', c]),
  loadDashboard: () => calls.push(['loadDashboard']),
  loadShopList: () => calls.push(['loadShopList']),
  loadClosingCutoff: () => calls.push(['loadClosingCutoff']),
  showLoading: () => calls.push(['showLoading']),
  hideLoading: () => calls.push(['hideLoading']),
  showToast: (msg, type) => calls.push(['showToast', msg, type])
});
// google.script.run 흉내 — 체인 끝의 서버 함수 호출을 serverImpl로 보내고 핸들러를 동기로 부른다
ctx.google.script.run = new Proxy({}, {
  get(_, prop) {
    const state = { ok: null, fail: null };
    const chain = new Proxy({}, {
      get(__, name) {
        if (name === 'withSuccessHandler') return (fn) => { state.ok = fn; return chain; };
        if (name === 'withFailureHandler') return (fn) => { state.fail = fn; return chain; };
        return (...args) => {
          calls.push(['server:' + String(name), ...args]);
          const r = serverImpl ? serverImpl(String(name), args) : { ok: {} };
          if (r.fail) { if (state.fail) state.fail(r.fail); }
          else if (state.ok) state.ok(r.ok);
        };
      }
    });
    return chain[prop];
  }
});
vm.runInContext(m[1], ctx, { filename: 'JS_Auth.html' });
const run = (expr) => vm.runInContext(expr, ctx);
const reset = () => { calls.length = 0; errors.length = 0; };
const names = () => calls.map((c) => c[0]);

let pass = 0, fail = 0;
function check(name, fn) {
  try { reset(); fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n        ' + e.message); fail++; }
}

const BOOT = {
  success: true,
  dashboard: { success: true, kpi: { total: 3 }, alertItems: [] },
  shops: [{ name: '식당', category: '식음' }],
  closing: { success: true, cutoff: null, minDate: null, nextClosable: null }
};
const j = (v) => JSON.parse(JSON.stringify(v)); // vm 경계 넘은 객체 비교는 JSON으로

console.log('[핫픽스 2026-09-15] 로그인 직후 묶음 응답 적용');

check('applyBootstrap: 대시보드를 먼저 그리고 업장·마감 기준일을 적용한다', () => {
  run('applyBootstrap(' + JSON.stringify(BOOT) + ')');
  assert.deepStrictEqual(names(), ['renderDashboard', 'applyShopList', 'applyClosingCutoff']);
  assert.deepStrictEqual(j(calls[0][1]), BOOT.dashboard);
  assert.deepStrictEqual(j(calls[1][1]), BOOT.shops);
  assert.deepStrictEqual(j(calls[2][1]), BOOT.closing);
  assert.deepStrictEqual(errors, []);
});

check('applyBootstrap: 한 항목이 예외를 내도 나머지는 적용되고 console.error로 남는다', () => {
  ctx.applyShopList = () => { throw new TypeError("Cannot set properties of null (setting 'textContent')"); };
  try {
    run('applyBootstrap(' + JSON.stringify(BOOT) + ')');
  } finally {
    ctx.applyShopList = (s) => calls.push(['applyShopList', s]);
  }
  assert.deepStrictEqual(names(), ['renderDashboard', 'applyClosingCutoff']);
  assert.strictEqual(errors.length, 1);
  assert.ok(/\[bootstrap\] shops 적용 실패: Cannot set properties of null/.test(errors[0]), errors[0]);
});

check('applyBootstrap: 대시보드 그리기가 실패해도 업장·마감 기준일은 적용된다 (역방향 격리)', () => {
  ctx.renderDashboard = () => { throw new Error('DOM 없음'); };
  try {
    run('applyBootstrap(' + JSON.stringify(BOOT) + ')');
  } finally {
    ctx.renderDashboard = (d) => calls.push(['renderDashboard', d]);
  }
  assert.deepStrictEqual(names(), ['applyShopList', 'applyClosingCutoff']);
  assert.ok(/\[bootstrap\] dashboard 적용 실패: DOM 없음/.test(errors[0]), errors[0]);
});

check('applyBootstrap: staff(dashboard.success:false)는 대시보드를 건너뛰고 오류로 세지 않는다', () => {
  const staff = Object.assign({}, BOOT, { dashboard: { success: false, message: '대시보드 조회 권한이 없습니다.' } });
  run('applyBootstrap(' + JSON.stringify(staff) + ')');
  assert.deepStrictEqual(names(), ['applyShopList', 'applyClosingCutoff']);
  assert.deepStrictEqual(errors, []);
});

check('loadBootstrap: getBootstrapData 1회 → 오버레이 해제 → applyBootstrap', () => {
  serverImpl = (fn) => (fn === 'getBootstrapData' ? { ok: BOOT } : { ok: {} });
  run('loadBootstrap()');
  assert.deepStrictEqual(names(), ['showLoading', 'server:getBootstrapData', 'hideLoading', 'renderDashboard', 'applyShopList', 'applyClosingCutoff']);
  assert.strictEqual(names().filter((n) => n.indexOf('server:') === 0).length, 1, '서버 왕복은 1회');
});

check('loadBootstrap: 서버가 success:false면 토스트만, 실패(예외)면 개별 호출 폴백 — 동기화 시각 조회는 없다', () => {
  serverImpl = () => ({ ok: { success: false, message: '인증이 필요합니다.' } });
  run('loadBootstrap()');
  assert.deepStrictEqual(names(), ['showLoading', 'server:getBootstrapData', 'hideLoading', 'showToast']);
  assert.strictEqual(calls[3][1], '인증이 필요합니다.');

  reset();
  serverImpl = () => ({ fail: new Error('timeout') });
  run('loadBootstrap()');
  assert.deepStrictEqual(names(), ['showLoading', 'server:getBootstrapData', 'hideLoading', 'showToast', 'loadDashboard', 'loadShopList', 'loadClosingCutoff']);
  assert.ok(!names().some((n) => /LastSync/i.test(n)), '표시 요소가 없는 마지막 동기화 시각은 부르지 않는다');
});

check('onLoginSuccess: 부트스트랩 1회를 부르고 1분 폴링(setInterval)은 걸지 않는다', () => {
  serverImpl = (fn) => (fn === 'getBootstrapData' ? { ok: BOOT } : { ok: {} });
  run('currentUser = { username: "u", name: "홍길동", dept: "관리", role: "admin", assignedShops: [] }');
  run('onLoginSuccess()');
  assert.strictEqual(names().filter((n) => n === 'server:getBootstrapData').length, 1);
  assert.ok(!names().includes('setInterval'), 'setInterval이 걸렸다: ' + names().join(','));
  assert.ok(names().includes('renderDashboard'), '대시보드가 그려져야 한다');
  assert.deepStrictEqual(errors, []);
});

check('소스에 옛 폴링·표시 요소 참조가 남아 있지 않다', () => {
  assert.ok(!/setInterval\(\s*updateLastSyncTime/.test(m[1]), 'updateLastSyncTime 폴링이 남아 있다');
  assert.ok(!/getElementById\(['"]lastSyncTimeText['"]\)/.test(m[1]), '#lastSyncTimeText 참조가 남아 있다');
});

console.log(`\n${fail === 0 ? '✓' : '✗'} 부트스트랩 적용 ${pass} 통과 / ${fail} 실패`);
if (fail > 0) process.exit(1);
