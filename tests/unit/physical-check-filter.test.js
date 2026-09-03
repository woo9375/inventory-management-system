// [TASK-013] 재고 실사 양식 3단계 필터링(유·무·전체) 단위 테스트
//
// 로직을 테스트 파일에 복사하지 않는다. `src/JS_BaseData.html`의 <script> 블록을 통째로
// vm 샌드박스에 로드해 **배포되는 실제 함수**를 호출한다. 소스가 바뀌면 테스트도 따라간다.
//
// 이 파일은 브라우저 전역(document/google/XLSX 등)을 쓰지만, 최상위에는 함수 선언만 있고
// 실행 코드가 없으므로 최소 스텁만으로 로드된다. 검증 대상인 parseStockValue /
// filterPhysicalCheckItems / physicalCheckFilterLabel은 DOM에 의존하지 않는 순수 함수다.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');

// ─────────────────────────────────────────────────────────────
//  샌드박스: JS_BaseData.html의 <script> 로드
// ─────────────────────────────────────────────────────────────

function loadBaseDataScript() {
  const html = fs.readFileSync(path.join(SRC, 'JS_BaseData.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(m, 'JS_BaseData.html에서 <script> 블록을 찾지 못했습니다');

  // 브라우저/GAS 전역 최소 스텁 (로드만 되면 되고, 호출되지는 않는다)
  const noop = () => {};
  const sandbox = {
    console: { log: noop, warn: noop, error: noop },
    document: { getElementById: () => null, querySelector: () => null, createElement: () => ({}) },
    window: {},
    setTimeout: noop,
    showLoading: noop,
    hideLoading: noop,
    showToast: noop,
    openModal: noop,
    closeModal: noop,
    escapeHtml: (s) => String(s === null || s === undefined ? '' : s),
    getToken: () => 'TEST-TOKEN',
    google: { script: { run: {} } },
    XLSX: {},
    Blob: function () {},
    URL: { createObjectURL: () => '', revokeObjectURL: noop }
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(m[1], ctx, { filename: 'JS_BaseData.html' });

  // .html의 top-level `function` 선언은 샌드박스 프로퍼티가 되므로 그대로 꺼내 쓴다.
  return ctx;
}

const ctx = loadBaseDataScript();
const { parseStockValue, filterPhysicalCheckItems, physicalCheckFilterLabel } = ctx;

// ─────────────────────────────────────────────────────────────
//  Mock 데이터셋 (Task 명세 Test Plan과 동일)
// ─────────────────────────────────────────────────────────────

const ITEMS = [
  { code: 'A', name: '양수재고', currentStock: 10 },
  { code: 'B', name: '음수재고', currentStock: -3 },
  { code: 'C', name: '영재고', currentStock: 0 },
  { code: 'D', name: '빈값', currentStock: '' },
  { code: 'E', name: 'null', currentStock: null },
  { code: 'F', name: '문자열양수', currentStock: '25' },
  { code: 'G', name: '문자열음수', currentStock: '-7' }
];

const codesOf = (arr) => arr.map((i) => i.code);

let passed = 0;
function test(title, fn) {
  fn();
  passed++;
  console.log('  ✓ ' + title);
}

console.log('[TASK-013] 재고 실사 양식 필터링');

// ─────────────────────────────────────────────────────────────
//  1. parseStockValue — 수량 정규화
// ─────────────────────────────────────────────────────────────

test('parseStockValue: 숫자는 그대로, 음수도 보존한다', () => {
  assert.strictEqual(parseStockValue(10), 10);
  assert.strictEqual(parseStockValue(-3), -3);
  assert.strictEqual(parseStockValue(0), 0);
});

test('parseStockValue: 문자열 숫자를 변환한다 (음수 포함)', () => {
  assert.strictEqual(parseStockValue('25'), 25);
  assert.strictEqual(parseStockValue('-7'), -7);
});

test('parseStockValue: 빈 값·null·undefined·비숫자는 0으로 본다', () => {
  assert.strictEqual(parseStockValue(''), 0);
  assert.strictEqual(parseStockValue(null), 0);
  assert.strictEqual(parseStockValue(undefined), 0);
  assert.strictEqual(parseStockValue('재고없음'), 0);
});

// ─────────────────────────────────────────────────────────────
//  2. 옵션 'exist' — 재고 '유' (음수 포함)
// ─────────────────────────────────────────────────────────────

test("'유'(exist): 현재고가 0이 아닌 품목 4건만 추출한다", () => {
  const r = filterPhysicalCheckItems(ITEMS, 'exist');
  assert.deepStrictEqual(codesOf(r), ['A', 'B', 'F', 'G']);
  assert.strictEqual(r.length, 4);
});

test("'유'(exist): 음수 재고가 반드시 포함된다 (이 Task의 핵심 요구사항)", () => {
  const r = filterPhysicalCheckItems(ITEMS, 'exist');
  assert.ok(codesOf(r).includes('B'), '숫자 음수(-3)가 누락되면 결손 조사가 불가능하다');
  assert.ok(codesOf(r).includes('G'), '문자열 음수("-7")가 누락되면 결손 조사가 불가능하다');
});

test("'유'(exist): 0·빈값·null은 배제한다", () => {
  const r = codesOf(filterPhysicalCheckItems(ITEMS, 'exist'));
  ['C', 'D', 'E'].forEach((c) => assert.ok(!r.includes(c), `${c}가 포함되면 안 된다`));
});

// ─────────────────────────────────────────────────────────────
//  3. 옵션 'zero' — 재고 '무'
// ─────────────────────────────────────────────────────────────

test("'무'(zero): 0·빈값·null 3건만 추출한다", () => {
  const r = filterPhysicalCheckItems(ITEMS, 'zero');
  assert.deepStrictEqual(codesOf(r), ['C', 'D', 'E']);
});

test("'무'(zero): 양수·음수 재고를 모두 배제한다", () => {
  const r = codesOf(filterPhysicalCheckItems(ITEMS, 'zero'));
  ['A', 'B', 'F', 'G'].forEach((c) => assert.ok(!r.includes(c), `${c}가 포함되면 안 된다`));
});

// ─────────────────────────────────────────────────────────────
//  4. 옵션 'all' 및 폴백
// ─────────────────────────────────────────────────────────────

test("'전체'(all): 7건 전부 반환한다", () => {
  assert.deepStrictEqual(codesOf(filterPhysicalCheckItems(ITEMS, 'all')), codesOf(ITEMS));
});

test('인자 미지정·알 수 없는 값은 전체로 폴백한다 (하위 호환)', () => {
  assert.strictEqual(filterPhysicalCheckItems(ITEMS).length, 7);
  assert.strictEqual(filterPhysicalCheckItems(ITEMS, undefined).length, 7);
  assert.strictEqual(filterPhysicalCheckItems(ITEMS, '').length, 7);
  assert.strictEqual(filterPhysicalCheckItems(ITEMS, 'bogus').length, 7);
});

test("'유'와 '무'는 서로 배타적이며 합치면 전체가 된다", () => {
  const exist = filterPhysicalCheckItems(ITEMS, 'exist');
  const zero = filterPhysicalCheckItems(ITEMS, 'zero');
  assert.strictEqual(exist.length + zero.length, ITEMS.length);
  const overlap = codesOf(exist).filter((c) => codesOf(zero).includes(c));
  assert.deepStrictEqual(overlap, [], '두 옵션에 동시에 속하는 품목이 있으면 안 된다');
});

// ─────────────────────────────────────────────────────────────
//  5. 잘못된 입력 방어
// ─────────────────────────────────────────────────────────────

test('빈 배열·null·비배열 입력은 빈 배열을 반환한다', () => {
  // vm 샌드박스 안에서 만들어진 배열은 호스트와 Array.prototype이 달라
  // deepStrictEqual이 구조가 같아도 실패한다. 길이로 단정한다.
  [[], null, undefined, {}, 'string', 0].forEach((input) => {
    const r = filterPhysicalCheckItems(input, 'exist');
    assert.strictEqual(r.length, 0, `입력 ${JSON.stringify(input)}에 대해 빈 배열이어야 한다`);
    assert.strictEqual(filterPhysicalCheckItems(input, 'all').length, 0);
  });
});

test('원본 배열을 변형하지 않는다', () => {
  const snapshot = codesOf(ITEMS);
  filterPhysicalCheckItems(ITEMS, 'exist');
  filterPhysicalCheckItems(ITEMS, 'zero');
  assert.deepStrictEqual(codesOf(ITEMS), snapshot);
});

// ─────────────────────────────────────────────────────────────
//  6. 인쇄 헤더 라벨
// ─────────────────────────────────────────────────────────────

test('필터 구분명이 옵션별로 구분된다', () => {
  assert.strictEqual(physicalCheckFilterLabel('exist'), "재고 '유' (음수 포함)");
  assert.strictEqual(physicalCheckFilterLabel('zero'), "재고 '무' (0 재고)");
  assert.strictEqual(physicalCheckFilterLabel('all'), '전체');
  assert.strictEqual(physicalCheckFilterLabel(undefined), '전체');
});

// ─────────────────────────────────────────────────────────────
//  7. 진입점 계약 — 모달과 하위 호환
// ─────────────────────────────────────────────────────────────

test('출력 함수가 인자 없이 호출돼도 예외 없이 동작한다 (하위 호환)', () => {
  // google.script.run 스텁을 체이닝 가능하게 만들고, 서버 호출 직전까지 흐르는지 본다
  let called = null;
  const chain = {
    withSuccessHandler() { return chain; },
    withFailureHandler() { return chain; },
    getItemMasterData(token) { called = token; }
  };
  ctx.google.script.run = chain;

  ctx.printPhysicalCheckList();
  assert.strictEqual(called, 'TEST-TOKEN', '인쇄가 서버 호출까지 도달해야 한다');

  called = null;
  ctx.downloadPhysicalCheckListExcel();
  assert.strictEqual(called, 'TEST-TOKEN', '다운로드가 서버 호출까지 도달해야 한다');
});

test('모달 진입점 함수가 정의되어 있다', () => {
  assert.strictEqual(typeof ctx.openPhysicalCheckModal, 'function');
  assert.strictEqual(typeof ctx.submitPhysicalCheckExport, 'function');
});

console.log(`\n✓ 실사 양식 필터링 테스트 ${passed}건 통과`);
