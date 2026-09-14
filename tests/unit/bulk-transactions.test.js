// [TASK-019] 입출고 일괄 업로드(uploadBulkTransactions) 단위 테스트
//
// src/Config.gs / StockEngine.gs / Archive.gs / TxService.gs 실제 소스를 vm 샌드박스에 로드하고
// GAS 전역 객체만 인메모리 스텁으로 대체한다 (fifo-lot-splitting.test.js와 같은 방식).
//
// 검증 축
//   1. 사전 검증(dryRun)은 아무것도 쓰지 않고, 오류를 행 번호와 함께 전부 돌려준다
//   2. 오류가 하나라도 있으면 청크 전체를 저장하지 않는다 (all-or-nothing)
//   3. 저장은 단건 등록과 같은 규칙을 탄다 — 담당자=로그인 사용자, 출고는 FIFO 분할, 같은 청크의 입고가 뒤 출고에 반영
//   4. 크기 제한(BULK_TX_CHUNK_SIZE / BULK_TX_MAX_ROWS)과 마감 기준일 1회 조회
//   5. 리팩터링 후에도 addTransaction의 결과가 동일하다 (같은 헬퍼를 쓰므로)

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');

function pad(n, w) { return String(n).padStart(w, '0'); }

/** 3행부터 데이터가 시작되는 시트 목 */
function makeSheet(rowsFromRow3) {
  const grid = {};
  rowsFromRow3.forEach((row, i) => { grid[i + 3] = row.slice(); });
  const sheet = {
    grid: grid,
    writes: 0,
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
            for (let c = 0; c < numCols; c++) { const v = src[startCol - 1 + c]; line.push(v === undefined ? '' : v); }
            out.push(line);
          }
          return out;
        },
        setValues(values) {
          sheet.writes++;
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

function loadContext(txRows, itemMap, opts) {
  opts = opts || {};
  const shopSheet = makeSheet([['식음', '테스트업장', 'FB', '생성완료', '', '']]);
  const txSheet = makeSheet(txRows);
  const props = Object.assign({}, opts.props || {});
  let uuidSeq = 0;

  const sandbox = {
    console,
    Utilities: {
      formatDate: (date, tz, fmt) => {
        const y = date.getFullYear(), m = pad(date.getMonth() + 1, 2), d = pad(date.getDate(), 2);
        if (fmt === 'yyyyMMdd') return `${y}${m}${d}`;
        if (fmt === 'yyyy-MM-dd') return `${y}-${m}-${d}`;
        throw new Error('지원하지 않는 포맷: ' + fmt);
      },
      getUuid: () => 'uuid' + pad(++uuidSeq, 4) + '-0000-0000-0000-000000000000'
    },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    LockService: { getScriptLock: () => ({ waitLock() { if (opts.lockFails) throw new Error('lock'); }, releaseLock() {} }) },
    // [TASK-027] 키별로 응답한다 — 업장 목록(SHOP_LIST)은 캐시 미스로 두어 시트에서 읽게 한다
    CacheManager: {
      get: (key) => (key === 'ITEM_CODE_MAP' ? itemMap : null),
      set: () => {},
      buildItemMapCache: () => itemMap,
      invalidateAll: () => { sandbox.__invalidated = (sandbox.__invalidated || 0) + 1; }
    },
    // [TASK-027] Archive.gs의 "마감 이력 없음" 부정 캐시가 CacheService를 쓴다 — 인메모리 스텁
    CacheService: (() => { const m = new Map(); const c = { get: (k) => (m.has(k) ? m.get(k) : null), put: (k, v) => { m.set(k, String(v)); }, remove: (k) => { m.delete(k); } }; return { getScriptCache: () => c }; })(),
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name) => {
          if (name === '🏢 업장관리') return shopSheet;
          if (name === '테스트업장') return txSheet;
          if (name === '📝 통합 입출고 기록장') return makeSheet([]);
          return null;
        }
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => { sandbox.__propReads = (sandbox.__propReads || 0) + 1; return props[k] === undefined ? null : props[k]; },
        setProperty: (k, v) => { props[k] = v; }
      })
    },
    DriveApp: {},
    validateSession: (token) => (token === 'bad' ? null : { name: '테스터', role: 'admin', assignedShops: ['테스트업장'] }),
    _canAccessShop: (session, shop) => shop === '테스트업장'
  };

  const ctx = vm.createContext(sandbox);
  ['Config.gs', 'StockEngine.gs', 'Archive.gs', 'TxService.gs'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  });
  ctx.__txSheet = txSheet;
  return ctx;
}

function savedRows(ctx) {
  const sheet = ctx.__txSheet;
  const last = sheet.getLastRow();
  if (last < 3) return [];
  return sheet.getRange(3, 1, last - 2, 9).getValues();
}
function tx(date, code, name, type, qty, price, note, txId) {
  return [new Date(date + 'T00:00:00'), code, name, type, qty, price, '테스터', note || '', txId || ''];
}
const ITEMS = {
  'A001': { name: '수건', price: 1500, initStock: 0 },
  'B002': { name: '비누', price: 300, initStock: 5 }
};

let passed = 0;
function test(title, fn) { fn(); passed++; console.log('  ✓ ' + title); }

// ─────────────────────────────────────────────────────────────
test('dryRun: 전부 유효하면 success + 아무것도 쓰지 않는다', () => {
  const ctx = loadContext([], ITEMS);
  const r = ctx.uploadBulkTransactions('t', '테스트업장', [
    { rowNo: 2, date: '2026-09-01', code: 'A001', type: '입고', qty: 10, note: '' },
    { rowNo: 3, date: '2026-09-02', code: 'B002', type: '출고', qty: '3', note: '조식' }
  ], { dryRun: true });
  assert.ok(r.success, r.message);
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(r.total, 2);
  assert.strictEqual(r.errors.length, 0);
  assert.strictEqual(savedRows(ctx).length, 0, 'dryRun은 쓰지 않는다');
  assert.strictEqual(ctx.__txSheet.writes, 0);
});

test('dryRun: 오류를 행 번호와 함께 전부 모아 돌려주고, 단건 등록과 같은 문구를 쓴다', () => {
  const ctx = loadContext([], ITEMS);
  const r = ctx.uploadBulkTransactions('t', '테스트업장', [
    { rowNo: 2, date: '2026/09/01', code: 'A001', type: '입고', qty: 1 },      // 날짜 형식
    { rowNo: 3, date: '2026-09-01', code: 'ZZZ', type: '입고', qty: 1 },       // 미등록 품목
    { rowNo: 4, date: '2026-09-01', code: 'A001', type: '반품', qty: 1 },      // 구분
    { rowNo: 5, date: '2026-09-01', code: 'A001', type: '출고', qty: 0 },      // 수량
    { rowNo: 6, date: '2026-09-01', code: '', type: '출고', qty: 1 },          // 코드 누락 → 미등록
    { rowNo: 7, date: '2026-09-01', code: 'A001', type: '입고', qty: 1, note: 'x'.repeat(501) },
    { rowNo: 8, date: '2026-09-01', code: 'A001', type: '입고', qty: 2 }       // 정상
  ], { dryRun: true });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.errors.length, 6, JSON.stringify(r.errors));
  assert.strictEqual(JSON.stringify(r.errors.map(e => e.row)), '[2,3,4,5,6,7]');
  assert.ok(/YYYY-MM-DD/.test(r.errors[0].message));
  assert.ok(/등록되지 않은 품목코드/.test(r.errors[1].message));
  assert.ok(/거래 구분/.test(r.errors[2].message));
  assert.ok(/수량은 0보다/.test(r.errors[3].message));
  assert.ok(/500자/.test(r.errors[5].message));
  assert.ok(/6건의 오류/.test(r.message), r.message);
  assert.strictEqual(savedRows(ctx).length, 0);
});

test('저장: 오류가 하나라도 있으면 청크 전체를 저장하지 않는다 (all-or-nothing)', () => {
  const ctx = loadContext([], ITEMS);
  const r = ctx.uploadBulkTransactions('t', '테스트업장', [
    { rowNo: 2, date: '2026-09-01', code: 'A001', type: '입고', qty: 10 },
    { rowNo: 3, date: '2026-09-01', code: 'NOPE', type: '입고', qty: 10 }
  ]);
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.errors[0].row, 3);
  assert.strictEqual(savedRows(ctx).length, 0);
  assert.strictEqual(ctx.__txSheet.writes, 0);
});

test('저장: 담당자=로그인 사용자, 단가 스냅샷, 1회 setValues, 캐시는 건드리지 않는다', () => {
  const ctx = loadContext([], ITEMS);
  const r = ctx.uploadBulkTransactions('t', '테스트업장', [
    { rowNo: 2, date: '2026-09-01', code: 'A001', type: '입고', qty: 10, note: '납품', person: '파일의담당자' },
    { rowNo: 3, date: '2026-09-01', code: 'B002', type: '입고', qty: '2,000'.replace(',', ''), note: '' }
  ]);
  assert.ok(r.success, r.message);
  assert.strictEqual(r.saved, 2);
  assert.strictEqual(r.rowsWritten, 2);
  assert.strictEqual(ctx.__txSheet.writes, 1, '청크는 setValues 1회로 저장');
  // [TASK-027] 거래 행은 어떤 캐시에도 들어 있지 않으므로 저장이 캐시를 지우지 않는다
  //   (지우면 다음 등록·탭 열기가 마스터 4,300행을 다시 읽는 콜드 미스가 된다)
  assert.strictEqual(ctx.__invalidated, undefined, '거래 저장은 invalidateAll을 부르지 않는다');

  const rows = savedRows(ctx);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual([rows[0][1], rows[0][2], rows[0][3], rows[0][4], rows[0][5], rows[0][6], rows[0][7]],
    ['A001', '수건', '입고', 10, 1500, '테스터', '납품']);
  assert.strictEqual(rows[1][4], 2000, '문자열 수량은 숫자로 저장');
  assert.strictEqual(rows[1][5], 300);
  assert.ok(/^FB-20260901-UUID000[12]$/.test(rows[0][8]), '거래ID 접두사=업장 태그: ' + rows[0][8]);
  assert.notStrictEqual(rows[0][8], rows[1][8], '행마다 다른 거래ID');
});

test('저장: 같은 청크의 입고가 뒤따르는 출고의 FIFO에 반영된다 (로트 단가 · 분할)', () => {
  const ctx = loadContext([tx('2026-08-01', 'A001', '수건', '입고', 4, 1000, '', 'FB-OLD')], ITEMS);
  const r = ctx.uploadBulkTransactions('t', '테스트업장', [
    { rowNo: 2, date: '2026-09-01', code: 'A001', type: '입고', qty: 6 },   // 마스터 단가 1500 로트
    { rowNo: 3, date: '2026-09-02', code: 'A001', type: '출고', qty: 7 }    // 4@1000(기존) + 3@1500(같은 청크의 입고)
  ]);
  assert.ok(r.success, r.message);
  assert.strictEqual(r.saved, 2);
  assert.strictEqual(r.rowsWritten, 3, '입고 1행 + 출고 2분할');
  assert.strictEqual(r.splitCount, 2);
  assert.strictEqual(r.overdraftCount, 0);

  const rows = savedRows(ctx).slice(1);
  assert.deepStrictEqual([rows[0][3], rows[0][4], rows[0][5]], ['입고', 6, 1500]);
  assert.deepStrictEqual([rows[1][3], rows[1][4], rows[1][5]], ['출고', 4, 1000]);
  assert.deepStrictEqual([rows[2][3], rows[2][4], rows[2][5]], ['출고', 3, 1500], '같은 청크의 입고 로트에서 차감');
  assert.ok(/\[FIFO 1\/2, 로트일자: 2026-08-01\]/.test(rows[1][7]), rows[1][7]);
  assert.ok(/\[FIFO 2\/2, 로트일자: 2026-09-01\]/.test(rows[2][7]), rows[2][7]);
  assert.ok(/-01$/.test(rows[1][8]) && /-02$/.test(rows[2][8]));
});

test('저장: 초과출고는 마스터 단가 + [FIFO 초과출고], overdraftCount 집계', () => {
  const ctx = loadContext([], ITEMS);
  const r = ctx.uploadBulkTransactions('t', '테스트업장', [
    { rowNo: 2, date: '2026-09-01', code: 'B002', type: '폐기', qty: 8 }   // 초기재고 5 + 초과 3
  ]);
  assert.ok(r.success, r.message);
  assert.strictEqual(r.overdraftCount, 1);
  const rows = savedRows(ctx);
  assert.deepStrictEqual([rows[0][4], rows[0][5]], [5, 300]);
  assert.deepStrictEqual([rows[1][4], rows[1][5]], [3, 300]);
  assert.ok(/\[FIFO 초과출고\]/.test(rows[1][7]));
  assert.ok(/초과출고 1건/.test(r.message), r.message);
});

test('제한: 저장 호출은 BULK_TX_CHUNK_SIZE행, dryRun은 BULK_TX_MAX_ROWS행을 넘기면 거부', () => {
  const ctx = loadContext([], ITEMS);
  // vm 컨텍스트의 top-level const는 전역 객체 프로퍼티가 아니라 runInContext로 읽어야 한다
  const CHUNK = vm.runInContext('BULK_TX_CHUNK_SIZE', ctx);
  const MAX = vm.runInContext('BULK_TX_MAX_ROWS', ctx);
  assert.ok(CHUNK > 0 && MAX >= CHUNK, 'Config 상수: ' + CHUNK + '/' + MAX);
  const row = { date: '2026-09-01', code: 'A001', type: '입고', qty: 1 };
  const chunk = Array.from({ length: CHUNK + 1 }, () => row);
  const r1 = ctx.uploadBulkTransactions('t', '테스트업장', chunk);
  assert.strictEqual(r1.success, false);
  assert.ok(r1.message.indexOf('최대 ' + CHUNK + '건') >= 0, r1.message);
  assert.strictEqual(savedRows(ctx).length, 0);

  const okChunk = Array.from({ length: CHUNK }, () => row);
  assert.ok(ctx.uploadBulkTransactions('t', '테스트업장', okChunk, { dryRun: true }).success);

  const big = Array.from({ length: MAX + 1 }, () => row);
  const r2 = ctx.uploadBulkTransactions('t', '테스트업장', big, { dryRun: true });
  assert.strictEqual(r2.success, false);
  assert.ok(r2.message.indexOf('최대 ' + MAX + '건') >= 0, r2.message);
});

test('마감 기간: 마감일 이하 날짜는 행 단위로 거부되고, 마감 기준일은 청크당 1회만 조회한다', () => {
  const ctx = loadContext([], ITEMS, { props: { LAST_CLOSED_CUTOFF: '2026-08-31' } });
  const r = ctx.uploadBulkTransactions('t', '테스트업장', [
    { rowNo: 2, date: '2026-08-31', code: 'A001', type: '입고', qty: 1 },
    { rowNo: 3, date: '2026-09-01', code: 'A001', type: '입고', qty: 1 },
    { rowNo: 4, date: '2026-07-15', code: 'A001', type: '입고', qty: 1 },
    { rowNo: 5, date: '2026-09-05', code: 'A001', type: '입고', qty: 1 }
  ], { dryRun: true });
  assert.strictEqual(r.success, false);
  assert.strictEqual(JSON.stringify(r.errors.map(e => e.row)), '[2,4]');
  assert.ok(/2026-08-31/.test(r.errors[0].message));
  assert.strictEqual(ctx.__propReads, 1, '행마다 마감일을 다시 읽지 않는다 (읽기 횟수=' + ctx.__propReads + ')');
});

test('접근 제어: 세션 없음 / 권한 없는 업장 / 빈 배열 / 락 실패', () => {
  const ctx = loadContext([], ITEMS);
  assert.strictEqual(ctx.uploadBulkTransactions('bad', '테스트업장', [{}]).success, false);
  assert.ok(/접근할 수 없/.test(ctx.uploadBulkTransactions('t', '다른업장', [{}]).message));
  assert.ok(/행이 없습니다/.test(ctx.uploadBulkTransactions('t', '테스트업장', []).message));
  assert.ok(/행이 없습니다/.test(ctx.uploadBulkTransactions('t', '테스트업장', null).message));

  const locked = loadContext([], ITEMS, { lockFails: true });
  const r = locked.uploadBulkTransactions('t', '테스트업장', [{ date: '2026-09-01', code: 'A001', type: '입고', qty: 1 }]);
  assert.strictEqual(r.success, false);
  assert.ok(/⏳/.test(r.message), '락 실패는 ⏳ 문구로 (클라이언트 재시도 신호): ' + r.message);
  assert.strictEqual(savedRows(locked).length, 0);
});

test('회귀: addTransaction은 리팩터링 후에도 같은 결과 (헬퍼 공유)', () => {
  const ctx = loadContext([tx('2026-08-01', 'A001', '수건', '입고', 4, 1000, '', 'FB-1')], ITEMS);
  const r = ctx.addTransaction('t', '테스트업장', { code: 'A001', type: '출고', qty: 6, date: '2026-08-10', note: '연회' });
  assert.ok(r.success, r.message);
  assert.strictEqual(r.splitCount, 2);
  assert.strictEqual(r.overdraftQty, 2);
  const rows = savedRows(ctx).slice(1);
  assert.deepStrictEqual([rows[0][4], rows[0][5]], [4, 1000]);
  assert.deepStrictEqual([rows[1][4], rows[1][5]], [2, 1500]);
  assert.strictEqual(rows[0][6], '테스터');
  assert.ok(/초과분은 마스터 단가/.test(r.message));

  const bad = ctx.addTransaction('t', '테스트업장', { code: 'A001', type: '출고', qty: 6, date: '20260810' });
  assert.ok(/YYYY-MM-DD/.test(bad.message));
  const none = ctx.addTransaction('t', '테스트업장', { code: 'NOPE', type: '출고', qty: 1, date: '2026-08-10' });
  assert.ok(/등록되지 않은 품목코드/.test(none.message));
});

console.log('\n✓ [TASK-019] 일괄 업로드 테스트 ' + passed + '건 통과');
