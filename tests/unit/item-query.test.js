/**
 * [TASK-025] 품목 관리 화면의 서버 쪽 — 서버 페이징 조회 · 인덱스 캐시 · CSV 사전 검증(dryRun)
 *
 * 핵심은 세 가지다.
 *   1) queryItems가 검색·카테고리·사용유무·정렬·페이징을 서버에서 끝내고 한 페이지만 돌려주는가(마스터를 통째로 내리지 않는다).
 *   2) 인덱스(ITEM_INDEX)가 캐시에 남고, 등록·수정 직후 같은 요청 안에서 다시 채워지는가(저장 뒤 목록 재조회가 콜드 미스가 아니다).
 *   3) uploadItemMasterCSV의 dryRun이 신규/건너뜀/오류를 세되 마스터·이력·Drive에 아무것도 쓰지 않는가.
 *
 * 실제 `src/*.gs`를 vm에 로드하고 tests/unit/lib/gas-sheet-mock.js로 Sheets·Cache·Drive를 모킹한다. 순수 인메모리.
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

const MASTER = '🗂️ 품목 마스터';
const CHANGELOG = '📋 변경이력';

function makeCtx(opts) {
  const o = opts || {};
  const ss = new Spreadsheet('mock');
  const env = buildEnv(ss);
  const ctx = vm.createContext(env);
  GS_FILES.forEach(function (name) {
    vm.runInContext(fs.readFileSync(path.join(SRC, name + '.gs'), 'utf8'), ctx, { filename: name + '.gs' });
  });
  ctx.validateSession = function (token) {
    if (token === 'BAD') return null;
    if (token === 'STAFF') return { name: '직원', username: 'staff', role: 'staff' };
    return { name: '테스터', username: 'tester', role: o.role || 'admin' };
  };
  ctx.__recalc = 0;
  ctx.recalcStockAndUsage = function () { ctx.__recalc++; };
  ctx.ss0 = ss;
  ctx.TOKEN = 'GOOD';
  vm.runInContext('buildBaseDataSheet(ss0); buildVendors(ss0); buildSeasonsSheet(ss0); buildItemMaster(ss0); buildChangelogSheet(ss0)', ctx);
  vm.runInContext('addVendor(TOKEN, { name: "가나상사" }); addVendor(TOKEN, { name: "폐업상사" })', ctx);
  vm.runInContext('updateVendor(TOKEN, "VND-002", { name: "폐업상사", usageStatus: "미사용" })', ctx);
  return { ss, ctx, env, master: ss.getSheetByName(MASTER), changelog: ss.getSheetByName(CHANGELOG) };
}
const run = (ctx, expr) => vm.runInContext(expr, ctx);
const hasIndexCache = (env) => env.__cacheStore.has('ITEM_INDEX_chunks');
// 캐시에는 필드 순서 고정 배열(ITEM_INDEX_FIELDS)로 들어간다 — 객체로 펴서 본다
const cachedIndex = (t) => {
  const fields = run(t.ctx, 'ITEM_INDEX_FIELDS');
  return JSON.parse(t.env.__cacheStore.get('ITEM_INDEX')).map((row) => {
    const it = {}; fields.forEach((f, i) => { it[f] = row[i]; }); return it;
  });
};

/** 검증에 쓸 품목 6건 — 카테고리 2종, 코드 순서를 일부러 섞어 등록한다 */
const SEED = [
  ['IT-003', '수건 40수', '소모품', '장'],
  ['IT-001', '샴푸 대용량', '어메니티', '개'],
  ['IT-005', '식용유', '식재료', '통'],
  ['IT-002', '바디워시', '어메니티', '개'],
  ['IT-004', '타월 30수', '소모품', '장'],
  ['IT-006', '쌀 20kg', '식재료', '포대']
];
function seed(ctx) {
  SEED.forEach(function (s) {
    const r = run(ctx, 'addNewItem(TOKEN, { code: "' + s[0] + '", name: "' + s[1] + '", category: "' + s[2] + '", unit: "' + s[3] + '", unitPrice: 1000 })');
    if (!r.success) throw new Error('시드 실패: ' + r.message);
  });
}
const codesOf = (res) => res.items.map(function (it) { return it.code; });

console.log('[TASK-025] 품목 관리 서버 — queryItems · ITEM_INDEX · CSV dryRun');

// ───────────────────────────────────────────────
console.log('\n[0] 상수');
{
  const t = makeCtx({});
  check('CACHE_INVALIDATE_KEYS에 ITEM_INDEX가 들어 있다 (invalidateAll이 지운다)', () => {
    ok(run(t.ctx, 'CACHE_INVALIDATE_KEYS.indexOf(CACHE_KEYS.ITEM_INDEX) >= 0'));
  });
  check('getItemUiConfigJson: 파싱되고 필드 라벨·기본값·페이지 크기가 Config 상수와 같다', () => {
    const json = run(t.ctx, 'getItemUiConfigJson()');
    ok(!/</.test(json), '"<"가 남아 있다');
    const ui = JSON.parse(json);
    eq(ui.pageSize, run(t.ctx, 'ITEM_QUERY_PAGE_SIZE'));
    eq(ui.csvMaxRows, run(t.ctx, 'ITEM_CSV_MAX_ROWS'));
    eq(ui.fieldLabels, run(t.ctx, 'MASTER_FIELD_LABELS'));
    eq(ui.numericDefaults, run(t.ctx, 'ITEM_NUMERIC_DEFAULTS'));
    eq(ui.taxTypes, ['과세', '비과세']); eq(ui.usageStatuses, ['사용', '미사용']);
  });
  check('SYSTEM_ACTIONS.uploadItemCsv: scope webapp · requiresAdmin false (구매팀 manager가 웹앱에서 실행, 시트 메뉴 없음 — TASK-026)', () => {
    eq(run(t.ctx, 'SYSTEM_ACTIONS.uploadItemCsv.scope'), 'webapp');
    eq(run(t.ctx, 'SYSTEM_ACTIONS.uploadItemCsv.requiresAdmin'), false);
  });
}

// ───────────────────────────────────────────────
console.log('\n[1] queryItems — 권한 · 빈 마스터 · 정렬 · 필터 · 페이징');
{
  const t = makeCtx({});
  check('세션 없음 → success:false, staff → 권한 거절 (탭이 숨겨져도 API가 막는다)', () => {
    eq(run(t.ctx, 'queryItems("BAD", {}).success'), false);
    const r = run(t.ctx, 'queryItems("STAFF", {})');
    eq(r.success, false); ok(/권한/.test(r.message), r.message);
  });
  check('빈 마스터 → total 0, items [], totalAll 0', () => {
    const r = run(t.ctx, 'queryItems(TOKEN, {})');
    eq(r.success, true); eq(r.total, 0); eq(r.items, []); eq(r.totalAll, 0);
  });
  seed(t.ctx);
  check('기본 조회: 사용 품목만, 코드 오름차순, page 1 · pageSize 25', () => {
    const r = run(t.ctx, 'queryItems(TOKEN, {})');
    eq(r.success, true); eq(r.page, 1); eq(r.pageSize, 25); eq(r.total, 6); eq(r.totalAll, 6);
    eq(codesOf(r), ['IT-001', 'IT-002', 'IT-003', 'IT-004', 'IT-005', 'IT-006']);
  });
  check('한 행에 수정 모달을 채울 필드가 다 있다 (수식 열은 없다)', () => {
    const it = run(t.ctx, 'queryItems(TOKEN, { q: "IT-003" })').items[0];
    eq(it, { code: 'IT-003', name: '수건 40수', category: '소모품', grade: '', unit: '장', initStock: 0, leadTime: 3, safetyDays: 5,
             targetDays: 30, vendorCode: '', taxType: '과세', unitPrice: 1000, usageStatus: '사용' });
    ok(!('rop' in it) && !('safetyStock' in it) && !('currentStock' in it), '수식/계산 열이 실려 왔다');
  });
  check('q: 품목명·코드 부분 일치, 대소문자 무시', () => {
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, { q: "타월" })')), ['IT-004']);
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, { q: "it-00" })')), ['IT-001', 'IT-002', 'IT-003', 'IT-004', 'IT-005', 'IT-006']);
    eq(run(t.ctx, 'queryItems(TOKEN, { q: "없는것" })').total, 0);
  });
  check('category 필터 · q와 결합', () => {
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, { category: "어메니티" })')), ['IT-001', 'IT-002']);
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, { category: "소모품", q: "40" })')), ['IT-003']);
  });
  check('페이징: pageSize 2 → 1/2/3페이지, 4페이지는 비고 total은 항상 필터 건수', () => {
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, { pageSize: 2, page: 1 })')), ['IT-001', 'IT-002']);
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, { pageSize: 2, page: 2 })')), ['IT-003', 'IT-004']);
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, { pageSize: 2, page: 3 })')), ['IT-005', 'IT-006']);
    const p4 = run(t.ctx, 'queryItems(TOKEN, { pageSize: 2, page: 4 })');
    eq(p4.items, []); eq(p4.total, 6);
  });
  check('인자 정규화: page 0/음수/문자 → 1, pageSize 상한 100, 이상한 usage → 사용', () => {
    eq(run(t.ctx, 'queryItems(TOKEN, { page: 0 }).page'), 1);
    eq(run(t.ctx, 'queryItems(TOKEN, { page: "x" }).page'), 1);
    eq(run(t.ctx, 'queryItems(TOKEN, { pageSize: 9999 }).pageSize'), 100);
    eq(run(t.ctx, 'queryItems(TOKEN, { usage: "폐기" }).total'), 6);
  });
  check('withCatalog: 카테고리·단위(기초데이터)·사용 중 거래처만 같이 온다', () => {
    const r = run(t.ctx, 'queryItems(TOKEN, { withCatalog: true })');
    ok(r.catalog && r.catalog.success, '카탈로그 없음');
    ok(r.catalog.categories.indexOf('소모품') >= 0 && r.catalog.units.indexOf('장') >= 0);
    eq(r.catalog.vendors.map(function (v) { return v.code; }), ['VND-001']);
    eq(run(t.ctx, 'queryItems(TOKEN, {}).catalog'), undefined, '기본 조회에는 카탈로그가 없다');
  });
  check('getItemCatalog 단독 호출도 같은 모양', () => {
    const c = run(t.ctx, 'getItemCatalog(TOKEN)');
    eq(c.success, true); eq(c.vendors[0].name, '가나상사');
    eq(run(t.ctx, 'getItemCatalog("BAD").success'), false);
  });
}

// ───────────────────────────────────────────────
console.log('\n[2] ITEM_INDEX 캐시 — 적중 · 무효화 · 쓰기 직후 재구성');
{
  const t = makeCtx({});
  check('콜드 등록: 캐시가 비어 있었으면 등록 뒤에도 인덱스를 만들지 않는다 (다음 조회가 만든다)', () => {
    run(t.ctx, 'addNewItem(TOKEN, { code: "IT-001", name: "샴푸", category: "어메니티", unit: "개" })');
    eq(hasIndexCache(t.env), false);
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, {})')), ['IT-001']);
    eq(hasIndexCache(t.env), true);
  });
  check('캐시 적중: 시트를 직접 바꿔도 조회는 캐시를 돌려주고, invalidateAll 뒤에 새 값이 보인다', () => {
    t.master.getRange(3, 2).setValue('샴푸(직접수정)');
    eq(run(t.ctx, 'queryItems(TOKEN, {}).items[0].name'), '샴푸');
    run(t.ctx, 'CacheManager.invalidateAll()');
    eq(hasIndexCache(t.env), false);
    eq(run(t.ctx, 'queryItems(TOKEN, {}).items[0].name'), '샴푸(직접수정)');
  });
  check('웜 등록: 인덱스가 있으면 새 항목을 끼워 다시 채운다 — 응답에도 item이 실린다', () => {
    const r = run(t.ctx, 'addNewItem(TOKEN, { code: "IT-000", name: "린스", category: "어메니티", unit: "개", unitPrice: 700 })');
    eq(r.success, true);
    eq(r.item.code, 'IT-000'); eq(r.item.unitPrice, 700); eq(r.item.usageStatus, '사용');
    eq(hasIndexCache(t.env), true, '등록 직후 인덱스가 비어 있다');
    eq(cachedIndex(t).map(function (it) { return it.code; }), ['IT-000', 'IT-001']);
    // 다른 캐시(마스터 목록·코드)는 지워져 있어야 한다
    eq(t.env.__cacheStore.has('ITEM_CODES_chunks'), false);
  });
  check('수정: 인덱스가 바뀐 값으로 다시 채워지고 응답 item이 새 값이다', () => {
    const r = run(t.ctx, 'updateItem(TOKEN, "IT-001", { name: "샴푸 대용량", unitPrice: 1500, reason: "단가 인상" })');
    eq(r.success, true);
    eq(r.item.name, '샴푸 대용량'); eq(r.item.unitPrice, 1500);
    eq(hasIndexCache(t.env), true, '수정 직후 인덱스가 비어 있다');
    const idx = cachedIndex(t).find(function (it) { return it.code === 'IT-001'; });
    eq(idx.name, '샴푸 대용량'); eq(idx.unitPrice, 1500);
    eq(run(t.ctx, 'queryItems(TOKEN, { q: "대용량" }).items[0].unitPrice'), 1500);
  });
  check('미사용 전환: 기본 조회에서 빠지고 all/미사용에서는 맨 아래, disableItemMaster 응답에도 item', () => {
    const r = run(t.ctx, 'disableItemMaster(TOKEN, "IT-000", "단종")');
    eq(r.success, true); eq(r.item.usageStatus, '미사용');
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, {})')), ['IT-001']);
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, { usage: "all" })')), ['IT-001', 'IT-000']);
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, { usage: "미사용" })')), ['IT-000']);
    const back = run(t.ctx, 'updateItem(TOKEN, "IT-000", { usageStatus: "사용", reason: "재사용" })');
    eq(back.item.usageStatus, '사용');
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, {})')), ['IT-000', 'IT-001']);
  });
  check('빈 행이 섞여 있어도 코드 없는 행은 인덱스에 들어가지 않는다', () => {
    t.master.getRange(6, 2).setValue('코드 없는 행'); // A열 비어 있음
    run(t.ctx, 'CacheManager.invalidateAll()');
    eq(run(t.ctx, 'queryItems(TOKEN, { usage: "all" }).totalAll'), 2);
  });
}

// ───────────────────────────────────────────────
console.log('\n[3] uploadItemMasterCSV dryRun — 세되 쓰지 않는다');
{
  const t = makeCtx({});
  run(t.ctx, 'addNewItem(TOKEN, { code: "IT-001", name: "샴푸", category: "어메니티", unit: "개" })');
  const lastRowBefore = run(t.ctx, '_findMasterLastRow(ss0.getSheetByName("' + MASTER + '"))');
  const clBefore = t.changelog.getLastRow();
  const ROWS = '[["IT-001","샴푸(중복)","어메니티","","개"], ["IT-010","수건","소모품","40수","장","5","","","","과세","1200"], ["IT-011","타월","소모품","","장"]]';

  check('신규 2 · 건너뜀 1 · 오류 0 → success, added/ignored/preview, 마스터·이력·Drive에 아무것도 없다', () => {
    const r = run(t.ctx, 'uploadItemMasterCSV(TOKEN, ' + ROWS + ', { dryRun: true })');
    eq(r.success, true); eq(r.dryRun, true); eq(r.added, 2); eq(r.ignored, 1); eq(r.ignoredCodes, ['IT-001']); eq(r.errors, []);
    eq(r.preview.map(function (p) { return p.code; }), ['IT-010', 'IT-011']);
    eq(r.preview[0].unitPrice, 1200); eq(r.preview[1].unitPrice, 0);
    eq(run(t.ctx, '_findMasterLastRow(ss0.getSheetByName("' + MASTER + '"))'), lastRowBefore, '마스터 행이 늘었다');
    eq(t.changelog.getLastRow(), clBefore, '이력이 남았다');
    eq(t.env.__driveFiles.length, 0, '백업 파일이 생겼다');
  });
  check('오류 행이 있으면 success:false + errors, 역시 아무것도 쓰지 않는다', () => {
    const r = run(t.ctx, 'uploadItemMasterCSV(TOKEN, [["IT-020","x","없는분류","","장"], ["IT-021","y","소모품","","장"]], { dryRun: true })');
    eq(r.success, false); eq(r.dryRun, true); eq(r.errors.length, 1); ok(/IT-020/.test(r.errors[0]));
    eq(r.added, 1); eq(r.ignored, 0);
    eq(run(t.ctx, '_findMasterLastRow(ss0.getSheetByName("' + MASTER + '"))'), lastRowBefore);
    eq(t.env.__driveFiles.length, 0);
  });
  check('행 수 상한(ITEM_CSV_MAX_ROWS) 초과는 dryRun·실제 모두 거부', () => {
    const big = 'Array.from({ length: ITEM_CSV_MAX_ROWS + 1 }, function (_, i) { return ["B-" + i, "x", "소모품", "", "장"]; })';
    ok(!run(t.ctx, 'uploadItemMasterCSV(TOKEN, ' + big + ', { dryRun: true })').success);
    ok(!run(t.ctx, 'uploadItemMasterCSV(TOKEN, ' + big + ')').success);
    eq(run(t.ctx, '_findMasterLastRow(ss0.getSheetByName("' + MASTER + '"))'), lastRowBefore);
  });
  check('staff·세션 없음 거부, 3번째 인자 없이 부르면 예전처럼 실제 등록 (시트 대화상자 호환)', () => {
    eq(run(t.ctx, 'uploadItemMasterCSV("STAFF", ' + ROWS + ', { dryRun: true }).success'), false);
    eq(run(t.ctx, 'uploadItemMasterCSV("BAD", ' + ROWS + ').success'), false);
    const r = run(t.ctx, 'uploadItemMasterCSV(TOKEN, ' + ROWS + ')');
    eq(r.success, true); eq(r.added, 2); eq(r.ignored, 1);
    eq(run(t.ctx, '_findMasterLastRow(ss0.getSheetByName("' + MASTER + '"))'), lastRowBefore + 2);
    eq(t.env.__driveFiles.length, 1, '업로드 전 백업이 없다');
  });
  check('실제 등록 뒤 인덱스는 지워지고 다음 조회가 새 품목을 포함해 다시 만든다', () => {
    eq(hasIndexCache(t.env), false);
    eq(codesOf(run(t.ctx, 'queryItems(TOKEN, {})')), ['IT-001', 'IT-010', 'IT-011']);
  });
}

console.log('');
if (fail > 0) { console.error('✗ ' + fail + '개 검증 실패'); process.exit(1); }
console.log('✓ TASK-025 (품목 관리 서버) 검증 통과 — ' + pass + '개');
