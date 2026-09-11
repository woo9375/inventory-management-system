/**
 * [TASK-019] migrateShops_TASK019 — 기존 업장 시트 삭제 + 신규 23개 업장 생성 (일회성 운영 스크립트)
 *
 * 이 스크립트는 업장 시트를 **영구 삭제**한다. 그래서 검증의 핵심은 "23개가 만들어지는가"만이 아니라
 *   · NO를 누르면 아무것도 건드리지 않는가
 *   · 업장관리 갱신이 실패하면 이전 목록을 복원하고 시트를 하나도 지우지 않는가 (되돌릴 수 있는 단계가 먼저)
 *   · 업장관리에 시스템 시트 이름이 섞여 있어도 절대 지우지 않는가
 * 다. 실제 src/*.gs를 vm에 로드해 끝까지 돌린다. 통합 갱신·CSV 백업은 호출 여부만 세는 스텁으로 바꾼다.
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
const TEMPLATE = '📋 입출고_템플릿';
const MASTER = '🗂️ 품목 마스터';
const SYSTEM = ['📊 대시보드', '📝 통합 입출고 기록장', MASTER, TEMPLATE, SHOPS, '📅 시즌설정',
                '👤 사용자관리', '📂 기초데이터', '📋 변경이력', '🤝 거래처관리', '🚨 System_Logs'];
const TX_HEADER = ['날짜', '품목코드', '품목명', '구분', '수량', '단가', '담당자', '비고', '거래ID'];

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '\n          ' + e.message); fail++; }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((what || '') + ' 기대 ' + b + ' / 실제 ' + a);
}
function ok(cond, what) { if (!cond) throw new Error(what || '조건 불충족'); }

function newContext(ss, answer) {
  const env = buildEnv(ss);
  // 확인창 답을 고정한다 (기본 목은 항상 YES)
  const baseUi = env.SpreadsheetApp.getUi();
  env.SpreadsheetApp.getUi = () => Object.assign({}, baseUi, {
    alert: (...a) => { env.__uiCalls.push(a); return a.length >= 3 ? answer : 'OK'; }
  });
  const ctx = vm.createContext(env);
  for (const name of GS_FILES) {
    const p = path.join(SRC, name + '.gs');
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: name + '.gs' });
  }
  // 무거운 본체는 호출 여부만 센다 — 이 테스트의 관심사는 시트 삭제/생성 순서와 안전장치다
  ctx.__calls = { refreshDashboard: [], backupToCSV: 0, invalidateAll: 0 };
  ctx.refreshDashboard = function (silent) { ctx.__calls.refreshDashboard.push(silent); };
  ctx.backupToCSV = function () { ctx.__calls.backupToCSV++; };
  // CacheManager는 const라 전역 프로퍼티가 아니다 — runInContext로 객체를 얻어 메서드만 감싼다
  const cacheManager = vm.runInContext('CacheManager', ctx);
  const realInvalidate = cacheManager.invalidateAll;
  cacheManager.invalidateAll = function () { ctx.__calls.invalidateAll++; return realInvalidate.apply(cacheManager, arguments); };
  return ctx;
}

/** 기존 4개 업장 + 삭제됨(숨김) 1개가 있는 운영 상태를 재현한다 */
function buildSpreadsheet(opts) {
  opts = opts || {};
  const ss = new Spreadsheet('prod');
  SYSTEM.forEach(n => { if (n !== SHOPS && n !== TEMPLATE && n !== MASTER) ss.insertSheet(n); });

  const master = ss.insertSheet(MASTER);
  master.getRange(3, 1, 3, 2).setValues([['IT-001', '수건'], ['IT-002', '비누'], ['IT-003', '칫솔']]);

  const tpl = ss.insertSheet(TEMPLATE);
  tpl.getRange('A1').setValue('✏️ 템플릿');
  tpl.getRange('A2:I2').setValues([TX_HEADER]);

  const shops = ss.insertSheet(SHOPS);
  shops.getRange('A2:G2').setValues([['분류', '업장명', '태그', '상태', '바로가기', 'GID', '담당자']]);

  const legacy = [['식음', '맛다락', 'TX'], ['식음', '술다락', 'AX'], ['스파월드', '남탕', 'MB'], ['스파월드', '여탕', 'WB']];
  const rows = [];
  legacy.forEach(([cat, name, tag]) => {
    const sh = ss.insertSheet(name);
    sh.getRange('A2:I2').setValues([TX_HEADER]);
    sh.getRange(3, 1, 2, 9).setValues([
      [new Date('2026-08-01T00:00:00'), 'IT-001', '수건', '입고', 10, 1000, '홍길동', '', tag + '-20260801-AAAA1111'],
      [new Date('2026-08-05T00:00:00'), 'IT-001', '수건', '출고', 3, 1000, '홍길동', '', tag + '-20260805-BBBB2222-01']
    ]);
    rows.push([cat, name, tag, '생성완료', '🔗 ' + name, sh.getSheetId(), 'staff@x']);
  });
  // 웹앱에서 소프트 삭제된 업장 (시트 숨김 + 상태 '삭제됨') — 이것도 옛 업장 시트이므로 함께 정리돼야 한다
  const gone = ss.insertSheet('폐점카페');
  gone.getRange('A2:I2').setValues([TX_HEADER]);
  gone.hideSheet();
  rows.push(['식음', '폐점카페', 'CF', '삭제됨', '', gone.getSheetId(), '']);

  if (opts.systemRow) rows.push(['관리', MASTER, 'MS', '생성완료', '', master.getSheetId(), '']);

  shops.getRange(3, 1, rows.length, 7).setValues(rows);
  return ss;
}

function shopRows(ss) {
  const sh = ss.getSheetByName(SHOPS);
  const last = sh.getLastRow();
  return last >= 3 ? sh.getRange(3, 1, last - 2, 7).getValues().filter(r => r[1]) : [];
}
function sheetNames(ss) { return ss.getSheets().map(s => s.getName()); }

console.log('[TASK-019] 업장 개편 마이그레이션');

// ── 목록 자체 검증 ──
{
  const ctx = newContext(buildSpreadsheet(), 'YES');
  const list = vm.runInContext('TASK019_NEW_SHOPS', ctx);
  check('신규 목록은 23개, 업장명·태그가 서로 다르고 태그는 대문자 2~3자다', () => {
    eq(list.length, 23, '업장 수');
    const names = new Set(list.map(s => s[1])), tags = new Set(list.map(s => s[2]));
    eq(names.size, 23, '업장명 중복'); eq(tags.size, 23, '태그 중복');
    list.forEach(s => ok(/^[A-Z]{2,3}$/.test(s[2]), '태그 형식: ' + s[2]));
    ctx._task019ValidateShopList(list);
  });
  check('사용자가 지정한 23개 업장명이 빠짐없이 들어 있다', () => {
    const expected = ['관리팀', '구매팀', '예약홍보팀', '호텔프론트', '호텔객실', '호텔 세탁실', '식음료', '조리팀', '직원식당',
      '기전실', '영선', '로봇커피', '달콤덕구', '매표소', '가족실', '카페테리아', '남탕', '여탕', '콘도프론트', '콘도객실',
      '콘도 세탁실', '맛다락', '술다락'];
    eq(list.map(s => s[1]), expected);
  });
  check('분류는 업장관리 A열 드롭다운 목록(buildShopsSheet) 안의 값만 쓴다', () => {
    const allowed = ['호텔', '콘도', '빌리지', '스파월드', '식음', '조리', '관리', '구매', '판촉'];
    list.forEach(s => ok(allowed.indexOf(s[0]) >= 0, '목록 밖 분류: ' + s[0] + ' (' + s[1] + ')'));
  });
  check('_task019ValidateShopList: 태그 중복·형식 오류를 시트를 건드리기 전에 거른다', () => {
    let threw = false;
    try { ctx._task019ValidateShopList([['식음', 'A', 'AA'], ['식음', 'B', 'AA']]); } catch (e) { threw = /태그 중복/.test(e.message); }
    ok(threw, '태그 중복 미검출');
    threw = false;
    try { ctx._task019ValidateShopList([['식음', 'A', 'abc']]); } catch (e) { threw = /대문자/.test(e.message); }
    ok(threw, '태그 형식 미검출');
  });
}

// ── 정상 경로 ──
{
  const ss = buildSpreadsheet();
  const ctx = newContext(ss, 'YES');
  const beforeNames = sheetNames(ss);
  const oldIds = { '맛다락': ss.getSheetByName('맛다락').getSheetId() };
  ctx.migrateShops_TASK019();

  check('기존 업장 시트(생성완료 4개 + 삭제됨/숨김 1개)를 GID로 찾아 삭제한다', () => {
    ok(!sheetNames(ss).includes('폐점카페'), '숨김 업장 시트가 남아 있음');
    ok(!ss.getSheets().some(s => s.getSheetId() === oldIds['맛다락']), '옛 맛다락 시트(GID)가 남아 있음');
  });
  check('시스템 시트는 모두 그대로다', () => {
    SYSTEM.forEach(n => ok(sheetNames(ss).includes(n), n + ' 사라짐'));
  });
  check('신규 23개 업장 시트가 템플릿에서 만들어진다 (헤더 복제, 입출고 없음)', () => {
    const list = vm.runInContext('TASK019_NEW_SHOPS', ctx);
    list.forEach(s => {
      const sh = ss.getSheetByName(s[1]);
      ok(sh, s[1] + ' 시트 없음');
      eq(sh.getRange('A2:I2').getValues()[0], TX_HEADER, s[1] + ' 헤더');
      ok(String(sh.getRange('A1').getValue()).indexOf(s[1]) >= 0, s[1] + ' A1 안내문');
      eq(sh.getLastRow(), 2, s[1] + '에 데이터 행이 있으면 안 됨');
    });
    eq(ss.getSheets().length, SYSTEM.length + 23, '전체 시트 수');
  });
  check('이름이 겹치는 업장(맛다락 등)은 옛 시트를 지우고 새 시트로 바꾼다 — 이력은 이월되지 않는다', () => {
    const sh = ss.getSheetByName('맛다락');
    ok(sh.getSheetId() !== oldIds['맛다락'], '옛 시트를 재사용함');
    eq(sh.getLastRow(), 2);
  });
  check('업장관리는 23행 전부 생성완료 + 바로가기 + 시트 GID가 실제 시트와 일치한다', () => {
    const rows = shopRows(ss);
    eq(rows.length, 23);
    rows.forEach(r => {
      eq(r[3], '생성완료', r[1] + ' 상태');
      ok(String(r[4]).indexOf('HYPERLINK') >= 0, r[1] + ' 바로가기');
      eq(ss.getSheetByName(r[1]).getSheetId(), r[5], r[1] + ' GID');
      eq(r[6], '', r[1] + ' 담당자는 비워야 함 (옛 배정 제거)');
    });
    eq(ctx._getActiveShopNames().length, 23);
  });
  check('사전 CSV 백업 1회 · 캐시 무효화 · 통합 갱신(refreshDashboard(true)) 1회', () => {
    eq(ctx.__calls.backupToCSV, 1, '백업');
    ok(ctx.__calls.invalidateAll >= 1, '캐시 무효화');
    eq(ctx.__calls.refreshDashboard, [true], '통합 갱신');
  });
  check('확인창(YES_NO)에 삭제될 시트 이름과 신규 업장 수가 적혀 있다', () => {
    const confirm = ctx.__uiCalls.find(a => a.length >= 3);
    ok(confirm, '확인창 없음');
    eq(confirm[2], 'YES_NO');
    ['맛다락', '술다락', '남탕', '여탕', '폐점카페', '23개'].forEach(t => ok(confirm[1].indexOf(t) >= 0, '확인창에 없음: ' + t));
  });
  check('완료 알림에 삭제/생성 결과가 적힌다', () => {
    const done = ctx.__uiCalls.find(a => a.length === 1 && /업장 개편 완료/.test(a[0]));
    ok(done, '완료 알림 없음');
    ok(/삭제한 시트: 5개/.test(done[0]), done[0]);
    ok(/생성완료 업장: 23 \/ 23개/.test(done[0]), done[0]);
  });
  check('멱등: 다시 실행하면 방금 만든 23개를 지우고 다시 만든다 (결과 동일)', () => {
    ctx.migrateShops_TASK019();
    eq(shopRows(ss).length, 23);
    eq(ss.getSheets().length, SYSTEM.length + 23);
  });
}

// ── NO → 아무것도 하지 않는다 ──
{
  const ss = buildSpreadsheet();
  const before = { names: sheetNames(ss), rows: shopRows(ss) };
  const ctx = newContext(ss, 'NO');
  ctx.migrateShops_TASK019();
  check('NO를 누르면 시트·업장관리·백업·통합 갱신 모두 손대지 않는다', () => {
    eq(sheetNames(ss), before.names);
    eq(shopRows(ss), before.rows);
    eq(ctx.__calls.backupToCSV, 0);
    eq(ctx.__calls.refreshDashboard, []);
  });
}

// ── 업장관리 갱신 실패 → 복원, 시트 삭제 없음 ──
{
  const ss = buildSpreadsheet();
  const before = { names: sheetNames(ss), rows: shopRows(ss) };
  const ctx = newContext(ss, 'YES');
  ctx._task019WriteShopRows = function () { throw new Error('분류 검증 거부(모의)'); };
  let err = null;
  try { ctx.migrateShops_TASK019(); } catch (e) { err = e; }
  check('업장관리 쓰기가 실패하면 예외를 던지고, 이전 목록을 복원하며, 시트는 하나도 지우지 않는다', () => {
    ok(err && /이전 목록을 복원/.test(err.message), '예외 문구: ' + (err && err.message));
    eq(sheetNames(ss), before.names, '시트 목록');
    eq(shopRows(ss), before.rows, '업장관리 행');
    eq(ctx.__calls.refreshDashboard, [], '통합 갱신은 돌면 안 됨');
  });
}

// ── 시스템 시트 보호 ──
{
  const ss = buildSpreadsheet({ systemRow: true });
  const ctx = newContext(ss, 'YES');
  ctx.migrateShops_TASK019();
  check('업장관리에 시스템 시트(품목 마스터)가 업장으로 적혀 있어도 절대 지우지 않는다', () => {
    ok(sheetNames(ss).includes(MASTER), '품목 마스터가 삭제됨');
    eq(ss.getSheetByName(MASTER).getRange('A3').getValue(), 'IT-001', '품목 마스터 데이터 보존');
    const confirm = ctx.__uiCalls.find(a => a.length >= 3);
    ok(confirm[1].indexOf(MASTER) < 0, '확인창의 삭제 목록에 시스템 시트가 있음');
  });
}

console.log('');
if (fail > 0) { console.error('✗ ' + fail + '개 검증 실패'); process.exit(1); }
console.log('✓ [TASK-019] 업장 개편 마이그레이션 검증 통과 — ' + pass + '개');
