// [TASK-006] 월마감(executeMonthlyClosing) 정합성 단위 테스트
//
// src/Config.gs / src/StockEngine.gs / src/SheetBuilder.gs / src/Archive.gs 의 실제 소스를 vm 샌드박스에
// 그대로 로드하고, GAS 전역(SpreadsheetApp / DriveApp / Utilities / Session /
// LockService / PropertiesService)만 인메모리 스텁으로 대체한다.
// 로직을 테스트 파일에 복사하지 않으므로 소스가 바뀌면 테스트도 함께 따라간다.
// 실제 시트/드라이브는 전혀 건드리지 않는다.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');
// [TASK-017] 픽스처가 열 번호를 직접 적어 두면, 열이 하나 끼어들 때(v17: 24 → 25열)
//   프로덕션 코드는 멀쩡한데 테스트만 거짓으로 깨진다. 실제 Config.gs의 상수를 읽어 쓴다.
const MASTER = (() => {
  const c = vm.createContext({ console: console });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'Config.gs'), 'utf8'), c, { filename: 'Config.gs' });
  return { COLS: vm.runInContext('MASTER_COLS', c), COUNT: vm.runInContext('MASTER_COL_COUNT', c) };
})();
const ARCHIVE_FOLDER_ID = 'TEST-ARCHIVE-FOLDER';

// ─────────────────────────────────────────────────────────────
//  시트 목
// ─────────────────────────────────────────────────────────────

function pad(n, w) { return String(n).padStart(w, '0'); }

/**
 * 3행부터 데이터가 시작되는 시트 목.
 * 숫자 getRange(row, col, numRows, numCols) 와 A1 표기 getRange("A1:I1") 를 모두 지원하고,
 * 서식 계열 메서드는 체이닝 가능한 no-op 이다.
 * opLog에 쓰기 연산 순서를 기록하여 "무엇을 먼저 썼는가"를 검증할 수 있게 한다.
 */
function makeSheet(name, rowsFromRow3, opLog, hooks) {
  const grid = {};
  (rowsFromRow3 || []).forEach((row, i) => { grid[i + 3] = row.slice(); });
  const h = hooks || {};

  function parseA1(a1) {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(a1);
    if (!m) throw new Error('테스트 스텁이 지원하지 않는 A1 표기: ' + a1);
    const colNum = (s) => s.split('').reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
    const c1 = colNum(m[1]), r1 = Number(m[2]), c2 = colNum(m[3]), r2 = Number(m[4]);
    return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
  }

  const sheet = {
    name: name,
    grid: grid,
    frozenRows: 0,
    protections: [],
    setName(n) { sheet.name = n; return sheet; },
    setFrozenRows(n) { sheet.frozenRows = n; return sheet; },
    getMaxRows() { return Math.max(sheet.getLastRow(), 3) + 100; },
    // [TASK-017] _ensureMinColumns / _isMasterSchemaCurrent가 열 수를 본다 (새 시트 기본 26열)
    getMaxColumns() { return 26; },
    insertColumnsAfter() { return sheet; },
    getSheetId() { return sheet.sheetId; },
    getProtections(type) { return sheet.protections.filter((p) => p.type === type); },
    getLastRow() {
      const rows = Object.keys(grid).map(Number).filter((r) => (grid[r] || []).some((v) => v !== '' && v !== undefined));
      return rows.length ? Math.max.apply(null, rows) : 0;
    },
    getRange() {
      let startRow, startCol, numRows, numCols;
      if (arguments.length === 1) {
        [startRow, startCol, numRows, numCols] = parseA1(arguments[0]);
      } else {
        [startRow, startCol, numRows, numCols] = arguments;
        // [TASK-017] GAS의 getRange(row, col)은 단일 셀이다. 목이 4인자 형태만 다뤄
        //   numRows/numCols가 undefined로 남아 getValues()가 빈 배열을 돌려주고 있었다.
        if (numRows === undefined) numRows = 1;
        if (numCols === undefined) numCols = 1;
      }

      const range = {
        // [TASK-017] 단일 셀 조회 — 스키마 가드가 헤더 셀 1개를 이 API로 읽는다
        getValue() { return range.getValues()[0][0]; },
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
          assert.strictEqual(values.length, numRows, `${sheet.name} setValues 행 수 불일치`);
          if (h.onSetValues) h.onSetValues(sheet, startRow, startCol, numRows, numCols);
          opLog.push(`SET:${name}:r${startRow}c${startCol}x${numCols}`);
          values.forEach((line, r) => {
            assert.strictEqual(line.length, numCols, `${sheet.name} setValues 열 수 불일치`);
            const target = grid[startRow + r] || (grid[startRow + r] = []);
            line.forEach((v, c) => { target[startCol - 1 + c] = v; });
          });
          return range;
        },
        clearContent() {
          if (h.onClearContent) h.onClearContent(sheet);
          opLog.push(`CLEAR:${name}:r${startRow}c${startCol}`);
          for (let r = 0; r < numRows; r++) {
            const target = grid[startRow + r];
            if (!target) continue;
            for (let c = 0; c < numCols; c++) target[startCol - 1 + c] = '';
          }
          return range;
        },
        setHorizontalAlignment() { return range; },
        setBackground() { return range; },
        setFontColor() { return range; },
        setFontWeight() { return range; },
        protect() {
          const p = {
            type: 'RANGE',
            startRow: startRow,
            startCol: startCol,
            numRows: numRows,
            description: '',
            warningOnly: false,
            setDescription(d) { p.description = d; return p; },
            getDescription() { return p.description; },
            setWarningOnly(v) { p.warningOnly = v; return p; },
            remove() { sheet.protections = sheet.protections.filter((x) => x !== p); }
          };
          sheet.protections.push(p);
          opLog.push(`PROTECT:${name}:r${startRow}c${startCol}`);
          return p;
        }
      };
      return range;
    }
  };
  return sheet;
}

/** 시즌설정 시트: recalcStockAndUsage()가 A5:C 범위만 읽는다 (시즌 없음 = 30일 fallback) */
function makeSeasonSheet() {
  return {
    getLastRow: () => 5,
    getRange: () => ({ getValues: () => [['', '', '']] })
  };
}

// ─────────────────────────────────────────────────────────────
//  샌드박스 구성
// ─────────────────────────────────────────────────────────────

/**
 * @param {Array} txRows        입출고 시트 3행 이후 (9열)
 * @param {Array} masterRows    품목 마스터 3행 이후 (24열)
 * @param {Object} [opts]       failOn: 'flush' | 'txWrite' — 실패 주입 지점
 */
function loadContext(txRows, masterRows, opts) {
  const options = opts || {};
  const opLog = [];
  const warnings = [];
  const errors = [];
  let uuidSeq = 0;

  const txSheet = makeSheet('TX', txRows, opLog, {
    onClearContent() {
      if (options.failOn === 'txClear') throw new Error('의도적 실패: tx clearContent');
    },
    onSetValues() {
      if (options.failOn === 'txWrite') throw new Error('의도적 실패: tx setValues');
    }
  });
  const masterSheet = seedMasterHeader(makeSheet('MASTER', masterRows, opLog));
  // [TASK-006] 업장 시트: 통합 시트와 동일한 원본 행을 보관한다(월마감은 이 시트를 건드리지 않는다)
  const shopTxSheet = makeSheet('SHOP_TX', (options.shopRows || txRows).map((r) => r.slice()), opLog);
  shopTxSheet.sheetId = 111;
  // 업장관리 시트: [분류|업장명|태그|상태|바로가기|GID]
  const shopsSheet = makeSheet('SHOPS', [['식음', '테스트업장', 'TX', '생성완료', '', 111]], opLog);
  const seasonSheet = makeSeasonSheet();
  const archiveSheet = makeSheet('ARCHIVE_NEW', [], opLog);

  const createdFolders = [];
  const createdSpreadsheets = [];
  const addedFiles = [];

  // [TASK-028] existingArchiveFiles: [{ name, trashed }] — 연도 폴더가 이미 있고 그 안에 파일이 있는 상태.
  //   지정하지 않으면 연도 폴더가 없어 마감이 새로 만든다(기존 동작).
  const existingFiles = options.existingArchiveFiles || null;
  const yearFolder = {
    _name: existingFiles ? '2026' : null,
    addFile(f) { addedFiles.push({ folder: yearFolder._name, file: f }); },
    getFilesByName(n) {
      const hits = (existingFiles || []).filter((f) => f.name === n).map((f) => ({ isTrashed: () => !!f.trashed }));
      let i = 0;
      return { hasNext: () => i < hits.length, next: () => hits[i++] };
    }
  };
  const baseFolder = {
    getFoldersByName: () => ({ hasNext: () => !!existingFiles, next: () => yearFolder }),
    createFolder(n) { createdFolders.push(n); yearFolder._name = n; return yearFolder; }
  };

  let flushCount = 0;

  const scriptProps = { ARCHIVE_FOLDER_ID: ARCHIVE_FOLDER_ID };
  // [TASK-028] 마감 이력이 있는 상태에서 시작 (재마감·순차 마감 검사용)
  if (options.closedCutoff) scriptProps.LAST_CLOSED_CUTOFF = options.closedCutoff;
  const cacheStore = new Map();

  const sandbox = {
    console: {
      log: (m) => opLog.push('LOG:' + m),
      warn: (m) => { warnings.push(String(m)); },
      error: (m) => { errors.push(String(m)); }
    },
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
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { opLog.push('UNLOCK'); } }) },
    // [TASK-010] 마감 성공 시 LAST_CLOSED_CUTOFF를 기록하므로 setProperty도 필요하다
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in scriptProps ? scriptProps[k] : null),
        setProperty: (k, v) => { scriptProps[k] = v; }
      })
    },
    // [TASK-028] 마감 전 getLatestClosingCutoff가 "이력 없음" 부정 캐시(TASK-027)를 읽는다 — 인메모리 스텁
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        put: (k, v) => { cacheStore.set(k, String(v)); },
        remove: (k) => { cacheStore.delete(k); }
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
      getActiveSpreadsheet: () => ({
        getSheetByName(n) {
          if (n === '📝 통합 입출고 기록장') return txSheet;
          if (n === '🗂️ 품목 마스터') return masterSheet;
          if (n === '📅 시즌설정') return seasonSheet;
          if (n === '🏢 업장관리') return shopsSheet;
          return null;
        },
        getSheets: () => [txSheet, masterSheet, shopTxSheet, shopsSheet]
      }),
      create(name) {
        createdSpreadsheets.push(name);
        return { getId: () => 'NEW-SS-ID', getSheets: () => [archiveSheet] };
      },
      ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' },
      flush() {
        flushCount++;
        opLog.push('FLUSH');
        if (options.failOn === 'flush' && flushCount === 1) throw new Error('의도적 실패: 첫 flush');
      }
    },
    CacheManager: { invalidateAll: () => { sandbox.__cacheInvalidated = true; } },
    __cacheInvalidated: false,
    validateSession: () => ({ name: '관리자', role: options.role || 'admin' })
  };

  const ctx = vm.createContext(sandbox);
  ['Config.gs', 'StockEngine.gs', 'SheetBuilder.gs', 'Dashboard.gs', 'Archive.gs'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  });

  ctx.__txSheet = txSheet;
  ctx.__masterSheet = masterSheet;
  ctx.__shopTxSheet = shopTxSheet;
  ctx.__archiveSheet = archiveSheet;
  ctx.__scriptProps = scriptProps;
  ctx.__opLog = opLog;
  ctx.__warnings = warnings;
  ctx.__errors = errors;
  ctx.__createdFolders = createdFolders;
  ctx.__createdSpreadsheets = createdSpreadsheets;
  ctx.__addedFiles = addedFiles;
  return ctx;
}

/** 시트 3행 이후 비어있지 않은 행 */
function sheetRows(sheet, cols) {
  const last = sheet.getLastRow();
  if (last < 3) return [];
  return sheet.getRange(3, 1, last - 2, cols).getValues().filter((r) => r[0] !== '' || r[1] !== '');
}

const txRowsOf = (ctx) => sheetRows(ctx.__txSheet, 9);
const masterRowsOf = (ctx) => sheetRows(ctx.__masterSheet, 24);

// ─────────────────────────────────────────────────────────────
//  데이터 빌더
// ─────────────────────────────────────────────────────────────

// [TASK-017] recalcStockAndUsage / _sortMasterByUsageStatus는 마스터에 되쓰기 전에
//   2행 헤더(사용유무)로 시트가 v17(25열) 구조인지 확인한다. 실제 시트에는 헤더가 있으므로
//   목에도 채워 준다 — 없으면 가드가 걸려 계산이 통째로 스킵된다.
function seedMasterHeader(sheet) {
  const header = new Array(MASTER.COUNT).fill('');
  header[MASTER.COLS.USAGE_STATUS] = '사용유무';
  sheet.grid[2] = header;
  return sheet;
}

function tx(date, code, name, type, qty, price, note, txId) {
  return [new Date(date + 'T00:00:00'), code, name, type, qty, price, '테스터', note || '', txId || 'FB-X'];
}

/** 품목 마스터 한 행 — 열 위치는 MASTER_COLS에서 가져온다 */
function master(code, name, initStock, unitPrice) {
  const row = new Array(MASTER.COUNT).fill('');
  row[MASTER.COLS.CODE] = code;
  row[MASTER.COLS.NAME] = name;
  row[MASTER.COLS.INIT_STOCK] = initStock;
  row[MASTER.COLS.CURRENT_STOCK] = 0;
  row[MASTER.COLS.UNIT_PRICE] = unitPrice;
  row[MASTER.COLS.TOTAL_VALUE] = 0;
  return row;
}

const INIT_STOCK_COL = MASTER.COLS.INIT_STOCK;
const CURRENT_STOCK_COL = MASTER.COLS.CURRENT_STOCK;
const TOTAL_VALUE_COL = MASTER.COLS.TOTAL_VALUE;

const carryoverRows = (rows) => rows.filter((r) => r[3] === '입고' && String(r[7]).indexOf('마감 이월') >= 0);

let passed = 0;
function test(title, fn) {
  fn();
  passed++;
  console.log('  ✓ ' + title);
}

// ─────────────────────────────────────────────────────────────
//  케이스 1: 기본 마감 (입고 3건 + 출고 2건)
// ─────────────────────────────────────────────────────────────
test('기본 마감: FIFO 잔여 로트가 이월 입고로 생성되고 INIT_STOCK이 0이 된다', () => {
  const ctx = loadContext([
    tx('2026-07-05', 'A001', '토마토', '입고', 10, 1000),
    tx('2026-07-10', 'A001', '토마토', '입고', 5, 1200),
    tx('2026-07-15', 'A001', '토마토', '입고', 8, 1500),
    tx('2026-07-20', 'A001', '토마토', '출고', 12, 1000),
    tx('2026-07-25', 'A001', '토마토', '출고', 2, 1000)
  ], [master('A001', '토마토', 0, 1500)], {});

  const res = ctx.executeMonthlyClosing('t', 2026, 7);
  assert.ok(res.success, res.message);
  assert.ok(res.message.indexOf('5건 보관') >= 0, res.message);

  // 입고 23 - 출고 14 = 잔여 9 (로트2 1개@1200 + 로트3 8개@1500)
  const rows = txRowsOf(ctx);
  const carry = carryoverRows(rows);
  assert.strictEqual(rows.length, carry.length, '마감 대상 행은 모두 시트에서 제거되어야 함');
  assert.deepStrictEqual(carry.map((r) => [r[4], r[5]]), [[1, 1200], [8, 1500]]);
  assert.strictEqual(carry.reduce((s, r) => s + r[4], 0), 9);

  // 이월 행 규격
  carry.forEach((r) => {
    assert.strictEqual(r[0], '2026-08-01', '이월 일자는 다음 달 1일');
    assert.strictEqual(r[3], '입고');
    assert.strictEqual(r[6], 'System');
    assert.strictEqual(r[7], '2026년 7월 마감 이월');
    assert.ok(/^SYS-20260701-[0-9A-F]{8}$/.test(r[8]), '이월 거래ID 형식: ' + r[8]);
  });

  // [TASK-010] 마감 성공 시 마감 기준일(마감월 말일)이 ScriptProperties에 기록된다
  assert.strictEqual(ctx.__scriptProps.LAST_CLOSED_CUTOFF, '2026-07-31',
    '마감 기준일 기록값: ' + ctx.__scriptProps.LAST_CLOSED_CUTOFF);
  assert.strictEqual(ctx.getLatestClosingCutoff(), '2026-07-31');
  assert.strictEqual(ctx.validateNotClosedMonth('2026-07-20').blocked, true, '마감월 거래는 차단되어야 함');
  assert.strictEqual(ctx.validateNotClosedMonth('2026-08-01').blocked, false, '익월 1일은 허용되어야 함');

  // INIT_STOCK 리셋
  assert.strictEqual(masterRowsOf(ctx)[0][INIT_STOCK_COL], 0);
});

// ─────────────────────────────────────────────────────────────
//  케이스 2: 초기재고만 있는 품목
// ─────────────────────────────────────────────────────────────
test('초기재고만 있는 품목: 초기재고가 이월 입고 행으로 전환되고 INIT_STOCK=0', () => {
  const ctx = loadContext([], [master('B002', '양파', 5, 800)], {});

  const res = ctx.executeMonthlyClosing('t', 2026, 7);
  assert.ok(res.success, res.message);

  const carry = carryoverRows(txRowsOf(ctx));
  assert.strictEqual(carry.length, 1);
  assert.deepStrictEqual([carry[0][1], carry[0][4], carry[0][5]], ['B002', 5, 800], '초기재고 단가(매입단가) 보존');
  assert.strictEqual(masterRowsOf(ctx)[0][INIT_STOCK_COL], 0);
});

// ─────────────────────────────────────────────────────────────
//  케이스 3: 재고 0
// ─────────────────────────────────────────────────────────────
test('재고 0인 품목: 이월 행을 생성하지 않는다', () => {
  const ctx = loadContext([
    tx('2026-07-05', 'C003', '감자', '입고', 5, 900),
    tx('2026-07-06', 'C003', '감자', '출고', 5, 900)
  ], [master('C003', '감자', 0, 900)], {});

  const res = ctx.executeMonthlyClosing('t', 2026, 7);
  assert.ok(res.success, res.message);
  assert.ok(res.message.indexOf('0건 이월') >= 0, res.message);
  assert.strictEqual(txRowsOf(ctx).length, 0, '마감 후 입출고 시트가 비어야 함');
  assert.strictEqual(masterRowsOf(ctx)[0][INIT_STOCK_COL], 0);
});

// ─────────────────────────────────────────────────────────────
//  케이스 4: 다중 로트 잔여 (로트 병합 금지)
// ─────────────────────────────────────────────────────────────
test('다중 로트 잔여: 로트별로 개별 이월 행 + 단가 병합 없음', () => {
  const ctx = loadContext([
    tx('2026-07-02', 'D004', '한우', '입고', 3, 20000),
    tx('2026-07-08', 'D004', '한우', '입고', 4, 22000),
    tx('2026-07-12', 'D004', '한우', '입고', 2, 25000)
  ], [master('D004', '한우', 6, 18000)], {});

  const res = ctx.executeMonthlyClosing('t', 2026, 7);
  assert.ok(res.success, res.message);

  // 초기재고 로트(date=0)가 가장 오래된 로트로 선행해야 한다
  const carry = carryoverRows(txRowsOf(ctx));
  assert.deepStrictEqual(
    carry.map((r) => [r[4], r[5]]),
    [[6, 18000], [3, 20000], [4, 22000], [2, 25000]],
    '4개 로트가 단가별로 분리 보존되어야 함'
  );
  const distinctPrices = new Set(carry.map((r) => r[5]));
  assert.strictEqual(distinctPrices.size, 4, '서로 다른 단가의 로트를 병합하면 안 된다');
});

// ─────────────────────────────────────────────────────────────
//  케이스 5: 마감 전후 현재고 동일 (이중 계상 없음)
// ─────────────────────────────────────────────────────────────
test('recalc 정합성: 마감 전 현재고 == 마감 후 현재고 (이중 계상 없음)', () => {
  const txData = [
    tx('2026-07-05', 'E005', '우유', '입고', 10, 1000),
    tx('2026-07-10', 'E005', '우유', '입고', 6, 1100),
    tx('2026-07-20', 'E005', '우유', '출고', 4, 1000)
  ];
  const masterData = [master('E005', '우유', 3, 900)];

  // 마감 전 기준값
  const before = loadContext(txData.map((r) => r.slice()), masterData.map((r) => r.slice()), {});
  before.recalcStockAndUsage(before.SpreadsheetApp.getActiveSpreadsheet());
  const stockBefore = masterRowsOf(before)[0][CURRENT_STOCK_COL];
  const valueBefore = masterRowsOf(before)[0][TOTAL_VALUE_COL];
  assert.strictEqual(stockBefore, 15, '초기재고 3 + 입고 16 - 출고 4');

  // 마감 실행 (executeMonthlyClosing 내부에서 recalc까지 수행)
  const after = loadContext(txData.map((r) => r.slice()), masterData.map((r) => r.slice()), {});
  const res = after.executeMonthlyClosing('t', 2026, 7);
  assert.ok(res.success, res.message);

  const afterMaster = masterRowsOf(after)[0];
  assert.strictEqual(afterMaster[INIT_STOCK_COL], 0);
  assert.strictEqual(afterMaster[CURRENT_STOCK_COL], stockBefore, '마감 후 현재고가 마감 전과 같아야 한다');
  assert.strictEqual(afterMaster[TOTAL_VALUE_COL], valueBefore, '마감 후 FIFO 합계금액이 마감 전과 같아야 한다');

  // 현재고 == Σ(이월 입고 수량)
  const carrySum = carryoverRows(txRowsOf(after)).reduce((s, r) => s + r[4], 0);
  assert.strictEqual(afterMaster[CURRENT_STOCK_COL], carrySum);
  assert.strictEqual(after.__warnings.length, 0, '정상 마감에서는 이중 계상 경고가 없어야 한다');
});

// ─────────────────────────────────────────────────────────────
//  케이스 6: 이중 계상 감지 (detectCarryoverDoubleCount)
// ─────────────────────────────────────────────────────────────
test('이중 계상 감지: INIT_STOCK > 0 + 마감 이월 입고 행 → 경고 기록', () => {
  const ctx = loadContext([], [master('F006', '버터', 0, 500)], {});

  const masterRows = [master('F006', '버터', 4, 500), master('G007', '치즈', 7, 700)];
  const rows = [
    tx('2026-08-01', 'F006', '버터', '입고', 4, 500, '2026년 7월 마감 이월', 'SYS-1'),
    tx('2026-08-01', 'H008', '연어', '입고', 2, 900, '2026년 7월 마감 이월', 'SYS-2'),
    tx('2026-08-02', 'G007', '치즈', '입고', 7, 700, '정기 납품', 'FB-1')
  ];

  const risks = ctx.detectCarryoverDoubleCount(masterRows, rows);
  assert.strictEqual(risks.length, 1, 'F006만 위험 (G007은 이월 행 아님, H008은 INIT_STOCK 없음)');
  // vm 컨텍스트 객체는 프로토타입이 달라 deepStrictEqual이 실패하므로 필드 단위로 비교한다
  assert.strictEqual(risks[0].code, 'F006');
  assert.strictEqual(risks[0].initStock, 4);
  assert.strictEqual(risks[0].carryoverQty, 4);
  assert.strictEqual(ctx.__warnings.length, 1);
  assert.ok(ctx.__warnings[0].indexOf('F006') >= 0, ctx.__warnings[0]);

  // 위험이 없는 입력에서는 경고를 만들지 않는다
  assert.strictEqual(ctx.detectCarryoverDoubleCount([master('F006', '버터', 0, 500)], rows).length, 0);
  assert.strictEqual(ctx.detectCarryoverDoubleCount(masterRows, []).length, 0);
});

// ─────────────────────────────────────────────────────────────
//  케이스 7: 실행 순서 — INIT_STOCK 리셋이 이월 행 삽입보다 앞
// ─────────────────────────────────────────────────────────────
test('실행 순서: INIT_STOCK 리셋 → 입출고 시트 클리어 → 이월 행 삽입', () => {
  const ctx = loadContext([
    tx('2026-07-05', 'A001', '토마토', '입고', 10, 1000)
  ], [master('A001', '토마토', 2, 1500)], {});

  const res = ctx.executeMonthlyClosing('t', 2026, 7);
  assert.ok(res.success, res.message);

  const log = ctx.__opLog;
  // INIT_STOCK(7번째 열) 리셋 기록
  const resetIdx = log.indexOf('SET:MASTER:r3c7x1');
  const clearIdx = log.indexOf('CLEAR:TX:r3c1');
  const writeIdx = log.indexOf('SET:TX:r3c1x9');

  assert.ok(resetIdx >= 0, 'INIT_STOCK 리셋이 수행되어야 함: ' + log.join(' | '));
  assert.ok(clearIdx >= 0 && writeIdx >= 0, '입출고 시트 갱신이 수행되어야 함: ' + log.join(' | '));
  assert.ok(resetIdx < clearIdx, 'INIT_STOCK 리셋이 입출고 시트 클리어보다 먼저여야 함');
  assert.ok(resetIdx < writeIdx, 'INIT_STOCK 리셋이 이월 행 삽입보다 먼저여야 함');
  assert.ok(log.indexOf('FLUSH') > resetIdx && log.indexOf('FLUSH') < clearIdx, '리셋 직후 flush 필요');
});

// ─────────────────────────────────────────────────────────────
//  케이스 8: 입출고 시트 변경 전 실패 → INIT_STOCK 원복
// ─────────────────────────────────────────────────────────────
test('실패 복원: 입출고 시트 변경 전 실패 시 INIT_STOCK을 마감 전 값으로 원복하고 에러를 다시 던진다', () => {
  const ctx = loadContext([
    tx('2026-07-05', 'A001', '토마토', '입고', 10, 1000)
  ], [master('A001', '토마토', 12, 1500)], { failOn: 'flush' });

  assert.throws(() => ctx.executeMonthlyClosing('t', 2026, 7), /의도적 실패/);

  assert.strictEqual(masterRowsOf(ctx)[0][INIT_STOCK_COL], 12, 'INIT_STOCK이 원복되어야 함');
  assert.strictEqual(txRowsOf(ctx).length, 1, '입출고 시트는 변경되지 않아야 함');
  assert.ok(ctx.__warnings.some((w) => w.indexOf('원복') >= 0), ctx.__warnings.join(' | '));
});

// ─────────────────────────────────────────────────────────────
//  케이스 9: 입출고 시트 변경 후 실패 → 원복하지 않음 (원복이 곧 이중 계상)
// ─────────────────────────────────────────────────────────────
test('실패 복원: 이월 행을 쓴 뒤 실패하면 원복하지 않고 수동 복구를 로그로 남긴다', () => {
  const ctx = loadContext([
    tx('2026-07-05', 'A001', '토마토', '입고', 10, 1000)
  ], [master('A001', '토마토', 12, 1500)], { failOn: 'txWrite' });

  assert.throws(() => ctx.executeMonthlyClosing('t', 2026, 7), /의도적 실패/);

  assert.strictEqual(masterRowsOf(ctx)[0][INIT_STOCK_COL], 0, 'INIT_STOCK은 0으로 유지되어야 함 (원복 시 이중 계상)');
  assert.ok(ctx.__errors.some((e) => e.indexOf('수동 복구') >= 0), ctx.__errors.join(' | '));
});

// ─────────────────────────────────────────────────────────────
//  케이스 10: Drive 아카이브 저장 규칙
// ─────────────────────────────────────────────────────────────
test('Drive 아카이브: 연도 폴더 / 파일명 / 시트명 / 9열 헤더 / Frozen Row 규칙 준수', () => {
  const ctx = loadContext([
    tx('2026-07-05', 'A001', '토마토', '입고', 10, 1000),
    tx('2026-09-05', 'A001', '토마토', '입고', 3, 1100)
  ], [master('A001', '토마토', 0, 1500)], {});

  const res = ctx.executeMonthlyClosing('t', 2026, 8);
  assert.ok(res.success, res.message);

  assert.deepStrictEqual(ctx.__createdFolders, ['2026'], '연도(YYYY) 폴더 생성');
  assert.deepStrictEqual(ctx.__createdSpreadsheets, ['[입출고마감]_2026_08'], '파일명 규칙');
  assert.strictEqual(ctx.__addedFiles.length, 1, '생성 파일을 연도 폴더로 이동');
  assert.strictEqual(ctx.__addedFiles[0].folder, '2026');

  const archive = ctx.__archiveSheet;
  assert.strictEqual(archive.name, '2026-08 마감', '시트명 규칙');
  assert.strictEqual(archive.frozenRows, 1);
  assert.deepStrictEqual(
    archive.getRange('A1:I1').getValues()[0],
    ['날짜', '품목코드', '품목명', '구분', '수량', '단가', '담당자', '비고', '거래ID']
  );

  // 마감일(2026-08-31) 이전 1건만 아카이브, 이후 1건은 메인 시트 잔존
  assert.strictEqual(archive.getRange(2, 2, 1, 1).getValues()[0][0], 'A001');
  const remaining = txRowsOf(ctx);
  assert.strictEqual(carryoverRows(remaining).length, 1, '잔여 10개 이월');
  assert.strictEqual(remaining.length, 2, '이월 1행 + 마감 이후 기존 1행');
});

// ─────────────────────────────────────────────────────────────
//  케이스 11: 권한 / 데이터 부재 가드 (반환 형식 유지)
// ─────────────────────────────────────────────────────────────
test('가드: 비관리자 차단 및 마감 대상 부재 시 { success:false, message } 반환', () => {
  const staff = loadContext([], [master('A001', '토마토', 5, 1500)], { role: 'staff' });
  const denied = staff.executeMonthlyClosing('t', 2026, 7);
  assert.strictEqual(denied.success, false);
  assert.strictEqual(denied.message, '권한이 없습니다.');
  assert.strictEqual(masterRowsOf(staff)[0][INIT_STOCK_COL], 5, '차단 시 시트를 건드리지 않아야 함');

  const empty = loadContext([], [master('A001', '토마토', 0, 1500)], {});
  const none = empty.executeMonthlyClosing('t', 2026, 7);
  assert.strictEqual(none.success, false);
  assert.ok(none.message.indexOf('아카이브할 입출고 데이터나 초기 재고가 없습니다') >= 0, none.message);
  assert.strictEqual(empty.__createdSpreadsheets.length, 0, '대상이 없으면 Drive 파일을 만들지 않는다');
});

// ─────────────────────────────────────────────────────────────
//  케이스 12: 초기재고(G열) 경고 전용 보호
// ─────────────────────────────────────────────────────────────
test('초기재고 보호: 마감 후 G열에 경고 전용 보호가 걸리고, 재적용해도 중복되지 않는다', () => {
  const ctx = loadContext([
    tx('2026-07-05', 'A001', '토마토', '입고', 10, 1000)
  ], [master('A001', '토마토', 2, 1500)], {});

  const res = ctx.executeMonthlyClosing('t', 2026, 7);
  assert.ok(res.success, res.message);

  const protections = ctx.__masterSheet.protections;
  assert.strictEqual(protections.length, 1, '보호는 정확히 1개여야 함');
  assert.strictEqual(protections[0].startCol, INIT_STOCK_COL + 1, 'G열(7번째 열)을 보호');
  assert.strictEqual(protections[0].startRow, 3, '헤더를 제외한 3행부터');
  assert.strictEqual(protections[0].warningOnly, true, '완전 잠금이 아닌 경고 전용');
  assert.ok(protections[0].description.indexOf('초기재고') >= 0, protections[0].description);

  // 멱등: 다시 호출해도 보호가 쌓이지 않는다
  ctx.applyInitStockProtection(ctx.SpreadsheetApp.getActiveSpreadsheet());
  ctx.applyInitStockProtection(ctx.SpreadsheetApp.getActiveSpreadsheet());
  assert.strictEqual(ctx.__masterSheet.protections.length, 1, '재적용 시 기존 보호를 교체해야 함');
});

// ─────────────────────────────────────────────────────────────
//  케이스 13: [회귀] 마감 후 재취합이 마감을 통째로 무효화한다
//
//  DEV Human QA(2026-09-01)에서 실제로 발생한 데이터 손실을 재현한다.
//  `executeMonthlyClosing`은 통합 시트(SHEET_INOUT)만 정리하고 **업장 시트는 건드리지 않는다.**
//  그런데 `consolidateAllSheets()`는 통합 시트를 비우고 업장 시트로부터 통째로 재구성한다.
//  따라서 재취합이 한 번이라도 돌면:
//    - 아카이브했던 과거 행이 업장 시트에서 되살아나고
//    - 업장 시트에 없는 "마감 이월" 행은 삭제되며
//    - INIT_STOCK은 이미 0이라 복구되지 않는다
//  → 초기재고분이 통째로 증발한다.
//
//  재취합 진입점: 매일 자정 트리거(Triggers.gs), 웹앱 '신규 내역 취합'/'시트 동기화',
//                 시스템 명령 refreshDashboard (모두 refreshDashboard → consolidateAllSheets)
//
//  [수정] 두 가지를 함께 적용해야 정합성이 유지된다:
//    1) 월마감이 업장 시트에서도 마감 대상 행을 제거 (_trimShopSheetsForClosing)
//    2) 재취합이 통합 시트의 "마감 이월" 행을 보존 (consolidateAllSheets)
//  하나만 적용하면 각각 재고 증발 / 이중 계상이 되므로 둘 다를 검증한다.
// ─────────────────────────────────────────────────────────────
test('[회귀] 마감 후 재취합을 반복해도 이월 행과 현재고가 유지된다', () => {
  const txRows = [
    tx('2026-08-05', 'A001', '토마토', '입고', 10, 1000),
    tx('2026-08-20', 'A001', '토마토', '출고', 4, 1000)
  ];
  const ctx = loadContext(txRows, [master('A001', '토마토', 3, 900)], {});

  // 마감 전 현재고: 초기재고 3 + 입고 10 - 출고 4 = 9
  const before = loadContext(txRows.map((r) => r.slice()), [master('A001', '토마토', 3, 900)], {});
  before.recalcStockAndUsage(before.SpreadsheetApp.getActiveSpreadsheet());
  assert.strictEqual(masterRowsOf(before)[0][CURRENT_STOCK_COL], 9);

  // 마감 실행 → 이월 9개 생성, INIT_STOCK 0
  const res = ctx.executeMonthlyClosing('t', 2026, 8);
  assert.ok(res.success, res.message);
  assert.strictEqual(carryoverRows(txRowsOf(ctx)).reduce((s, r) => s + r[4], 0), 9, '이월 9개');
  assert.strictEqual(masterRowsOf(ctx)[0][CURRENT_STOCK_COL], 9, '마감 직후 현재고는 보존된다');
  assert.strictEqual(masterRowsOf(ctx)[0][INIT_STOCK_COL], 0);

  // 업장 시트에서도 마감 대상 행이 제거되어야 한다
  assert.strictEqual(sheetRows(ctx.__shopTxSheet, 9).length, 0, '업장 시트의 마감 대상 행이 제거된다');
  assert.ok(res.message.indexOf('업장 시트') >= 0, '정리 결과를 메시지로 알린다: ' + res.message);
  assert.strictEqual(ctx.__cacheInvalidated, true, '마감 후 캐시를 무효화해야 웹앱이 최신 재고를 읽는다');

  // 재취합 발생 (자정 트리거 / '신규 내역 취합' / '시트 동기화') — 2회 반복해도 안정적이어야 한다
  const ss = ctx.SpreadsheetApp.getActiveSpreadsheet();
  for (let i = 1; i <= 2; i++) {
    ctx.consolidateAllSheets(ss);
    ctx.recalcStockAndUsage(ss);

    const after = txRowsOf(ctx);
    assert.strictEqual(carryoverRows(after).length, 1, `재취합 ${i}회 후에도 이월 행이 보존된다`);
    assert.strictEqual(after.length, 1, `재취합 ${i}회 후 아카이브 행이 되살아나지 않는다`);
    assert.strictEqual(
      masterRowsOf(ctx)[0][CURRENT_STOCK_COL], 9,
      `재취합 ${i}회 후에도 현재고 9가 유지된다 (증발도 이중 계상도 없음)`
    );
    assert.strictEqual(masterRowsOf(ctx)[0][INIT_STOCK_COL], 0);
  }
});

// ─────────────────────────────────────────────────────────────
//  [TASK-028] 마감 대상 월 검증 — 재마감 · 과거 월 · 미종료 월 · 건너뜀 · 동명 파일
//
//  2026-09-14 DEV에서 모달 기본값(이번 달)으로 9월을 마감해 남은 기간의 거래 등록이 통째로 막혔다.
//  그 전까지 재마감이 막히던 것은 "아카이브할 데이터 없음" 가드에 우연히 걸린 것뿐이라,
//  초기재고 > 0인 품목이 하나라도 생기면 재마감이 통과하고, 기준일 이전 월을 다시 마감하면
//  setLatestClosingCutoff가 기준일을 뒤로 옮겨 TASK-010의 소급 차단이 풀렸다.
//  아래는 전부 "거절 시 시트·Drive·속성에 아무 흔적도 남기지 않는다"를 함께 단언한다.
// ─────────────────────────────────────────────────────────────

/** 거절 경로 공통 단언: 파일·폴더 미생성, 시트 불변, 속성 불변 */
function assertUntouched(ctx, txCountBefore, initBefore, cutoffBefore) {
  assert.strictEqual(ctx.__createdSpreadsheets.length, 0, 'Drive 파일을 만들면 안 된다');
  assert.strictEqual(ctx.__createdFolders.length, 0, '연도 폴더를 만들면 안 된다');
  assert.strictEqual(txRowsOf(ctx).length, txCountBefore, '입출고 시트가 바뀌면 안 된다');
  assert.strictEqual(masterRowsOf(ctx)[0][INIT_STOCK_COL], initBefore, '초기재고가 바뀌면 안 된다');
  assert.strictEqual(ctx.__scriptProps.LAST_CLOSED_CUTOFF, cutoffBefore, '마감 기준일이 바뀌면 안 된다');
  assert.ok(!ctx.__opLog.some((op) => op.indexOf('SET:') === 0 || op.indexOf('CLEAR:') === 0), '시트 쓰기 없음: ' + ctx.__opLog.join(' | '));
}

test('[TASK-028] 재마감 거절: 기준일 2026-08-31 상태에서 2026년 8월을 다시 마감하면 거절하고 아무것도 쓰지 않는다', () => {
  const ctx = loadContext([
    tx('2026-09-01', 'A001', '토마토', '입고', 9, 1200, '2026년 8월 마감 이월', 'SYS-20260801-AAAA0001')
  ], [master('A001', '토마토', 0, 1500)], { closedCutoff: '2026-08-31' });

  const res = ctx.executeMonthlyClosing('t', 2026, 8);
  assert.strictEqual(res.success, false);
  assert.ok(res.message.indexOf('2026년 8월은 이미 마감된 월입니다') >= 0, res.message);
  assert.ok(res.message.indexOf('2026-08-31') >= 0, '메시지에 기준일: ' + res.message);
  assertUntouched(ctx, 1, 0, '2026-08-31');
});

test('[TASK-028] 과거 월 소급 마감 거절: 기준일 2026-08-31 상태에서 7월을 마감해도 기준일이 뒤로 가지 않는다', () => {
  const ctx = loadContext([
    tx('2026-09-01', 'A001', '토마토', '입고', 9, 1200, '2026년 8월 마감 이월', 'SYS-20260801-AAAA0001')
  ], [master('A001', '토마토', 0, 1500)], { closedCutoff: '2026-08-31' });

  const res = ctx.executeMonthlyClosing('t', 2026, 7);
  assert.strictEqual(res.success, false);
  assert.ok(res.message.indexOf('이미 마감된 월입니다') >= 0, res.message);
  assertUntouched(ctx, 1, 0, '2026-08-31');
  assert.strictEqual(ctx.getLatestClosingCutoff(), '2026-08-31', '소급 차단 기준일이 그대로여야 한다');
  assert.strictEqual(ctx.validateNotClosedMonth('2026-08-15').blocked, true, '8월 거래는 여전히 차단되어야 한다');
});

test('[TASK-028] 미종료 월 거절: 이번 달을 마감하려 하면 "아직 끝나지 않았습니다"로 거절한다 (DEV 사고 재현)', () => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const ctx = loadContext([
    tx(`${y}-${pad(m, 2)}-01`, 'A001', '토마토', '입고', 10, 1000)
  ], [master('A001', '토마토', 3, 1500)], {});

  const res = ctx.executeMonthlyClosing('t', y, m);
  assert.strictEqual(res.success, false);
  assert.ok(res.message.indexOf(`${y}년 ${m}월은 아직 끝나지 않았습니다`) >= 0, res.message);
  assertUntouched(ctx, 1, 3, undefined);
});

test('[TASK-028] 건너뛴 월 거절: 기준일 2026-06-30 상태에서 8월을 마감하면 "다음 마감 대상은 2026년 7월"로 거절한다', () => {
  const ctx = loadContext([
    tx('2026-07-05', 'A001', '토마토', '입고', 10, 1000),
    tx('2026-08-05', 'A001', '토마토', '입고', 4, 1000)
  ], [master('A001', '토마토', 0, 1500)], { closedCutoff: '2026-06-30' });

  const res = ctx.executeMonthlyClosing('t', 2026, 8);
  assert.strictEqual(res.success, false);
  assert.ok(res.message.indexOf('다음 마감 대상은 2026년 7월입니다') >= 0, res.message);
  assertUntouched(ctx, 2, 0, '2026-06-30');

  // 순서대로(7월) 마감하면 정상 — 8월 행은 남고 기준일은 7월 말일로 전진한다
  const ok = ctx.executeMonthlyClosing('t', 2026, 7);
  assert.ok(ok.success, ok.message);
  assert.strictEqual(ctx.__scriptProps.LAST_CLOSED_CUTOFF, '2026-07-31');
  assert.strictEqual(ctx.__createdSpreadsheets[0], '[입출고마감]_2026_07');
  assert.strictEqual(txRowsOf(ctx).filter((r) => r[8] === 'FB-X').length, 1, '8월 행은 메인 시트에 남는다');
});

test('[TASK-028] 동명 파일 거절: 연도 폴더에 [입출고마감]_2026_07이 이미 있으면 파일을 만들지도 시트를 건드리지도 않는다', () => {
  const rows = [tx('2026-07-05', 'A001', '토마토', '입고', 10, 1000)];
  const dup = loadContext(rows.map((r) => r.slice()), [master('A001', '토마토', 2, 1500)],
    { existingArchiveFiles: [{ name: '[입출고마감]_2026_07' }, { name: '[입출고마감]_2026_06' }] });

  const res = dup.executeMonthlyClosing('t', 2026, 7);
  assert.strictEqual(res.success, false);
  assert.ok(res.message.indexOf("'[입출고마감]_2026_07' 파일이 이미 있습니다") >= 0, res.message);
  assert.ok(res.message.indexOf('아카이브 폴더 2026') >= 0, res.message);
  assertUntouched(dup, 1, 2, undefined);

  // 휴지통에 있는 동명 파일만 있으면 정상 마감 — 기존 연도 폴더를 재사용한다(새로 만들지 않음)
  const trashed = loadContext(rows.map((r) => r.slice()), [master('A001', '토마토', 2, 1500)],
    { existingArchiveFiles: [{ name: '[입출고마감]_2026_07', trashed: true }] });
  const ok = trashed.executeMonthlyClosing('t', 2026, 7);
  assert.ok(ok.success, ok.message);
  assert.deepStrictEqual(trashed.__createdSpreadsheets, ['[입출고마감]_2026_07']);
  assert.strictEqual(trashed.__createdFolders.length, 0, '이미 있는 연도 폴더를 다시 만들지 않는다');
  assert.strictEqual(trashed.__addedFiles[0].folder, '2026');
});

test('[TASK-028] 첫 마감(이력 없음): 끝난 달이면 어느 달이든 허용하고, 그 달 말일 이전 전부를 한 파일로 보관한다', () => {
  const ctx = loadContext([
    tx('2025-11-20', 'A001', '토마토', '입고', 5, 1000),
    tx('2026-03-10', 'A001', '토마토', '입고', 7, 1000),
    tx('2026-04-02', 'A001', '토마토', '출고', 1, 1000)
  ], [master('A001', '토마토', 0, 1500)], {});
  assert.strictEqual(ctx.getLatestClosingCutoff(), null, '전제: 마감 이력 없음');

  const res = ctx.executeMonthlyClosing('t', 2026, 3);
  assert.ok(res.success, res.message);
  assert.ok(res.message.indexOf('2건 보관') >= 0, '2025-11 + 2026-03 두 행 보관: ' + res.message);
  assert.strictEqual(ctx.__scriptProps.LAST_CLOSED_CUTOFF, '2026-03-31');
});

test('[TASK-028] 초기재고 > 0 신규 품목이 있어도 재마감은 규칙으로 거절된다 (우연 가드가 아님을 증명)', () => {
  // 마감 후 품목 관리에서 초기재고 50으로 신규 등록한 상황 — 예전에는 이 초기재고 때문에
  // "아카이브할 데이터 없음" 가드를 지나쳐 빈 2번째 파일과 엉뚱한 이월 행이 생겼다.
  const ctx = loadContext([
    tx('2026-08-01', 'A001', '토마토', '입고', 9, 1200, '2026년 7월 마감 이월', 'SYS-20260701-AAAA0001')
  ], [master('A001', '토마토', 0, 1500), master('N999', '신규품목', 50, 700)], { closedCutoff: '2026-07-31' });

  const res = ctx.executeMonthlyClosing('t', 2026, 7);
  assert.strictEqual(res.success, false);
  assert.ok(res.message.indexOf('이미 마감된 월입니다') >= 0, '데이터 없음이 아니라 재마감 규칙으로 거절: ' + res.message);
  assert.ok(res.message.indexOf('아카이브할 입출고 데이터') < 0, res.message);
  assert.strictEqual(masterRowsOf(ctx)[1][INIT_STOCK_COL], 50, '신규 품목 초기재고가 리셋되면 안 된다');
  assert.strictEqual(ctx.__createdSpreadsheets.length, 0);
  assert.strictEqual(carryoverRows(txRowsOf(ctx)).length, 1, '이월 행이 늘어나면 안 된다');
});

test('[TASK-028] _validateClosingTarget 순수 판정: 기준 일자 주입 · 연말 경계 · 검사 순서 · 잘못된 입력', () => {
  const ctx = loadContext([], [master('A001', '토마토', 0, 1500)], {});
  const v = ctx._validateClosingTarget;
  const day = (s) => new Date(s + 'T12:00:00');

  // 2. 미종료 월 — 오늘이 다음 달 1일이 되는 순간부터 허용
  assert.strictEqual(v(2026, 9, null, day('2026-09-14')).ok, false);
  assert.ok(v(2026, 9, null, day('2026-09-14')).message.indexOf('10월 1일 이후') >= 0);
  assert.strictEqual(v(2026, 9, null, day('2026-09-30')).ok, false, '말일 당일도 아직 끝나지 않았다');
  assert.strictEqual(v(2026, 9, null, day('2026-10-01')).ok, true);
  assert.ok(v(2026, 12, null, day('2026-12-31')).message.indexOf('2027년 1월 1일 이후') >= 0, '12월은 이듬해 1월 1일');

  // 3. 순차 마감 — 연말 경계 포함
  assert.strictEqual(v(2027, 1, '2026-12-31', day('2027-02-01')).ok, true, '12월 마감 다음은 이듬해 1월');
  const skip = v(2027, 2, '2026-12-31', day('2027-03-01'));
  assert.strictEqual(skip.ok, false);
  assert.ok(skip.message.indexOf('다음 마감 대상은 2027년 1월입니다') >= 0, skip.message);

  // 검사 순서: 기준일 이전 월은 (순서 위반이기도 하지만) "이미 마감된 월"로 안내한다
  const past = v(2026, 5, '2026-08-31', day('2026-09-15'));
  assert.ok(past.message.indexOf('이미 마감된 월') >= 0, past.message);
  // 기준일 당월 말일과 같은 달 = 재마감
  assert.ok(v(2026, 8, '2026-08-31', day('2026-09-15')).message.indexOf('이미 마감된 월') >= 0);

  // 클라이언트가 문자열로 보내도 같은 판정
  assert.strictEqual(v('2026', '7', null, day('2026-09-15')).ok, true);
  // 잘못된 입력
  assert.strictEqual(v(2026, 13, null, day('2026-09-15')).ok, false);
  assert.strictEqual(v(2026, 0, null, day('2026-09-15')).ok, false);
  assert.strictEqual(v('abc', 7, null, day('2026-09-15')).ok, false);
  assert.ok(v(2026, 13, null, day('2026-09-15')).message.indexOf('올바르지 않습니다') >= 0);
});

test('[TASK-028] getClosingCutoffInfo: nextClosable(기준일의 다음 달)을 함께 주고 기존 필드는 그대로다', () => {
  const dec = loadContext([], [master('A001', '토마토', 0, 1500)], { closedCutoff: '2026-12-31' });
  const info = dec.getClosingCutoffInfo('t');
  assert.strictEqual(info.success, true);
  assert.strictEqual(info.cutoff, '2026-12-31');
  assert.strictEqual(info.minDate, '2027-01-01');
  assert.strictEqual(info.nextClosable.year, 2027);
  assert.strictEqual(info.nextClosable.month, 1);

  const none = loadContext([], [master('A001', '토마토', 0, 1500)], {});
  const noInfo = none.getClosingCutoffInfo('t');
  assert.strictEqual(noInfo.success, true);
  assert.strictEqual(noInfo.cutoff, null);
  assert.strictEqual(noInfo.nextClosable, null);
});

console.log(`\n✓ 월마감 정합성 테스트 ${passed}건 통과`);
