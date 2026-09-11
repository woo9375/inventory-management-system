/**
 * [TASK-018] VendorService — 거래처 CRUD 검증
 *
 * 핵심은 삭제 규칙이다. 품목 마스터(S열)가 참조 중인 거래처를 물리 삭제하면
 * 그 품목의 거래처코드가 어디도 가리키지 않는 미아가 된다. 그래서 서비스는
 * "참조 중이면 거절하고 논리 삭제(미사용)로 유도"한다.
 *
 * 함께 보는 것: 채번(중간 행이 지워져도 번호가 재사용되지 않는가), 이름 중복,
 * 권한 경계, 그리고 삭제가 숨김 N열의 드롭다운 소스 수식을 날려먹지 않는가.
 *
 * 실제 `src/*.gs`를 vm에 로드하고 tests/unit/lib/gas-sheet-mock.js로 Sheets를 모킹한다.
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

/**
 * v17까지 마이그레이션된 스프레드시트를 만든다.
 * @param {object} opts role: 세션 역할, masterVendorCodes: 품목별 거래처코드(S열)
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
  // 세션 스텁은 .gs 로드 **뒤에** 꽂는다.
  //   RBAC.gs의 top-level function validateSession 선언이 전역 객체의 같은 이름을 덮어쓰므로,
   //  로드 전에 넣으면 조용히 사라지고 전 API가 "관리자 권한이 필요합니다"로 떨어진다.
  ctx.validateSession = function (token) {
    if (token === 'BAD') return null;
    return { name: '테스터', username: 'tester', role: o.role || 'admin' };
  };

  ctx.ss0 = ss;
  ctx.TOKEN = 'GOOD';

  // 기초데이터 → 거래처 → 품목 마스터 순서 (품목 마스터의 거래처 드롭다운이 거래처 시트를 본다)
  vm.runInContext('buildBaseDataSheet(ss0); buildVendors(ss0); buildSeasonsSheet(ss0); buildItemMaster(ss0)', ctx);

  const master = ss.getSheetByName('🗂️ 품목 마스터');
  const vendorCodes = o.masterVendorCodes || [];
  vendorCodes.forEach(function (vc, i) {
    const row = 3 + i;
    master.getRange(row, 1).setValue('IT-' + ('00' + (i + 1)).slice(-3));
    master.getRange(row, 2).setValue('품목' + (i + 1));
    if (vc) master.getRange(row, 19).setValue(vc); // S열 = MASTER_COLS.VENDOR_CODE + 1
  });

  return { ss: ss, ctx: ctx, env: env, vendors: ss.getSheetByName('🤝 거래처관리'), master: master };
}

const run = (ctx, expr) => vm.runInContext(expr, ctx);

// ───────────────────────────────────────────────────────────────
console.log('[TASK-018] VendorService — 거래처 CRUD');

// ── 1. 조회 ──
console.log('\n[1] 조회 (getVendors)');
{
  const t = makeCtx({ role: 'staff' });
  check('빈 시트에서도 실패하지 않고 빈 배열을 준다', () => {
    const r = run(t.ctx, 'getVendors(TOKEN)');
    eq(r.success, true); eq(r.vendors, []);
  });
  check('staff도 조회할 수 있다 (다른 모듈이 코드→이름을 되찾아야 한다)', () => {
    eq(run(t.ctx, 'getVendors(TOKEN).userRole'), 'staff');
  });
  check('인증 없으면 거절한다', () => {
    eq(run(t.ctx, 'getVendors("BAD").success'), false);
  });
}

// ── 2. 등록 / 채번 ──
console.log('\n[2] 등록 · 자동 채번 (addVendor)');
{
  const t = makeCtx({});
  check('첫 등록은 VND-001을 받는다', () => {
    const r = run(t.ctx, 'addVendor(TOKEN, { name: "가나상사" })');
    eq(r.success, true, r.message); eq(r.code, 'VND-001');
  });
  check('연속 등록은 번호가 증가한다', () => {
    eq(run(t.ctx, 'addVendor(TOKEN, { name: "다라식품" }).code'), 'VND-002');
    eq(run(t.ctx, 'addVendor(TOKEN, { name: "마바유통" }).code'), 'VND-003');
  });
  check('시트에 13열이 그대로 기록된다', () => {
    const row = t.vendors.getRange(3, 1, 1, 13).getValues()[0];
    eq(row[0], 'VND-001'); eq(row[1], '가나상사'); eq(row[12], '사용');
  });
  check('전 필드가 각자 열에 들어간다', () => {
    const r = run(t.ctx, 'addVendor(TOKEN, { name: "사아상회", shortName: "사아", bizNo: "123-45-67890",' +
      ' ceo: "홍길동", bizType: "도소매", bizItem: "식자재", address: "경북 울진군", phone: "054-000-0000",' +
      ' email: "a@b.c", bizEntity: "법인", note: "메모" })');
    eq(r.success, true, r.message);
    const row = t.vendors.getRange(6, 1, 1, 13).getValues()[0];
    eq(row, ['VND-004', '사아상회', '사아', '123-45-67890', '홍길동', '도소매', '식자재',
             '경북 울진군', '054-000-0000', 'a@b.c', '법인', '메모', '사용']);
  });
  check('거래처명 중복은 거절한다', () => {
    const r = run(t.ctx, 'addVendor(TOKEN, { name: "가나상사" })');
    eq(r.success, false);
    if (!/이미 등록된/.test(r.message)) throw new Error(r.message);
  });
  check('공백·대소문자만 다른 이름도 중복으로 본다', () => {
    eq(run(t.ctx, 'addVendor(TOKEN, { name: "  가나상사 " }).success'), false);
  });
  check('거래처명이 없으면 거절한다', () => {
    eq(run(t.ctx, 'addVendor(TOKEN, { name: "   " }).success'), false);
  });
  check('중간 번호가 비어도 채번은 최대값+1이다 (번호 재사용 금지)', () => {
    // VND-002 행을 지워도 다음 채번은 005여야 한다 — 002를 다시 주면 남의 품목을 가리키게 된다
    t.vendors.getRange(4, 1, 1, 13).setValues([new Array(13).fill('')]);
    eq(run(t.ctx, 'addVendor(TOKEN, { name: "자차물산" }).code'), 'VND-005');
  });
  check('쓰기 직후 조회에 새 거래처가 곧바로 보인다 (캐시 무효화)', () => {
    var before = run(t.ctx, 'getVendors(TOKEN).vendors.length');   // 캐시 채우기
    run(t.ctx, 'addVendor(TOKEN, { name: "캐시상사" })');
    var after = run(t.ctx, 'getVendors(TOKEN).vendors.length');
    eq(after, before + 1, '등록 후 목록 건수');
  });
}

// ── 3. 권한 ──
console.log('\n[3] 권한 경계');
{
  ['staff', 'manager'].forEach(function (role) {
    const t = makeCtx({ role: role });
    check(role + '는 등록/수정/삭제가 모두 막힌다', () => {
      eq(run(t.ctx, 'addVendor(TOKEN, { name: "x" }).success'), false);
      eq(run(t.ctx, 'updateVendor(TOKEN, "VND-001", { name: "x" }).success'), false);
      eq(run(t.ctx, 'deleteVendor(TOKEN, "VND-001").success'), false);
    });
  });
}

// ── 4. 수정 ──
console.log('\n[4] 수정 (updateVendor)');
{
  const t = makeCtx({});
  run(t.ctx, 'addVendor(TOKEN, { name: "가나상사", phone: "054-111-1111" })');
  run(t.ctx, 'addVendor(TOKEN, { name: "다라식품" })');

  check('필드가 갱신된다', () => {
    const r = run(t.ctx, 'updateVendor(TOKEN, "VND-001", { name: "가나상사", phone: "054-222-2222", ceo: "김대표" })');
    eq(r.success, true, r.message);
    const row = t.vendors.getRange(3, 1, 1, 13).getValues()[0];
    eq(row[8], '054-222-2222', '전화'); eq(row[4], '김대표', '대표자명');
  });
  check('이름을 그대로 두고 다른 필드만 고쳐도 자기 중복으로 막히지 않는다', () => {
    eq(run(t.ctx, 'updateVendor(TOKEN, "VND-001", { name: "가나상사", note: "메모" }).success'), true);
  });
  check('다른 거래처의 이름으로는 바꿀 수 없다', () => {
    const r = run(t.ctx, 'updateVendor(TOKEN, "VND-001", { name: "다라식품" })');
    eq(r.success, false);
    if (!/이미 등록된/.test(r.message)) throw new Error(r.message);
  });
  check('거래처코드는 바뀌지 않는다 (품목이 참조 중인 키)', () => {
    run(t.ctx, 'updateVendor(TOKEN, "VND-001", { name: "가나상사", code: "VND-999" })');
    eq(t.vendors.getRange(3, 1).getValue(), 'VND-001');
  });
  check('사용여부를 미사용으로 바꿀 수 있다 (논리 삭제 경로)', () => {
    run(t.ctx, 'updateVendor(TOKEN, "VND-001", { name: "가나상사", usageStatus: "미사용" })');
    eq(t.vendors.getRange(3, 13).getValue(), '미사용');
  });
  check('없는 코드는 거절한다', () => {
    eq(run(t.ctx, 'updateVendor(TOKEN, "VND-404", { name: "x" }).success'), false);
  });
}

// ── 5. 삭제 — 이 Task의 핵심 규칙 ──
console.log('\n[5] 삭제 (deleteVendor) — 품목 참조 검사');
{
  const t = makeCtx({});
  run(t.ctx, 'addVendor(TOKEN, { name: "가나상사" })');   // VND-001
  run(t.ctx, 'addVendor(TOKEN, { name: "다라식품" })');   // VND-002
  // 품목 마스터 S열이 VND-001을 참조하게 한다
  t.master.getRange(3, 1).setValue('IT-001');
  t.master.getRange(3, 2).setValue('수건');
  t.master.getRange(3, 19).setValue('VND-001');

  check('사용 중인 거래처는 물리 삭제를 거절한다', () => {
    const r = run(t.ctx, 'deleteVendor(TOKEN, "VND-001")');
    eq(r.success, false);
    eq(r.inUse, true);
    eq(r.itemCount, 1);
  });
  check('거절 메시지가 막고 있는 품목과 대안(미사용)을 알려준다', () => {
    const r = run(t.ctx, 'deleteVendor(TOKEN, "VND-001")');
    if (!/IT-001/.test(r.message)) throw new Error('품목코드가 없다: ' + r.message);
    if (!/미사용/.test(r.message)) throw new Error('대안 안내가 없다: ' + r.message);
  });
  check('거절된 거래처는 시트에 그대로 남는다', () => {
    eq(t.vendors.getRange(3, 1).getValue(), 'VND-001');
  });
  check('사용 중이 아닌 거래처는 물리 삭제된다', () => {
    const r = run(t.ctx, 'deleteVendor(TOKEN, "VND-002")');
    eq(r.success, true, r.message);
    const codes = t.vendors.getRange(3, 1, 5, 1).getValues().flat().filter(Boolean);
    eq(codes, ['VND-001'], '남은 코드');
  });
  check('삭제해도 드롭다운 소스(숨김 N열)의 FILTER 수식이 살아 있다', () => {
    // deleteRow는 그 행의 모든 셀을 지운다. 3행을 지웠다면 N3의 수식까지 사라져
    // 품목 마스터의 거래처 드롭다운이 통째로 비게 된다.
    const f = t.vendors.getRange(3, 14).getFormula();
    if (!/FILTER/.test(f)) throw new Error('N3 FILTER 수식이 사라졌다: ' + JSON.stringify(f));
  });
  check('3행(수식이 있는 행)을 지워도 소스 수식이 복구된다', () => {
    const t2 = makeCtx({});
    run(t2.ctx, 'addVendor(TOKEN, { name: "혼자상사" })'); // 3행에 들어간다
    eq(run(t2.ctx, 'deleteVendor(TOKEN, "VND-001").success'), true);
    const f = t2.vendors.getRange(3, 14).getFormula();
    if (!/FILTER/.test(f)) throw new Error('N3 FILTER 수식이 복구되지 않았다: ' + JSON.stringify(f));
  });
  check('없는 코드는 거절한다', () => {
    eq(run(t.ctx, 'deleteVendor(TOKEN, "VND-404").success'), false);
  });
}

// ── 6. 마이그레이션 전 상태에서의 안전장치 ──
console.log('\n[6] v17 이전 구조에서의 안전장치');
{
  // 품목 마스터가 아직 24열이면 MASTER_COLS.VENDOR_CODE(18)는 거래처코드가 아니라 과세구분 열이다.
  // 그 값을 믿고 "참조 없음"으로 판정하면 사용 중인 거래처가 지워진다.
  const t = makeCtx({});
  run(t.ctx, 'addVendor(TOKEN, { name: "가나상사" })');
  const master = t.master;
  master.getRange(2, 25).setValue(''); // 사용유무 헤더를 지워 v17 이전 구조처럼 보이게 한다

  check('참조 판정이 불가능하면 삭제를 거절한다 (조용히 지우지 않는다)', () => {
    const r = run(t.ctx, 'deleteVendor(TOKEN, "VND-001")');
    eq(r.success, false);
    if (!/마이그레이션/.test(r.message)) throw new Error(r.message);
  });
  check('거절된 거래처는 시트에 그대로 남는다', () => {
    eq(t.vendors.getRange(3, 1).getValue(), 'VND-001');
  });
}

// ── 7. WebApp 래퍼 ──
console.log('\n[7] WebApp 공개 래퍼');
{
  const t = makeCtx({});
  check('공개 이름과 구현 이름이 서로 달라 무한 재귀가 없다', () => {
    // 같은 이름을 WebApp.gs와 VendorService.gs 양쪽에 두면 전역 스코프가 하나라 뒤에 로드된 쪽이
    // 이기고, 래퍼가 자기 자신을 불러 스택이 터진다. 실제로 호출해 그 사고가 없음을 확인한다.
    const r = run(t.ctx, 'addVendor(TOKEN, { name: "래퍼상사" })');
    eq(r.success, true, r.message);
    eq(run(t.ctx, 'getVendors(TOKEN).vendors.length'), 1);
  });
  check('4개 래퍼가 모두 존재한다', () => {
    ['getVendors', 'addVendor', 'updateVendor', 'deleteVendor'].forEach(function (fn) {
      eq(run(t.ctx, 'typeof ' + fn), 'function', fn);
    });
  });
}

console.log('\n─────────────────────────────');
if (fail > 0) {
  console.error('✗ ' + fail + '개 검증 실패 (통과 ' + pass + ')');
  process.exit(1);
}
console.log('✓ TASK-018 (거래처 CRUD) 검증 통과 — ' + pass + '개');
