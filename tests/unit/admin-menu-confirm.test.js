// [TASK-019] 구글 시트 "🏨 관리자 도구" 메뉴 — 실행 전 확인창
//
// onOpen이 등록하는 모든 항목이 확인 래퍼(menu*)를 거치고,
//   · NO  → 본체를 부르지 않는다
//   · YES → 본체를 정확히 1회 부른다
//   · 확인창은 YES_NO 버튼셋으로 뜬다
// 를 실제 src/Code.gs를 vm에 로드해 검증한다. 본체 함수(refreshDashboard 등)는 호출 횟수만 세는 스텁이다.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');

/** 메뉴 항목 → 본체 함수 매핑 (Code.gs의 onOpen과 래퍼가 이 표와 일치해야 한다) */
const EXPECTED = {
  menuRefreshDashboard:        'refreshDashboard',
  menuSyncPermissions:         'syncPermissions',
  menuValidateSeasonSettings:  'validateSeasonSettings',
  menuBackupCSV:               'backupToCSV',            // backupCSV(Code.gs) → backupToCSV(Archive.gs)
  menuOpenCsvUploadModal:      'showModalDialog',        // openCsvUploadModal(Code.gs) → ui.showModalDialog
  menuRepairAllSheetFormatting:'reapplyAllSheetFormatting', // repairAllSheetFormatting(Code.gs) → SheetBuilder
  menuAssignMissingVendorCodes:'assignMissingVendorCodes'
};

function buildContext(answer) {
  const calls = {};
  const count = (name) => { calls[name] = (calls[name] || 0) + 1; };
  const alerts = [];
  const menuItems = [];

  const ui = {
    ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' },
    Button: { YES: 'YES', NO: 'NO', OK: 'OK' },
    alert: function () {
      const args = Array.prototype.slice.call(arguments);
      alerts.push(args);
      // 확인창(3인자, YES_NO)에만 답을 준다. 완료 알림(1인자)은 OK.
      return args.length >= 3 ? answer : 'OK';
    },
    showModalDialog: () => count('showModalDialog'),
    createMenu: () => {
      const m = { addItem: (label, fn) => { menuItems.push({ label, fn }); return m; }, addSeparator: () => m, addToUi: () => {} };
      return m;
    }
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: {
      getUi: () => ui,
      getActiveSpreadsheet: () => ({ toast() {}, getSheetByName: () => null }),
      flush() {}
    },
    HtmlService: { createHtmlOutputFromFile: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
    // 본체 스텁 — 호출 횟수만 센다
    refreshDashboard: (silent) => count('refreshDashboard' + (silent === true ? ':silent' : '')),
    syncPermissions: () => count('syncPermissions'),
    validateSeasonSettings: () => count('validateSeasonSettings'),
    backupToCSV: () => count('backupToCSV'),
    reapplyAllSheetFormatting: () => { count('reapplyAllSheetFormatting'); return { sheets: 1, addedRows: 0, addedCols: 0, missing: [] }; },
    assignMissingVendorCodes: () => count('assignMissingVendorCodes')
  };
  const ctx = vm.createContext(sandbox);
  for (const f of ['Config.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  return { ctx, calls, alerts, menuItems };
}

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n        ' + e.message); fail++; }
}

console.log('[TASK-019] 관리자 도구 메뉴 확인창');

// ── 메뉴 등록 ──
{
  const t = buildContext('NO');
  t.ctx.onOpen();
  check('onOpen이 7개 항목을 모두 확인 래퍼(menu*)에 묶는다', () => {
    assert.strictEqual(t.menuItems.length, 7, '항목 수=' + t.menuItems.length);
    t.menuItems.forEach(item => {
      assert.ok(/^menu[A-Z]/.test(item.fn), item.label + ' → ' + item.fn + ' (래퍼가 아님)');
      assert.strictEqual(typeof t.ctx[item.fn], 'function', item.fn + ' 함수 없음');
    });
    const registered = t.menuItems.map(i => i.fn).sort();
    assert.deepStrictEqual(registered, Object.keys(EXPECTED).sort());
  });
}

// ── NO → 본체 미실행 ──
Object.keys(EXPECTED).forEach(wrapper => {
  const target = EXPECTED[wrapper];
  check(wrapper + ': NO를 누르면 ' + target + '를 부르지 않는다', () => {
    const t = buildContext('NO');
    t.ctx[wrapper]();
    assert.strictEqual(t.alerts.length, 1, '확인창 1회 (실제=' + t.alerts.length + ')');
    assert.strictEqual(t.alerts[0][2], 'YES_NO', '버튼셋이 YES_NO가 아님');
    assert.ok(/계속하시겠습니까/.test(t.alerts[0][1]), '안내문에 확인 질문이 없음');
    assert.strictEqual(t.calls[target] || 0, 0, target + ' 호출됨');
  });
});

// ── YES → 본체 1회 실행 ──
Object.keys(EXPECTED).forEach(wrapper => {
  const target = EXPECTED[wrapper];
  check(wrapper + ': YES를 누르면 ' + target + '를 1회 부른다', () => {
    const t = buildContext('YES');
    t.ctx[wrapper]();
    assert.strictEqual(t.calls[target] || 0, 1, target + ' 호출 횟수=' + (t.calls[target] || 0));
  });
});

check('menuRefreshDashboard는 통합 갱신을 대화형(isSilent=false)으로 부른다 — 완료 알림이 떠야 하므로', () => {
  const t = buildContext('YES');
  t.ctx.menuRefreshDashboard();
  assert.strictEqual(t.calls['refreshDashboard'] || 0, 1);
  assert.strictEqual(t.calls['refreshDashboard:silent'] || 0, 0);
});

check('본체 함수의 프로그램 호출 경로에는 확인창이 끼지 않는다 (backupCSV/repairAllSheetFormatting 직접 호출)', () => {
  const t = buildContext('NO'); // NO여도 본체 직접 호출은 실행돼야 한다
  t.ctx.backupCSV();
  t.ctx.repairAllSheetFormatting();
  assert.strictEqual(t.calls['backupToCSV'], 1);
  assert.strictEqual(t.calls['reapplyAllSheetFormatting'], 1);
  assert.ok(t.alerts.every(a => a.length < 3), 'YES_NO 확인창이 떠서는 안 된다');
});

console.log('');
if (fail > 0) { console.error('✗ ' + fail + '개 검증 실패'); process.exit(1); }
console.log('✓ 관리자 도구 메뉴 확인창 검증 통과 — ' + pass + '개');
