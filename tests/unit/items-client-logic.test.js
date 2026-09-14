/**
 * [TASK-025] 품목 관리 화면(src/JS_Items.html)의 순수 로직 — 조회 인자 · 변경 diff · 폼 검증 · CSV 파싱
 *
 * JS_Items.html의 <script> 본문을 그대로 vm에 넣고 돌린다. 파일 상단은 상수·함수 선언뿐이라 DOM 없이 로드된다.
 * ITEM_UI는 실제 Config.gs의 getItemUiConfigJson()으로 만든다 — 화면 폴백값이 아니라 서버가 주입하는 값으로 검증한다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');

// 서버 상수 → ITEM_UI (Index.html이 주입하는 것과 같은 값)
const cfg = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(SRC, 'Config.gs'), 'utf8'), cfg, { filename: 'Config.gs' });
const ITEM_UI = JSON.parse(vm.runInContext('getItemUiConfigJson()', cfg));

// JS_Items.html <script> 본문 로드 — DOM/google은 순수 함수가 쓰지 않으므로 최소 스텁만 둔다
const html = fs.readFileSync(path.join(SRC, 'JS_Items.html'), 'utf8');
const m = /<script>([\s\S]*)<\/script>/.exec(html);
assert.ok(m, 'JS_Items.html에 <script> 블록이 없다');
const ctx = vm.createContext({
  console, ITEM_UI,
  document: { getElementById: () => null, querySelector: () => null },
  google: { script: { run: {} } },
  setTimeout, clearTimeout
});
vm.runInContext(m[1], ctx, { filename: 'JS_Items.html' });
const run = (expr) => vm.runInContext(expr, ctx);

// vm 안에서 만든 배열/객체는 이쪽 realm의 프로토타입이 아니라 deepStrictEqual이 실패한다 — JSON으로 비교한다
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((what || '') + ' 기대 ' + b + ' / 실제 ' + a);
}

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n        ' + e.message); fail++; }
}

console.log('[TASK-025] JS_Items 순수 로직');

// ── itemQueryParams ──
check('itemQueryParams: 검색어 trim, usage 기본 사용, page 하한 1, pageSize는 ITEM_UI, withCatalog 불리언', () => {
  eq(run('itemQueryParams({ q: "  타월 ", category: "", usage: "" }, 0, 1)'),
    { q: '타월', category: '', usage: '사용', page: 1, pageSize: ITEM_UI.pageSize, withCatalog: true });
  eq(run('itemQueryParams({ q: "", category: "소모품", usage: "all" }, 3, undefined)'),
    { q: '', category: '소모품', usage: 'all', page: 3, pageSize: ITEM_UI.pageSize, withCatalog: false });
  assert.strictEqual(run('itemQueryParams(null, 2).page'), 2);
});

// ── computeItemDiff ──
const ORIGINAL = '{ code: "IT-001", name: "타월", category: "소모품", grade: "", unit: "장", vendorCode: "", taxType: "과세", initStock: 10, unitPrice: 1500, leadTime: 3, safetyDays: 5, targetDays: 30, usageStatus: "사용" }';
check('computeItemDiff: 같은 값이면 빈 배열 — 숫자 "1500"과 1500, 빈 숫자와 서버 기본값은 같은 값', () => {
  eq(run('computeItemDiff(' + ORIGINAL + ', { name: "타월", unitPrice: "1500", initStock: "10", leadTime: "", safetyDays: "5", targetDays: "" })'), []);
  eq(run('computeItemDiff(' + ORIGINAL + ', { name: " 타월 ", grade: "" })'), []);
});
check('computeItemDiff: 달라진 필드만, 라벨은 ITEM_UI.fieldLabels, 순서는 ITEM_FORM_FIELDS 순', () => {
  const diff = run('computeItemDiff(' + ORIGINAL + ', { unitPrice: "1800", name: "타월 40수", vendorCode: "VND-001", grade: "40수" })');
  eq(diff.map((d) => d.field), ['name', 'grade', 'vendorCode', 'unitPrice']);
  eq(diff[0], { field: 'name', label: ITEM_UI.fieldLabels.name, oldValue: '타월', newValue: '타월 40수' });
  eq(diff[3], { field: 'unitPrice', label: ITEM_UI.fieldLabels.unitPrice, oldValue: 1500, newValue: 1800 });
});
check('computeItemDiff: 빈 숫자 입력 → 기본값으로 비교 (리드타임 3인 품목에 "" 는 변경 아님, 7이면 변경)', () => {
  eq(run('computeItemDiff(' + ORIGINAL + ', { leadTime: "" })'), []);
  const d = run('computeItemDiff(' + ORIGINAL + ', { leadTime: "7" })');
  assert.strictEqual(d.length, 1); assert.strictEqual(d[0].newValue, 7);
});
check('computeItemDiff: 폼에 없는 필드·품목코드·사용유무는 보지 않는다', () => {
  eq(run('computeItemDiff(' + ORIGINAL + ', { code: "OTHER", usageStatus: "미사용" })'), []);
  eq(run('computeItemDiff(' + ORIGINAL + ', {})'), []);
  eq(run('computeItemDiff(null, { name: "x" })')[0].oldValue, '');
});

// ── validateItemForm ──
const VALID = '{ code: "IT-100", name: "수건", category: "소모품", unit: "장", taxType: "과세", unitPrice: "1000", initStock: "", leadTime: "3" }';
check('validateItemForm(add): 유효 → valid, 코드 공백/포함 공백·품목명·카테고리·단위 빈 값은 거절', () => {
  assert.strictEqual(run('validateItemForm(' + VALID + ', "add").valid'), true);
  assert.match(run('validateItemForm(Object.assign({}, ' + VALID + ', { code: " " }), "add").message'), /품목코드/);
  assert.match(run('validateItemForm(Object.assign({}, ' + VALID + ', { code: "IT 100" }), "add").message'), /공백/);
  assert.match(run('validateItemForm(Object.assign({}, ' + VALID + ', { name: "" }), "add").message'), /품목명/);
  assert.match(run('validateItemForm(Object.assign({}, ' + VALID + ', { category: "" }), "add").message'), /카테고리/);
  assert.match(run('validateItemForm(Object.assign({}, ' + VALID + ', { unit: "" }), "add").message'), /단위/);
});
check('validateItemForm: 숫자 음수·문자 거절(라벨로 안내), 빈 숫자 허용, 과세구분 목록 밖 거절, edit는 코드를 보지 않는다', () => {
  assert.match(run('validateItemForm(Object.assign({}, ' + VALID + ', { unitPrice: "-1" }), "add").message'), new RegExp(ITEM_UI.fieldLabels.unitPrice));
  assert.match(run('validateItemForm(Object.assign({}, ' + VALID + ', { initStock: "abc" }), "add").message'), new RegExp(ITEM_UI.fieldLabels.initStock));
  assert.strictEqual(run('validateItemForm(Object.assign({}, ' + VALID + ', { unitPrice: "" }), "add").valid'), true);
  assert.match(run('validateItemForm(Object.assign({}, ' + VALID + ', { taxType: "면세" }), "add").message'), /과세구분/);
  assert.strictEqual(run('validateItemForm(Object.assign({}, ' + VALID + ', { code: "" }), "edit").valid'), true);
});

// ── detectItemCsvHeader / normalizeItemCsvRows ──
check('detectItemCsvHeader: 한글·영문 별칭, 열 순서 무관, 코드/품목명 없으면 null', () => {
  eq(run('detectItemCsvHeader(["품목명", "품목코드", "단위", "카테고리", "매입단가"])'),
    { name: 0, code: 1, unit: 2, category: 3, unitPrice: 4 });
  eq(run('detectItemCsvHeader(["Code", "Name", "Tax Type"])'), { code: 0, name: 1, taxType: 2 });
  assert.strictEqual(run('detectItemCsvHeader(["품목명", "단위"])'), null);
  assert.strictEqual(run('detectItemCsvHeader(null)'), null);
});
check('normalizeItemCsvRows: 제목 행이 있으면 이름으로 찾아 서버 11열 순서로 맞춘다, 빈 행 건너뜀, 행 번호는 파일 기준', () => {
  const r = run('normalizeItemCsvRows([["품목명","품목코드","카테고리","단위","매입단가"], ["수건","IT-010","소모품","장","1,200"], ["","","","",""], ["타월","IT-011","소모품","장",""]])');
  assert.strictEqual(r.hasHeader, true);
  eq(r.errors, []);
  eq(r.rows, [
    ['IT-010', '수건', '소모품', '', '장', '', '', '', '', '', '1200'],
    ['IT-011', '타월', '소모품', '', '장', '', '', '', '', '', '']
  ]);
  eq(r.rowNos, [2, 4]);
});
check('normalizeItemCsvRows: 제목 행이 없으면 고정 순서(ITEM_CSV_COLUMNS)로 읽는다', () => {
  const r = run('normalizeItemCsvRows([["IT-020","쌀","식재료","20kg","포대","5","3","5","30","과세","45000"]])');
  assert.strictEqual(r.hasHeader, false);
  eq(r.rows, [['IT-020', '쌀', '식재료', '20kg', '포대', '5', '3', '5', '30', '과세', '45000']]);
  eq(r.rowNos, [1]);
});
check('normalizeItemCsvRows: 코드/품목명 누락·음수·문자 숫자·과세구분 오류는 행 번호와 함께 모으고 그 행은 rows에서 뺀다', () => {
  const r = run('normalizeItemCsvRows([["품목코드","품목명","카테고리","단위","초기재고","과세구분"], ["","이름만","소모품","장","",""], ["IT-030","","소모품","장","",""], ["IT-031","음수","소모품","장","-3",""], ["IT-032","면세","소모품","장","","면세"], ["IT-033","정상","소모품","장","2","비과세"]])');
  eq(r.errors.map((e) => e.row), [2, 3, 4, 5]);
  assert.match(r.errors[0].message, /품목코드 누락/);
  assert.match(r.errors[1].message, /품목명 누락/);
  assert.match(r.errors[2].message, new RegExp(ITEM_UI.fieldLabels.initStock));
  assert.match(r.errors[3].message, /과세구분/);
  eq(r.rows, [['IT-033', '정상', '소모품', '', '장', '2', '', '', '', '비과세', '']]);
  eq(r.rowNos, [6]);
});
check('ITEM_CSV_COLUMNS는 서버 dataRows 계약(11열)과 같다', () => {
  eq(run('ITEM_CSV_COLUMNS'),
    ['품목코드', '품목명', '카테고리', '규격', '단위', '초기재고', '리드타임', '안전재고일수', '목표유지일수', '과세구분', '매입단가']);
});
check('ITEM_UI_FALLBACK(주입 실패 시 폴백)은 Config.gs 값과 같다', () => {
  eq(run('ITEM_UI_FALLBACK'), ITEM_UI);
});

console.log('');
if (fail > 0) { console.error('✗ ' + fail + '개 검증 실패'); process.exit(1); }
console.log('✓ JS_Items 순수 로직 검증 통과 — ' + pass + '개');
