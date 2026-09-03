/**
 * [TASK-016] MIGRATIONS[16] — 서식/유효성 검사 범위의 동적 확장 검증
 *
 * TASK-009(v12)는 VALIDATION_ROWS를 500 → 2000으로 올렸지만, 고정 상수를 상한으로
 * 쓰는 구조는 그대로여서 품목이 2000건을 넘자 2003행부터 같은 결함이 재발했다.
 * v16의 핵심은 상수를 5000으로 올린 것이 아니라 **적용 범위가 시트의 실제 행 수를
 * 따라간다**는 점이므로, 이 테스트는 상수보다 큰 시트에서의 동작을 중점 검증한다.
 *
 * migration-v12-formatting.test.js와 같은 방식으로 `src/*.gs`를 vm 컨텍스트에
 * 실제 로드하고 SpreadsheetApp만 모킹한다. 다만 이번 모킹은 **범위가 시트 밖을
 * 가리키면 예외를 던진다** — GAS 런타임과 같은 실패를 테스트에서 재현하기 위함이다.
 * (실제 Google Sheet는 전혀 건드리지 않는 순수 인메모리 시뮬레이션이다.)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');
const INPUT_BG = '#fffde7'; // Config.gs COLORS.inputBg
const BLANK_BG = '#ffffff';

// ── SpreadsheetApp 모킹 ───────────────────────────────────────────
function makeRange(sheet, row, col, numRows, numCols) {
  // GAS는 시트 밖을 가리키는 getRange에서 런타임 에러를 낸다. 같은 조건으로 실패시킨다.
  if (row + numRows - 1 > sheet.maxRows) {
    throw new Error(
      sheet.name + ': 범위가 시트 밖을 가리킴 — ' +
      'row=' + row + ' numRows=' + numRows + ' (maxRows=' + sheet.maxRows + ')'
    );
  }
  const rec = { row: row, col: col, numRows: numRows, numCols: numCols, ops: [] };
  sheet.rangeCalls.push(rec);
  const api = {};
  const chain = (name) => function () { rec.ops.push(name); return api; };
  ['setHorizontalAlignment', 'setDataValidation', 'setNumberFormat', 'setFontColor',
   'setFontWeight', 'setFontStyle', 'merge', 'setValue', 'setValues', 'setFormula',
   'clearContent', 'clearDataValidations'].forEach((m) => { api[m] = chain(m); });

  // A열 배경색 커버리지를 추적한다 — _isItemMasterFormattingStale()이 이 값을 읽는다
  api.setBackground = function () {
    rec.ops.push('setBackground');
    if (col === 1) sheet.bgCoveredRow = Math.max(sheet.bgCoveredRow, row + numRows - 1);
    return api;
  };
  api.getBackground = () => (col === 1 && row <= sheet.bgCoveredRow) ? INPUT_BG : BLANK_BG;
  api.getValues = () => Array.from({ length: numRows }, () => new Array(numCols).fill(''));
  api.getLastRow = () => row + numRows - 1;
  return api;
}

function makeSheet(name, maxRows) {
  const sheet = {
    name: name,
    maxRows: maxRows,
    bgCoveredRow: 0,
    rangeCalls: [],
    insertedRows: 0,
    unprotectedRanges: null,
    getName: () => name,
    getMaxRows: () => sheet.maxRows,
    insertRowsAfter: (afterRow, howMany) => { sheet.maxRows += howMany; sheet.insertedRows += howMany; },
    getLastRow: () => Math.min(10, sheet.maxRows),
    setFrozenRows: () => sheet,
    setColumnWidth: () => sheet,
    protect: () => ({ setDescription: () => ({}) }),
    setConditionalFormatRules: (rules) => { sheet.cfRules = rules; },
    getProtections: () => [{
      setUnprotectedRanges: (ranges) => { sheet.unprotectedRanges = ranges; }
    }],
    getRange: function (a, b, c, d) {
      if (typeof a === 'string') return makeRange(sheet, 1, 1, 1, 1); // "C3:C50" 형태
      return makeRange(sheet, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    }
  };
  return sheet;
}

function buildContext(sheetNames, shopNames, maxRows, extraFiles) {
  const sheets = {};
  sheetNames.forEach((n) => { sheets[n] = makeSheet(n, maxRows); });

  const validationBuilder = {
    requireValueInList: () => validationBuilder,
    requireValueInRange: () => validationBuilder,
    requireNumberGreaterThan: () => validationBuilder,
    setAllowInvalid: () => validationBuilder,
    build: () => ({ __validation: true })
  };
  const cfBuilder = {
    whenTextEqualTo: () => cfBuilder,
    whenFormulaSatisfied: (f) => { cfBuilder.lastFormula = f; return cfBuilder; },
    whenNumberLessThan: () => cfBuilder,
    setBackground: () => cfBuilder,
    setFontColor: () => cfBuilder,
    setBold: () => cfBuilder,
    setRanges: () => cfBuilder,
    build: () => ({ __cfRule: true, formula: cfBuilder.lastFormula })
  };

  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = makeSheet(n, maxRows); return sheets[n]; }
  };

  const alerts = [];
  const sandbox = {
    console: { log: () => {}, error: () => {}, warn: () => {} },
    Logger: { log: () => {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      newDataValidation: () => validationBuilder,
      newConditionalFormatRule: () => cfBuilder,
      ProtectionType: { SHEET: 'SHEET' },
      flush: () => {},
      getUi: () => ({ alert: (msg) => { alerts.push(msg); } })
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} })
    },
    Utilities: { formatDate: () => '' },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    DriveApp: {},
    HtmlService: {},
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    CacheManager: { invalidateAll: () => {} },
    recalcStockAndUsage: () => {},
    _getActiveShopNames: () => shopNames.slice()
  };
  vm.createContext(sandbox);
  const files = ['Config.gs', 'SheetBuilder.gs', 'Migration.gs'].concat(extraFiles || []);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f });
  }
  // .gs의 top-level `const`는 vm 샌드박스 객체의 프로퍼티가 되지 않는다(렉시컬 스코프).
  const evalIn = (expr) => vm.runInContext(expr, sandbox);
  return { sandbox: sandbox, ss: ss, sheets: sheets, alerts: alerts, evalIn: evalIn };
}

// ── 테스트 ────────────────────────────────────────────────────────
let failures = 0;
function check(label, fn) {
  try { fn(); console.log('  OK  ' + label); }
  catch (e) { console.error('  FAIL ' + label + ' — ' + e.message); failures++; }
}

function lastRowCovered(sheet) {
  return sheet.rangeCalls
    .filter((r) => r.row === 3 && r.ops.length > 0)
    .reduce((m, r) => Math.max(m, r.row + r.numRows - 1), 0);
}
function opsOnSheet(sheet, op) {
  return sheet.rangeCalls.filter((r) => r.ops.includes(op));
}

const SHOPS = ['맛다락', '술다락'];
const TX_NAMES = ['📝 통합 입출고 기록장', '📋 입출고_템플릿'].concat(SHOPS);
const NAMES = ['🗂️ 품목 마스터', '📂 기초데이터'].concat(TX_NAMES);

console.log('[TASK-016] MIGRATIONS[16] 서식 범위 동적 확장');

// ── 상수 ──────────────────────────────────────────────────────────
const base = buildContext(NAMES, SHOPS, 1000);
const V = base.evalIn('VALIDATION_ROWS');

check('VALIDATION_ROWS가 5000 이상이다', () => {
  assert.ok(V >= 5000, '실제=' + V);
});
check('CURRENT_SCHEMA_VERSION이 16 이상이다', () => {
  assert.ok(base.evalIn('CURRENT_SCHEMA_VERSION') >= 16, '실제=' + base.evalIn('CURRENT_SCHEMA_VERSION'));
});
check('MIGRATIONS[16]이 등록되어 있다', () => {
  assert.strictEqual(typeof base.evalIn('MIGRATIONS[16]'), 'function');
});

// ── 기본 시나리오: 1000행 시트 → VALIDATION_ROWS + 2행까지 확충 ──────
const REQUIRED = V + 2;
const run1 = buildContext(NAMES, SHOPS, 1000);
run1.evalIn('MIGRATIONS[16]')(run1.ss);

['🗂️ 품목 마스터'].concat(TX_NAMES).forEach((name) => {
  const sheet = run1.sheets[name];
  check(name + ': 행이 ' + REQUIRED + '행으로 확충된다', () => {
    assert.strictEqual(sheet.maxRows, REQUIRED, '실제=' + sheet.maxRows);
  });
  check(name + ': 서식이 ' + REQUIRED + '행까지 적용된다', () => {
    assert.strictEqual(lastRowCovered(sheet), REQUIRED);
  });
  check(name + ': 데이터 값(setValues/setFormula)은 건드리지 않는다', () => {
    assert.strictEqual(opsOnSheet(sheet, 'setValues').length, 0);
    assert.strictEqual(opsOnSheet(sheet, 'setFormula').length, 0);
  });
});

check('품목 마스터: 드롭다운 4종이 시트 끝(' + REQUIRED + '행)까지 적용된다', () => {
  const calls = opsOnSheet(run1.sheets['🗂️ 품목 마스터'], 'setDataValidation');
  assert.strictEqual(calls.length, 4, '실제=' + calls.length);
  calls.forEach((c) => assert.strictEqual(c.row + c.numRows - 1, REQUIRED));
});

check('업장 시트: 편집 허용(보호 예외) 범위 3구간이 시트 끝까지 갱신된다', () => {
  SHOPS.forEach((name) => {
    const ranges = run1.sheets[name].unprotectedRanges;
    assert.ok(Array.isArray(ranges) && ranges.length === 3, name + ' 보호 범위 미갱신');
  });
});

check('템플릿 시트에는 보호 범위를 건드리지 않는다', () => {
  assert.strictEqual(run1.sheets['📋 입출고_템플릿'].unprotectedRanges, null);
});

check('업장 시트의 품목코드(B열) 드롭다운은 재적용하지 않는다 (직접 입력 구조 유지)', () => {
  SHOPS.forEach((name) => {
    const calls = opsOnSheet(run1.sheets[name], 'setDataValidation');
    assert.ok(!calls.some((c) => c.col === 2), name + ': B열 검증이 다시 걸렸다');
  });
});

// ── 핵심 시나리오: 상수보다 큰 시트 ────────────────────────────────
// TASK-009가 재발한 이유가 여기 있다. 고정 상수만 쓰면 초과분이 맨살로 남는다.
const BIG = V + 1002; // VALIDATION_ROWS보다 1000행 큰 시트
const run2 = buildContext(NAMES, SHOPS, BIG);
run2.evalIn('MIGRATIONS[16]')(run2.ss);

['🗂️ 품목 마스터'].concat(TX_NAMES).forEach((name) => {
  const sheet = run2.sheets[name];
  check(name + ': ' + BIG + '행 시트에서 서식이 ' + BIG + '행까지 확장된다', () => {
    assert.strictEqual(lastRowCovered(sheet), BIG, '실제=' + lastRowCovered(sheet));
  });
  check(name + ': ' + BIG + '행 시트에는 행을 추가하지 않는다', () => {
    assert.strictEqual(sheet.insertedRows, 0, '실제=' + sheet.insertedRows + '행 추가됨');
  });
});

check('업장 시트: 보호 예외 범위도 ' + BIG + '행까지 확장된다', () => {
  SHOPS.forEach((name) => {
    const sheet = run2.sheets[name];
    // setUnprotectedRanges에 넘긴 3개 범위는 rangeCalls의 마지막 3건이다
    const last3 = sheet.rangeCalls.slice(-3);
    last3.forEach((r) => assert.strictEqual(r.row + r.numRows - 1, BIG, name + ' 보호 범위가 시트 끝에 못 미침'));
  });
});

// ── 멱등성 ────────────────────────────────────────────────────────
const run3 = buildContext(NAMES, SHOPS, REQUIRED);
run3.evalIn('MIGRATIONS[16]')(run3.ss);
check('멱등성: 이미 확충된 시트에는 행을 추가하지 않는다', () => {
  Object.keys(run3.sheets).forEach((k) => {
    assert.strictEqual(run3.sheets[k].insertedRows, 0, run3.sheets[k].name + '에 행 추가됨');
  });
});
run3.evalIn('MIGRATIONS[16]')(run3.ss);
check('멱등성: 재실행해도 서식 범위가 동일하다', () => {
  assert.strictEqual(lastRowCovered(run3.sheets['🗂️ 품목 마스터']), REQUIRED);
});

// ── 대상 시트 부재 ────────────────────────────────────────────────
const run4 = buildContext(['📂 기초데이터'], [], 1000);
check('대상 시트가 없어도 예외 없이 완료된다', () => {
  run4.evalIn('MIGRATIONS[16]')(run4.ss);
});

// ── 조건부 서식 비용: INDIRECT 앞에 단축평가를 둔다 ──────────────────
check('입출고 시트 조건부 서식이 빈 행에서 INDIRECT/MATCH를 건너뛴다 (IF 단축평가)', () => {
  const ctx = buildContext(NAMES, SHOPS, 1000);
  const sheet = ctx.sheets['📋 입출고_템플릿'];
  ctx.evalIn('applyTxInputSheetFormatting')(sheet);
  const formula = sheet.cfRules[0].formula;
  assert.ok(/^=IF\(\$B3=""/.test(formula), '단축평가 IF로 시작하지 않음: ' + formula);
  assert.ok(!/^=AND\(/.test(formula), 'AND()는 인자를 모두 평가하므로 빈 행에서도 MATCH가 돈다');
});

// ── 자가 복구: 서식 적용 후 행이 늘어난 상황 ────────────────────────
const run5 = buildContext(NAMES, SHOPS, 1000);
run5.evalIn('MIGRATIONS[16]')(run5.ss);
const master5 = run5.sheets['🗂️ 품목 마스터'];

check('자가 복구: 서식이 최신이면 아무 것도 하지 않는다', () => {
  assert.strictEqual(run5.evalIn('_isItemMasterFormattingStale')(master5), false);
  assert.strictEqual(run5.evalIn('_healSheetFormattingIfStale')(run5.ss), false);
});

check('자가 복구: 사용자가 행을 추가하면 커버리지 이탈을 감지한다', () => {
  master5.insertRowsAfter(master5.maxRows, 1000); // 하단 "행 1000개 추가"
  assert.strictEqual(run5.evalIn('_isItemMasterFormattingStale')(master5), true);
});

check('자가 복구: 추가된 행까지 서식을 다시 굽는다', () => {
  const grown = master5.maxRows;
  assert.strictEqual(run5.evalIn('_healSheetFormattingIfStale')(run5.ss), true);
  assert.strictEqual(lastRowCovered(master5), grown, '실제=' + lastRowCovered(master5));
  assert.strictEqual(run5.evalIn('_isItemMasterFormattingStale')(master5), false);
});

check('통합 갱신(refreshDashboard)이 자가 복구를 호출한다', () => {
  const src = fs.readFileSync(path.join(SRC, 'Dashboard.gs'), 'utf8');
  const body = src.slice(src.indexOf('function refreshDashboard'));
  assert.ok(/_healSheetFormattingIfStale\(ss\)/.test(body.slice(0, 3000)),
    'refreshDashboard에서 _healSheetFormattingIfStale 호출을 찾지 못함');
});

// ── 관리자 메뉴 ───────────────────────────────────────────────────
const run6 = buildContext(NAMES, SHOPS, 1000, ['Code.gs']);
check('repairAllSheetFormatting 함수가 존재한다', () => {
  assert.strictEqual(typeof run6.sandbox.repairAllSheetFormatting, 'function');
});
check('repairAllSheetFormatting 실행 시 서식이 재적용되고 완료 알림이 뜬다', () => {
  run6.sandbox.repairAllSheetFormatting();
  assert.strictEqual(lastRowCovered(run6.sheets['🗂️ 품목 마스터']), REQUIRED);
  assert.strictEqual(run6.alerts.length, 1, '알림 수=' + run6.alerts.length);
  assert.ok(run6.alerts[0].indexOf('복구 완료') >= 0, '완료 알림이 아님: ' + run6.alerts[0]);
});
check('onOpen 메뉴에 서식 복구 항목이 등록되어 있다', () => {
  const src = fs.readFileSync(path.join(SRC, 'Code.gs'), 'utf8');
  assert.ok(src.indexOf('"repairAllSheetFormatting"') > 0, '메뉴 등록 누락');
});

// ── CSV 업로드: 행 부족 시 쓰기 실패 방지 + 신규 행 서식 ──────────────
const run7 = buildContext(NAMES, SHOPS, 3, ['ItemService.gs']); // 남은 데이터 행이 1행뿐인 시트
const master7 = run7.sheets['🗂️ 품목 마스터'];
const csvRows = [
  ['CHE-262', '신규품목1'], ['CHE-263', '신규품목2'],
  ['CHE-264', '신규품목3'], ['CHE-265', '신규품목4']
];
let uploadResult = null;
check('CSV 업로드: 남은 행보다 CSV가 커도 쓰기가 실패하지 않는다 (선제 행 확충)', () => {
  uploadResult = run7.sandbox.uploadItemMasterCSV('SHEET_UI', csvRows);
  assert.ok(uploadResult && uploadResult.success, '실패: ' + (uploadResult && uploadResult.message));
  assert.ok(master7.maxRows >= 2 + csvRows.length, '행 확충 안 됨 (maxRows=' + master7.maxRows + ')');
});
check('CSV 업로드: 신규 등록 건수가 정확하다', () => {
  assert.ok(uploadResult.message.indexOf(csvRows.length + '건 신규 등록') >= 0, uploadResult.message);
});
check('CSV 업로드: 업로드 직후 신규 행에 서식/드롭다운이 재적용된다', () => {
  assert.strictEqual(lastRowCovered(master7), REQUIRED, '실제=' + lastRowCovered(master7));
  assert.strictEqual(opsOnSheet(master7, 'setDataValidation').length, 4);
});

if (failures > 0) {
  console.error('\n✗ ' + failures + '개 검증 실패');
  process.exit(1);
}
console.log('\n✓ MIGRATIONS[16] 검증 통과');
