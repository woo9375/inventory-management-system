/**
 * [TASK-027] 웹앱 응답 시간 개선 — 서버 경로 단위 테스트
 *
 * DEV 실측(2026-09-14, tests/e2e/perf-baseline.spec.js): 빈 함수 왕복 955ms, 거래 등록 4.6~5.1초,
 * 최근 기록 조회 2.2초, 대시보드 3.2초, 설정 콜드 3.2초. 원인은 계산이 아니라
 *   (1) 호출마다 같은 시트를 여러 번 다시 읽는 것(업장관리 3회, 업장 시트 전체, 마스터 4,300행)
 *   (2) 거래 등록마다 캐시 전체를 지워 다음 호출이 전부 콜드 미스가 되는 것(+ 지우는 데만 28회 왕복)
 *   (3) 마감 이력이 없는 환경에서 등록마다 통합 시트를 풀 스캔하는 것
 * 이 파일은 그 세 가지가 코드로 막혔는지를 본다. 실제 Google Sheet는 건드리지 않는다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Spreadsheet, buildEnv } = require('./lib/gas-sheet-mock');

const SRC = path.join(__dirname, '..', '..', 'src');
const GS_FILES = ['Config', 'SheetBuilder', 'Migration', 'Code', 'ItemService', 'StockEngine',
                  'Dashboard', 'Archive', 'CacheManager', 'WebApp', 'DevTools', 'RBAC',
                  'TxService', 'BaseDataService', 'ConfigService', 'Triggers', 'VendorService'];

const SHOPS = '🏢 업장관리';
const MASTER = '🗂️ 품목 마스터';
const INOUT = '📝 통합 입출고 기록장';
const SEASONS = '📅 시즌설정';
const USERS = '👤 사용자관리';
const SHOP_A = '테스트업장';

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '\n          ' + e.message); fail++; }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((what || '') + ' 기대 ' + b + ' / 실제 ' + a);
}
function ok(cond, what) { if (!cond) throw new Error(what || '조건 불만족'); }

/** 시트 읽기 횟수를 세는 래퍼 — "다시 읽지 않는다"를 검증하기 위한 계측 */
function countReads(sheet) {
  const counter = { getValues: 0, getLastRow: 0, rowsRead: 0 };
  const origGetRange = sheet.getRange.bind(sheet);
  const origLastRow = sheet.getLastRow.bind(sheet);
  sheet.getRange = function () {
    const range = origGetRange.apply(sheet, arguments);
    const origGetValues = range.getValues.bind(range);
    range.getValues = function () { counter.getValues++; const v = origGetValues(); counter.rowsRead += v.length; return v; };
    return range;
  };
  sheet.getLastRow = function () { counter.getLastRow++; return origLastRow(); };
  return counter;
}

function makeCtx() {
  const ss = new Spreadsheet('mock');
  const env = buildEnv(ss);
  // 세션은 캐시에 그대로 든 JSON — 실제 validateSession 경로를 탄다
  const ctx = vm.createContext(env);
  GS_FILES.forEach(function (name) {
    const p = path.join(SRC, name + '.gs');
    if (!fs.existsSync(p)) return;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: name + '.gs' });
  });
  ctx.ss0 = ss;
  // buildUsersSheet가 초기 관리자 프로퍼티를 요구한다 (값은 테스트용 더미)
  env.__scriptProps.set('INITIAL_ADMIN_USERNAME', 'admin');
  env.__scriptProps.set('INITIAL_ADMIN_PASSWORD', 'dummy-password-12');
  env.__scriptProps.set('INITIAL_ADMIN_NAME', '관리자');
  env.__scriptProps.set('INITIAL_ADMIN_DEPT', '시스템');
  vm.runInContext('buildBaseDataSheet(ss0); buildVendors(ss0); buildItemMaster(ss0); buildChangelogSheet(ss0); ' +
                  'buildShopsSheet(ss0); buildSeasonsSheet(ss0); buildUsersSheet(ss0); buildConsolidatedLog(ss0); buildDashboard(ss0)', ctx);

  const master = ss.getSheetByName(MASTER);
  master.getRange(3, 1, 2, 5).setValues([
    ['A001', '수건', '소모품', '', '장'],
    ['A002', '비누', '소모품', '', '개']
  ]);
  master.getRange(3, 21, 2, 1).setValues([[1500], [300]]); // U열 매입단가

  const shops = ss.getSheetByName(SHOPS);
  const shopSheet = ss.insertSheet(SHOP_A);
  shops.getRange(3, 1, 2, 7).setValues([
    ['식음', SHOP_A, 'FB', '생성완료', '', shopSheet.getSheetId ? shopSheet.getSheetId() : 1, ''],
    ['객실', '미생성업장', 'RM', '대기', '', '', '']
  ]);

  env.__cacheStore.set('session_tok', JSON.stringify({ username: 'admin', name: '관리자', role: 'admin', assignedShops: [] }));
  env.__cacheStore.set('session_staff', JSON.stringify({ username: 'st', name: '직원', role: 'staff', assignedShops: [SHOP_A] }));
  return { ss, ctx, env, master, shops, shopSheet };
}
const call = (t, expr) => vm.runInContext(expr, t.ctx);

function txRow(date, code, name, type, qty, price, txId) {
  return [new Date(date + 'T00:00:00'), code, name, type, qty, price, '관리자', '', txId];
}

// ───────────────────────────────────────────────────────────────
console.log('[TASK-027] 웹앱 응답 시간 — 서버 경로');

console.log('\n[1] 활성 업장 캐시 (_getActiveShops)');
check('첫 호출은 업장관리 시트를 읽고, 두 번째 호출은 캐시만 읽는다', () => {
  const t = makeCtx();
  const reads = countReads(t.shops);
  const first = call(t, '_getActiveShops()');
  eq(first.map(s => s.name), [SHOP_A], '생성완료만');
  eq(first[0].tag, 'FB');
  const before = reads.getValues;
  call(t, '_getActiveShops()');
  call(t, '_getActiveShopNames()');
  call(t, '_getShopTxPrefix(SpreadsheetApp.getActiveSpreadsheet(), "' + SHOP_A + '")');
  eq(reads.getValues, before, '캐시 적중 뒤에는 시트를 다시 읽지 않는다');
  ok(before >= 1, '첫 호출은 시트를 읽는다');
});
check('접근 검사·거래ID 접두사가 캐시에서 나온다', () => {
  const t = makeCtx();
  const session = { role: 'staff', assignedShops: [SHOP_A] };
  t.ctx.__s = session;
  eq(call(t, '_canAccessShop(__s, "' + SHOP_A + '")'), true);
  eq(call(t, '_canAccessShop(__s, "미생성업장")'), false, '대기 상태 업장은 접근 불가');
  eq(call(t, '_getShopTxPrefix(SpreadsheetApp.getActiveSpreadsheet(), "' + SHOP_A + '")'), 'FB');
  eq(call(t, '_getShopTxPrefix(SpreadsheetApp.getActiveSpreadsheet(), "없는업장")'), 'XX');
});
check('invalidateAll 뒤에는 업장관리 시트를 다시 읽는다 (업장 등록/삭제·시트 편집 경로)', () => {
  const t = makeCtx();
  const reads = countReads(t.shops);
  call(t, '_getActiveShops()');
  const before = reads.getValues;
  call(t, 'CacheManager.invalidateAll()');
  call(t, '_getActiveShops()');
  eq(reads.getValues, before + 1);
});

console.log('\n[2] CacheManager.invalidateAll — 왕복 2회, 청크 키까지 삭제');
check('getAll 1회 + removeAll 1회로 끝나고 청크 키가 모두 지워진다', () => {
  const t = makeCtx();
  // 큰 데이터(청크 3개)와 작은 데이터를 넣는다
  const big = 'x'.repeat(90000 * 2 + 10);
  call(t, 'CacheManager.set("ITEM_MASTER_DATA", ' + JSON.stringify(big) + ')');
  call(t, 'CacheManager.set("SHOP_LIST", [1,2,3])');
  ok(t.env.__cacheStore.has('ITEM_MASTER_DATA_0'), '청크 저장');
  ok(t.env.__cacheStore.has('ITEM_MASTER_DATA_2'), '청크 3개');

  const cache = t.env.CacheService.getScriptCache();
  const calls = { getAll: 0, removeAll: 0, get: 0, remove: 0 };
  ['getAll', 'removeAll', 'get', 'remove'].forEach(k => { const o = cache[k]; cache[k] = function () { calls[k]++; return o.apply(cache, arguments); }; });
  call(t, 'CacheManager.invalidateAll()');
  eq(calls, { getAll: 1, removeAll: 1, get: 0, remove: 0 }, '캐시 왕복 횟수');
  ok(!t.env.__cacheStore.has('ITEM_MASTER_DATA_0') && !t.env.__cacheStore.has('ITEM_MASTER_DATA_2'), '청크 삭제');
  ok(!t.env.__cacheStore.has('ITEM_MASTER_DATA_chunks') && !t.env.__cacheStore.has('SHOP_LIST'), '본체 삭제');
  ok(t.env.__cacheStore.has('session_tok'), '세션은 지우지 않는다');
});
check('기본 TTL은 10분(TTL.DEFAULT)이고, 대상 키 목록에 캐시를 쓰는 모든 키가 있다', () => {
  const t = makeCtx();
  const cache = t.env.CacheService.getScriptCache();
  let seenTtl = null;
  const origPut = cache.put; cache.put = function (k, v, ttl) { seenTtl = ttl; return origPut.apply(cache, arguments); };
  call(t, 'CacheManager.set("SHOP_LIST", [1])');
  eq(seenTtl, 600, 'TTL');
  const keys = call(t, 'CACHE_INVALIDATE_KEYS');
  ['ITEM_MASTER_DATA', 'ITEM_MASTER_DATA_ALL', 'ITEM_CODES', 'SHOP_LIST', 'VENDOR_LIST', 'ITEM_CODE_MAP', 'DASHBOARD_DATA',
   'CONFIG_DATA_admin', 'CONFIG_DATA_manager', 'BASE_DATA_admin', 'BASE_DATA_staff'].forEach(k => ok(keys.includes(k), k + ' 누락'));
});

console.log('\n[3] getRecentTransactions — 시트 끝에서만 읽는다');
check('결과는 전체 읽기와 같고(최신이 위), 읽은 행 수는 limit+여유를 넘지 않는다', () => {
  const t = makeCtx();
  const rows = [];
  for (let i = 1; i <= 300; i++) rows.push(txRow('2026-09-01', 'A001', '수건', '입고', i, 1500, 'FB-' + i));
  t.shopSheet.getRange(3, 1, rows.length, 9).setValues(rows);
  const reads = countReads(t.shopSheet);
  const r = call(t, 'getRecentTransactions("tok", "' + SHOP_A + '", 50)');
  eq(r.length, 50);
  eq(r[0].txId, 'FB-300', '최신이 맨 위');
  eq(r[49].txId, 'FB-251');
  eq(r[0].qty, 300);
  ok(reads.rowsRead <= 50 + 20, '읽은 행 ' + reads.rowsRead);
  eq(reads.getValues, 1, '블록 1회');
});
check('끝에 빈 행이 섞여 있으면 위 블록을 더 읽어 채운다', () => {
  const t = makeCtx();
  const rows = [];
  for (let i = 1; i <= 80; i++) rows.push(txRow('2026-09-01', 'A001', '수건', '입고', i, 1500, 'FB-' + i));
  // 81~120행은 코드가 비어 있는 행(날짜만 남은 흔적)
  for (let i = 81; i <= 120; i++) rows.push([new Date('2026-09-01T00:00:00'), '', '', '', '', '', '', '', '']);
  t.shopSheet.getRange(3, 1, rows.length, 9).setValues(rows);
  const r = call(t, 'getRecentTransactions("tok", "' + SHOP_A + '", 50)');
  eq(r.length, 50);
  eq(r[0].txId, 'FB-80');
  eq(r[49].txId, 'FB-31');
});
check('전체가 limit보다 적으면 있는 만큼만 돌려준다', () => {
  const t = makeCtx();
  t.shopSheet.getRange(3, 1, 2, 9).setValues([txRow('2026-09-01', 'A001', '수건', '입고', 1, 1500, 'FB-1'), txRow('2026-09-02', 'A002', '비누', '출고', 2, 300, 'FB-2')]);
  const r = call(t, 'getRecentTransactions("tok", "' + SHOP_A + '", 50)');
  eq(r.map(x => x.txId), ['FB-2', 'FB-1']);
  eq(r[0].date, new Date('2026-09-02T00:00:00').toISOString(), '날짜는 formatDate(목은 ISO)');
});
check('staff는 배정 업장만, 남의 업장은 빈 배열', () => {
  const t = makeCtx();
  t.shopSheet.getRange(3, 1, 1, 9).setValues([txRow('2026-09-01', 'A001', '수건', '입고', 1, 1500, 'FB-1')]);
  eq(call(t, 'getRecentTransactions("staff", "' + SHOP_A + '", 50)').length, 1);
  eq(call(t, 'getRecentTransactions("staff", "미생성업장", 50)'), []);
});

console.log('\n[4] addTransaction — 캐시를 지우지 않고, 쓴 행을 돌려준다');
check('응답 records가 시트에 쓴 행과 같고 invalidateAll이 불리지 않는다', () => {
  const t = makeCtx();
  call(t, 'getItemMasterData("tok"); getShopList("tok"); getDashboardData("tok")'); // 캐시를 채워 둔다
  ok(t.env.__cacheStore.has('ITEM_MASTER_DATA'), '사전 캐시');
  const cm = call(t, 'CacheManager');
  let invalidations = 0; const orig = cm.invalidateAll; cm.invalidateAll = function () { invalidations++; return orig.apply(cm, arguments); };

  const r = call(t, 'addTransaction("tok", "' + SHOP_A + '", { date: "2026-09-10", code: "A001", type: "입고", qty: 7, note: "납품" })');
  ok(r.success, r.message);
  eq(invalidations, 0, '거래 등록은 캐시를 지우지 않는다');
  ok(t.env.__cacheStore.has('ITEM_MASTER_DATA') && t.env.__cacheStore.has('DASHBOARD_DATA') && t.env.__cacheStore.has('SHOP_LIST'), '캐시가 그대로 남는다');
  eq(r.records.length, 1);
  eq([r.records[0].code, r.records[0].name, r.records[0].type, r.records[0].qty, r.records[0].unitPrice, r.records[0].person, r.records[0].note, r.records[0].txId],
     ['A001', '수건', '입고', 7, 1500, '관리자', '납품', r.txId]);
  const sheetRow = t.shopSheet.getRange(3, 1, 1, 9).getValues()[0];
  eq(sheetRow.slice(1), ['A001', '수건', '입고', 7, 1500, '관리자', '납품', r.txId], '시트 행과 일치');
  ok(r.records[0].txId.indexOf('FB-') === 0, '접두사는 업장 태그 (목의 formatDate는 ISO라 날짜부는 보지 않는다)');
});
check('출고 FIFO 분할이면 records가 분할 행 수만큼이고 시트 순서다', () => {
  const t = makeCtx();
  t.shopSheet.getRange(3, 1, 2, 9).setValues([
    txRow('2026-09-01', 'A001', '수건', '입고', 3, 1000, 'FB-1'),
    txRow('2026-09-02', 'A001', '수건', '입고', 5, 2000, 'FB-2')
  ]);
  const r = call(t, 'addTransaction("tok", "' + SHOP_A + '", { date: "2026-09-10", code: "A001", type: "출고", qty: 4 })');
  ok(r.success, r.message);
  eq(r.splitCount, 2);
  eq(r.records.map(x => [x.qty, x.unitPrice]), [[3, 1000], [1, 2000]]);
  eq(r.records.map(x => x.txId), r.txIds);
});

console.log('\n[5] 마감 기준일 부정 캐시 (getLatestClosingCutoff)');
check('마감 이력이 없으면 통합 시트를 한 번만 훑고, 그 뒤엔 캐시로 null을 준다', () => {
  const t = makeCtx();
  const inout = t.ss.getSheetByName(INOUT);
  inout.getRange(3, 1, 1, 9).setValues([txRow('2026-09-01', 'A001', '수건', '입고', 1, 1500, 'FB-1')]);
  const reads = countReads(inout);
  eq(call(t, 'getLatestClosingCutoff()'), null);
  eq(call(t, 'getLatestClosingCutoff()'), null);
  eq(call(t, 'validateNotClosedMonth("2026-01-01").blocked'), false);
  eq(reads.getValues, 1, '풀 스캔 1회');
  ok(t.env.__cacheStore.has('CLOSING_CUTOFF_NONE'), '부정 캐시');
});
check('마감이 기록되면(setLatestClosingCutoff) 부정 캐시가 풀리고 새 기준일이 바로 적용된다', () => {
  const t = makeCtx();
  eq(call(t, 'getLatestClosingCutoff()'), null);
  call(t, 'setLatestClosingCutoff("2026-08-31")');
  ok(!t.env.__cacheStore.has('CLOSING_CUTOFF_NONE'), '부정 캐시 삭제');
  eq(call(t, 'getLatestClosingCutoff()'), '2026-08-31');
  eq(call(t, 'validateNotClosedMonth("2026-08-15").blocked'), true);
});
check('프로퍼티가 있으면 시트도 캐시도 보지 않는다', () => {
  const t = makeCtx();
  t.env.__scriptProps.set('LAST_CLOSED_CUTOFF', '2026-07-31');
  const reads = countReads(t.ss.getSheetByName(INOUT));
  eq(call(t, 'getLatestClosingCutoff()'), '2026-07-31');
  eq(reads.getValues, 0);
});

console.log('\n[6] getDashboardData 캐시');
check('두 번째 호출은 마스터를 읽지 않고 같은 값을 준다; 통합 갱신 뒤에는 다시 읽는다', () => {
  const t = makeCtx();
  const reads = countReads(t.master);
  const a = call(t, 'getDashboardData("tok")');
  ok(a.success && a.kpi.total === 2, JSON.stringify(a.kpi));
  const before = reads.getValues;
  const b = call(t, 'getDashboardData("tok")');
  eq(reads.getValues, before, '캐시 적중');
  eq(b.kpi, a.kpi);
  call(t, 'CacheManager.invalidateAll()');
  call(t, 'getDashboardData("tok")');
  eq(reads.getValues, before + 1, '무효화 뒤 재조회');
});
check('staff는 여전히 거절된다 (캐시가 권한을 우회하지 않는다)', () => {
  const t = makeCtx();
  call(t, 'getDashboardData("tok")');
  eq(call(t, 'getDashboardData("staff").success'), false);
});

console.log('\n[7] getBootstrapData — 로그인 직후 묶음 응답');
check('대시보드·업장·마감·동기화 시각을 한 번에 돌려주고, 인증 없으면 거절한다', () => {
  const t = makeCtx();
  t.env.__scriptProps.set('LAST_SYNC_TIMESTAMP', '2026-09-14T00:00:00.000Z');
  const b = call(t, 'getBootstrapData("tok")');
  ok(b.success);
  eq(b.shops.map(s => s.name), [SHOP_A]);
  eq(b.dashboard.kpi.total, 2);
  eq(b.closing, { success: true, cutoff: null, minDate: null, nextClosable: null }); // [TASK-028] nextClosable 추가
  eq(b.lastSync.timestamp, '2026-09-14T00:00:00.000Z');
  eq(call(t, 'getBootstrapData("nope").success'), false);
  const s = call(t, 'getBootstrapData("staff")');
  eq(s.dashboard.success, false, 'staff 대시보드 거절은 그대로');
  eq(s.shops.map(x => x.name), [SHOP_A], 'staff 배정 업장');
});

console.log('\n[8] onEdit — 설정 시트 직접 편집이 캐시를 지운다');
function editCell(t, sheet, row, col, value) {
  const range = sheet.getRange(row, col, 1, 1);
  const oldValue = range.getValue();
  range.setValue(value);
  vm.runInContext('onEdit', t.ctx)({ range: range, value: value, oldValue: oldValue });
}
check('시즌설정·사용자관리·기초데이터·업장관리 편집 → 캐시 삭제 (전에는 return에 막혀 실행되지 않던 경로)', () => {
  [[SEASONS, 5, 1], [USERS, 3, 2], ['📂 기초데이터', 3, 2], [SHOPS, 4, 1]].forEach(([name, row, col]) => {
    const t = makeCtx();
    call(t, 'getShopList("tok"); getDashboardData("tok")');
    ok(t.env.__cacheStore.has('SHOP_LIST') && t.env.__cacheStore.has('DASHBOARD_DATA'), name + ' 사전 캐시');
    editCell(t, t.ss.getSheetByName(name), row, col, '값');
    ok(!t.env.__cacheStore.has('SHOP_LIST') && !t.env.__cacheStore.has('DASHBOARD_DATA'), name + ' 편집 뒤 캐시가 남아 있다');
  });
});
check('품목 마스터 단가 편집 → ITEM_CODE_MAP이 지워져 다음 거래가 새 단가를 쓴다', () => {
  const t = makeCtx();
  call(t, 'addTransaction("tok", "' + SHOP_A + '", { date: "2026-09-10", code: "A001", type: "입고", qty: 1 })');
  ok(t.env.__cacheStore.has('ITEM_CODE_MAP'), '품목 맵 캐시');
  editCell(t, t.master, 3, 21, 9999); // U열 매입단가
  ok(!t.env.__cacheStore.has('ITEM_CODE_MAP'), '캐시 삭제');
  const r = call(t, 'addTransaction("tok", "' + SHOP_A + '", { date: "2026-09-10", code: "A001", type: "입고", qty: 1 })');
  eq(r.records[0].unitPrice, 9999, '새 단가 스냅샷');
});
check('업장 시트 편집은 캐시를 지우지 않는다', () => {
  const t = makeCtx();
  call(t, 'getShopList("tok")');
  t.shopSheet.getRange(3, 1, 1, 9).setValues([txRow('2026-09-01', 'A001', '수건', '입고', 1, 1500, '')]);
  editCell(t, t.shopSheet, 3, 5, 2);
  ok(t.env.__cacheStore.has('SHOP_LIST'));
});

console.log('\n─────────────────────────────');
console.log(fail === 0 ? '✓ 전체 통과 (' + pass + ')' : '✗ ' + fail + '개 검증 실패 (' + pass + ' 통과)');
if (fail > 0) process.exit(1);
