/**
 * [TASK-009] MIGRATIONS[12] — 서식/유효성 검사 적용 행 범위 확장 검증
 *
 * migration-v11.test.js는 마이그레이션 로직을 테스트 파일에 복사해 시뮬레이션하지만,
 * v12는 SheetBuilder.gs의 공용 서식 함수를 그대로 재사용하므로 복사본이 원본과 어긋나기 쉽다.
 * 그래서 이 테스트는 `src/Config.gs`, `src/SheetBuilder.gs`, `src/Migration.gs`를
 * vm 컨텍스트에 **실제로 로드**하고 SpreadsheetApp만 모킹한다.
 * (`_getActiveShopNames`는 RBAC.gs 전체를 끌어오지 않기 위해 스텁으로 주입한다.)
 *
 * 실제 Google Sheet는 전혀 건드리지 않는 순수 인메모리 시뮬레이션이다.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');

// ── SpreadsheetApp 모킹 ───────────────────────────────────────────
function makeRange(sheet, row, col, numRows, numCols) {
  const rec = { row: row, col: col, numRows: numRows, numCols: numCols, ops: [] };
  sheet.rangeCalls.push(rec);
  const api = {};
  const chain = (name) => function () { rec.ops.push(name); return api; };
  ['setBackground', 'setHorizontalAlignment', 'setDataValidation', 'setNumberFormat',
   'setFontColor', 'setFontWeight', 'setFontStyle', 'merge', 'setValue', 'setValues',
   'setFormula', 'clearContent', 'clearDataValidations'].forEach((m) => { api[m] = chain(m); });
  api.getValues = () => Array.from({ length: numRows }, () => new Array(numCols).fill(''));
  api.getLastRow = () => row + numRows - 1;
  return api;
}

function makeSheet(name, maxRows) {
  const sheet = {
    name: name,
    maxRows: maxRows,
    rangeCalls: [],
    insertedRows: 0,
    unprotectedRanges: null,
    getName: () => name,
    getMaxRows: () => sheet.maxRows,
    insertRowsAfter: (afterRow, howMany) => { sheet.maxRows += howMany; sheet.insertedRows += howMany; },
    getLastRow: () => Math.min(10, sheet.maxRows),
    setFrozenRows: () => sheet,
    setColumnWidth: () => sheet,
    setConditionalFormatRules: (rules) => { sheet.cfRules = rules; },
    getProtections: () => [{
      setUnprotectedRanges: (ranges) => { sheet.unprotectedRanges = ranges; }
    }],
    getRange: function (a, b, c, d) {
      if (typeof a === 'string') return makeRange(sheet, 0, 0, 1, 1); // "C3:C50" 형태
      return makeRange(sheet, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    }
  };
  return sheet;
}

function buildContext(sheetNames, shopNames, maxRows) {
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
    whenFormulaSatisfied: () => cfBuilder,
    whenNumberLessThan: () => cfBuilder, // [TASK-011] H열 음수 강조 규칙
    setBackground: () => cfBuilder,
    setFontColor: () => cfBuilder,
    setBold: () => cfBuilder,
    setRanges: () => cfBuilder,
    build: () => ({ __cfRule: true })
  };

  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = makeSheet(n, maxRows); return sheets[n]; }
  };

  const sandbox = {
    console: { log: () => {}, error: () => {}, warn: () => {} },
    Logger: { log: () => {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      newDataValidation: () => validationBuilder,
      newConditionalFormatRule: () => cfBuilder,
      ProtectionType: { SHEET: 'SHEET' },
      flush: () => {},
      getUi: () => { throw new Error('UI 없음'); }
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} })
    },
    Utilities: { formatDate: () => '' },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    DriveApp: {},
    _getActiveShopNames: () => shopNames.slice()
  };
  vm.createContext(sandbox);
  for (const f of ['Config.gs', 'SheetBuilder.gs', 'Migration.gs']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f });
  }
  // .gs의 top-level `const`는 vm 샌드박스 객체의 프로퍼티가 되지 않는다(렉시컬 스코프).
  // 같은 컨텍스트에서 식을 평가하면 접근할 수 있으므로 evalIn으로 꺼낸다.
  const evalIn = (expr) => vm.runInContext(expr, sandbox);
  return { sandbox: sandbox, ss: ss, sheets: sheets, evalIn: evalIn };
}

// ── 테스트 ────────────────────────────────────────────────────────
let failures = 0;
function check(label, fn) {
  try { fn(); console.log('  OK  ' + label); }
  catch (e) { console.error('  FAIL ' + label + ' — ' + e.message); failures++; }
}

const SHOPS = ['맛다락', '술다락'];
const NAMES = ['🗂️ 품목 마스터', '📝 통합 입출고 기록장', '📋 입출고_템플릿', '📂 기초데이터'].concat(SHOPS);

console.log('[TASK-009] MIGRATIONS[12] 서식 범위 확장');

// 상수
const base = buildContext(NAMES, SHOPS, 1000);
check('VALIDATION_ROWS가 2000 이상이다', () => {
  assert.ok(base.evalIn('VALIDATION_ROWS') >= 2000, '실제=' + base.evalIn('VALIDATION_ROWS'));
});
check('CURRENT_SCHEMA_VERSION이 12 이상이다', () => {
  assert.ok(base.evalIn('CURRENT_SCHEMA_VERSION') >= 12, '실제=' + base.evalIn('CURRENT_SCHEMA_VERSION'));
});
check('MIGRATIONS[12]가 등록되어 있다', () => {
  assert.strictEqual(typeof base.evalIn('MIGRATIONS[12]'), 'function');
});

// 마이그레이션 실행 (기본 1000행 시트)
const run1 = buildContext(NAMES, SHOPS, 1000);
const V = run1.evalIn('VALIDATION_ROWS');
const REQUIRED = V + 2;
run1.evalIn('MIGRATIONS[12]')(run1.ss);

function lastRowCovered(sheet) {
  return sheet.rangeCalls
    .filter((r) => r.row === 3 && r.ops.length > 0)
    .reduce((m, r) => Math.max(m, r.row + r.numRows - 1), 0);
}
function opsOnSheet(sheet, op) {
  return sheet.rangeCalls.filter((r) => r.ops.includes(op));
}

['🗂️ 품목 마스터', '📝 통합 입출고 기록장', '📋 입출고_템플릿'].concat(SHOPS).forEach((name) => {
  const sheet = run1.sheets[name];
  check(name + ': 행이 ' + REQUIRED + '행 이상으로 확충된다', () => {
    assert.ok(sheet.maxRows >= REQUIRED, '실제=' + sheet.maxRows);
  });
  check(name + ': 서식이 ' + REQUIRED + '행까지 적용된다', () => {
    assert.strictEqual(lastRowCovered(sheet), REQUIRED);
  });
  check(name + ': 배경색과 가운데 정렬이 적용된다', () => {
    assert.ok(opsOnSheet(sheet, 'setBackground').length > 0, 'setBackground 호출 없음');
    assert.ok(opsOnSheet(sheet, 'setHorizontalAlignment').length > 0, 'setHorizontalAlignment 호출 없음');
  });
  check(name + ': 데이터 값(setValues/setFormula)은 건드리지 않는다', () => {
    assert.strictEqual(opsOnSheet(sheet, 'setValues').length, 0);
    assert.strictEqual(opsOnSheet(sheet, 'setFormula').length, 0);
  });
});

check('품목 마스터: 카테고리/단위/과세/사용유무 드롭다운 4종이 재적용된다', () => {
  const calls = opsOnSheet(run1.sheets['🗂️ 품목 마스터'], 'setDataValidation');
  assert.strictEqual(calls.length, 4, '실제=' + calls.length);
  calls.forEach((c) => assert.strictEqual(c.numRows, V, '드롭다운 범위가 VALIDATION_ROWS가 아님'));
});

check('품목 마스터: 매입단가 등 금액 열에 #,##0 서식이 적용된다', () => {
  const calls = opsOnSheet(run1.sheets['🗂️ 품목 마스터'], 'setNumberFormat');
  assert.ok(calls.some((c) => c.col === 20 && c.numRows === V), 'T열(20) 숫자서식 없음');
});

check('입출고 시트: 구분/수량 드롭다운이 VALIDATION_ROWS 범위로 재적용된다', () => {
  SHOPS.concat(['📋 입출고_템플릿']).forEach((name) => {
    const calls = opsOnSheet(run1.sheets[name], 'setDataValidation');
    assert.strictEqual(calls.length, 2, name + ' 실제=' + calls.length);
    calls.forEach((c) => assert.strictEqual(c.numRows, V));
  });
});

check('업장 시트: 시트 보호 편집 허용 범위가 VALIDATION_ROWS로 확장된다', () => {
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

// 멱등성 — 이미 2002행인 시트에 재실행
const run2 = buildContext(NAMES, SHOPS, REQUIRED);
run2.evalIn('MIGRATIONS[12]')(run2.ss);
check('멱등성: 이미 확충된 시트에는 행을 추가하지 않는다', () => {
  Object.keys(run2.sheets).forEach((k) => {
    const sh = run2.sheets[k];
    assert.strictEqual(sh.insertedRows, 0, sh.name + '에 ' + sh.insertedRows + '행 추가됨');
  });
});
check('멱등성: 재실행해도 서식은 동일 범위로 적용된다', () => {
  assert.strictEqual(lastRowCovered(run2.sheets['🗂️ 품목 마스터']), REQUIRED);
});

// 시트가 없는 환경에서도 예외 없이 통과
const run3 = buildContext(['📂 기초데이터'], [], 1000);
check('대상 시트가 없어도 예외 없이 완료된다', () => {
  run3.evalIn('MIGRATIONS[12]')(run3.ss);
});

if (failures > 0) {
  console.error('\n✗ ' + failures + '개 검증 실패');
  process.exit(1);
}
console.log('\n✓ MIGRATIONS[12] 검증 통과');
