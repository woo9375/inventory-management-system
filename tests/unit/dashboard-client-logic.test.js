/**
 * [TASK-029] 대시보드 헤더 「재고 계산 기준」 · 통합 갱신 뒤 재조회 — 클라이언트 순수 로직
 *
 * src/JS_UI.html(renderDashboard)과 src/JS_Config.html(submitSystemCommand)의 <script> 본문을 vm에 넣고 돌린다.
 * document는 Index.html에 실제로 선언된 id만 아는 가짜 DOM — 마크업에 없는 id를 찾으면 null이 나와 TypeError로 드러난다
 * (2026-09-15 핫픽스 회귀와 같은 종류의 결함을 여기서도 잡는다). google.script.run은 동기 스텁.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');
const scriptOf = (file) => {
  const m = /<script>([\s\S]*)<\/script>/.exec(fs.readFileSync(path.join(SRC, file), 'utf8'));
  assert.ok(m, file + '에 <script> 블록이 없다');
  return m[1];
};
const indexHtml = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
const declaredIds = new Set([...indexHtml.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));

// ── 가짜 DOM ──
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), textContent: '', innerHTML: '', hidden: false, className: '', title: '', value: '',
    children: [], classList: { add() {}, remove() {}, contains: () => false },
    appendChild(c) { el.children.push(c); return c; },
    replaceChildren(c) { el.children = c && c.children ? c.children.slice() : (c ? [c] : []); }
  };
  return el;
}
const els = {};
const elById = (id) => { if (!declaredIds.has(id)) return null; if (!els[id]) els[id] = makeEl('span'); return els[id]; };

const calls = [];
let serverImpl = null; // (fnName, args) → { ok: data } | { fail: err }
const ctx = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  document: {
    getElementById: elById,
    createElement: makeEl,
    createDocumentFragment: () => makeEl('fragment'),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {}
  },
  window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  Date: Date,
  google: { script: { run: null } },
  currentUser: { username: 'u', name: '관리자', role: 'admin', assignedShops: [] },
  getToken: () => 'tok',
  getSystemActionConfig: () => null
});
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
vm.runInContext(scriptOf('JS_UI.html'), ctx, { filename: 'JS_UI.html' });
vm.runInContext(scriptOf('JS_Config.html'), ctx, { filename: 'JS_Config.html' });
const run = (expr) => vm.runInContext(expr, ctx);
const names = () => calls.map((c) => c[0]);

// JS_UI가 선언한 함수 중 여기서 호출 기록만 보고 싶은 것은 스파이로 바꾼다 (전역 함수 선언은 writable)
['showLoading', 'hideLoading', 'closeModal', 'clearTabData', 'loadDashboard'].forEach((fn) => {
  ctx[fn] = () => calls.push([fn]);
});
ctx.showToast = (msg, type) => calls.push(['showToast', msg, type]);

let pass = 0, fail = 0;
function check(name, fn) {
  try { calls.length = 0; fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n        ' + e.message); fail++; }
}
const HOUR = 60 * 60 * 1000;
const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();
const dash = (over) => Object.assign({
  success: true, season: '비수기', seasonMultiplier: 1,
  recalcAt: isoAgo(HOUR), recalcAtText: '2026-09-15 00:02',
  kpi: { total: 3, risk: 1, order: 0, normal: 2 },
  alertItems: [{ code: 'A001', name: '수건', grade: '', currentStock: 1, safetyStock: 3, rop: 5, orderQty: 10, status: 'risk' }]
}, over || {});
const render = (d) => run('renderDashboard(' + JSON.stringify(d) + ')');

console.log('[TASK-029] 대시보드 헤더 「재고 계산 기준」 · 통합 갱신 뒤 재조회');

check('recalcAtText가 있으면 "재고 계산 기준: yyyy-MM-dd HH:mm" — 옛 "최신 갱신일" 문구는 없다', () => {
  render(dash());
  assert.strictEqual(els.dashDate.textContent, '재고 계산 기준: 2026-09-15 00:02');
  assert.ok(!/['"]최신 갱신일/.test(scriptOf('JS_UI.html')), 'JS_UI.html이 옛 문구를 아직 그린다');
  assert.ok(!/data\.date\b/.test(scriptOf('JS_UI.html')), 'JS_UI.html이 제거된 date 필드를 읽는다');
});

check('기록이 없으면(recalcAt·recalcAtText null) "재고 계산 기준: 기록 없음", 배지 숨김', () => {
  render(dash({ recalcAt: null, recalcAtText: null }));
  assert.strictEqual(els.dashDate.textContent, '재고 계산 기준: 기록 없음');
  assert.strictEqual(els.dashStaleBadge.hidden, true);
});

check('필드 자체가 없어도(옛 응답 형태) 예외 없이 "기록 없음"으로 그린다', () => {
  const old = dash(); delete old.recalcAt; delete old.recalcAtText; old.date = '2026-09-15 14:30';
  render(old);
  assert.strictEqual(els.dashDate.textContent, '재고 계산 기준: 기록 없음');
  assert.strictEqual(els.dashStaleBadge.hidden, true);
  assert.strictEqual(els.kpiTotal.textContent, 3, 'KPI는 그대로 그려진다');
});

check('24시간 경과 배지: 25시간 전이면 보이고, 1시간 전·23시간 전이면 숨는다', () => {
  render(dash({ recalcAt: isoAgo(25 * HOUR) }));
  assert.strictEqual(els.dashStaleBadge.hidden, false, '25시간 전');
  render(dash({ recalcAt: isoAgo(HOUR) }));
  assert.strictEqual(els.dashStaleBadge.hidden, true, '1시간 전');
  render(dash({ recalcAt: isoAgo(23 * HOUR) }));
  assert.strictEqual(els.dashStaleBadge.hidden, true, '23시간 전');
  render(dash({ recalcAt: 'garbage' }));
  assert.strictEqual(els.dashStaleBadge.hidden, true, '깨진 값은 배지를 띄우지 않는다');
});

check('배지 마크업: Index.html의 #dashStaleBadge는 status-badge order pill, 기본 hidden, 이모지 없음 (UIGuidelines §3·§5)', () => {
  const m = /<span id="dashStaleBadge"([^>]*)>([^<]*)<\/span>/.exec(indexHtml);
  assert.ok(m, 'Index.html에 #dashStaleBadge가 없다');
  assert.ok(/class="status-badge order"/.test(m[1]), m[1]);
  assert.ok(/\bhidden\b/.test(m[1]), '기본은 hidden');
  assert.strictEqual(m[2].trim(), '하루 이상 지난 계산');
  assert.ok(!/[☀-➿\u{1F300}-\u{1FAFF}]/u.test(m[2]), 'UI 텍스트에 이모지 금지');
  assert.ok(/\.status-badge\[hidden\]/.test(fs.readFileSync(path.join(SRC, 'Stylesheet.html'), 'utf8')),
    '.status-badge는 inline-flex라 [hidden] 규칙이 없으면 숨겨지지 않는다');
});

check('renderDashboard가 찾는 id는 모두 Index.html에 있다 (가짜 DOM은 미선언 id에 null을 준다)', () => {
  render(dash());
  assert.strictEqual(els.kpiRisk.textContent, 1);
  assert.strictEqual(els.alertBadge.hidden, false);
  assert.ok(els.alertTableBody.children.length > 0, '알림 표가 그려진다');
});

// ── submitSystemCommand ──
function runCommand(command, result) {
  serverImpl = (fn) => (fn === 'runSystemCommand' ? result : { ok: {} });
  run("submitSystemCommand('" + command + "')");
}

check('통합갱신(refreshDashboard) 성공 → 토스트 → clearTabData → loadDashboard', () => {
  runCommand('refreshDashboard', { ok: { success: true, message: '통합 갱신이 완료되었습니다.' } });
  assert.deepStrictEqual(names(), ['closeModal', 'showLoading', 'showToast', 'server:runSystemCommand', 'hideLoading', 'showToast', 'clearTabData', 'loadDashboard']);
  assert.deepStrictEqual(calls[5].slice(1), ['통합 갱신이 완료되었습니다.', 'success']);
});

check('신규 내역 취합(incrementalSync) 성공도 대시보드를 다시 조회한다', () => {
  runCommand('incrementalSync', { ok: { success: true, message: 'ok' } });
  assert.ok(names().includes('clearTabData') && names().includes('loadDashboard'), names().join(','));
});

check('재고와 무관한 명령(권한 동기화·시즌 검증·백업)은 재조회하지 않는다', () => {
  ['syncPermissions', 'validateSeason', 'backupToCSV'].forEach((cmd) => {
    calls.length = 0;
    runCommand(cmd, { ok: { success: true, message: 'ok' } });
    assert.ok(!names().includes('clearTabData') && !names().includes('loadDashboard'), cmd + ': ' + names().join(','));
    assert.ok(names().includes('showToast'));
  });
});

check('실패(success:false)나 예외면 재조회하지 않는다', () => {
  runCommand('refreshDashboard', { ok: { success: false, message: '다른 프로세스가 실행 중입니다.' } });
  assert.ok(!names().includes('loadDashboard'), names().join(','));
  assert.deepStrictEqual(calls[calls.length - 1], ['showToast', '다른 프로세스가 실행 중입니다.', 'warning']);
  calls.length = 0;
  runCommand('refreshDashboard', { fail: new Error('timeout') });
  assert.ok(!names().includes('loadDashboard'), names().join(','));
  assert.ok(/timeout/.test(calls[calls.length - 1][1]));
});

console.log(`\n${fail === 0 ? '✓' : '✗'} 대시보드 클라이언트 ${pass} 통과 / ${fail} 실패`);
if (fail > 0) process.exit(1);
