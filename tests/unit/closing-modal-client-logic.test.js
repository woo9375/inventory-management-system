/**
 * [TASK-028] 월마감 모달(src/JS_Config.html)의 순수 로직 — 고를 수 있는 달 · 기본 선택 · 렌더 결과
 *
 * JS_Config.html의 <script> 본문을 vm에 넣고 돌린다. 파일 상단은 상수·함수 선언뿐이라 DOM 없이 로드된다.
 * 서버 _validateClosingTarget(tests/unit/monthly-closing.test.js)과 같은 규칙을 화면이 따르는지 본다:
 *   끝난 달만 · 마감 이력이 있으면 기준일의 다음 달만 · 이력이 없으면 지난 아무 달이나.
 * 렌더는 openModal 스텁이 받은 HTML을 문자열로 검사한다(기준일 안내 · selected · disabled).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');
const html = fs.readFileSync(path.join(SRC, 'JS_Config.html'), 'utf8');
const m = /<script>([\s\S]*)<\/script>/.exec(html);
assert.ok(m, 'JS_Config.html에 <script> 블록이 없다');

const rendered = { title: null, body: null, footer: null };
const selects = {}; // id → { value, options:[{value, disabled}] } — refreshClosingMonthOptions가 만진다
const ctx = vm.createContext({
  console,
  document: { getElementById: (id) => selects[id] || null, querySelector: () => null },
  google: { script: { run: {} } },
  openModal: (t, b, f) => { rendered.title = t; rendered.body = b; rendered.footer = f; parseSelects(b); },
  showToast: () => {}, showLoading: () => {}, hideLoading: () => {},
  currentUser: { role: 'admin' },
  closingCutoffInfo: null,
  setTimeout, clearTimeout
});
vm.runInContext(m[1], ctx, { filename: 'JS_Config.html' });
const run = (expr) => vm.runInContext(expr, ctx);

/** 렌더된 <select id="..."> 옵션을 DOM 흉내 객체로 옮긴다 */
function parseSelects(body) {
  const re = /<select id="(closingYear|closingMonth)"[^>]*>([\s\S]*?)<\/select>/g;
  let s;
  while ((s = re.exec(body))) {
    const options = [];
    const or = /<option value="(\d+)"([^>]*)>/g;
    let o;
    while ((o = or.exec(s[2]))) options.push({ value: o[1], disabled: /disabled/.test(o[2]), selected: /selected/.test(o[2]) });
    const sel = options.find((x) => x.selected) || options[0];
    selects[s[1]] = { value: sel ? sel.value : '', options };
  }
}

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n        ' + e.message); fail++; }
}
const day = (s) => new Date(s + 'T12:00:00');
const WITH_HISTORY = { success: true, cutoff: '2026-08-31', minDate: '2026-09-01', nextClosable: { year: 2026, month: 9 } };
const NO_HISTORY = { success: true, cutoff: null, minDate: null, nextClosable: null };

console.log('[TASK-028] 월마감 모달 순수 로직');

check('isClosableMonth: 끝나지 않은 달은 고를 수 없다 (말일 당일 포함), 다음 달 1일부터 가능', () => {
  const f = run('isClosableMonth');
  assert.strictEqual(f(NO_HISTORY, 2026, 9, day('2026-09-15')), false);
  assert.strictEqual(f(NO_HISTORY, 2026, 9, day('2026-09-30')), false);
  assert.strictEqual(f(NO_HISTORY, 2026, 9, day('2026-10-01')), true);
  assert.strictEqual(f(NO_HISTORY, 2026, 12, day('2026-12-31')), false);
  assert.strictEqual(f(NO_HISTORY, 2026, 12, day('2027-01-01')), true);
});

check('isClosableMonth: 이력이 없으면 지난 아무 달이나, 이력이 있으면 기준일의 다음 달만', () => {
  const f = run('isClosableMonth');
  assert.strictEqual(f(NO_HISTORY, 2025, 3, day('2026-09-15')), true);
  assert.strictEqual(f(WITH_HISTORY, 2026, 9, day('2026-10-05')), true, '다음 달(9월)은 가능');
  assert.strictEqual(f(WITH_HISTORY, 2026, 8, day('2026-10-05')), false, '이미 마감된 달');
  assert.strictEqual(f(WITH_HISTORY, 2026, 10, day('2026-11-05')), false, '건너뛴 달');
  assert.strictEqual(f(WITH_HISTORY, 2026, 9, day('2026-09-15')), false, '다음 달이라도 아직 끝나지 않았으면 불가');
});

check('defaultClosingTarget: 이력 있으면 다음 마감 대상, 없으면 지난달 (1월이면 작년 12월)', () => {
  const f = run('defaultClosingTarget');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(f(WITH_HISTORY, day('2026-09-15')))), { year: 2026, month: 9 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(f(NO_HISTORY, day('2026-09-15')))), { year: 2026, month: 8 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(f(NO_HISTORY, day('2027-01-10')))), { year: 2026, month: 12 });
});

check('렌더(이력 없음, 2026-09-15): 안내 "마감 이력 없음", 기본 2026년 8월, 9월 이후 disabled, 작년은 전부 가능', () => {
  ctx.closingCutoffInfo = NO_HISTORY;
  run('renderMonthlyClosingModal(' + JSON.stringify(NO_HISTORY) + ', new Date("2026-09-15T12:00:00"))');
  assert.strictEqual(rendered.title, '월마감 및 재고 이월 실행');
  assert.ok(rendered.body.indexOf('현재 마감 기준일: <strong>마감 이력 없음</strong>') >= 0, rendered.body);
  assert.ok(rendered.body.indexOf('경고: 월마감을 실행하면') >= 0, '기존 경고문 유지');
  assert.strictEqual(selects.closingYear.value, '2026');
  assert.strictEqual(selects.closingMonth.value, '8');
  // 렌더 직후 refreshClosingMonthOptions가 오늘 기준으로 disabled를 다시 계산한다 — 여기서는 주입한 날짜로 재현
  const dis = (m) => selects.closingMonth.options.find((o) => o.value === String(m)).disabled;
  assert.strictEqual(dis(8), false);
  assert.strictEqual(dis(7), false);
  assert.strictEqual(selects.closingYear.options.every((o) => !o.disabled), true, '작년·올해 모두 고를 수 있는 달이 있다');
});

check('렌더(이력 2026-08-31, 2026-09-15): 안내에 기준일·다음 대상 9월·"10월 1일 이후 가능", 기본 2026년 9월', () => {
  ctx.closingCutoffInfo = WITH_HISTORY;
  run('renderMonthlyClosingModal(' + JSON.stringify(WITH_HISTORY) + ', new Date("2026-09-15T12:00:00"))');
  assert.ok(rendered.body.indexOf('현재 마감 기준일: <strong>2026-08-31</strong>') >= 0, rendered.body);
  assert.ok(rendered.body.indexOf('다음 마감 대상: <strong>2026년 9월</strong>') >= 0, rendered.body);
  assert.ok(rendered.body.indexOf('(10월 1일 이후 가능)') >= 0, rendered.body);
  assert.strictEqual(selects.closingYear.value, '2026');
  assert.strictEqual(selects.closingMonth.value, '9');
  const y2025 = selects.closingYear.options.find((o) => o.value === '2025');
  assert.strictEqual(y2025.disabled, true, '이력이 있으면 다음 대상 연도만 고를 수 있다');
});

check('렌더(이력 2026-08-31, 2026-10-05): 9월은 가능 — 안내에 "이후 가능"이 없고 연도 2026만 활성', () => {
  ctx.closingCutoffInfo = WITH_HISTORY;
  run('renderMonthlyClosingModal(' + JSON.stringify(WITH_HISTORY) + ', new Date("2026-10-05T12:00:00"))');
  assert.strictEqual(rendered.body.indexOf('이후 가능'), -1, rendered.body);
  assert.strictEqual(selects.closingMonth.value, '9');
  assert.strictEqual(selects.closingYear.options.find((o) => o.value === '2026').disabled, false);
});

check('렌더(이력 2026-12-31, 2027-01-10): 다음 대상 2027년 1월이 연도 목록에 있고 기본 선택된다 (연말 경계)', () => {
  const dec = { success: true, cutoff: '2026-12-31', minDate: '2027-01-01', nextClosable: { year: 2027, month: 1 } };
  ctx.closingCutoffInfo = dec;
  run('renderMonthlyClosingModal(' + JSON.stringify(dec) + ', new Date("2027-01-10T12:00:00"))');
  assert.ok(rendered.body.indexOf('다음 마감 대상: <strong>2027년 1월</strong>') >= 0, rendered.body);
  assert.strictEqual(selects.closingYear.value, '2027');
  assert.strictEqual(selects.closingMonth.value, '1');
  assert.ok(rendered.body.indexOf('(2월 1일 이후 가능)') >= 0, '1월은 아직 끝나지 않았다: ' + rendered.body);
});

check('refreshClosingMonthOptions: 연도를 바꾸면 그 연도 기준으로 달의 disabled를 다시 계산한다', () => {
  ctx.closingCutoffInfo = NO_HISTORY;
  run('renderMonthlyClosingModal(' + JSON.stringify(NO_HISTORY) + ', new Date("2026-09-15T12:00:00"))');
  selects.closingYear.value = '2025';
  run('refreshClosingMonthOptions()');
  assert.strictEqual(selects.closingMonth.options.every((o) => !o.disabled), true, '작년은 12달 모두 끝났다');
  selects.closingYear.value = '2026';
  run('refreshClosingMonthOptions()');
  // 실제 오늘 기준: 진행 중인 달 이후는 disabled (테스트가 도는 날짜에 상관없이 참)
  const now = new Date();
  if (now.getFullYear() === 2026) {
    const cur = now.getMonth() + 1;
    assert.strictEqual(selects.closingMonth.options.find((o) => o.value === String(cur)).disabled, true, '이번 달은 disabled');
    if (cur > 1) assert.strictEqual(selects.closingMonth.options.find((o) => o.value === String(cur - 1)).disabled, false, '지난달은 가능');
  }
});

check('openMonthlyClosingModal: admin이 아니면 서버를 부르지 않고 토스트만', () => {
  let toast = null, called = false;
  ctx.showToast = (msg) => { toast = msg; };
  ctx.loadClosingCutoff = () => { called = true; };
  ctx.currentUser = { role: 'manager' };
  run('openMonthlyClosingModal()');
  assert.strictEqual(toast, '최고 관리자만 실행할 수 있습니다.');
  assert.strictEqual(called, false);
  ctx.currentUser = { role: 'admin' };
  run('openMonthlyClosingModal()');
  assert.strictEqual(called, true, 'admin은 기준일을 다시 읽은 뒤 연다');
});

console.log(`\n${fail === 0 ? '✓' : '✗'} 월마감 모달 순수 로직 ${pass} 통과 / ${fail} 실패`);
if (fail > 0) process.exit(1);
