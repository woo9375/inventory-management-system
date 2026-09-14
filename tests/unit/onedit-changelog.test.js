/**
 * [TASK-003 → TASK-024] onEdit 품목 마스터 변경이력 블록
 *
 * TASK-003 때는 onEdit의 로직을 이 파일에 베껴 두고 검증했다. 그 사본은 원본이 바뀌면 조용히 낡는다
 * (실제로 TASK-017의 25열 구조를 반영하지 못한 채 통과하고 있었다). TASK-024부터는 실제 `src/Code.gs`의
 * onEdit(e)를 vm에 로드해 편집 이벤트를 흉내내고, ItemService._appendChangelog가 남긴 **9열** 결과를 본다.
 *
 * 보는 것: 단일 셀(이전값 정확) · 다중 셀(이전값 없음) · Clear · 값 변화 없음 · 추적 대상 아닌 열 ·
 *          코드 없는 행 · 숫자/문자 보존 · 변경자/사유/경로(시트편집).
 * 순수 인메모리 — 실제 Google Sheet는 건드리지 않는다.
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

const MASTER = '🗂️ 품목 마스터';
const CHANGELOG = '📋 변경이력';

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '\n          ' + e.message); fail++; }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((what || '') + ' 기대 ' + b + ' / 실제 ' + a);
}

/** 품목 3행(A001~A003)이 든 마스터 + 변경이력 시트. onEdit은 Code.gs의 진짜다. */
function makeCtx() {
  const ss = new Spreadsheet('mock');
  const env = buildEnv(ss);
  const ctx = vm.createContext(env);
  GS_FILES.forEach(function (name) {
    const p = path.join(SRC, name + '.gs');
    if (!fs.existsSync(p)) return;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: name + '.gs' });
  });
  ctx.ss0 = ss;
  vm.runInContext('buildBaseDataSheet(ss0); buildVendors(ss0); buildItemMaster(ss0); buildChangelogSheet(ss0)', ctx);
  const master = ss.getSheetByName(MASTER);
  // [코드, 품목명, 카테고리, 규격, 단위]
  master.getRange(3, 1, 3, 5).setValues([
    ['A001', '이전품목명', '음료', '500ml', '병'],
    ['A002', '품목2', '소모품', '', '개'],
    ['A003', '품목3', '소모품', '', '개']
  ]);
  master.getRange(3, 21).setValue(4500); // U열 매입단가
  return { ss, ctx, master, changelog: ss.getSheetByName(CHANGELOG) };
}

/** 셀에 값을 쓰고(=사용자 편집) onEdit 이벤트를 만든다. 단일 셀이면 oldValue를 싣는다(실제 Sheets 동작). */
function edit(t, row, col, values, opts) {
  const o = opts || {};
  const numRows = values.length, numCols = values[0].length;
  const range = t.master.getRange(row, col, numRows, numCols);
  const single = numRows === 1 && numCols === 1;
  const oldValue = single ? range.getValue() : undefined;
  range.setValues(values);
  const e = { range: range, value: single ? values[0][0] : undefined };
  if (single && !o.noOldValue) e.oldValue = oldValue;
  vm.runInContext('onEdit', t.ctx)(e);
}

function records(t) {
  const last = t.changelog.getLastRow();
  if (last < 3) return [];
  return t.changelog.getRange(3, 1, last - 2, 9).getValues();
}

// ───────────────────────────────────────────────────────────────
console.log('[TASK-003/024] onEdit 품목 마스터 변경이력 (실제 Code.gs onEdit)');

check('단일 셀: 품목명 변경 → 이전값/새값 정확, 9열, 경로 시트편집', () => {
  const t = makeCtx();
  edit(t, 3, 2, [['새품목명']]);
  const r = records(t);
  eq(r.length, 1);
  eq(r[0].slice(1), ['mock@example.invalid', 'A001', '새품목명', '품목명', '이전품목명', '새품목명', '(시트 직접편집)', '시트편집']);
  eq(Object.prototype.toString.call(r[0][0]), '[object Date]', '변경일시');
});

check('단일 셀: 값 삭제 → 새값 빈 값', () => {
  const t = makeCtx();
  edit(t, 3, 4, [['']]);
  const r = records(t);
  eq(r.length, 1); eq(r[0][5], '500ml'); eq(r[0][6], '');
});

check('단일 셀: 값이 같으면 기록하지 않는다', () => {
  const t = makeCtx();
  edit(t, 3, 2, [['이전품목명']]);
  eq(records(t).length, 0);
});

check('단일 셀: oldValue가 없으면 (이전값 없음)', () => {
  const t = makeCtx();
  edit(t, 3, 2, [['새품목명']], { noOldValue: true });
  const r = records(t);
  eq(r.length, 1); eq(r[0][5], '(이전값 없음)');
});

check('다중 셀(가로 붙여넣기): 열마다 1건, 이전값 없음, 사유 일괄편집', () => {
  const t = makeCtx();
  edit(t, 3, 2, [['새이름', '식재료', '1L']]);
  const r = records(t);
  eq(r.length, 3);
  eq(r.map(x => x[4]), ['품목명', '카테고리', '규격']);
  r.forEach(x => { eq(x[5], '(이전값 없음)'); eq(x[7], '(시트 붙여넣기/일괄편집)'); eq(x[8], '시트편집'); });
  eq(r.map(x => x[6]), ['새이름', '식재료', '1L']);
});

check('다중 셀(세로): 행마다 품목코드가 정확히 붙는다', () => {
  const t = makeCtx();
  edit(t, 3, 2, [['n1'], ['n2'], ['n3']]);
  eq(records(t).map(x => x[2]), ['A001', 'A002', 'A003']);
});

check('범위 Clear: 새값 빈 값으로 기록', () => {
  const t = makeCtx();
  edit(t, 3, 2, [[''], ['']]);
  const r = records(t);
  eq(r.length, 2); eq(r.map(x => x[6]), ['', '']);
});

check('추적 대상이 아닌 열(H 현재고, F 스페이서)은 기록하지 않는다', () => {
  const t = makeCtx();
  edit(t, 3, 8, [[99]]);
  edit(t, 3, 6, [['x']]);
  eq(records(t).length, 0);
});

check('품목코드가 없는 행은 기록하지 않는다', () => {
  const t = makeCtx();
  edit(t, 10, 2, [['유령']]);
  eq(records(t).length, 0);
});

check('헤더 행(1~2행) 편집은 기록하지 않는다', () => {
  const t = makeCtx();
  edit(t, 2, 2, [['품목명(수정)']]);
  eq(records(t).length, 0);
});

check('숫자/문자 값이 그대로 보존된다 (매입단가 4500 → 5000, 카테고리 음료 → 식자재)', () => {
  const t = makeCtx();
  edit(t, 3, 21, [[5000]]);
  edit(t, 3, 3, [['식자재']]);
  const r = records(t);
  eq(r.length, 2);
  eq([r[0][4], r[0][5], r[0][6]], ['매입단가', 4500, 5000]);
  eq([r[1][4], r[1][5], r[1][6]], ['카테고리', '음료', '식자재']);
});

check('추적 열은 Config.gs MASTER_FIELD_COLS 12개와 같다 (거래처 S열 · 사용유무 Y열 포함)', () => {
  const t = makeCtx();
  edit(t, 3, 19, [['VND-001']]);
  edit(t, 3, 25, [['미사용']]);
  const r = records(t);
  eq(r.map(x => x[4]), ['거래처', '사용유무']);
  eq(vm.runInContext('Object.keys(MASTER_FIELD_COLS).length', t.ctx), 12);
});

check('변경이력 시트가 없으면 죽지 않고 넘어간다 (안전망은 편집을 막지 않는다)', () => {
  const t = makeCtx();
  t.ss.deleteSheet(t.changelog);
  edit(t, 3, 2, [['새품목명']]);
  eq(t.master.getRange(3, 2).getValue(), '새품목명');
});

// ───────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────');
if (fail > 0) {
  console.log('✗ ' + fail + '개 검증 실패 (통과 ' + pass + ')');
  process.exit(1);
}
console.log('✓ onEdit 변경이력 검증 통과 — ' + pass + '개');
