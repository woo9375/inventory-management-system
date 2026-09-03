// [TASK-005] FIFO 다중 로트 분할 저장 단위 테스트
//
// src/Config.gs / src/StockEngine.gs / src/TxService.gs 의 실제 소스를 vm 샌드박스에
// 그대로 로드하고, GAS 전역 객체(SpreadsheetApp, Utilities, Session, LockService,
// CacheManager 등)만 인메모리 스텁으로 대체한다. 로직을 테스트 파일에 복사하지 않으므로
// 소스가 바뀌면 테스트도 함께 따라간다. 실제 시트는 전혀 건드리지 않는다.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');

// ─────────────────────────────────────────────────────────────
//  GAS 스텁
// ─────────────────────────────────────────────────────────────

function pad(n, w) { return String(n).padStart(w, '0'); }

const Utilities = {
  formatDate: function (date, tz, fmt) {
    const y = date.getFullYear(), m = pad(date.getMonth() + 1, 2), d = pad(date.getDate(), 2);
    if (fmt === 'yyyyMMdd') return `${y}${m}${d}`;
    if (fmt === 'yyyy-MM-dd') return `${y}-${m}-${d}`;
    throw new Error('테스트 스텁이 지원하지 않는 포맷: ' + fmt);
  },
  getUuid: function () { return 'aabbccdd-1111-2222-3333-444455556666'; }
};

const Session = { getScriptTimeZone: () => 'Asia/Seoul' };
const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };

/** 3행부터 데이터가 시작되는 시트 목 (getRange/setValues/서식 no-op) */
function makeSheet(rowsFromRow3) {
  const grid = {}; // 1-based row -> 배열
  rowsFromRow3.forEach((row, i) => { grid[i + 3] = row.slice(); });

  const sheet = {
    grid: grid,
    getLastRow() {
      const rows = Object.keys(grid).map(Number);
      return rows.length ? Math.max.apply(null, rows) : 0;
    },
    getRange(startRow, startCol, numRows, numCols) {
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
          assert.strictEqual(values.length, numRows, 'setValues 행 수 불일치');
          values.forEach((line, r) => {
            assert.strictEqual(line.length, numCols, 'setValues 열 수 불일치');
            const target = grid[startRow + r] || (grid[startRow + r] = []);
            line.forEach((v, c) => { target[startCol - 1 + c] = v; });
          });
          return range;
        },
        setHorizontalAlignment() { return range; },
        setBackground() { return range; }
      };
      return range;
    }
  };
  return sheet;
}

// ─────────────────────────────────────────────────────────────
//  샌드박스 구성
// ─────────────────────────────────────────────────────────────

function loadContext(txRows, itemMap) {
  // [카테고리|업장명|태그|상태|-|-]
  const shopSheet = makeSheet([['식음', '테스트업장', 'FB', '생성완료', '', '']]);
  const txSheet = makeSheet(txRows);

  const sandbox = {
    console,
    Utilities: Utilities,
    Session: Session,
    LockService: LockService,
    CacheManager: {
      get: () => itemMap,
      buildItemMapCache: () => itemMap,
      invalidateAll: () => { sandbox.__invalidated = true; }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name) => (name === '🏢 업장관리' ? shopSheet : txSheet)
      })
    },
    // [TASK-010] addTransaction이 Archive.gs의 마감일 가드를 호출한다.
    // 마감 이력이 없는 상태(프로퍼티 없음 + 이월 행 없음)이므로 어떤 날짜도 차단되지 않아야 한다.
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} })
    },
    DriveApp: {},
    validateSession: () => ({ name: '테스터', role: 'admin', assignedShops: ['테스트업장'] }),
    _canAccessShop: () => true,
    __invalidated: false
  };

  const ctx = vm.createContext(sandbox);
  ['Config.gs', 'StockEngine.gs', 'Archive.gs', 'TxService.gs'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  });

  ctx.__txSheet = txSheet;
  return ctx;
}

/** 시트 3행 이후의 실제 저장 결과 */
function savedRows(ctx) {
  const sheet = ctx.__txSheet;
  const last = sheet.getLastRow();
  if (last < 3) return [];
  return sheet.getRange(3, 1, last - 2, 9).getValues();
}

function tx(date, code, name, type, qty, price, note, txId) {
  return [new Date(date + 'T00:00:00'), code, name, type, qty, price, '테스터', note || '', txId || ''];
}

const ITEM = (price, initStock) => ({ 'A001': { name: '테스트품목', price: price, initStock: initStock } });

let passed = 0;
function test(title, fn) {
  fn();
  passed++;
  console.log('  ✓ ' + title);
}

// ─────────────────────────────────────────────────────────────
//  케이스 1: 단일 로트 내 충족
// ─────────────────────────────────────────────────────────────
test('단일 로트 출고: 1개 행 + 로트 단가 + TxID -01', () => {
  const ctx = loadContext(
    [tx('2026-08-01', 'A001', '테스트품목', '입고', 10, 1000, '', 'FB-20260801-AAA')],
    ITEM(1500, 0)
  );
  const res = ctx.addTransaction('t', '테스트업장', { code: 'A001', type: '출고', qty: 5, date: '2026-08-10', note: '조식용' });
  assert.ok(res.success, res.message);
  assert.strictEqual(res.splitCount, 1);

  const rows = savedRows(ctx).slice(1); // 신규 저장분만
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][4], 5);
  assert.strictEqual(rows[0][5], 1000, '마스터 단가(1500)가 아닌 로트 단가여야 함');
  assert.ok(/-01$/.test(rows[0][8]), 'TxID 접미사 -01: ' + rows[0][8]);
  assert.strictEqual(rows[0][7], '조식용', '단일 로트는 FIFO 태그 미부착');
  assert.strictEqual(res.overdraftQty, 0);
});

// ─────────────────────────────────────────────────────────────
//  케이스 2: 2개 로트 분할
// ─────────────────────────────────────────────────────────────
test('2개 로트 분할 출고: 4@1000 / 6@1200 + Parent TxID -01/-02', () => {
  const ctx = loadContext([
    tx('2026-08-01', 'A001', '테스트품목', '입고', 4, 1000, '', 'FB-1'),
    tx('2026-08-05', 'A001', '테스트품목', '입고', 10, 1200, '', 'FB-2')
  ], ITEM(1500, 0));

  const res = ctx.addTransaction('t', '테스트업장', { code: 'A001', type: '출고', qty: 10, date: '2026-08-10', note: '연회' });
  assert.ok(res.success, res.message);
  assert.strictEqual(res.splitCount, 2);

  const rows = savedRows(ctx).slice(2);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual([rows[0][4], rows[0][5]], [4, 1000]);
  assert.deepStrictEqual([rows[1][4], rows[1][5]], [6, 1200]);

  const parent = res.parentTxId;
  assert.strictEqual(rows[0][8], parent + '-01');
  assert.strictEqual(rows[1][8], parent + '-02');
  assert.ok(rows[0][7].indexOf('[FIFO 1/2, 로트일자: 2026-08-01]') >= 0, rows[0][7]);
  assert.ok(rows[1][7].indexOf('[FIFO 2/2, 로트일자: 2026-08-05]') >= 0, rows[1][7]);
  assert.strictEqual(rows[0][7].indexOf('연회'), 0, '사용자 비고 보존');
  assert.ok(res.message.indexOf('2개 로트로 분할 저장') >= 0, res.message);
});

// ─────────────────────────────────────────────────────────────
//  케이스 3: 초기재고 연계
// ─────────────────────────────────────────────────────────────
test('초기재고 연계 출고: 3@800(초기재고) / 2@1000', () => {
  const ctx = loadContext(
    [tx('2026-08-01', 'A001', '테스트품목', '입고', 5, 1000, '', 'FB-1')],
    ITEM(800, 3)
  );
  const res = ctx.addTransaction('t', '테스트업장', { code: 'A001', type: '출고', qty: 5, date: '2026-08-10', note: '' });
  assert.ok(res.success, res.message);

  const rows = savedRows(ctx).slice(1);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual([rows[0][4], rows[0][5]], [3, 800]);
  assert.deepStrictEqual([rows[1][4], rows[1][5]], [2, 1000]);
  assert.ok(rows[0][7].indexOf('로트일자: 초기재고') >= 0, rows[0][7]);
});

// ─────────────────────────────────────────────────────────────
//  케이스 4: 초과 출고
// ─────────────────────────────────────────────────────────────
test('초과 출고: 가용 5 소진 후 3개는 마스터 단가 + [FIFO 초과출고]', () => {
  const ctx = loadContext(
    [tx('2026-08-01', 'A001', '테스트품목', '입고', 5, 1000, '', 'FB-1')],
    ITEM(1500, 0)
  );
  const res = ctx.addTransaction('t', '테스트업장', { code: 'A001', type: '폐기', qty: 8, date: '2026-08-10', note: '' });
  assert.ok(res.success, res.message);
  assert.strictEqual(res.overdraftQty, 3);

  const rows = savedRows(ctx).slice(1);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual([rows[0][4], rows[0][5]], [5, 1000]);
  assert.deepStrictEqual([rows[1][4], rows[1][5]], [3, 1500]);
  assert.strictEqual(rows[1][3], '폐기');
  assert.ok(rows[1][7].indexOf('[FIFO 초과출고]') >= 0, rows[1][7]);
  assert.ok(res.message.indexOf('초과분은 마스터 단가') >= 0, res.message);
});

// ─────────────────────────────────────────────────────────────
//  케이스 5: 입고 불변성
// ─────────────────────────────────────────────────────────────
test('입고 등록: 분할 없이 1개 행 + 접미사 없는 TxID', () => {
  const ctx = loadContext([], ITEM(1500, 10));
  const res = ctx.addTransaction('t', '테스트업장', { code: 'A001', type: '입고', qty: 7, date: '2026-08-10', note: '정기납품' });
  assert.ok(res.success, res.message);
  assert.strictEqual(res.splitCount, 1);

  const rows = savedRows(ctx);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual([rows[0][3], rows[0][4], rows[0][5]], ['입고', 7, 1500]);
  assert.strictEqual(rows[0][7], '정기납품');
  assert.strictEqual(rows[0][8], 'FB-20260810-AABBCCDD', 'TxID: ' + rows[0][8]);
});

// ─────────────────────────────────────────────────────────────
//  케이스 6: 기존 출고 이력 반영 (부분 소진된 로트부터 차감)
// ─────────────────────────────────────────────────────────────
test('기존 출고 반영: 소진된 로트를 건너뛰고 잔여 로트부터 차감', () => {
  const ctx = loadContext([
    tx('2026-08-01', 'A001', '테스트품목', '입고', 5, 1000, '', 'FB-1'),
    tx('2026-08-02', 'A001', '테스트품목', '입고', 5, 1200, '', 'FB-2'),
    tx('2026-08-03', 'B002', '다른품목', '입고', 100, 50, '', 'FB-X'),
    tx('2026-08-04', 'A001', '테스트품목', '출고', 4, 1000, '', 'FB-3-01'),
    tx('2026-08-05', 'B002', '다른품목', '출고', 100, 50, '', 'FB-Y')
  ], ITEM(1500, 0));

  const res = ctx.addTransaction('t', '테스트업장', { code: 'A001', type: '출고', qty: 3, date: '2026-08-10', note: '' });
  assert.ok(res.success, res.message);

  const rows = savedRows(ctx).slice(5);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual([rows[0][4], rows[0][5]], [1, 1000], '로트1 잔여 1개');
  assert.deepStrictEqual([rows[1][4], rows[1][5]], [2, 1200], '로트2에서 2개');
  assert.strictEqual(res.overdraftQty, 0, '다른 품목(B002) 이력에 영향받지 않아야 함');
});

// ─────────────────────────────────────────────────────────────
//  케이스 7: 대시보드 FIFO 잔여금액 정합성
// ─────────────────────────────────────────────────────────────
test('분할 저장 후 로트별 잔여 금액 정합성 유지', () => {
  const ctx = loadContext([
    tx('2026-08-01', 'A001', '테스트품목', '입고', 4, 1000, '', 'FB-1'),
    tx('2026-08-05', 'A001', '테스트품목', '입고', 10, 1200, '', 'FB-2')
  ], ITEM(1500, 0));
  ctx.addTransaction('t', '테스트업장', { code: 'A001', type: '출고', qty: 10, date: '2026-08-10', note: '' });

  // 남은 재고: 로트2의 4개 @1200 = 4,800원
  let inQty = 0, outQty = 0, inValue = 0, outValue = 0;
  savedRows(ctx).forEach(r => {
    if (r[3] === '입고') { inQty += r[4]; inValue += r[4] * r[5]; }
    else { outQty += r[4]; outValue += r[4] * r[5]; }
  });
  assert.strictEqual(inQty - outQty, 4, '현재고 4개');
  assert.strictEqual(inValue - outValue, 4800, '잔여 금액 4,800원 (로트별 단가 정합)');
});

console.log(`\n✓ FIFO 분할 저장 테스트 ${passed}건 통과`);
