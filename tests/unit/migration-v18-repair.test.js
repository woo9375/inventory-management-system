/**
 * [v18] MIGRATIONS[18] — 사용유무 손상 복구 + 거래처 드롭다운 소스 열 이전 + 거래처코드 일괄 부여
 *
 * 이 마이그레이션은 "이미 망가진 시트를 되돌리는" 일을 한다. 그래서 검증의 핵심은
 * 고쳐지는가만이 아니라 **멀쩡한 값을 건드리지 않는가**다. 특히
 *   · 사용유무가 "미사용"인 품목을 "사용"으로 되돌려 버리면 운영 데이터를 훼손한다.
 *   · 이미 부여된 거래처코드를 다시 매기면 품목 마스터의 참조가 통째로 미아가 된다.
 * 두 가지를 명시적으로 못 박는다.
 *
 * 실제 src/*.gs를 vm에 로드해 마이그레이션을 끝까지 돌린다. 실제 시트는 건드리지 않는다.
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

function newContext(ss) {
  const ctx = vm.createContext(buildEnv(ss));
  for (const name of GS_FILES) {
    const p = path.join(SRC, name + '.gs');
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: name + '.gs' });
  }
  return ctx;
}

/** v16 시점(24열)의 스프레드시트 — v17을 태워 v18의 출발 상태를 만든다 */
function buildLegacySpreadsheet() {
  const ss = new Spreadsheet('legacy');
  const base = ss.insertSheet('📂 기초데이터');
  base.getRange(3, 3, 2, 1).setValues([['소모품'], ['식재료']]);
  base.getRange(3, 2, 2, 1).setValues([['개'], ['박스']]);

  const seasons = ss.insertSheet('📅 시즌설정');
  seasons.getRange('B2').setValue('비수기');
  seasons.getRange('D2').setValue(1.0);

  const m = ss.insertSheet('🗂️ 품목 마스터');
  m.getRange('A1:X1').merge().setValue('🗂️ 품목 마스터 변수 관리');
  m.getRange('A2:X2').setValues([[
    '품목코드', '품목명', '카테고리', '규격', '단위', '',
    '초기재고', '현재고', '일평균 사용량', '',
    '리드타임', '안전재고일수', '목표유지일수', '안전재고', '발주점', '적정발주량', '재고 상태', '',
    '과세구분', '매입단가', '공급단가', '단위 세액', '재고 합계금액', '사용유무'
  ]]);
  m.getRange(3, 1, 3, 24).setValues([
    ['IT-001', '수건', '소모품', '대', '개', '', 10, 10, 1, '', 2, 3, 7, 3, 5, 10, '✅ 정상', '', '과세', 1100, 1000, 100, 11000, '사용'],
    ['IT-002', '비누', '소모품', '소', '박스', '', 5, 5, 1, '', 2, 3, 7, 3, 5, 10, '✅ 정상', '', '비과세', 2000, 2000, 0, 10000, '미사용'],
    ['IT-003', '칫솔', '소모품', '소', '개', '', 0, 0, 0, '', 2, 3, 7, 0, 0, 0, '', '', '비과세', 500, 500, 0, 0, '사용']
  ]);

  const inout = ss.insertSheet('📝 통합 입출고 기록장');
  inout.getRange('A2:I2').setValues([['날짜', '품목코드', '품목명', '구분', '수량', '단가', '담당자', '비고', '거래ID']]);
  const tpl = ss.insertSheet('📋 입출고_템플릿');
  tpl.getRange('A2:I2').setValues([['날짜', '품목코드', '품목명', '구분', '수량', '단가', '담당자', '비고', '거래ID']]);
  const shops = ss.insertSheet('🏢 업장관리');
  shops.getRange('A2:F2').setValues([['분류', '업장명', '태그', '상태', '바로가기', 'GID']]);
  const dash = ss.insertSheet('📊 대시보드');
  dash.getRange('B5:C8').merge();
  dash.getRange('B5').setFormula('="전체 관리 품목" & TEXT(COUNTIFS(\'🗂️ 품목 마스터\'!A3:A,"<>"), "#,##0")');
  ss.insertSheet('📋 변경이력').getRange('A2:G2').setValues([['변경일시', '변경자', '품목코드', '품목명', '변경필드', '변경 전', '변경 후']]);
  return ss;
}

/**
 * v17까지 끝난 뒤 실제 DEV에서 관측된 손상 상태를 재현한다.
 *   · 품목 마스터 Y열(사용유무)이 FIFO 평가액 숫자로 덮여 있다
 *   · 거래처 드롭다운 소스가 옛 자리(O열)에 있다
 *   · 거래처 59건이 시트에 직접 붙여넣어져 A열(거래처코드)만 비어 있다
 */
function damagedAfterV17() {
  const ss = buildLegacySpreadsheet();
  const ctx = newContext(ss);
  ctx.ss0 = ss;
  vm.runInContext('MIGRATIONS[17](ss0)', ctx);

  const m = ss.getSheetByName('🗂️ 품목 마스터');
  // 배포~마이그레이션 창에서 재고 합계금액이 사용유무를 덮어쓴 결과 (v17이 Y로 밀어 놓은 상태)
  m.getRange(3, 25, 3, 1).setValues([[11000], [0], [0]]);

  const v = ss.getSheetByName('🤝 거래처관리');
  // 소스 열을 v17 시절 자리(O)로 되돌린다
  v.getRange(3, 14).setFormula('');
  v.getRange(2, 14).setValue('');
  v.getRange(2, 15).setValue('사용중 거래처코드(자동)');
  v.getRange(3, 15).setFormula('=IFERROR(SORT(FILTER($A$3:$A, $M$3:$M="사용")), "")');
  v.hideColumns(15);

  // 시트에 직접 붙여넣은 거래처 — 코드 열이 비어 있다
  v.getRange(3, 2, 3, 1).setValues([['새마을떡방앗간'], ['금오주류'], ['쿠팡']]);
  v.getRange(3, 13, 3, 1).setValues([['사용'], ['사용'], ['미사용']]);

  return { ss, ctx, m, v };
}

// ───────────────────────────────────────────────────────────────
console.log('\n[1] 품목 마스터 사용유무 복구');
{
  const { ss, ctx, m } = damagedAfterV17();
  // 손상되지 않은 값 하나를 섞어 둔다 — 이게 살아남는지가 이 복구의 안전성이다
  m.getRange(4, 25).setValue('미사용');

  check('v18이 에러 없이 완주한다', () => {
    vm.runInContext('MIGRATIONS[18](ss0)', ctx);
  });
  check('숫자로 덮인 사용유무가 "사용"으로 복구된다', () => {
    eq(m.getRange(3, 25).getValue(), '사용');
    eq(m.getRange(5, 25).getValue(), '사용');
  });
  check('멀쩡한 "미사용"은 그대로 둔다 (운영 데이터 훼손 금지)', () => {
    eq(m.getRange(4, 25).getValue(), '미사용');
  });
  check('복구가 다른 열을 건드리지 않는다', () => {
    eq(m.getRange(3, 19).getValue(), '', 'S열 거래처코드');
    eq(m.getRange(3, 20).getValue(), '과세', 'T열 과세구분');
    eq(m.getRange(3, 21).getValue(), 1100, 'U열 매입단가');
    eq(m.getRange(3, 1).getValue(), 'IT-001');
  });
  check('품목코드가 없는 행에는 "사용"을 심지 않는다', () => {
    eq(m.getRange(6, 25).getValue(), '');
    eq(m.getRange(50, 25).getValue(), '');
  });
  check('재실행해도 값이 그대로다 (멱등)', () => {
    vm.runInContext('MIGRATIONS[18](ss0)', ctx);
    eq(m.getRange(3, 25).getValue(), '사용');
    eq(m.getRange(4, 25).getValue(), '미사용');
  });
  check('마스터가 v17 구조가 아니면 사용유무를 건드리지 않는다', () => {
    const ss2 = buildLegacySpreadsheet();      // 아직 24열 — Y2에 헤더가 없다
    const ctx2 = newContext(ss2);
    ctx2.ss0 = ss2;
    const m2 = ss2.getSheetByName('🗂️ 품목 마스터');
    m2.getRange(3, 24, 3, 1).setValues([[11000], [0], [0]]); // 이 시트에선 24열이 사용유무다
    vm.runInContext('MIGRATIONS[18](ss0)', ctx2);
    eq(m2.getRange(3, 24).getValue(), 11000, '구조가 어긋난 시트의 값');
  });
  if (!ss) throw new Error('unreachable');
}

// ───────────────────────────────────────────────────────────────
console.log('\n[2] 거래처 드롭다운 소스 열 O → N 이전');
{
  const { ctx, m, v } = damagedAfterV17();
  vm.runInContext('MIGRATIONS[18](ss0)', ctx);

  check('N열에 사용중 코드 FILTER 수식이 생기고 숨겨진다', () => {
    const f = v.getRange(3, 14).getFormula();
    if (!/FILTER/.test(f) || !/사용/.test(f)) throw new Error('N3 수식이 아니다: ' + JSON.stringify(f));
    if (!v.hidden.has(14)) throw new Error('N열이 숨겨지지 않았다');
  });
  check('옛 O열은 비워지고 숨김 상태로 남는다', () => {
    eq(v.getRange(2, 15).getValue(), '', 'O2 헤더');
    eq(v.getRange(3, 15).getFormula(), '', 'O3 수식');
    if (!v.hidden.has(15)) throw new Error('비운 O열이 다시 보이게 됐다');
  });
  check('품목 마스터 거래처 드롭다운이 N열을 가리킨다', () => {
    const dv = m.cell(3, 19).validation;
    if (!dv || dv.type !== 'RANGE') throw new Error('S열 범위 검증이 없다');
    eq(dv.args.getColumn(), 14);
  });
  check('우리가 쓰지 않은 O열은 손대지 않는다', () => {
    const d = damagedAfterV17();
    d.v.getRange(2, 15).setValue('사람이 적어 둔 메모');
    d.v.getRange(3, 15).setValue('건드리면 안 됨');
    vm.runInContext('MIGRATIONS[18](ss0)', d.ctx);
    eq(d.v.getRange(2, 15).getValue(), '사람이 적어 둔 메모');
    eq(d.v.getRange(3, 15).getValue(), '건드리면 안 됨');
  });
}

// ───────────────────────────────────────────────────────────────
console.log('\n[3] 거래처코드 일괄 부여');
{
  const { ctx, v } = damagedAfterV17();
  vm.runInContext('MIGRATIONS[18](ss0)', ctx);

  check('코드가 빈 행에 VND-001부터 순서대로 부여된다', () => {
    eq(v.getRange(3, 1, 3, 1).getValues(), [['VND-001'], ['VND-002'], ['VND-003']]);
  });
  check('붙여넣은 다른 열은 그대로다', () => {
    eq(v.getRange(3, 2).getValue(), '새마을떡방앗간');
    eq(v.getRange(5, 13).getValue(), '미사용');
  });
  check('재실행해도 코드가 다시 매겨지지 않는다 (참조 키 보존)', () => {
    vm.runInContext('MIGRATIONS[18](ss0)', ctx);
    eq(v.getRange(3, 1, 3, 1).getValues(), [['VND-001'], ['VND-002'], ['VND-003']]);
  });
  check('이미 있는 코드는 유지하고 그 다음 번호부터 이어 붙인다', () => {
    const d = damagedAfterV17();
    d.v.getRange(3, 1).setValue('VND-007');            // 사람이 먼저 적어 둔 코드
    vm.runInContext('MIGRATIONS[18](ss0)', d.ctx);
    eq(d.v.getRange(3, 1, 3, 1).getValues(), [['VND-007'], ['VND-008'], ['VND-009']]);
  });
  check('거래처명이 없는 행에는 코드를 주지 않는다', () => {
    const d = damagedAfterV17();
    d.v.getRange(4, 2).setValue('');                    // 가운데 행의 이름을 지운다
    vm.runInContext('MIGRATIONS[18](ss0)', d.ctx);
    eq(d.v.getRange(3, 1, 3, 1).getValues(), [['VND-001'], [''], ['VND-002']]);
  });
  check('거래처가 하나도 없으면 아무 일도 하지 않는다', () => {
    const ss2 = buildLegacySpreadsheet();
    const ctx2 = newContext(ss2);
    ctx2.ss0 = ss2;
    vm.runInContext('MIGRATIONS[17](ss0); MIGRATIONS[18](ss0)', ctx2);
    const v2 = ss2.getSheetByName('🤝 거래처관리');
    eq(v2.getRange(3, 1, 3, 1).getValues(), [[''], [''], ['']]);
  });
}

// ───────────────────────────────────────────────────────────────
console.log('\n[4] 코드 없는 행이 있어도 새 거래처가 기존 행을 덮지 않는다');
{
  // 붙여넣은 59건은 코드 열이 비어 있다. _lastVendorRow가 A열만 봤다면 그 59행이
  // 전부 "빈 행"으로 잡혀, 웹앱에서 등록한 첫 거래처가 3행부터 그 위에 앉는다.
  const { ctx, v } = damagedAfterV17();

  check('코드가 비어 있어도 이름이 있으면 쓰인 행으로 센다', () => {
    ctx.__v = v;
    eq(vm.runInContext('_lastVendorRow(__v)', ctx), 5);
  });
  check('빈 시트에서는 2를 돌려준다 (첫 거래처가 3행에 앉는다)', () => {
    const ss2 = buildLegacySpreadsheet();
    const ctx2 = newContext(ss2);
    ctx2.ss0 = ss2;
    vm.runInContext('MIGRATIONS[17](ss0)', ctx2);
    ctx2.__v = ss2.getSheetByName('🤝 거래처관리');
    eq(vm.runInContext('_lastVendorRow(__v)', ctx2), 2);
  });
  check('숨김 소스 열의 수식은 행 수 판정에 끼어들지 않는다', () => {
    const ss2 = buildLegacySpreadsheet();
    const ctx2 = newContext(ss2);
    ctx2.ss0 = ss2;
    vm.runInContext('MIGRATIONS[17](ss0)', ctx2);
    const v2 = ss2.getSheetByName('🤝 거래처관리');
    if (!/FILTER/.test(v2.getRange(3, 14).getFormula())) throw new Error('N3 수식이 없어 전제가 깨졌다');
    ctx2.__v = v2;
    eq(vm.runInContext('_lastVendorRow(__v)', ctx2), 2);
  });
}

// ───────────────────────────────────────────────────────────────
console.log('\n[5] 서식 복구가 열 확충을 보고한다');
{
  // 사용자가 M 오른쪽 열을 지운 시트에서 서식 복구를 누르면 소스 열이 되살아난다.
  // 그 사실이 결과 보고에 적히지 않으면 "누르지도 않은 열이 생겼다"로 보인다.
  const { ctx, ss } = damagedAfterV17();
  const v = ss.getSheetByName('🤝 거래처관리');
  while (v.getMaxColumns() > 13) v.deleteColumn(v.getMaxColumns());

  check('확충한 열 수가 결과에 담긴다', () => {
    const r = vm.runInContext('reapplyAllSheetFormatting(ss0)', ctx);
    if (!(r.addedCols >= 1)) throw new Error('addedCols가 보고되지 않았다: ' + JSON.stringify(r.addedCols));
  });
  check('되살아난 소스 열은 숨김이라 시트는 M에서 끝난 것처럼 보인다', () => {
    eq(v.getMaxColumns(), 14);
    if (!v.hidden.has(14)) throw new Error('N열이 숨겨지지 않았다');
  });
}

console.log('\n─────────────────────────────');
if (fail > 0) {
  console.log('✗ ' + fail + '개 검증 실패 (통과 ' + pass + ')');
  process.exit(1);
}
console.log('✓ v18 (사용유무 복구 · 소스 열 이전 · 코드 일괄 부여) 검증 통과 — ' + pass + '개');
