/**
 * [TASK-024] ItemService — 품목 API 검증 · 변경이력 9열 · 원자성
 *
 * 핵심은 두 가지다.
 *   1) 시트 드롭다운이 막아 주던 것(카테고리·단위·거래처·과세·숫자)을 웹앱 경로에서는 API가 막는가.
 *   2) 마스터에 쓰는 모든 경로(등록·수정·비활성화·CSV)가 9열 변경이력을 남기고,
 *      이력 기록이 실패하면 마스터도 되돌리는가 (이력 없는 변경을 남기지 않는다).
 *
 * 실제 `src/*.gs`를 vm에 로드하고 tests/unit/lib/gas-sheet-mock.js로 Sheets·Drive를 모킹한다.
 * 순수 인메모리이며 실제 Google Sheet는 건드리지 않는다.
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

/**
 * 기초데이터 → 거래처(VND-001 사용, VND-002 미사용) → 품목 마스터 → 변경이력 순으로 굽고 세션을 꽂는다.
 * @param {object} opts role: 세션 역할(기본 admin)
 */
function makeCtx(opts) {
  const o = opts || {};
  const ss = new Spreadsheet('mock');
  const env = buildEnv(ss);
  const ctx = vm.createContext(env);
  GS_FILES.forEach(function (name) {
    const p = path.join(SRC, name + '.gs');
    if (!fs.existsSync(p)) return;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: name + '.gs' });
  });
  // 세션 스텁은 .gs 로드 뒤에 (RBAC.gs의 validateSession 선언이 같은 이름을 덮어쓴다)
  ctx.validateSession = function (token) {
    if (token === 'BAD') return null;
    return { name: '테스터', username: 'tester', role: o.role || 'admin' };
  };
  // 재고 재계산은 StockEngine 소관 — 여기서는 "불렸는가"만 센다
  ctx.__recalc = 0;
  ctx.recalcStockAndUsage = function () { ctx.__recalc++; };

  ctx.ss0 = ss;
  ctx.TOKEN = 'GOOD';
  vm.runInContext('buildBaseDataSheet(ss0); buildVendors(ss0); buildSeasonsSheet(ss0); buildItemMaster(ss0); buildChangelogSheet(ss0)', ctx);
  vm.runInContext('addVendor(TOKEN, { name: "가나상사" }); addVendor(TOKEN, { name: "폐업상사" })', ctx);
  vm.runInContext('updateVendor(TOKEN, "VND-002", { name: "폐업상사", usageStatus: "미사용" })', ctx);

  return { ss: ss, ctx: ctx, env: env, master: ss.getSheetByName(MASTER), changelog: ss.getSheetByName(CHANGELOG) };
}

const run = (ctx, expr) => vm.runInContext(expr, ctx);
const VALID = '{ code: "IT-001", name: "타월 40수", category: "소모품", unit: "장", grade: "40수", initStock: 10, unitPrice: 1500, vendorCode: "VND-001" }';

/** 변경이력 데이터 행(3행~)을 9열 배열로 */
function changelogRows(sheet) {
  const last = sheet.getLastRow();
  if (last < 3) return [];
  return sheet.getRange(3, 1, last - 2, 9).getValues();
}
function masterRow(sheet, row) { return sheet.getRange(row, 1, 1, 25).getValues()[0]; }

// ───────────────────────────────────────────────────────────────
console.log('[TASK-024] ItemService — 품목 API 검증 · 변경이력 9열');

// ── 0. 준비 상태 ──
console.log('\n[0] 시트 준비');
{
  const t = makeCtx({});
  check('변경이력 시트가 9열 헤더로 생성된다', () => {
    eq(t.changelog.getRange(2, 1, 1, 9).getValues()[0],
       ['변경일시', '변경자', '품목코드', '품목명', '변경필드', '변경 전', '변경 후', '변경사유', '경로']);
    eq(t.changelog.merges.indexOf('A1:I1') >= 0, true, '타이틀 병합 A1:I1');
  });
  check('품목 마스터가 현재 스키마(25열)로 판정된다', () => {
    eq(run(t.ctx, '_isMasterSchemaCurrent(ss0.getSheetByName("' + MASTER + '"))'), true);
  });
  check('거래처 VND-001 사용 / VND-002 미사용', () => {
    const cat = run(t.ctx, '(function(){ const c = _loadItemCatalog(ss0); return { v1: c.vendorCodes.has("VND-001"), v2: c.vendorCodes.has("VND-002"), cat: c.categories.has("소모품"), unit: c.units.has("장") }; })()');
    eq(cat, { v1: true, v2: false, cat: true, unit: true });
  });
}

// ── 1. 검증 규칙 ──
console.log('\n[1] _validateItemFields');
{
  const t = makeCtx({});
  const v = (fields, opts) => run(t.ctx, '_validateItemFields(' + fields + ', ' + (opts || '{}') + ')');
  check('전 필드가 유효하면 정규화된 값을 돌려준다 (빈 숫자는 기본값)', () => {
    const r = v(VALID);
    eq(r.valid, true, r.message);
    eq(r.values.leadTime, 3); eq(r.values.safetyDays, 5); eq(r.values.targetDays, 30);
    eq(r.values.taxType, '과세'); eq(r.values.usageStatus, '사용'); eq(r.values.initStock, 10);
  });
  check('품목코드 공백 거절', () => eq(v('{ code: "  ", name: "x", category: "소모품", unit: "장" }').valid, false));
  check('품목명 공백 거절', () => eq(v('{ code: "A", name: "", category: "소모품", unit: "장" }').valid, false));
  check('기초데이터에 없는 카테고리 거절', () => {
    const r = v('{ code: "A", name: "x", category: "없는분류", unit: "장" }');
    eq(r.valid, false); ok(r.message.indexOf('기초데이터') >= 0, r.message);
  });
  check('기초데이터에 없는 단위 거절', () => eq(v('{ code: "A", name: "x", category: "소모품", unit: "다스" }').valid, false));
  check('카테고리·단위 빈 값 거절 (등록)', () => {
    eq(v('{ code: "A", name: "x", category: "", unit: "장" }').valid, false);
    eq(v('{ code: "A", name: "x", category: "소모품", unit: "" }').valid, false);
  });
  check('거래처코드: 빈 값 허용, 미사용·미등록 코드는 거절', () => {
    eq(v('{ code: "A", name: "x", category: "소모품", unit: "장", vendorCode: "" }').valid, true);
    eq(v('{ code: "A", name: "x", category: "소모품", unit: "장", vendorCode: "VND-002" }').valid, false);
    eq(v('{ code: "A", name: "x", category: "소모품", unit: "장", vendorCode: "VND-999" }').valid, false);
  });
  check('과세구분은 과세/비과세만', () => {
    eq(v('{ code: "A", name: "x", category: "소모품", unit: "장", taxType: "면세" }').valid, false);
    eq(v('{ code: "A", name: "x", category: "소모품", unit: "장", taxType: "비과세" }').values.taxType, '비과세');
  });
  check('숫자 필드: 음수·문자 거절, 문자열 숫자는 변환', () => {
    eq(v('{ code: "A", name: "x", category: "소모품", unit: "장", unitPrice: -1 }').valid, false);
    eq(v('{ code: "A", name: "x", category: "소모품", unit: "장", initStock: "abc" }').valid, false);
    eq(v('{ code: "A", name: "x", category: "소모품", unit: "장", unitPrice: "1,000" }').valid, false);
    eq(v('{ code: "A", name: "x", category: "소모품", unit: "장", unitPrice: " 1200 " }').values.unitPrice, 1200);
  });
  check('사용유무는 사용/미사용만', () => eq(v('{ code: "A", name: "x", category: "소모품", unit: "장", usageStatus: "폐기" }').valid, false));
  check('중복 코드 거절 (existingCodes)', () => {
    eq(v('{ code: "IT-001", name: "x", category: "소모품", unit: "장" }', '{ existingCodes: new Set(["IT-001"]) }').valid, false);
  });
  check('partial: 넘긴 키만 검사하고 나머지는 요구하지 않는다', () => {
    const r = v('{ unitPrice: 900 }', '{ partial: true }');
    eq(r.valid, true, r.message); eq(Object.keys(r.values), ['unitPrice']);
    eq(v('{ category: "없는분류" }', '{ partial: true }').valid, false);
  });
}

// ── 2. 등록 ──
console.log('\n[2] addNewItem');
{
  const t = makeCtx({});
  check('유효한 등록은 마스터 3행에 25열로 쓰인다', () => {
    const r = run(t.ctx, 'addNewItem(TOKEN, ' + VALID + ')');
    eq(r.success, true, r.message); eq(r.code, 'IT-001');
    const row = masterRow(t.master, 3);
    eq(row[0], 'IT-001'); eq(row[1], '타월 40수'); eq(row[2], '소모품'); eq(row[4], '장');
    eq(row[6], 10); eq(row[7], 10); eq(row[10], 3); eq(row[18], 'VND-001'); eq(row[19], '과세'); eq(row[20], 1500); eq(row[24], '사용');
  });
  check('등록 이력: [신규 등록, -, 품목명, "신규 등록", 웹앱] 9열', () => {
    const rows = changelogRows(t.changelog);
    eq(rows.length, 1);
    const r = rows[0];
    ok(Object.prototype.toString.call(r[0]) === '[object Date]', '변경일시가 Date'); eq(r[1], '테스터'); // vm 렐름이 달라 instanceof는 못 쓴다
    eq(r.slice(2), ['IT-001', '타월 40수', '신규 등록', '-', '타월 40수', '신규 등록', '웹앱']);
  });
  check('reason을 주면 H열에 그대로 남는다', () => {
    const r = run(t.ctx, 'addNewItem(TOKEN, { code: "IT-002", name: "샴푸", category: "어메니티", unit: "개", reason: "신규 취급" })');
    eq(r.success, true, r.message);
    eq(changelogRows(t.changelog)[1].slice(7), ['신규 취급', '웹앱']);
  });
  check('중복 코드는 거절하고 아무것도 쓰지 않는다', () => {
    const before = changelogRows(t.changelog).length;
    const r = run(t.ctx, 'addNewItem(TOKEN, ' + VALID + ')');
    eq(r.success, false); ok(r.message.indexOf('이미 존재') >= 0, r.message);
    eq(changelogRows(t.changelog).length, before);
    eq(t.master.getRange(5, 1).getValue(), '');
  });
  check('카테고리 없는 등록은 거절한다', () => {
    eq(run(t.ctx, 'addNewItem(TOKEN, { code: "IT-003", name: "x", category: "없는분류", unit: "개" })').success, false);
  });
  check('staff는 등록할 수 없다 / 인증 없으면 거절', () => {
    const s = makeCtx({ role: 'staff' });
    eq(run(s.ctx, 'addNewItem(TOKEN, ' + VALID + ')').success, false);
    eq(run(s.ctx, 'addNewItem("BAD", ' + VALID + ')').success, false);
  });
  check('캐시가 비워져 다음 조회가 새 품목을 본다', () => {
    const list = run(t.ctx, 'getItemMasterData(TOKEN)');
    eq(list.map(i => i.code), ['IT-001', 'IT-002']);
  });
  check('이력 기록이 실패하면 마스터 행을 지우고 실패를 돌려준다 (원자성)', () => {
    const u = makeCtx({});
    u.ctx._appendChangelog = function () { throw new Error('시트 오류(모의)'); };
    const r = run(u.ctx, 'addNewItem(TOKEN, ' + VALID + ')');
    eq(r.success, false); ok(r.message.indexOf('변경이력') >= 0, r.message);
    const row = masterRow(u.master, 3);
    eq([row[0], row[1], row[4], row[20], row[24]].join(''), '', '마스터 3행 데이터 열이 비어 있어야 한다');
    ok(String(row[13]).indexOf('ARRAYFORMULA') >= 0, '되돌릴 때도 3행 수식은 남는다');
  });
}

// ── 3. 수정 ──
console.log('\n[3] updateItem');
{
  const t = makeCtx({});
  run(t.ctx, 'addNewItem(TOKEN, ' + VALID + ')');
  const base = changelogRows(t.changelog).length;
  check('사유가 없으면 거절한다', () => {
    const r = run(t.ctx, 'updateItem(TOKEN, "IT-001", { unitPrice: 1700 })');
    eq(r.success, false); ok(r.message.indexOf('변경사유') >= 0, r.message);
  });
  check('품목코드 변경 시도는 거절한다', () => {
    const r = run(t.ctx, 'updateItem(TOKEN, "IT-001", { code: "IT-9", reason: "x" })');
    eq(r.success, false); ok(r.message.indexOf('품목코드는 변경할 수 없습니다') >= 0, r.message);
  });
  check('실제로 바뀐 필드만 쓰고 이력에 남긴다 (같은 값은 이력 없음)', () => {
    const r = run(t.ctx, 'updateItem(TOKEN, "IT-001", { unitPrice: 1700, name: "타월 40수", grade: "40수", reason: "단가 인상" })');
    eq(r.success, true, r.message);
    eq(r.changes, [{ field: '매입단가', oldValue: 1500, newValue: 1700 }]);
    const rows = changelogRows(t.changelog);
    eq(rows.length, base + 1);
    eq(rows[base].slice(2), ['IT-001', '타월 40수', '매입단가', 1500, 1700, '단가 인상', '웹앱']);
    eq(masterRow(t.master, 3)[20], 1700);
  });
  check('수식 열(N~Q, V~X)은 건드리지 않는다 — 3행 ARRAYFORMULA 보존', () => {
    [14, 15, 16, 17, 22, 23, 24].forEach(c => ok(t.master.getRange(3, c).getFormula().indexOf('ARRAYFORMULA') >= 0, '열 ' + c));
  });
  check('변경된 것이 없으면 noChanges로 거절한다', () => {
    const r = run(t.ctx, 'updateItem(TOKEN, "IT-001", { unitPrice: 1700, reason: "x" })');
    eq(r.success, false); eq(r.noChanges, true);
  });
  check('없는 카테고리·미사용 거래처는 거절한다', () => {
    eq(run(t.ctx, 'updateItem(TOKEN, "IT-001", { category: "없는분류", reason: "x" })').success, false);
    eq(run(t.ctx, 'updateItem(TOKEN, "IT-001", { vendorCode: "VND-002", reason: "x" })').success, false);
  });
  check('없는 품목코드는 거절한다', () => eq(run(t.ctx, 'updateItem(TOKEN, "NOPE", { unitPrice: 1, reason: "x" })').success, false));
  check('usageStatus 미사용 → 이력 + 정렬(미사용이 아래로)', () => {
    run(t.ctx, 'addNewItem(TOKEN, { code: "IT-002", name: "샴푸", category: "어메니티", unit: "개" })');
    const r = run(t.ctx, 'updateItem(TOKEN, "IT-001", { usageStatus: "미사용", reason: "단종" })');
    eq(r.success, true, r.message);
    const rows = changelogRows(t.changelog);
    eq(rows[rows.length - 1].slice(4), ['사용유무', '사용', '미사용', '단종', '웹앱']);
    eq(masterRow(t.master, 3)[0], 'IT-002', '사용 품목이 위');
    eq(masterRow(t.master, 4)[0], 'IT-001'); eq(masterRow(t.master, 4)[24], '미사용');
  });
  check('usageStatus 사용으로 복귀 (재사용)', () => {
    const r = run(t.ctx, 'updateItem(TOKEN, "IT-001", { usageStatus: "사용", reason: "재취급" })');
    eq(r.success, true, r.message);
    eq(masterRow(t.master, 3)[0], 'IT-001'); eq(masterRow(t.master, 3)[24], '사용');
    const rows = changelogRows(t.changelog);
    eq(rows[rows.length - 1].slice(4), ['사용유무', '미사용', '사용', '재취급', '웹앱']);
  });
  check('초기재고가 바뀌면 재고를 다시 계산한다', () => {
    const before = t.ctx.__recalc;
    eq(run(t.ctx, 'updateItem(TOKEN, "IT-001", { initStock: 20, reason: "실사 반영" })').success, true);
    eq(t.ctx.__recalc, before + 1);
  });
  check('이력 기록이 실패하면 행을 이전 값으로 되돌린다 (원자성)', () => {
    const u = makeCtx({});
    run(u.ctx, 'addNewItem(TOKEN, ' + VALID + ')');
    u.ctx._appendChangelog = function () { throw new Error('시트 오류(모의)'); };
    const r = run(u.ctx, 'updateItem(TOKEN, "IT-001", { unitPrice: 9999, reason: "x" })');
    eq(r.success, false);
    eq(masterRow(u.master, 3)[20], 1500, '매입단가가 원래 값');
  });
  check('staff는 수정할 수 없다', () => {
    const s = makeCtx({ role: 'staff' });
    eq(run(s.ctx, 'updateItem(TOKEN, "IT-001", { unitPrice: 1, reason: "x" })').success, false);
  });
}

// ── 4. 비활성화 ──
console.log('\n[4] disableItemMaster (logChange 결함 수정)');
{
  const t = makeCtx({});
  run(t.ctx, 'addNewItem(TOKEN, ' + VALID + ')');
  check('비활성화 시 [사용유무, 사용, 미사용, (품목 비활성화), 웹앱] 이력이 남는다', () => {
    const r = run(t.ctx, 'disableItemMaster(TOKEN, "IT-001")');
    eq(r.success, true, r.message);
    const rows = changelogRows(t.changelog);
    eq(rows.length, 2);
    eq(rows[1].slice(2), ['IT-001', '타월 40수', '사용유무', '사용', '미사용', '(품목 비활성화)', '웹앱']);
    eq(masterRow(t.master, 3)[24], '미사용');
  });
  check('사유를 주면 그대로 남는다', () => {
    run(t.ctx, 'addNewItem(TOKEN, { code: "IT-002", name: "샴푸", category: "어메니티", unit: "개" })');
    eq(run(t.ctx, 'disableItemMaster(TOKEN, "IT-002", "공급 중단")').success, true);
    const rows = changelogRows(t.changelog);
    eq(rows[rows.length - 1][7], '공급 중단');
  });
  check('이미 미사용이면 안내하고 이력을 남기지 않는다', () => {
    const before = changelogRows(t.changelog).length;
    const r = run(t.ctx, 'disableItemMaster(TOKEN, "IT-001")');
    eq(r.success, false); ok(r.message.indexOf('이미 미사용') >= 0, r.message);
    eq(changelogRows(t.changelog).length, before);
  });
  check('없는 품목은 거절', () => eq(run(t.ctx, 'disableItemMaster(TOKEN, "NOPE")').success, false));
}

// ── 5. CSV 업로드 ──
console.log('\n[5] uploadItemMasterCSV');
{
  const t = makeCtx({});
  run(t.ctx, 'addNewItem(TOKEN, ' + VALID + ')');
  const base = changelogRows(t.changelog).length;
  check('한 행이라도 검증에 실패하면 전체를 중단하고 아무것도 쓰지 않는다', () => {
    t.ctx.csv = [['CSV-1', '품목A', '소모품', '', '개'], ['CSV-2', '품목B', '없는분류', '', '개'], ['CSV-3', '품목C', '소모품', '', '다스']];
    const r = run(t.ctx, 'uploadItemMasterCSV(TOKEN, csv)');
    eq(r.success, false); eq(r.errors.length, 2);
    ok(r.errors[0].indexOf('[CSV-2]') === 0 && r.errors[1].indexOf('[CSV-3]') === 0, r.errors.join(' | '));
    eq(masterRow(t.master, 4)[0], ''); eq(changelogRows(t.changelog).length, base);
    eq(t.env.__driveFiles.length, 0, '백업도 남기지 않는다');
  });
  check('신규만 추가하고 기존 코드는 건너뛴다 · 품목마다 CSV 경로 이력 · 업로드 전 스냅샷', () => {
    t.ctx.csv = [['IT-001', '타월(중복)', '소모품', '', '장'], ['CSV-1', '품목A', '소모품', '', '개', '5', '', '', '', '비과세', '300'], ['CSV-2', '품목B', '음료', '500ml', '병']];
    const r = run(t.ctx, 'uploadItemMasterCSV(TOKEN, csv)');
    eq(r.success, true, r.message); eq(r.added, 2); eq(r.ignored, 1);
    ok(r.message.indexOf('2건 신규 등록, 1건 무시(중복)') >= 0, r.message);
    const a = masterRow(t.master, 4), b = masterRow(t.master, 5);
    eq([a[0], a[1], a[2], a[4], a[6], a[7], a[10], a[19], a[20], a[24]], ['CSV-1', '품목A', '소모품', '개', 5, 5, 3, '비과세', 300, '사용']);
    eq([b[0], b[3], b[4], b[19], b[20]], ['CSV-2', '500ml', '병', '과세', 0]);
    const rows = changelogRows(t.changelog);
    eq(rows.length, base + 2);
    eq(rows[base].slice(2), ['CSV-1', '품목A', '신규 등록', '-', '품목A', 'CSV 일괄 등록', 'CSV']);
    eq(rows[base + 1].slice(2), ['CSV-2', '품목B', '신규 등록', '-', '품목B', 'CSV 일괄 등록', 'CSV']);
    eq(t.env.__driveFiles.length, 1);
    ok(t.env.__driveFiles[0].name.indexOf('품목마스터_업로드전_') === 0, t.env.__driveFiles[0].name);
    eq(t.env.__driveFiles[0].folder, '시스템_데이터_백업');
    ok(t.env.__driveFiles[0].content.indexOf('"IT-001"') >= 0, '스냅샷에 업로드 전 마스터 내용이 있다');
    ok(r.backupFile === t.env.__driveFiles[0].name, 'backupFile 응답');
  });
  check('추가할 것이 없으면(전부 중복) 백업 없이 0건 완료', () => {
    const files = t.env.__driveFiles.length;
    t.ctx.csv = [['IT-001', 'x', '소모품', '', '장']];
    const r = run(t.ctx, 'uploadItemMasterCSV(TOKEN, csv)');
    eq(r.success, true); eq(r.added, 0); eq(r.ignored, 1); eq(t.env.__driveFiles.length, files);
  });
  check('같은 CSV 안의 중복 코드는 두 번째가 무시된다', () => {
    t.ctx.csv = [['CSV-9', 'a', '소모품', '', '개'], ['CSV-9', 'b', '소모품', '', '개']];
    const r = run(t.ctx, 'uploadItemMasterCSV(TOKEN, csv)');
    eq(r.success, true, r.message); eq(r.added, 1); eq(r.ignored, 1);
  });
  check('백업이 실패하면 업로드를 중단한다', () => {
    const u = makeCtx({});
    u.ctx.backupMasterSnapshot = function () { throw new Error('Drive 오류(모의)'); };
    u.ctx.csv = [['CSV-1', '품목A', '소모품', '', '개']];
    const r = run(u.ctx, 'uploadItemMasterCSV(TOKEN, csv)');
    eq(r.success, false); ok(r.message.indexOf('백업') >= 0, r.message);
    eq(masterRow(u.master, 3)[0], '');
  });
  check('이력 기록이 실패하면 추가한 행을 지운다 (원자성)', () => {
    const u = makeCtx({});
    u.ctx._appendChangelog = function () { throw new Error('시트 오류(모의)'); };
    u.ctx.csv = [['CSV-1', '품목A', '소모품', '', '개'], ['CSV-2', '품목B', '소모품', '', '개']];
    const r = run(u.ctx, 'uploadItemMasterCSV(TOKEN, csv)');
    eq(r.success, false);
    eq(masterRow(u.master, 3)[0], ''); eq(masterRow(u.master, 4)[0], '');
  });
  check('[TASK-026] 옛 시트 대화상자 우회 토큰(SHEET_UI)은 더 이상 통하지 않는다 — 세션만 받는다', () => {
    const u = makeCtx({});
    u.ctx.validateSession = function (token) { return token === 'GOOD' ? { name: '테스터', username: 'tester', role: 'admin' } : null; };
    u.ctx.csv = [['CSV-1', '품목A', '소모품', '', '개']];
    eq(run(u.ctx, 'uploadItemMasterCSV("SHEET_UI", csv)').success, false);
    eq(changelogRows(u.changelog).length, 0);
    eq(run(u.ctx, 'uploadItemMasterCSV(TOKEN, csv)').success, true);
    eq(changelogRows(u.changelog)[0][1], '테스터');
  });
  check('staff·빈 배열은 거절', () => {
    const s = makeCtx({ role: 'staff' });
    s.ctx.csv = [['CSV-1', '품목A', '소모품', '', '개']];
    eq(run(s.ctx, 'uploadItemMasterCSV(TOKEN, csv)').success, false);
    eq(run(t.ctx, 'uploadItemMasterCSV(TOKEN, [])').success, false);
  });
}

// ── 6. 조회 ──
console.log('\n[6] getItemChangelog · getItemMasterData');
{
  const t = makeCtx({});
  run(t.ctx, 'addNewItem(TOKEN, ' + VALID + ')');
  run(t.ctx, 'updateItem(TOKEN, "IT-001", { unitPrice: 1700, reason: "단가 인상" })');
  run(t.ctx, 'disableItemMaster(TOKEN, "IT-001", "단종")');
  check('getItemChangelog: 품목별 · 최근순 · reason/route 포함', () => {
    const r = run(t.ctx, 'getItemChangelog(TOKEN, "IT-001")');
    eq(r.success, true); eq(r.records.length, 3);
    eq(r.records.map(x => x.field), ['사용유무', '매입단가', '신규 등록']);
    eq(r.records[0].reason, '단종'); eq(r.records[0].route, '웹앱');
    eq(r.records[1].oldValue, 1500); eq(r.records[1].newValue, 1700);
    eq(r.records[2].reason, '신규 등록');
  });
  check('getItemChangelog: 다른 품목·없는 품목은 빈 배열', () => {
    eq(run(t.ctx, 'getItemChangelog(TOKEN, "NOPE").records'), []);
  });
  check('getItemMasterData 기본은 미사용 제외 (기존 계약), includeDisabled면 포함 + usageStatus', () => {
    run(t.ctx, 'addNewItem(TOKEN, { code: "IT-002", name: "샴푸", category: "어메니티", unit: "개" })');
    eq(run(t.ctx, 'getItemMasterData(TOKEN)').map(i => i.code), ['IT-002']);
    const all = run(t.ctx, 'getItemMasterData(TOKEN, { includeDisabled: true })');
    eq(all.map(i => [i.code, i.usageStatus]), [['IT-001', '미사용'], ['IT-002', '사용']]); // 비활성화 시점엔 1행뿐이라 정렬 없음
  });
  check('includeDisabled 목록도 쓰기 후 캐시가 비워진다', () => {
    run(t.ctx, 'getItemMasterData(TOKEN, { includeDisabled: true })');
    run(t.ctx, 'updateItem(TOKEN, "IT-001", { usageStatus: "사용", reason: "재취급" })');
    const all = run(t.ctx, 'getItemMasterData(TOKEN, { includeDisabled: true })');
    eq(all.map(i => i.usageStatus), ['사용', '사용']);
  });
}

// ── 7. 마이그레이션 v19 ──
console.log('\n[7] MIGRATIONS[19]');
{
  const t = makeCtx({});
  // 옛 7열 시트를 흉내낸다: 헤더 A~G만, 데이터 1행
  const cl = t.changelog;
  cl.getRange(1, 1, 1, 9).breakApart();
  cl.getRange(1, 8, 2, 2).clearContent();
  cl.getRange(3, 1, 1, 7).setValues([[new Date(2026, 0, 1), '옛편집자', 'OLD-1', '옛품목', '품목명', 'a', 'b']]);
  check('7열 시트에 v19를 돌리면 H·I 헤더가 생기고 기존 행은 보존된다', () => {
    run(t.ctx, 'MIGRATIONS[19](ss0)');
    eq(cl.getRange(2, 8, 1, 2).getValues()[0], ['변경사유', '경로']);
    eq(cl.getRange(3, 1, 1, 9).getValues()[0].slice(1), ['옛편집자', 'OLD-1', '옛품목', '품목명', 'a', 'b', '', '']);
    eq(cl.merges.indexOf('A1:I1') >= 0, true);
  });
  check('두 번 돌려도 같다 (멱등)', () => {
    run(t.ctx, 'MIGRATIONS[19](ss0)');
    eq(cl.getRange(2, 1, 1, 9).getValues()[0][8], '경로');
    eq(cl.getLastRow(), 3);
  });
  check('시트가 없으면 새로 만든다', () => {
    t.ss.deleteSheet(cl);
    run(t.ctx, 'MIGRATIONS[19](ss0)');
    const fresh = t.ss.getSheetByName(CHANGELOG);
    ok(fresh, '시트 생성'); eq(fresh.getRange(2, 9).getValue(), '경로');
  });
  check('CURRENT_SCHEMA_VERSION은 19', () => eq(run(t.ctx, 'CURRENT_SCHEMA_VERSION'), 19));
  check('옛 7열 이력도 getItemChangelog가 읽는다 (H·I는 빈 값)', () => {
    const u = makeCtx({});
    const s = u.changelog;
    s.getRange(3, 1, 1, 7).setValues([[new Date(2026, 0, 1), '옛편집자', 'OLD-1', '옛품목', '품목명', 'a', 'b']]);
    const r = run(u.ctx, 'getItemChangelog(TOKEN, "OLD-1")');
    eq(r.records.length, 1); eq(r.records[0].reason, ''); eq(r.records[0].route, '');
  });
}

// ── 8. 정렬 — 비파괴 · 수식 보존 · 원복 ──
console.log('\n[8] _sortMasterByUsageStatus (TASK-024 재작성)');
{
  const SORT = '_sortMasterByUsageStatus(ss0.getSheetByName("' + MASTER + '"))';
  const seed = (t) => {
    run(t.ctx, 'addNewItem(TOKEN, { code: "IT-003", name: "c", category: "소모품", unit: "개" })');
    run(t.ctx, 'addNewItem(TOKEN, { code: "IT-001", name: "a", category: "소모품", unit: "개" })');
    run(t.ctx, 'addNewItem(TOKEN, { code: "IT-002", name: "b", category: "소모품", unit: "개" })');
  };
  const codes = (t) => [3, 4, 5].map(r => masterRow(t.master, r)[0]);
  const FORMULA_COLS = [14, 15, 16, 17, 22, 23, 24]; // N,O,P,Q,V,W,X
  check('코드 순으로 정렬하고 3행 ARRAYFORMULA(N~Q, V~X)는 그대로 둔다', () => {
    const t = makeCtx({}); seed(t);
    const before = FORMULA_COLS.map(c => t.master.getRange(3, c).getFormula());
    ok(before.every(f => f.indexOf('ARRAYFORMULA') >= 0), '3행에 수식이 있어야 한다: ' + JSON.stringify(before));
    eq(run(t.ctx, SORT), true);
    eq(codes(t), ['IT-001', 'IT-002', 'IT-003']);
    eq(FORMULA_COLS.map(c => t.master.getRange(3, c).getFormula()), before, '수식 보존');
    eq(masterRow(t.master, 3)[1], 'a'); eq(masterRow(t.master, 5)[1], 'c');
  });
  check('이미 정렬돼 있으면 false — 아무것도 쓰지 않는다', () => {
    const t = makeCtx({}); seed(t);
    run(t.ctx, SORT);
    let writes = 0;
    const orig = t.master.getRange.bind(t.master);
    t.master.getRange = function () {
      const r = orig.apply(this, arguments);
      const sv = r.setValues.bind(r);
      r.setValues = function (v) { writes++; return sv(v); };
      return r;
    };
    eq(run(t.ctx, SORT), false);
    eq(writes, 0);
  });
  check('미사용은 아래로, 정렬 뒤 드롭다운 검증이 다시 걸리고 재고를 재계산한다', () => {
    const t = makeCtx({}); seed(t);
    run(t.ctx, 'updateItem(TOKEN, "IT-001", { usageStatus: "미사용", reason: "x" })');
    eq(codes(t), ['IT-002', 'IT-003', 'IT-001']);
    ok(t.master.getRange(3, 3).getDataValidation(), 'C열 검증 복원');
    ok(t.master.getRange(5, 25).getDataValidation(), 'Y열 검증 복원');
    eq(t.ctx.__recalc, 1, '행이 움직였으니 재계산 1회');
  });
  check('쓰기 도중 실패하면 원래 순서로 되돌리고 throw — updateItem은 변경 저장 + 정렬 실패 안내', () => {
    const t = makeCtx({}); seed(t);
    const orig = t.master.getRange.bind(t.master);
    let armed = true;
    t.master.getRange = function (r, c, nr, nc) {
      const rg = orig.apply(this, arguments);
      if (armed && r === 3 && c === 19 && nc === 3) { // 세 번째 블록(S:U)에서 터진다
        rg.setValues = function () { armed = false; throw new Error('데이터 확인 규칙 위반(모의)'); };
      }
      return rg;
    };
    const res = run(t.ctx, 'updateItem(TOKEN, "IT-001", { usageStatus: "미사용", reason: "x" })');
    eq(res.success, true, res.message); ok(res.message.indexOf('정렬에 실패') >= 0, res.message);
    eq(codes(t), ['IT-003', 'IT-001', 'IT-002'], '원래 순서로 원복');
    eq(masterRow(t.master, 4)[24], '미사용', '변경 자체는 저장됨');
    eq(changelogRows(t.changelog).length, 4, '이력도 남음');
    eq(t.ctx.__recalc, 0, '옮기지 못했으니 재계산 없음');
  });
}


// ───────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────');
if (fail > 0) {
  console.log('✗ ' + fail + '개 검증 실패 (통과 ' + pass + ')');
  process.exit(1);
}
console.log('✓ TASK-024 (품목 API · 변경이력 9열) 검증 통과 — ' + pass + '개');
