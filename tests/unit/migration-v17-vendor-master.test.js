/**
 * [TASK-017] MIGRATIONS[17] — 거래처 마스터 신설 + 품목 마스터 거래처코드 열 삽입 검증
 *
 * 이 Task는 품목 마스터 S열에 열을 하나 끼워 넣어 과세구분~사용유무를 한 칸씩 민다.
 * 열이 밀리면 깨지는 곳이 코드 곳곳에 흩어져 있어(하드코딩된 A1 주소, 배열 인덱스,
 * 조건부 서식 수식, 대시보드 KPI) 눈으로 훑는 검토만으로는 빠뜨리기 쉽다.
 * 그래서 실제 `src/*.gs`를 vm에 로드해 **마이그레이션을 끝까지 돌리고** 결과 지오메트리를 본다.
 *
 * 검증 축은 3개다.
 *   [1] 신규 생성 경로 — 새 스프레드시트가 처음부터 25열/13열로 만들어지는가
 *   [2] 마이그레이션 경로 — 24열 레거시 시트가 데이터를 지킨 채 25열이 되는가 (+ 멱등)
 *   [3] 회귀 — MASTER_COLS를 소비하는 함수들이 25열 배열에서 그대로 도는가
 *
 * 순수 인메모리 시뮬레이션이며 실제 Google Sheet는 전혀 건드리지 않는다.
 * 모킹은 tests/unit/lib/gas-sheet-mock.js에 있고, 범위가 시트 밖을 가리키면
 * GAS 런타임과 같이 예외를 던진다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Spreadsheet, buildEnv } = require('./lib/gas-sheet-mock');

const SRC = path.join(__dirname, '..', '..', 'src');
const GS_FILES = ['Config', 'SheetBuilder', 'Migration', 'Code', 'ItemService', 'StockEngine',
                  'Dashboard', 'Archive', 'CacheManager', 'WebApp', 'DevTools', 'RBAC',
                  'TxService', 'BaseDataService', 'ConfigService', 'Triggers'];

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
  const env = buildEnv(ss);
  const ctx = vm.createContext(env);
  for (const name of GS_FILES) {
    const p = path.join(SRC, name + '.gs');
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: name + '.gs' });
  }
  return ctx;
}

// ───────────────────────────────────────────────────────────────
// 1) 신규 생성 경로 — buildVendors + buildItemMaster
// ───────────────────────────────────────────────────────────────
console.log('\n[1] 신규 생성 (buildVendors / buildItemMaster / buildDashboard)');
{
  const ss = new Spreadsheet('mock');
  const ctx = newContext(ss);
  ctx.ss0 = ss;
  vm.runInContext('buildBaseDataSheet(ss0)', ctx); // 카테고리/단위 드롭다운 소스

  check('거래처관리 시트가 생성된다', () => {
    vm.runInContext('buildVendors(ss0)', ctx);
    if (!ss.getSheetByName('🤝 거래처관리')) throw new Error('시트 없음');
  });

  const v = ss.getSheetByName('🤝 거래처관리');
  check('거래처관리 헤더가 확정된 13열이다', () => {
    eq(v.getRange('A2:M2').getValues()[0],
      ['거래처코드', '거래처명', '약어명', '사업자번호', '대표자명', '업태', '업종',
       '주소', '전화', '이메일', '사업자구분', '비고', '사용여부']);
  });
  check('거래처관리에 초기 데이터가 심어지지 않는다 (Human이 직접 입력)', () => {
    const rows = v.getRange(3, 1, 20, 13).getValues().filter(r => r.some(c => c !== ''));
    eq(rows.length, 0, '3행 이후 데이터 행 수');
  });
  check('사용여부(M열) 드롭다운이 사용/미사용이다', () => {
    const dv = v.getRange(3, 13).getDataValidation();
    eq(dv.type, 'LIST'); eq(dv.args, ['사용', '미사용']); eq(dv.allowInvalid, false);
  });
  check('사업자구분(K열) 드롭다운이 개인/법인이다', () => {
    const dv = v.getRange(3, 11).getDataValidation();
    eq(dv.args, ['개인', '법인']);
  });
  check('거래처코드 검증은 차단이 아니라 경고다 (59건 붙여넣기를 막지 않는다)', () => {
    const dv = v.getRange(3, 1).getDataValidation();
    eq(dv.type, 'FORMULA'); eq(dv.allowInvalid, true);
    if (!/VND-/.test(dv.args)) throw new Error('VND- 규칙이 없다: ' + dv.args);
  });
  check('드롭다운 소스(N열)에 사용중 코드 FILTER 수식이 있고 숨겨져 있다', () => {
    const f = v.getRange(3, 14).getFormula();
    if (!/FILTER/.test(f) || !/사용/.test(f)) throw new Error('FILTER 수식 아님: ' + f);
    if (!v.hidden.has(14)) throw new Error('N열이 숨겨지지 않음');
  });
  check('코드/사업자번호/전화가 텍스트 서식이다 (앞자리 0 보존)', () => {
    [1, 4, 9].forEach(c => eq(v.getRange(3, c).cell !== undefined ? '' : '', ''));
    eq(v.getRange(3, 1).sheet.cell(3, 1).numberFormat, '@', 'A열');
    eq(v.getRange(3, 4).sheet.cell(3, 4).numberFormat, '@', 'D열');
    eq(v.getRange(3, 9).sheet.cell(3, 9).numberFormat, '@', 'I열');
  });

  check('품목 마스터가 25열로 생성된다', () => {
    vm.runInContext('buildItemMaster(ss0)', ctx);
    const m = ss.getSheetByName('🗂️ 품목 마스터');
    eq(m.getRange('A2:Y2').getValues()[0][18], '거래처코드', 'S2');
    eq(m.getRange('A2:Y2').getValues()[0][19], '과세구분', 'T2');
    eq(m.getRange('A2:Y2').getValues()[0][20], '매입단가', 'U2');
    eq(m.getRange('A2:Y2').getValues()[0][24], '사용유무', 'Y2');
  });
  check('회계 ARRAYFORMULA가 V3/W3/X3에 새 참조로 들어간다', () => {
    const m = ss.getSheetByName('🗂️ 품목 마스터');
    if (!/T3:T="과세"/.test(m.getRange('V3').getFormula())) throw new Error('V3: ' + m.getRange('V3').getFormula());
    if (!/U3:U-V3:V/.test(m.getRange('W3').getFormula())) throw new Error('W3: ' + m.getRange('W3').getFormula());
    if (!/U3:U \* H3:H/.test(m.getRange('X3').getFormula())) throw new Error('X3: ' + m.getRange('X3').getFormula());
  });
  check('거래처코드 드롭다운이 거래처 시트 N열을 가리킨다', () => {
    const m = ss.getSheetByName('🗂️ 품목 마스터');
    const dv = m.getRange(3, 19).getDataValidation();
    eq(dv.type, 'RANGE');
    eq(dv.args.sheet.getName(), '🤝 거래처관리');
    eq(dv.args.getColumn(), 14);
  });
  check('과세구분/사용유무 드롭다운이 T열·Y열로 이동했다', () => {
    const m = ss.getSheetByName('🗂️ 품목 마스터');
    eq(m.getRange(3, 20).getDataValidation().args, ['과세', '비과세'], 'T열');
    eq(m.getRange(3, 25).getDataValidation().args, ['사용', '미사용'], 'Y열');
    if (m.getRange(3, 19).getDataValidation().type === 'LIST') throw new Error('S열에 과세 드롭다운이 남아 있다');
  });
  check('미사용 회색 조건부서식이 $Y3를 본다', () => {
    const m = ss.getSheetByName('🗂️ 품목 마스터');
    const rule = m.getConditionalFormatRules().find(r => r.criteria === 'FORMULA' && /미사용/.test(r.arg));
    eq(rule.arg, '=$Y3="미사용"');
    eq(rule.ranges[0].getNumColumns(), 25);
  });
  check('대시보드 KPI가 사용유무를 Y열로 참조한다', () => {
    vm.runInContext('buildSeasonsSheet(ss0); buildDashboard(ss0)', ctx);
    const d = ss.getSheetByName('📊 대시보드');
    const f = d.getRange('B5').getFormula();
    if (!/!Y3:Y/.test(f)) throw new Error('Y3:Y 참조 없음: ' + f);
    if (/!X3:X/.test(f)) throw new Error('X3:X가 남아 있음: ' + f);
  });
}

// ───────────────────────────────────────────────────────────────
// 2) 마이그레이션 경로 — v16 상태(24열)에서 v17 실행
// ───────────────────────────────────────────────────────────────
console.log('\n[2] v16(24열) → v17 마이그레이션');

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
  // 24열 구조의 실제 데이터 2건 (S=과세구분, T=매입단가, W=합계, X=사용유무)
  m.getRange(3, 1, 2, 24).setValues([
    ['IT-001', '수건', '소모품', '대', '개', '', 10, 10, 1, '', 2, 3, 7, 3, 5, 10, '✅ 정상', '', '과세', 1100, 1000, 100, 11000, '사용'],
    ['IT-002', '비누', '소모품', '소', '박스', '', 5, 5, 1, '', 2, 3, 7, 3, 5, 10, '✅ 정상', '', '비과세', 2000, 2000, 0, 10000, '미사용']
  ]);
  // v16 시점의 회계 수식 (구 위치/구 참조)
  m.getRange('U3').setFormula('=ARRAYFORMULA(IF(A3:A="", "", IF(S3:S="과세", ROUND(T3:T/1.1, 0), IF(S3:S="비과세", T3:T, ""))))');
  m.getRange('V3').setFormula('=ARRAYFORMULA(IF(A3:A="", "", IF(S3:S="과세", T3:T-U3:U, IF(S3:S="비과세", 0, ""))))');
  m.getRange('W3').setFormula('=ARRAYFORMULA(IF(A3:A="", "", IF(T3:T * H3:H < 0, 0, T3:T * H3:H)))');
  // 구 검증: S열 과세 드롭다운, X열 사용유무 드롭다운
  const dvTax = { type: 'LIST', args: ['과세', '비과세'], allowInvalid: false };
  const dvUse = { type: 'LIST', args: ['사용', '미사용'], allowInvalid: false };
  for (let r = 3; r <= 100; r++) { m.cell(r, 19).validation = dvTax; m.cell(r, 24).validation = dvUse; }

  const inout = ss.insertSheet('📝 통합 입출고 기록장');
  inout.getRange('A2:I2').setValues([['날짜', '품목코드', '품목명', '구분', '수량', '단가', '담당자', '비고', '거래ID']]);

  const tpl = ss.insertSheet('📋 입출고_템플릿');
  tpl.getRange('A2:I2').setValues([['날짜', '품목코드', '품목명', '구분', '수량', '단가', '담당자', '비고', '거래ID']]);

  const shops = ss.insertSheet('🏢 업장관리');
  shops.getRange('A2:F2').setValues([['분류', '업장명', '태그', '상태', '바로가기', 'GID']]);

  const dash = ss.insertSheet('📊 대시보드');
  dash.getRange('B5:C8').merge();
  dash.getRange('B5').setFormula('="전체 관리 품목" & CHAR(10) & TEXT(COUNTIFS(\'🗂️ 품목 마스터\'!A3:A,"<>",IFERROR(\'🗂️ 품목 마스터\'!X3:X,"사용"),"<>미사용"), "#,##0") & " 개"');

  ss.insertSheet('📋 변경이력').getRange('A2:G2').setValues([['변경일시', '변경자', '품목코드', '품목명', '변경필드', '변경 전', '변경 후']]);
  return ss;
}

{
  const ss = buildLegacySpreadsheet();
  const ctx = newContext(ss);
  ctx.ss0 = ss;
  const m = ss.getSheetByName('🗂️ 품목 마스터');

  check('v17이 에러 없이 완주한다', () => {
    vm.runInContext('MIGRATIONS[17](ss0)', ctx);
  });
  check('🤝 거래처관리 시트가 생긴다', () => {
    if (!ss.getSheetByName('🤝 거래처관리')) throw new Error('시트 없음');
  });
  check('품목 마스터 S2가 거래처코드다', () => eq(m.getRange('S2').getValue(), '거래처코드'));
  check('기존 열이 한 칸씩 우측으로 밀렸다', () => {
    eq(m.getRange('T2').getValue(), '과세구분');
    eq(m.getRange('U2').getValue(), '매입단가');
    eq(m.getRange('Y2').getValue(), '사용유무');
  });
  check('기존 품목 데이터가 새 위치에서 보존된다', () => {
    eq(m.getRange(3, 1).getValue(), 'IT-001');
    eq(m.getRange(3, 20).getValue(), '과세', 'T3 과세구분');
    eq(m.getRange(3, 21).getValue(), 1100, 'U3 매입단가');
    eq(m.getRange(3, 25).getValue(), '사용', 'Y3 사용유무');
    eq(m.getRange(4, 25).getValue(), '미사용', 'Y4 사용유무');
  });
  check('거래처코드(S열)는 소급 입력 없이 빈 값이다', () => {
    eq(m.getRange(3, 19).getValue(), '');
    eq(m.getRange(4, 19).getValue(), '');
  });
  check('회계 수식(V3 공급단가 / W3 단위세액)이 새 위치·새 참조로 덮어써진다', () => {
    if (!/T3:T="과세"/.test(m.getRange('V3').getFormula())) throw new Error('V3: ' + m.getRange('V3').getFormula());
    if (!/U3:U-V3:V/.test(m.getRange('W3').getFormula())) throw new Error('W3: ' + m.getRange('W3').getFormula());
  });
  check('재고 합계금액(X열)은 v17이 수식을 깐 뒤 StockEngine FIFO 값이 덮는다 (기존 설계)', () => {
    // X3 ARRAYFORMULA는 "FIFO 전 초기값"이라 recalcStockAndUsage가 리터럴로 덮어쓴다.
    // v14도 같은 순서(W3 수식 → recalc)였으므로 이 동작 자체는 v17이 바꾼 것이 아니다.
    // 확인할 것은 두 가지: 수식 정의가 새 참조를 쓰는가, 값이 X열(24)에 들어갔는가.
    if (!/U3:U \* H3:H/.test(vm.runInContext('_masterTotalValueFormula()', ctx))) {
      throw new Error('수식 정의가 옛 참조다: ' + vm.runInContext('_masterTotalValueFormula()', ctx));
    }
    const x3 = m.getRange(3, 24).getValue();
    if (typeof x3 !== 'number') throw new Error('X3에 FIFO 평가액이 없다: ' + JSON.stringify(x3));
    if (m.getRange(3, 23).getFormula() === '') throw new Error('W3 단위세액 수식이 지워졌다');
  });
  check('밀려난 옛 과세 드롭다운이 매입단가(U열)에 남지 않는다', () => {
    const dv = m.getRange(3, 21).getDataValidation();
    if (dv && dv.type === 'LIST' && String(dv.args).includes('과세')) {
      throw new Error('U열에 과세 드롭다운이 남아 숫자 입력이 막힌다');
    }
  });
  check('드롭다운이 새 위치로 재설정된다', () => {
    eq(m.getRange(3, 19).getDataValidation().type, 'RANGE', 'S열 거래처');
    eq(m.getRange(3, 20).getDataValidation().args, ['과세', '비과세'], 'T열');
    eq(m.getRange(3, 25).getDataValidation().args, ['사용', '미사용'], 'Y열');
  });
  check('대시보드 KPI가 Y열 참조로 갱신된다', () => {
    const f = ss.getSheetByName('📊 대시보드').getRange('B5').getFormula();
    if (!/!Y3:Y/.test(f)) throw new Error('Y3:Y 없음: ' + f);
  });
  check('1행 제목 병합이 A1:Y1로 넓어진다', () => {
    if (!m.merges.includes('A1:Y1')) throw new Error('merges=' + JSON.stringify(m.merges));
  });
  check('거래처코드 열 너비가 스페이서(20px)를 물려받지 않는다', () => {
    if (m.widths[19] !== 110) throw new Error('width=' + m.widths[19]);
  });

  check('v17을 다시 실행해도 결과가 같다 (멱등)', () => {
    const before = JSON.stringify(m.getRange(2, 1, 3, 25).getValues());
    const colsBefore = m.getMaxColumns();
    vm.runInContext('MIGRATIONS[17](ss0)', ctx);
    eq(m.getRange(2, 1, 3, 25).getValues(), JSON.parse(before), '재실행 후 값');
    eq(m.getMaxColumns(), colsBefore, '재실행 후 열 수');
    eq(m.getRange('S2').getValue(), '거래처코드');
    eq(m.getRange('T2').getValue(), '과세구분');
  });
}

// ───────────────────────────────────────────────────────────────
// 3) 열 인덱스 소비자 — 회귀 방지
// ───────────────────────────────────────────────────────────────
console.log('\n[3] MASTER_COLS 소비자 회귀 확인');
{
  const ss = buildLegacySpreadsheet();
  const ctx = newContext(ss);
  ctx.ss0 = ss;
  vm.runInContext('MIGRATIONS[17](ss0)', ctx);
  const m = ss.getSheetByName('🗂️ 품목 마스터');

  check('MASTER_COL_COUNT / MASTER_COLS 값이 25열 구조와 맞는다', () => {
    eq(vm.runInContext('MASTER_COL_COUNT', ctx), 25);
    eq(vm.runInContext('MASTER_COLS.VENDOR_CODE', ctx), 18);
    eq(vm.runInContext('MASTER_COLS.TAX_TYPE', ctx), 19);
    eq(vm.runInContext('MASTER_COLS.UNIT_PRICE', ctx), 20);
    eq(vm.runInContext('MASTER_COLS.TOTAL_VALUE', ctx), 23);
    eq(vm.runInContext('MASTER_COLS.USAGE_STATUS', ctx), 24);
  });
  check('StockEngine이 합계금액을 X열(24)에 쓴다', () => {
    eq(vm.runInContext('MASTER_COLS.TOTAL_VALUE + 1', ctx), 24);
    const src = fs.readFileSync(path.join(SRC, 'StockEngine.gs'), 'utf8');
    if (/getRange\(3, 23,/.test(src)) throw new Error('열 23 하드코딩이 남아 있다');
    if (/row\[19\]/.test(src)) throw new Error('row[19] 하드코딩이 남아 있다');
  });
  check('onEdit 변경이력이 거래처(S열)를 추적한다', () => {
    const src = fs.readFileSync(path.join(SRC, 'Code.gs'), 'utf8');
    if (!/MASTER_COLS\.VENDOR_CODE \+ 1\]: "거래처"/.test(src)) throw new Error('TRACKED_COLS에 거래처 없음');
  });
  check('Dashboard.refreshDashboard가 25열 배열에서 동작한다', () => {
    vm.runInContext('refreshDashboard(ss0)', ctx);
  });
  check('CacheManager.buildItemMapCache가 25열 배열에서 동작한다', () => {
    const map = vm.runInContext('CacheManager.buildItemMapCache(ss0)', ctx);
    if (!map['IT-001']) throw new Error('IT-001 없음');
    eq(map['IT-001'].price, 1100, '매입단가');
    if (map['IT-002']) throw new Error('미사용 품목이 캐시에 들어갔다');
  });
  check('recalcStockAndUsage가 25열 배열에서 동작한다', () => {
    vm.runInContext('recalcStockAndUsage(ss0)', ctx);
  });
  check('Archive의 월마감 점검이 25열 배열에서 초기재고/단가를 바르게 읽는다', () => {
    ctx.__masterRows = m.getRange(3, 1, 2, 25).getValues();
    const risks = vm.runInContext('detectCarryoverDoubleCount(__masterRows, [])', ctx);
    if (!Array.isArray(risks)) throw new Error('배열이 아님: ' + JSON.stringify(risks));
    // 초기재고(G)·매입단가(U)를 상수로 읽는지 — 열이 밀린 뒤에도 값이 맞아야 한다
    const rows = ctx.__masterRows;
    eq(rows[0][vm.runInContext('MASTER_COLS.INIT_STOCK', ctx)], 10, '초기재고');
    eq(rows[0][vm.runInContext('MASTER_COLS.UNIT_PRICE', ctx)], 1100, '매입단가');
    eq(rows[1][vm.runInContext('MASTER_COLS.USAGE_STATUS', ctx)], '미사용', '사용유무');
  });
}

// ───────────────────────────────────────────────────────────────
// 4) 배포 ~ 마이그레이션 사이의 창 — 스키마 가드
// ───────────────────────────────────────────────────────────────
// 코드는 git push로 즉시 나가지만 runMigrations()는 사람이 메뉴에서 눌러야 한다.
// 그 사이 창에서 코드(25열)와 시트(24열)가 한 칸 어긋난다. 이때 자정 트리거가
// recalcStockAndUsage를 돌리면 MASTER_COLS.TOTAL_VALUE+1 = 24열에 FIFO 값을 쓰는데,
// 아직 안 밀린 시트에서 24열은 **사용유무**다. 가드가 없으면 전 품목의 사용유무가 지워진다.
console.log('\n[4] 배포~마이그레이션 사이 창: 스키마 가드');
{
  const ss = buildLegacySpreadsheet(); // v17을 일부러 실행하지 않는다 (24열 그대로)
  const ctx = newContext(ss);
  ctx.ss0 = ss;
  const m = ss.getSheetByName('🗂️ 품목 마스터');

  check('사전 조건: 시트는 아직 24열이고 24열이 사용유무다', () => {
    eq(m.getRange(2, 24).getValue(), '사용유무');
    eq(m.getRange(3, 24).getValue(), '사용');
  });
  check('마이그레이션 전에는 재고 재계산이 쓰기를 거부한다', () => {
    vm.runInContext('recalcStockAndUsage(ss0)', ctx);
  });
  check('사용유무 열이 FIFO 평가액으로 덮어써지지 않는다', () => {
    eq(m.getRange(3, 24).getValue(), '사용', '3행 사용유무');
    eq(m.getRange(4, 24).getValue(), '미사용', '4행 사용유무');
  });
  check('마이그레이션 전에는 품목 정렬도 쓰기를 거부한다', () => {
    vm.runInContext('_sortMasterByUsageStatus(__master)', Object.assign(ctx, { __master: m }));
    eq(m.getRange(3, 24).getValue(), '사용');
    eq(m.getRange(3, 1).getValue(), 'IT-001');
  });
  check('v17을 돌린 뒤에는 재계산이 정상 동작한다', () => {
    vm.runInContext('MIGRATIONS[17](ss0)', ctx);
    eq(m.getRange(2, 25).getValue(), '사용유무', 'Y2');
    eq(m.getRange(3, 25).getValue(), '사용', 'Y3 보존');
    if (typeof m.getRange(3, 24).getValue() !== 'number') {
      throw new Error('재계산이 X열에 값을 쓰지 않았다: ' + JSON.stringify(m.getRange(3, 24).getValue()));
    }
  });
}

// ───────────────────────────────────────────────────────────────
// 5) 중간 실패에서의 복구 — 반쯤 만들어진 거래처 시트
// ───────────────────────────────────────────────────────────────
// 실제로 DEV에서 v17이 setFrozenColumns(2)에서 죽었다. 1행 제목이 A1:M1 병합인데 2열만 고정하면
// Sheets가 "병합된 셀의 일부만 포함된 열을 고정할 수 없습니다"로 거부한다.
// 문제는 그 예외가 insertSheet **뒤에** 터졌다는 것이다 — 시트는 만들어졌고 안은 덜 채워졌다.
// 그 상태에서 존재 검사만으로 스킵하면 반쯤 만들어진 시트가 그대로 굳는다.
console.log('\n[5] 중간 실패 복구: 반쯤 만들어진 거래처 시트');
{
  const ss = buildLegacySpreadsheet();
  const ctx = newContext(ss);
  ctx.ss0 = ss;

  // 이전 실행이 "시트 생성 + 제목 병합"까지만 하고 죽은 상태를 만든다
  const half = ss.insertSheet('🤝 거래처관리');
  half.getRange('A1:M1').merge().setValue('🤝 거래처(매입처) 관리');

  check('사전 조건: 시트는 있지만 헤더가 없다', () => {
    eq(half.getRange('A2').getValue(), '');
  });
  check('제목 병합을 가로지르는 열 고정은 거부된다 (원래 실패 지점)', () => {
    let threw = false;
    try { half.setFrozenColumns(2); } catch (e) { threw = /병합/.test(e.message); }
    if (!threw) throw new Error('병합 가로지르기 고정이 통과됐다 — 목이 실제 Sheets 제약을 재현하지 못한다');
  });
  check('행 고정(2행)은 제목 병합과 무관하므로 허용된다', () => {
    half.setFrozenRows(2);
  });
  check('v17 재실행이 반쯤 만들어진 시트를 복구한다', () => {
    vm.runInContext('MIGRATIONS[17](ss0)', ctx);
    eq(half.getRange('A2:M2').getValues()[0],
      ['거래처코드', '거래처명', '약어명', '사업자번호', '대표자명', '업태', '업종',
       '주소', '전화', '이메일', '사업자구분', '비고', '사용여부']);
    eq(half.getRange(3, 13).getDataValidation().args, ['사용', '미사용'], '사용여부 드롭다운');
    if (!half.hidden.has(14)) throw new Error('드롭다운 소스 N열이 숨겨지지 않았다');
    if (half.widths[8] !== 260) throw new Error('열 너비가 복구되지 않았다: ' + half.widths[8]);
  });
  check('buildVendors를 다시 불러도 예외 없이 같은 결과다 (멱등)', () => {
    vm.runInContext('buildVendors(ss0)', ctx);
    eq(half.getRange('A2').getValue(), '거래처코드');
    eq(ss.getSheets().filter(sh => sh.getName() === '🤝 거래처관리').length, 1, '시트 중복 생성');
  });
  check('복구 후에도 품목 마스터는 25열로 정상 마이그레이션된다', () => {
    const m = ss.getSheetByName('🗂️ 품목 마스터');
    eq(m.getRange('S2').getValue(), '거래처코드');
    eq(m.getRange('Y2').getValue(), '사용유무');
    eq(m.getRange(3, 25).getValue(), '사용');
  });
}

console.log('\n─────────────────────────────');
if (fail > 0) {
  console.error('✗ ' + fail + '개 검증 실패 (통과 ' + pass + ')');
  process.exit(1);
}
console.log('✓ TASK-017 (v17 거래처 마스터) 검증 통과 — ' + pass + '개');
