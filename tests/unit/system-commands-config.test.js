// [TASK-023] 시스템 작업 안내문 SSOT — src/Config.gs SYSTEM_ACTIONS
//
// 시트 관리자 도구 대화상자와 웹앱 안내 모달이 같은 정의를 읽으므로, 정의가 깨지면 두 화면이 함께 깨진다.
//   · 9개 작업이 모두 있고 필수 키가 채워져 있다
//   · forceRefresh·uploadItemCsv만 requiresAdmin=false (시트 동기화는 staff/manager도, 품목 CSV는 구매팀 manager도 실행한다 — TASK-025)
//   · assignVendorCodes만 btn-danger (되돌릴 수 없는 작업 — Docs/UIGuidelines.md §2)
//   · 문구에 이모지가 없다 (§3)
//   · 웹앱 주입용 JSON이 <script> 안에서 안전하다
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(SRC, 'Config.gs'), 'utf8'), ctx, { filename: 'Config.gs' });
const ACTIONS = vm.runInContext('SYSTEM_ACTIONS', ctx);

const EXPECTED_IDS = [
  'forceRefresh', 'refreshDashboard', 'incrementalSync', 'syncPermissions', 'validateSeason',
  'backupCSV', 'repairFormatting', 'assignVendorCodes', 'uploadItemCsv'
];
const EXPECTED_SCOPE = {
  forceRefresh: 'webapp', refreshDashboard: 'both', incrementalSync: 'webapp', syncPermissions: 'both',
  validateSeason: 'both', backupCSV: 'both', repairFormatting: 'sheet', assignVendorCodes: 'sheet',
  uploadItemCsv: 'both' // [TASK-025] 웹앱 품목 관리 탭도 같은 안내문을 쓴다
};
const REQUIRED_KEYS = ['id', 'title', 'desc', 'bullets', 'btnText', 'btnClass', 'requiresAdmin', 'scope'];
const EMOJI = /[☀-➿\u{1F300}-\u{1FAFF}️]/u;

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n        ' + e.message); fail++; }
}

console.log('[TASK-023] SYSTEM_ACTIONS 정의 테이블');

check('9개 작업이 정확히 정의되어 있다', () => {
  assert.deepStrictEqual(Object.keys(ACTIONS).sort(), EXPECTED_IDS.slice().sort());
});

EXPECTED_IDS.forEach(id => {
  check(id + ': 필수 키가 모두 채워져 있고 id가 키와 같다', () => {
    const a = ACTIONS[id];
    REQUIRED_KEYS.forEach(k => assert.ok(k in a, id + '.' + k + ' 없음'));
    assert.strictEqual(a.id, id);
    assert.ok(typeof a.title === 'string' && a.title.trim(), 'title 비었음');
    assert.ok(typeof a.desc === 'string' && a.desc.trim(), 'desc 비었음');
    assert.ok(Array.isArray(a.bullets) && a.bullets.length >= 1 && a.bullets.length <= 3, 'bullets 1~3개여야 한다: ' + a.bullets.length);
    a.bullets.forEach(b => assert.ok(typeof b === 'string' && b.trim(), 'bullet 비었음'));
    assert.ok(typeof a.btnText === 'string' && a.btnText.trim(), 'btnText 비었음');
    assert.ok(['btn-primary', 'btn-danger'].includes(a.btnClass), 'btnClass=' + a.btnClass);
    assert.strictEqual(typeof a.requiresAdmin, 'boolean');
    assert.strictEqual(a.scope, EXPECTED_SCOPE[id], 'scope=' + a.scope);
  });
});

// [TASK-025] uploadItemCsv는 웹앱 품목 관리 탭에서 구매팀(manager)도 실행한다
const NON_ADMIN_ACTIONS = ['forceRefresh', 'uploadItemCsv'];
check('forceRefresh·uploadItemCsv만 requiresAdmin=false — 시트 동기화는 staff/manager, 품목 CSV는 manager도 실행한다', () => {
  EXPECTED_IDS.forEach(id => assert.strictEqual(ACTIONS[id].requiresAdmin, NON_ADMIN_ACTIONS.indexOf(id) < 0, id));
});

check('assignVendorCodes만 btn-danger, 나머지는 btn-primary', () => {
  EXPECTED_IDS.forEach(id => assert.strictEqual(ACTIONS[id].btnClass, id === 'assignVendorCodes' ? 'btn-danger' : 'btn-primary', id));
});

check('제목·설명·주의사항·버튼 문구에 이모지가 없다 (UIGuidelines §3)', () => {
  EXPECTED_IDS.forEach(id => {
    const a = ACTIONS[id];
    [a.title, a.desc, a.btnText].concat(a.bullets).forEach(s => assert.ok(!EMOJI.test(s), id + ': ' + s));
  });
});

check('getSystemAction은 정의를 돌려주고 모르는 id·프로토타입 키에는 null', () => {
  assert.strictEqual(vm.runInContext('getSystemAction("backupCSV")', ctx), ACTIONS.backupCSV);
  assert.strictEqual(vm.runInContext('getSystemAction("nope")', ctx), null);
  assert.strictEqual(vm.runInContext('getSystemAction("toString")', ctx), null);
});

check('getSystemActionsJson은 "<"를 이스케이프하고 파싱하면 원본과 같다', () => {
  const json = vm.runInContext('getSystemActionsJson()', ctx);
  assert.ok(!/</.test(json), '"<"가 남아 있다');
  assert.deepStrictEqual(JSON.parse(json), JSON.parse(JSON.stringify(ACTIONS)));
});

console.log('');
if (fail > 0) { console.error('✗ ' + fail + '개 검증 실패'); process.exit(1); }
console.log('✓ SYSTEM_ACTIONS 정의 검증 통과 — ' + pass + '개');
