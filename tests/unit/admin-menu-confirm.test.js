// [TASK-019 → TASK-023] 구글 시트 "🏨 관리자 도구" 메뉴 — 실행 전 안내 대화상자
//
// TASK-019가 넣은 ui.alert(YES/NO) 확인창을 TASK-023이 HtmlService 모달(AdminActionDialog.html)로 바꿨다.
//   · 메뉴 항목 → menu*() → showModalDialog 1회, 본체는 부르지 않는다 (사용자가 [실행]을 눌러야 한다)
//   · 대화상자의 [실행] → runAdminAction(id) → 본체를 정확히 1회, 조용히(isSilent=true) 부르고 { success, message }를 돌려준다
//   · 대화상자 문구는 Config.gs SYSTEM_ACTIONS(SSOT)에서 온다
//   · 본체를 직접 부르는 프로그램 경로(backupCSV, repairAllSheetFormatting)에는 대화상자가 끼지 않는다
// 를 실제 src/Code.gs를 vm에 로드해 검증한다. 본체 함수(refreshDashboard 등)는 호출 인자를 기록하는 스텁이다.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');

/** 메뉴 항목 → 작업 id → 본체 함수 (Code.gs의 onOpen·menu*·runAdminAction이 이 표와 일치해야 한다) */
const EXPECTED = {
  menuRefreshDashboard:        { id: 'refreshDashboard',  body: 'refreshDashboard' },
  menuSyncPermissions:         { id: 'syncPermissions',   body: 'syncPermissions' },
  menuValidateSeasonSettings:  { id: 'validateSeason',    body: 'validateSeasonSettings' },
  menuBackupCSV:               { id: 'backupCSV',         body: 'backupToCSV' },            // runAdminAction → backupToCSV(Archive.gs)
  menuRepairAllSheetFormatting:{ id: 'repairFormatting',  body: 'reapplyAllSheetFormatting' }, // repairAllSheetFormatting(Code.gs) → SheetBuilder
  menuAssignMissingVendorCodes:{ id: 'assignVendorCodes', body: 'assignMissingVendorCodes' }
  // [TASK-026] 「📤 품목마스터 CSV 업로드」는 시트 메뉴에서 빠졌다 — 웹앱 품목 관리 탭 전용(scope webapp)
};

function buildContext() {
  const calls = {};
  const record = (name, args) => { (calls[name] = calls[name] || []).push(args); };
  const alerts = [];
  const dialogs = [];
  const menuItems = [];

  const ui = {
    ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' },
    Button: { YES: 'YES', NO: 'NO', OK: 'OK' },
    alert: function () { alerts.push(Array.prototype.slice.call(arguments)); return 'OK'; },
    showModalDialog: (html, title) => dialogs.push({ html, title }),
    createMenu: () => {
      const m = { addItem: (label, fn) => { menuItems.push({ label, fn }); return m; }, addSeparator: () => m, addToUi: () => {} };
      return m;
    }
  };

  // 템플릿 스텁 — 어떤 파일을, 어떤 변수로 평가했는지 기록한다
  const templates = [];
  const HtmlService = {
    createTemplateFromFile: (file) => {
      const t = { file, evaluate() { templates.push(t); return { setWidth: () => ({ setHeight: () => ({ file, action: t.action }) }) }; } };
      return t;
    },
    createHtmlOutputFromFile: (file) => ({ setWidth: () => ({ setHeight: () => ({ file }) }) })
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: {
      getUi: () => ui,
      getActiveSpreadsheet: () => ({ toast() {}, getSheetByName: () => null }),
      flush() {}
    },
    HtmlService,
    // 본체 스텁 — 인자를 기록하고 시트 대화상자용 결과 형태를 돌려준다
    refreshDashboard: (silent) => { record('refreshDashboard', [silent]); return { success: true, message: 'ok-refresh' }; },
    syncPermissions: (silent) => { record('syncPermissions', [silent]); return { success: true, message: 'ok-perm' }; },
    validateSeasonSettings: (silent) => { record('validateSeasonSettings', [silent]); return { success: false, message: 'season-errors', errors: ['x'] }; },
    backupToCSV: () => record('backupToCSV', []),
    reapplyAllSheetFormatting: () => { record('reapplyAllSheetFormatting', []); return { sheets: 3, addedRows: 10, addedCols: 0, missing: [] }; },
    assignMissingVendorCodes: (silent) => { record('assignMissingVendorCodes', [silent]); return { success: true, message: 'ok-vendor' }; }
  };
  const ctx = vm.createContext(sandbox);
  for (const f of ['Config.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  return { ctx, calls, alerts, dialogs, templates, menuItems };
}

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n        ' + e.message); fail++; }
}

console.log('[TASK-023] 관리자 도구 메뉴 안내 대화상자');

// ── 메뉴 등록 ──
{
  const t = buildContext();
  t.ctx.onOpen();
  check('onOpen이 6개 항목을 모두 래퍼(menu*)에 묶는다 (품목 CSV 업로드는 웹앱 전용 — TASK-026)', () => {
    assert.strictEqual(t.menuItems.length, 6, '항목 수=' + t.menuItems.length);
    assert.ok(!t.menuItems.some(i => /CSV 업로드/.test(i.label)), '품목 CSV 업로드 메뉴가 남아 있다');
    t.menuItems.forEach(item => {
      assert.ok(/^menu[A-Z]/.test(item.fn), item.label + ' → ' + item.fn + ' (래퍼가 아님)');
      assert.strictEqual(typeof t.ctx[item.fn], 'function', item.fn + ' 함수 없음');
    });
    const registered = t.menuItems.map(i => i.fn).sort();
    assert.deepStrictEqual(registered, Object.keys(EXPECTED).sort());
  });
}

// ── 메뉴 클릭 → 대화상자만 뜨고 본체는 돌지 않는다 ──
Object.keys(EXPECTED).forEach(wrapper => {
  const { id, body } = EXPECTED[wrapper];
  check(wrapper + ': 대화상자 1회, ui.alert 0회, 본체 미실행', () => {
    const t = buildContext();
    t.ctx[wrapper]();
    assert.strictEqual(t.dialogs.length, 1, 'showModalDialog 횟수=' + t.dialogs.length);
    assert.strictEqual(t.alerts.length, 0, '네이티브 alert가 떠서는 안 된다');
    assert.strictEqual(t.templates.length, 1, '템플릿 평가 횟수=' + t.templates.length);
    const action = vm.runInContext('SYSTEM_ACTIONS', t.ctx)[id]; // const는 컨텍스트 객체의 속성이 아니다 → 평가로 꺼낸다
    assert.ok(action, 'SYSTEM_ACTIONS.' + id + ' 정의 없음');
    assert.strictEqual(t.templates[0].action, action, '대화상자에 SSOT 정의가 그대로 들어가야 한다');
    assert.strictEqual(t.dialogs[0].title, action.title, '창 제목=' + t.dialogs[0].title);
    assert.strictEqual(t.templates[0].file, 'AdminActionDialog');
    if (body) assert.strictEqual((t.calls[body] || []).length, 0, body + ' 호출됨');
  });
});

// ── 대화상자 [실행] → runAdminAction → 본체 1회, 조용히 ──
Object.keys(EXPECTED).forEach(wrapper => {
  const { id, body } = EXPECTED[wrapper];
  if (!body) return;
  check('runAdminAction(' + id + '): ' + body + '를 1회 부르고 { success, message }를 돌려준다', () => {
    const t = buildContext();
    const res = t.ctx.runAdminAction(id);
    assert.strictEqual((t.calls[body] || []).length, 1, body + ' 호출 횟수=' + (t.calls[body] || []).length);
    assert.strictEqual(typeof res.success, 'boolean');
    assert.ok(res.message && String(res.message).length > 0, '결과 문구가 비었다');
    assert.strictEqual(t.alerts.length, 0, '본체가 alert를 띄우면 모달 위에 겹친다 — isSilent로 막아야 한다');
    assert.strictEqual(t.dialogs.length, 0, '실행 중 대화상자를 또 띄우면 안 된다');
  });
});

check('runAdminAction은 isSilent=true로 본체를 부른다 (refreshDashboard/syncPermissions/validateSeason/assignVendorCodes)', () => {
  const t = buildContext();
  ['refreshDashboard', 'syncPermissions', 'validateSeason', 'assignVendorCodes'].forEach(id => t.ctx.runAdminAction(id));
  assert.deepStrictEqual(t.calls.refreshDashboard, [[true]]);
  assert.deepStrictEqual(t.calls.syncPermissions, [[true]]);
  assert.deepStrictEqual(t.calls.validateSeasonSettings, [[true]]);
  assert.deepStrictEqual(t.calls.assignMissingVendorCodes, [[true]]);
});

check('runAdminAction(validateSeason)은 본체의 실패 결과를 그대로 전달한다', () => {
  const t = buildContext();
  const res = t.ctx.runAdminAction('validateSeason');
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.message, 'season-errors');
});

check('runAdminAction(repairFormatting)은 복구 결과 수치를 문구에 담는다', () => {
  const t = buildContext();
  const res = t.ctx.runAdminAction('repairFormatting');
  assert.strictEqual(res.success, true);
  assert.ok(/대상 시트: 3개/.test(res.message) && /확충한 행: 10행/.test(res.message), res.message);
  assert.ok(!/[🎨✅❌]/.test(res.message), '대화상자 문구에 이모지가 있다');
});

check('runAdminAction은 모르는 id·웹앱 전용 id·uploadItemCsv를 거부한다', () => {
  const t = buildContext();
  assert.strictEqual(t.ctx.runAdminAction('nope').success, false);
  assert.strictEqual(t.ctx.runAdminAction('forceRefresh').success, false);
  assert.strictEqual(t.ctx.runAdminAction('incrementalSync').success, false);
  assert.strictEqual(t.ctx.runAdminAction('uploadItemCsv').success, false);
  assert.deepStrictEqual(Object.keys(t.calls), [], '본체가 불리면 안 된다');
});

check('runAdminAction은 본체 예외를 { success:false }로 감싼다', () => {
  const t = buildContext();
  t.ctx.backupToCSV = () => { throw new Error('drive quota'); };
  const res = t.ctx.runAdminAction('backupCSV');
  assert.strictEqual(res.success, false);
  assert.ok(/drive quota/.test(res.message), res.message);
});

check('openAdminActionDialog는 웹앱 전용 작업(forceRefresh)을 열지 않는다', () => {
  const t = buildContext();
  assert.throws(() => t.ctx.openAdminActionDialog('forceRefresh'));
  assert.strictEqual(t.dialogs.length, 0);
});

check('본체 함수의 프로그램 호출 경로에는 대화상자가 끼지 않는다 (backupCSV/repairAllSheetFormatting 직접 호출)', () => {
  const t = buildContext();
  t.ctx.backupCSV();
  t.ctx.repairAllSheetFormatting();
  assert.strictEqual(t.calls.backupToCSV.length, 1);
  assert.strictEqual(t.calls.reapplyAllSheetFormatting.length, 1);
  assert.strictEqual(t.dialogs.length, 0, '대화상자가 떠서는 안 된다');
  assert.strictEqual(t.alerts.length, 2, '직접 호출은 기존처럼 완료 alert를 띄운다 (실제=' + t.alerts.length + ')');
});

check('repairAllSheetFormatting(true)는 alert 없이 결과만 돌려준다', () => {
  const t = buildContext();
  const res = t.ctx.repairAllSheetFormatting(true);
  assert.strictEqual(res.success, true);
  assert.strictEqual(t.alerts.length, 0);
});

console.log('');
if (fail > 0) { console.error('✗ ' + fail + '개 검증 실패'); process.exit(1); }
console.log('✓ 관리자 도구 메뉴 안내 대화상자 검증 통과 — ' + pass + '개');
