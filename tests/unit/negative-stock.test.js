// [TASK-011] 음수 재고 표시 지원 및 4대 안전장치 단위 테스트
//
// src/Config.gs / src/StockEngine.gs / src/SheetBuilder.gs / src/Dashboard.gs / src/Archive.gs /
// src/Migration.gs 의 실제 소스를 vm 샌드박스에 그대로 로드하고, GAS 전역만 인메모리 스텁으로
// 대체한다. 로직을 테스트 파일에 복사하지 않으므로 소스가 바뀌면 테스트도 함께 따라간다.
//
// 검증 대상
//   1) 현재고 음수 표시      — recalcStockAndUsage()가 H열에 -5를 그대로 기록
//   2) 재고자산 0원 하한     — 음수 재고여도 W열은 0
//   3) 적정발주량 수식 방어  — 일평균 0 + 현재고 -5 → 발주량 0 (실제 P3 수식을 평가)
//   4) 월마감 가드레일       — 음수 재고 1건이라도 있으면 마감 차단, 없으면 정상 진행
//   5) 시각화 서식           — H열 음수 조건부 서식 + 숫자 서식

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');
const ARCHIVE_FOLDER_ID = 'TEST-ARCHIVE-FOLDER';

function pad(n, w) { return String(n).padStart(w, '0'); }

// ─────────────────────────────────────────────────────────────
//  시트 목 (3행부터 데이터)
// ─────────────────────────────────────────────────────────────

function makeSheet(name, rowsFromRow3) {
  const grid = {};
  (rowsFromRow3 || []).forEach((row, i) => { grid[i + 3] = row.slice(); });

  function parseA1(a1) {
    const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a1);
    if (!m) throw new Error('테스트 스텁이 지원하지 않는 A1 표기: ' + a1);
    const colNum = (s) => s.split('').reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
    const c1 = colNum(m[1]), r1 = Number(m[2]);
    const c2 = m[3] ? colNum(m[3]) : c1, r2 = m[4] ? Number(m[4]) : r1;
    return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
  }

  const sheet = {
    name: name,
    grid: grid,
    formulas: {},      // { 'P3': '=ARRAYFORMULA(...)' }
    numberFormats: [], // [{ row, col, numRows, numCols, format }]
    cfRules: [],
    protections: [],
    setName(n) { sheet.name = n; return sheet; },
    getName() { return sheet.name; },
    setFrozenRows() { return sheet; },
    setColumnWidth() { return sheet; },
    getMaxRows() { return 3000; },
    insertRowsAfter() { return sheet; },
    setConditionalFormatRules(rules) { sheet.cfRules = rules; return sheet; },
    getProtections() { return sheet.protections; },
    getLastRow() {
      const rows = Object.keys(grid).map(Number)
        .filter((r) => (grid[r] || []).some((v) => v !== '' && v !== undefined));
      return rows.length ? Math.max.apply(null, rows) : 0;
    },
    getRange() {
      let startRow, startCol, numRows, numCols, a1 = null;
      if (arguments.length === 1) {
        a1 = arguments[0];
        [startRow, startCol, numRows, numCols] = parseA1(a1);
      } else {
        [startRow, startCol, numRows, numCols] = arguments;
      }

      const range = {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const src = grid[startRow + r] || [];
            const line = [];
            for (let c = 0; c < numCols; c++) {
              const v = src[startCol - 1 + c];
              line.push(v === undefined ? '' : v);
            }
            out.push(line);
          }
          return out;
        },
        setValues(values) {
          values.forEach((line, r) => {
            const target = grid[startRow + r] || (grid[startRow + r] = []);
            line.forEach((v, c) => { target[startCol - 1 + c] = v; });
          });
          return range;
        },
        setValue(v) { return range.setValues([[v]]); },
        setFormula(f) { sheet.formulas[a1 || `r${startRow}c${startCol}`] = f; return range; },
        setNumberFormat(format) {
          sheet.numberFormats.push({ row: startRow, col: startCol, numRows: numRows, numCols: numCols, format: format });
          return range;
        },
        clearContent() {
          for (let r = 0; r < numRows; r++) {
            const target = grid[startRow + r];
            if (!target) continue;
            for (let c = 0; c < numCols; c++) target[startCol - 1 + c] = '';
          }
          return range;
        },
        merge() { return range; },
        clearDataValidations() { return range; },
        setDataValidation() { return range; },
        setHorizontalAlignment() { return range; },
        setBackground() { return range; },
        setFontColor() { return range; },
        setFontWeight() { return range; },
        setFontStyle() { return range; },
        protect() {
          const p = {
            type: 'RANGE', startRow: startRow, startCol: startCol, numRows: numRows,
            description: '', warningOnly: false,
            setDescription(d) { p.description = d; return p; },
            getDescription() { return p.description; },
            setWarningOnly(v) { p.warningOnly = v; return p; },
            setUnprotectedRanges() { return p; },
            remove() { sheet.protections = sheet.protections.filter((x) => x !== p); }
          };
          sheet.protections.push(p);
          return p;
        }
      };
      return range;
    }
  };
  return sheet;
}

/** 시즌설정 시트: recalcStockAndUsage()는 A5:C 범위만 읽는다 (시즌 없음 = 30일 fallback) */
function makeSeasonSheet() {
  return {
    getLastRow: () => 5,
    getRange: () => ({ getValues: () => [['', '', '']] })
  };
}

// ─────────────────────────────────────────────────────────────
//  샌드박스
// ─────────────────────────────────────────────────────────────

function loadContext(txRows, masterRows) {
  const txSheet = makeSheet('TX', txRows);
  const masterSheet = makeSheet('MASTER', masterRows);
  const seasonSheet = makeSeasonSheet();
  const baseDataSheet = makeSheet('BASE', []);
  const archiveSheet = makeSheet('ARCHIVE_NEW', []);
  const shopsSheet = makeSheet('SHOPS', []);

  let uuidSeq = 0;
  const scriptProps = { ARCHIVE_FOLDER_ID: ARCHIVE_FOLDER_ID };
  const createdSpreadsheets = [];

  const yearFolder = { addFile() {} };
  const baseFolder = {
    getFoldersByName: () => ({ hasNext: () => false, next: () => null }),
    createFolder: () => yearFolder
  };

  const cfBuilder = () => {
    const rule = { conditions: [], background: null, fontColor: null, bold: false, ranges: [] };
    const builder = {
      whenTextEqualTo(v) { rule.conditions.push({ type: 'textEq', value: v }); return builder; },
      whenFormulaSatisfied(v) { rule.conditions.push({ type: 'formula', value: v }); return builder; },
      whenNumberLessThan(v) { rule.conditions.push({ type: 'numberLessThan', value: v }); return builder; },
      setBackground(v) { rule.background = v; return builder; },
      setFontColor(v) { rule.fontColor = v; return builder; },
      setBold(v) { rule.bold = v; return builder; },
      setRanges(v) { rule.ranges = v; return builder; },
      build: () => rule
    };
    return builder;
  };

  const validationBuilder = {
    requireValueInList: () => validationBuilder,
    requireValueInRange: () => validationBuilder,
    requireNumberGreaterThan: () => validationBuilder,
    setAllowInvalid: () => validationBuilder,
    build: () => ({ __validation: true })
  };

  const ss = {
    getSheetByName(n) {
      if (n === '📝 통합 입출고 기록장') return txSheet;
      if (n === '🗂️ 품목 마스터') return masterSheet;
      if (n === '📅 시즌설정') return seasonSheet;
      if (n === '📂 기초데이터') return baseDataSheet;
      if (n === '🏢 업장관리') return shopsSheet;
      return null;
    },
    getSheets: () => [txSheet, masterSheet, shopsSheet],
    insertSheet: () => makeSheet('NEW', [])
  };

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Logger: { log: () => {} },
    Utilities: {
      formatDate(date, tz, fmt) {
        const y = date.getFullYear(), m = pad(date.getMonth() + 1, 2), d = pad(date.getDate(), 2);
        if (fmt === 'yyyy-MM-dd') return `${y}-${m}-${d}`;
        if (fmt === 'yyyyMMdd') return `${y}${m}${d}`;
        throw new Error('테스트 스텁이 지원하지 않는 포맷: ' + fmt);
      },
      getUuid: () => `${pad(++uuidSeq, 8)}-1111-2222-3333-444455556666`
    },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in scriptProps ? scriptProps[k] : null),
        setProperty: (k, v) => { scriptProps[k] = v; }
      })
    },
    DriveApp: {
      getFolderById(id) {
        if (id !== ARCHIVE_FOLDER_ID) throw new Error('폴더 없음: ' + id);
        return baseFolder;
      },
      getFileById: (id) => ({ _id: id }),
      getRootFolder: () => ({ removeFile() {} })
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      newConditionalFormatRule: cfBuilder,
      newDataValidation: () => validationBuilder,
      create(name) {
        createdSpreadsheets.push(name);
        return { getId: () => 'NEW-SS-ID', getSheets: () => [archiveSheet] };
      },
      ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' },
      flush() {}
    },
    CacheManager: { invalidateAll: () => {} },
    validateSession: () => ({ name: '관리자', role: 'admin' }),
    _getActiveShopNames: () => []
  };

  const ctx = vm.createContext(sandbox);
  ['Config.gs', 'StockEngine.gs', 'SheetBuilder.gs', 'Dashboard.gs', 'Archive.gs', 'Migration.gs'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  });

  ctx.__ss = ss;
  ctx.__txSheet = txSheet;
  ctx.__masterSheet = masterSheet;
  // .gs의 top-level const는 샌드박스 프로퍼티가 되지 않으므로 같은 컨텍스트에서 평가해 꺼낸다
  ctx.__evalIn = (expr) => vm.runInContext(expr, ctx);
  return ctx;
}

// ─────────────────────────────────────────────────────────────
//  데이터 빌더
// ─────────────────────────────────────────────────────────────

function tx(date, code, name, type, qty, price) {
  return [new Date(date + 'T00:00:00'), code, name, type, qty, price, '테스터', '', 'FB-X'];
}

/** MASTER_COLS: CODE(0) NAME(1) INIT_STOCK(6) CURRENT_STOCK(7) UNIT_PRICE(19) TOTAL_VALUE(22) USAGE_STATUS(23) */
function master(code, name, initStock, unitPrice, opts) {
  const o = opts || {};
  const row = new Array(24).fill('');
  row[0] = code;
  row[1] = name;
  row[6] = initStock;
  row[7] = o.currentStock === undefined ? 0 : o.currentStock;
  row[19] = unitPrice;
  row[22] = 0;
  row[23] = o.usageStatus === undefined ? '사용' : o.usageStatus;
  return row;
}

const CURRENT_STOCK_COL = 7;
const TOTAL_VALUE_COL = 22;

function masterRowsOf(ctx) {
  const sheet = ctx.__masterSheet;
  const last = sheet.getLastRow();
  if (last < 3) return [];
  return sheet.getRange(3, 1, last - 2, 24).getValues().filter((r) => r[0] !== '');
}

// ─────────────────────────────────────────────────────────────
//  스프레드시트 수식 평가기 (ARRAYFORMULA 1행 분)
// ─────────────────────────────────────────────────────────────

/**
 * SheetBuilder가 실제로 시트에 쓰는 ARRAYFORMULA 수식을 한 행분 값으로 평가한다.
 * 수식 문자열을 테스트에 복사하지 않고 소스에서 읽어온 것을 그대로 평가하므로,
 * 수식이 바뀌면 이 테스트도 함께 바뀐 수식을 검증한다.
 *
 * 지원 범위: IF / ROUNDUP / 사칙연산 / 비교연산 / A3:A 형태의 열 참조.
 *
 * @param {string} formula ARRAYFORMULA 수식 (= 로 시작)
 * @param {Object} cols    { A: 'ITM-001', H: -5, I: 0, M: 7, T: 1000 } 형태의 행 값
 */
function evalArrayFormulaRow(formula, cols) {
  let body = formula.trim();
  assert.ok(/^=ARRAYFORMULA\(/.test(body), 'ARRAYFORMULA 수식이 아님: ' + body);
  body = body.replace(/^=ARRAYFORMULA\(/, '').replace(/\)$/, '');

  // A3:A → A (열 참조를 스칼라 변수로)
  body = body.replace(/([A-Z])\d+:\1\b/g, '$1');
  // 스프레드시트의 = 비교를 JS === 로 (<=, >=, <>는 건드리지 않는다)
  body = body.replace(/(?<![<>!=])=(?!=)/g, '===');
  body = body.replace(/<>/g, '!==');

  const names = Object.keys(cols);
  const fn = new Function('IF', 'ROUNDUP', ...names, 'return (' + body + ');');
  return fn(
    (cond, a, b) => (cond ? a : b),
    (v, digits) => {
      const f = Math.pow(10, digits || 0);
      return v < 0 ? -Math.ceil(-v * f) / f : Math.ceil(v * f) / f;
    },
    ...names.map((n) => cols[n])
  );
}

// ─────────────────────────────────────────────────────────────
//  러너
// ─────────────────────────────────────────────────────────────

let passed = 0;
function test(title, fn) {
  fn();
  passed++;
  console.log('  ✓ ' + title);
}

console.log('[TASK-011] 음수 재고 표시 지원 및 안전장치');

// ─────────────────────────────────────────────────────────────
//  1. 현재고 음수 표시
// ─────────────────────────────────────────────────────────────

test('입고 10 / 출고 15 → 현재고가 -5로 기록된다 (0으로 클램핑하지 않는다)', () => {
  const ctx = loadContext([
    tx('2026-09-01', 'A001', '토마토', '입고', 10, 1000),
    tx('2026-09-02', 'A001', '토마토', '출고', 15, 1000)
  ], [master('A001', '토마토', 0, 1000)]);

  ctx.recalcStockAndUsage(ctx.__ss);
  assert.strictEqual(masterRowsOf(ctx)[0][CURRENT_STOCK_COL], -5);
});

test('초기재고 3 / 출고 8 → 현재고 -5 (초기재고도 음수 계산에 포함된다)', () => {
  const ctx = loadContext([
    tx('2026-09-02', 'A001', '토마토', '출고', 8, 1000)
  ], [master('A001', '토마토', 3, 1000)]);

  ctx.recalcStockAndUsage(ctx.__ss);
  assert.strictEqual(masterRowsOf(ctx)[0][CURRENT_STOCK_COL], -5);
});

test('정상 재고(입고 10 / 출고 4)는 기존과 동일하게 6으로 계산된다', () => {
  const ctx = loadContext([
    tx('2026-09-01', 'A001', '토마토', '입고', 10, 1000),
    tx('2026-09-02', 'A001', '토마토', '출고', 4, 1000)
  ], [master('A001', '토마토', 0, 1000)]);

  ctx.recalcStockAndUsage(ctx.__ss);
  assert.strictEqual(masterRowsOf(ctx)[0][CURRENT_STOCK_COL], 6);
});

// ─────────────────────────────────────────────────────────────
//  2. 재고자산 평가액 0원 하한
// ─────────────────────────────────────────────────────────────

test('현재고 -5 (입고 이력 있음) → 재고 합계금액 W열은 0원', () => {
  const ctx = loadContext([
    tx('2026-09-01', 'A001', '토마토', '입고', 10, 1000),
    tx('2026-09-02', 'A001', '토마토', '출고', 15, 1000)
  ], [master('A001', '토마토', 0, 1000)]);

  ctx.recalcStockAndUsage(ctx.__ss);
  const row = masterRowsOf(ctx)[0];
  assert.strictEqual(row[CURRENT_STOCK_COL], -5, '수량은 음수로 남는다');
  assert.strictEqual(row[TOTAL_VALUE_COL], 0, '평가액은 0원이어야 한다');
});

test('현재고 -5 (입고 이력 없음, 매입단가 1000) → 단가 곱연산이 음수가 되지 않는다', () => {
  // 입고 로트가 없으므로 과거에는 unitPrice * currentStock = -5000이 기록될 수 있었다
  const ctx = loadContext([
    tx('2026-09-02', 'A001', '토마토', '출고', 5, 1000)
  ], [master('A001', '토마토', 0, 1000)]);

  ctx.recalcStockAndUsage(ctx.__ss);
  const row = masterRowsOf(ctx)[0];
  assert.strictEqual(row[CURRENT_STOCK_COL], -5);
  assert.strictEqual(row[TOTAL_VALUE_COL], 0, '마이너스 자산이 장부에 기록되면 안 된다');
});

test('정상 재고의 FIFO 평가액은 그대로 유지된다 (0 하한이 정상값을 깎지 않는다)', () => {
  const ctx = loadContext([
    tx('2026-09-01', 'A001', '토마토', '입고', 10, 1000),
    tx('2026-09-02', 'A001', '토마토', '입고', 5, 1200),
    tx('2026-09-03', 'A001', '토마토', '출고', 12, 1000)
  ], [master('A001', '토마토', 0, 1200)]);

  ctx.recalcStockAndUsage(ctx.__ss);
  const row = masterRowsOf(ctx)[0];
  assert.strictEqual(row[CURRENT_STOCK_COL], 3);
  assert.strictEqual(row[TOTAL_VALUE_COL], 3 * 1200, 'FIFO 잔여 로트 3개 × 1200');
});

// ─────────────────────────────────────────────────────────────
//  3. 적정발주량(P3) / 재고 합계금액(W3) 수식 방어
// ─────────────────────────────────────────────────────────────

const formulaCtx = loadContext([], [master('A001', '토마토', 0, 1000)]);
formulaCtx.__evalIn('MIGRATIONS[14]')(formulaCtx.__ss);
const P3 = formulaCtx.__masterSheet.formulas['P3'];
const W3 = formulaCtx.__masterSheet.formulas['W3'];

test('MIGRATIONS[14]가 P3 / W3 수식을 기존 시트에 재적용한다', () => {
  assert.ok(P3, 'P3 수식이 설정되지 않음');
  assert.ok(W3, 'W3 수식이 설정되지 않음');
  assert.ok(formulaCtx.__evalIn('CURRENT_SCHEMA_VERSION') >= 14,
    'CURRENT_SCHEMA_VERSION이 14 미만: ' + formulaCtx.__evalIn('CURRENT_SCHEMA_VERSION'));
});

test('적정발주량: 일평균 0 + 현재고 -5 → 발주량 0 (허수 발주 차단)', () => {
  assert.strictEqual(evalArrayFormulaRow(P3, { A: 'A001', H: -5, I: 0, M: 7 }), 0);
});

test('적정발주량: 일평균 2 + 현재고 -5 → 부족분을 메우도록 정상 계산된다', () => {
  // 목표 2 × 7 = 14, 현재고 -5 → 14 - (-5) = 19
  assert.strictEqual(evalArrayFormulaRow(P3, { A: 'A001', H: -5, I: 2, M: 7 }), 19);
});

test('적정발주량: 재고가 충분하면 0 (기존 동작 유지)', () => {
  assert.strictEqual(evalArrayFormulaRow(P3, { A: 'A001', H: 100, I: 2, M: 7 }), 0);
});

test('적정발주량: 빈 행은 빈 문자열 (기존 동작 유지)', () => {
  assert.strictEqual(evalArrayFormulaRow(P3, { A: '', H: '', I: '', M: '' }), '');
});

test('재고 합계금액 수식: 현재고 -5 × 단가 1000 → 0원', () => {
  assert.strictEqual(evalArrayFormulaRow(W3, { A: 'A001', H: -5, T: 1000 }), 0);
});

test('재고 합계금액 수식: 정상 재고는 단가 × 수량 그대로', () => {
  assert.strictEqual(evalArrayFormulaRow(W3, { A: 'A001', H: 5, T: 1000 }), 5000);
});

// ─────────────────────────────────────────────────────────────
//  4. 월마감 음수 재고 가드레일
// ─────────────────────────────────────────────────────────────

test('음수 재고 품목이 있으면 월마감이 차단된다 (아카이브도 초기재고 리셋도 하지 않는다)', () => {
  const txRows = [
    tx('2026-08-01', 'A001', '토마토', '입고', 10, 1000),
    tx('2026-08-20', 'A001', '토마토', '출고', 15, 1000)
  ];
  const ctx = loadContext(txRows, [master('A001', '토마토', 0, 1000)]);
  ctx.recalcStockAndUsage(ctx.__ss);
  assert.strictEqual(masterRowsOf(ctx)[0][CURRENT_STOCK_COL], -5, '사전 조건: 현재고 -5');

  const res = ctx.executeMonthlyClosing('t', 2026, 8);
  assert.strictEqual(res.success, false, '마감이 차단되어야 한다');
  assert.ok(res.message.indexOf('마감 차단') >= 0, '차단 사유 메시지: ' + res.message);
  assert.ok(res.message.indexOf('A001') >= 0, '대상 품목코드가 안내되어야 한다: ' + res.message);
  assert.ok(res.message.indexOf('1건') >= 0, '건수가 안내되어야 한다: ' + res.message);

  // 마감이 중단됐으므로 원본 데이터가 그대로 남아 있어야 한다
  assert.strictEqual(ctx.__txSheet.getRange(3, 1, 2, 9).getValues()[1][4], 15, '입출고 원본이 보존된다');
  assert.strictEqual(masterRowsOf(ctx)[0][CURRENT_STOCK_COL], -5, '현재고가 0으로 증발하지 않는다');
});

test('모든 품목의 현재고가 0 이상이면 월마감이 정상 진행된다', () => {
  const ctx = loadContext([
    tx('2026-08-01', 'A001', '토마토', '입고', 10, 1000),
    tx('2026-08-20', 'A001', '토마토', '출고', 4, 1000)
  ], [master('A001', '토마토', 0, 1000)]);
  ctx.recalcStockAndUsage(ctx.__ss);
  assert.strictEqual(masterRowsOf(ctx)[0][CURRENT_STOCK_COL], 6, '사전 조건: 현재고 6');

  const res = ctx.executeMonthlyClosing('t', 2026, 8);
  assert.ok(res.success, '마감이 성공해야 한다: ' + res.message);
});

test('현재고 0인 품목은 마감을 막지 않는다 (음수만 차단 대상)', () => {
  const ctx = loadContext([
    tx('2026-08-01', 'A001', '토마토', '입고', 5, 1000),
    tx('2026-08-20', 'A001', '토마토', '출고', 5, 1000)
  ], [master('A001', '토마토', 0, 1000)]);
  ctx.recalcStockAndUsage(ctx.__ss);
  assert.strictEqual(masterRowsOf(ctx)[0][CURRENT_STOCK_COL], 0);

  const res = ctx.executeMonthlyClosing('t', 2026, 8);
  assert.ok(res.success, '마감이 성공해야 한다: ' + res.message);
});

test('H열이 갱신되기 전이어도(기록값 0) 실적으로 재계산해 음수를 잡아낸다', () => {
  // recalcStockAndUsage()를 돌리지 않아 H열은 0인 상태 — 가드레일이 이를 통과시키면 결손이 증발한다
  const ctx = loadContext([
    tx('2026-08-01', 'A001', '토마토', '입고', 10, 1000),
    tx('2026-08-20', 'A001', '토마토', '출고', 15, 1000)
  ], [master('A001', '토마토', 0, 1000, { currentStock: 0 })]);

  const res = ctx.executeMonthlyClosing('t', 2026, 8);
  assert.strictEqual(res.success, false, '스테일한 H열에 속아 마감이 진행되면 안 된다');
  assert.ok(res.message.indexOf('마감 차단') >= 0, res.message);
});

test('미사용 품목의 음수 재고는 마감을 막지 않는다', () => {
  const ctx = loadContext([
    tx('2026-08-20', 'A001', '토마토', '출고', 5, 1000)
  ], [master('A001', '토마토', 0, 1000, { usageStatus: '미사용' })]);

  const res = ctx.executeMonthlyClosing('t', 2026, 8);
  assert.ok(res.success, '미사용(폐기 예정) 품목까지 마감을 영구 차단하면 안 된다: ' + res.message);
});

test('음수 품목이 4건 이상이면 3건까지만 예시로 보여주고 나머지는 건수로 안내한다', () => {
  const codes = ['A001', 'B002', 'C003', 'D004'];
  const ctx = loadContext(
    codes.map((c, i) => tx('2026-08-2' + i, c, '품목' + c, '출고', 5, 1000)),
    codes.map((c) => master(c, '품목' + c, 0, 1000))
  );
  ctx.recalcStockAndUsage(ctx.__ss);

  const res = ctx.executeMonthlyClosing('t', 2026, 8);
  assert.strictEqual(res.success, false);
  assert.ok(res.message.indexOf('4건 있습니다') >= 0, '총 건수 안내: ' + res.message);
  assert.ok(res.message.indexOf('외 1건') >= 0, '초과분 요약 안내: ' + res.message);
  assert.strictEqual(res.message.indexOf('D004'), -1, '예시는 3건까지만: ' + res.message);
});

test('collectNegativeStockItems(): 음수 품목만, 보수적인 수량으로 수집한다', () => {
  const ctx = loadContext([], []);
  const items = ctx.collectNegativeStockItems([
    master('A001', '토마토', 0, 1000, { currentStock: -5 }),  // 기록값만 음수
    master('B002', '양파', 3, 800, { currentStock: 3 }),      // 정상
    master('C003', '감자', 0, 900, { currentStock: 0 })       // 0 — 차단 대상 아님
  ], []);

  assert.strictEqual(items.length, 1, '음수 1건만 잡혀야 한다');
  assert.deepStrictEqual(
    { code: items[0].code, name: items[0].name, stock: items[0].stock },
    { code: 'A001', name: '토마토', stock: -5 }
  );
});

// ─────────────────────────────────────────────────────────────
//  5. 시트 시각화 서식
// ─────────────────────────────────────────────────────────────

test('품목 마스터 H열에 음수 강조 조건부 서식이 적용된다', () => {
  const ctx = loadContext([], [master('A001', '토마토', 0, 1000)]);
  ctx.applyItemMasterFormatting(ctx.__ss, ctx.__masterSheet);

  const rule = ctx.__masterSheet.cfRules.find((r) =>
    r.conditions.some((c) => c.type === 'numberLessThan' && c.value === 0));
  assert.ok(rule, 'H열 음수 조건부 서식 규칙이 없다');
  assert.strictEqual(rule.background, '#fce8e6');
  assert.strictEqual(rule.fontColor, '#c53929');
  assert.strictEqual(rule.bold, true);
});

test('음수 강조 서식은 미사용 회색 처리 규칙보다 먼저 평가된다', () => {
  const ctx = loadContext([], [master('A001', '토마토', 0, 1000)]);
  ctx.applyItemMasterFormatting(ctx.__ss, ctx.__masterSheet);

  const rules = ctx.__masterSheet.cfRules;
  const negIdx = rules.findIndex((r) => r.conditions.some((c) => c.type === 'numberLessThan'));
  const grayIdx = rules.findIndex((r) => r.conditions.some((c) => c.type === 'formula'));
  assert.ok(negIdx >= 0 && grayIdx >= 0, '두 규칙이 모두 존재해야 한다');
  assert.ok(negIdx < grayIdx, '음수 강조가 회색 처리보다 앞서야 붉게 보인다');
});

test('품목 마스터 H열에 숫자 서식(#,##0)이 적용된다', () => {
  const ctx = loadContext([], [master('A001', '토마토', 0, 1000)]);
  ctx.applyItemMasterFormatting(ctx.__ss, ctx.__masterSheet);

  const applied = ctx.__masterSheet.numberFormats.some((f) =>
    f.row === 3 && f.col === 8 && f.format === '#,##0');
  assert.ok(applied, 'H열(8) 숫자 서식이 적용되지 않았다');
});

console.log(`\n✓ 음수 재고 지원 테스트 ${passed}건 통과`);
