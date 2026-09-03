/**
 * [TASK-010] 마감된 과거 기간의 거래 입력 차단 가드레일 검증
 *
 * `src/Config.gs` + `src/Archive.gs`를 vm 컨텍스트에 실제로 로드하고
 * SpreadsheetApp / PropertiesService만 모킹한다. 검증 대상은
 * `getLatestClosingCutoff()`와 `validateNotClosedMonth()`이며,
 * `addTransaction()`은 이 두 함수의 결과를 그대로 반환하므로 함께 시뮬레이션한다.
 *
 * 실제 Google Sheet는 전혀 건드리지 않는 순수 인메모리 시뮬레이션이다.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');

function pad(n) { return String(n).padStart(2, '0'); }

/**
 * @param {Array<Array<*>>} txRows 통합 입출고 기록장 9열 행
 * @param {Object|null} props 초기 ScriptProperties 값
 */
function buildContext(txRows, props) {
  const stored = Object.assign({}, props || {});

  const txSheet = {
    getLastRow: () => 2 + txRows.length,
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => txRows.slice(row - 3, row - 3 + numRows).map((r) => r.slice(col - 1, col - 1 + numCols))
    })
  };

  const ss = {
    getSheetByName: (n) => (n === '📝 통합 입출고 기록장' ? txSheet : null)
  };

  const sandbox = {
    console: { log: () => {}, error: () => {}, warn: () => {} },
    Logger: { log: () => {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in stored ? stored[k] : null),
        setProperty: (k, v) => { stored[k] = v; }
      })
    },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    Utilities: {
      // GAS Utilities.formatDate의 "yyyy-MM-dd" 부분만 흉내낸다
      formatDate: (d, tz, fmt) => {
        assert.strictEqual(fmt, 'yyyy-MM-dd', '테스트가 지원하지 않는 포맷: ' + fmt);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      },
      getUuid: () => '00000000-0000-0000-0000-000000000000'
    },
    DriveApp: {},
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    validateSession: () => ({ role: 'admin' }),
    toLocalDate: (v) => (v instanceof Date ? v : new Date(String(v) + 'T00:00:00'))
  };
  vm.createContext(sandbox);
  for (const f of ['Config.gs', 'Archive.gs']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f });
  }
  const evalIn = (expr) => vm.runInContext(expr, sandbox);
  return { evalIn: evalIn, stored: stored, ss: ss };
}

/** 마감 이월 입고 행 (거래ID SYS-…, 비고 "…마감 이월") */
function carryoverRow(dateStr, year, month) {
  return [new Date(dateStr + 'T00:00:00'), 'ITEM-1', '테스트품목', '입고', 10, 1000, 'System',
          year + '년 ' + month + '월 마감 이월', 'SYS-' + year + pad(month) + '01-ABCD1234'];
}
/** 일반 입고 행 */
function normalRow(dateStr) {
  return [new Date(dateStr + 'T00:00:00'), 'ITEM-1', '테스트품목', '입고', 5, 1000, '홍길동', '', 'TX-20260901-11112222'];
}

let failures = 0;
function check(label, fn) {
  try { fn(); console.log('  OK  ' + label); }
  catch (e) { console.error('  FAIL ' + label + ' — ' + e.message); failures++; }
}

console.log('[TASK-010] 마감월 데이터 수정 차단 가드레일');

// ── Scenario 1: ScriptProperties에 마감일이 기록된 상태 ──
{
  const ctx = buildContext([], { LAST_CLOSED_CUTOFF: '2026-08-31' });
  const validate = ctx.evalIn('validateNotClosedMonth');

  check('S1: 마감 기준일(2026-08-31) 당일 거래는 차단된다', () => {
    const r = validate('2026-08-31');
    assert.strictEqual(r.blocked, true);
    assert.ok(r.message.indexOf('2026-08-31') >= 0, '메시지에 마감일이 없음: ' + r.message);
  });
  check('S1: 마감 기준일 이전(2026-08-15) 거래는 차단된다', () => {
    assert.strictEqual(validate('2026-08-15').blocked, true);
  });
  check('S1: 마감 익월 1일(2026-09-01) 거래는 허용된다', () => {
    assert.strictEqual(validate('2026-09-01').blocked, false);
  });
  check('S1: 마감 이후(2026-09-20) 거래는 허용된다', () => {
    assert.strictEqual(validate('2026-09-20').blocked, false);
  });
  check('S1: 연도가 앞선 과거(2025-12-31)도 차단된다', () => {
    assert.strictEqual(validate('2025-12-31').blocked, true);
  });
}

// ── Scenario 2: 프로퍼티가 없고 이월 행으로 역산해야 하는 상태 ──
{
  const rows = [normalRow('2026-09-05'), carryoverRow('2026-09-01', 2026, 8), normalRow('2026-09-10')];
  const ctx = buildContext(rows, {});

  check('S2: 이월 행(2026-09-01)에서 마감 기준일 2026-08-31을 역산한다', () => {
    assert.strictEqual(ctx.evalIn('getLatestClosingCutoff')(), '2026-08-31');
  });
  check('S2: 역산 결과가 ScriptProperties에 캐시된다', () => {
    assert.strictEqual(ctx.stored.LAST_CLOSED_CUTOFF, '2026-08-31');
  });
  check('S2: 역산된 기준일로도 과거 거래가 차단된다', () => {
    assert.strictEqual(ctx.evalIn('validateNotClosedMonth')('2026-08-20').blocked, true);
  });
}

// ── Scenario 3: 여러 번 마감된 경우 가장 최신 이월 행이 기준이 된다 ──
{
  const rows = [carryoverRow('2026-07-01', 2026, 6), carryoverRow('2026-09-01', 2026, 8), carryoverRow('2026-08-01', 2026, 7)];
  const ctx = buildContext(rows, {});
  check('S3: 최신 이월 행 기준으로 2026-08-31이 선택된다', () => {
    assert.strictEqual(ctx.evalIn('getLatestClosingCutoff')(), '2026-08-31');
  });
}

// ── Scenario 4: 마감 이력이 전혀 없는 신규 시트 ──
{
  const ctx = buildContext([normalRow('2026-09-01'), normalRow('2026-01-05')], {});
  check('S4: 마감 이력이 없으면 cutoff는 null이다', () => {
    assert.strictEqual(ctx.evalIn('getLatestClosingCutoff')(), null);
  });
  check('S4: 마감 이력이 없으면 어떤 날짜도 차단하지 않는다', () => {
    const validate = ctx.evalIn('validateNotClosedMonth');
    assert.strictEqual(validate('2026-01-05').blocked, false);
    assert.strictEqual(validate('2020-01-01').blocked, false);
  });
}

// ── Scenario 5: 월/연 경계 (12월 마감 → 이듬해 1월 1일 이월) ──
{
  const ctx = buildContext([carryoverRow('2027-01-01', 2026, 12)], {});
  check('S5: 12월 마감의 기준일은 2026-12-31이다', () => {
    assert.strictEqual(ctx.evalIn('getLatestClosingCutoff')(), '2026-12-31');
  });
  check('S5: 2027-01-01 거래는 허용된다', () => {
    assert.strictEqual(ctx.evalIn('validateNotClosedMonth')('2027-01-01').blocked, false);
  });
}

// ── Scenario 6: 마감 실행 시 기준일 기록 ──
{
  const ctx = buildContext([], {});
  check('S6: setLatestClosingCutoff(Date)가 yyyy-MM-dd로 저장된다', () => {
    ctx.evalIn('setLatestClosingCutoff')(new Date(2026, 7, 31, 23, 59, 59)); // 2026-08-31
    assert.strictEqual(ctx.stored.LAST_CLOSED_CUTOFF, '2026-08-31');
  });
  check('S6: 잘못된 형식은 저장하지 않는다', () => {
    const before = ctx.stored.LAST_CLOSED_CUTOFF;
    ctx.evalIn('setLatestClosingCutoff')('2026/08/31');
    assert.strictEqual(ctx.stored.LAST_CLOSED_CUTOFF, before);
  });
}

// ── Scenario 7: 클라이언트 UX용 최소 선택 가능일 ──
{
  const ctx = buildContext([], { LAST_CLOSED_CUTOFF: '2026-08-31' });
  check('S7: getClosingCutoffInfo가 minDate로 마감 익일을 준다', () => {
    const info = ctx.evalIn('getClosingCutoffInfo')('dummy-token');
    assert.strictEqual(info.success, true);
    assert.strictEqual(info.cutoff, '2026-08-31');
    assert.strictEqual(info.minDate, '2026-09-01');
  });
}

// ── Scenario 8: 역할과 무관하게 동일 차단 (검증 함수에 역할 인자가 없음) ──
{
  const ctx = buildContext([], { LAST_CLOSED_CUTOFF: '2026-08-31' });
  check('S8: admin/manager/staff 구분 없이 동일하게 차단된다', () => {
    const validate = ctx.evalIn('validateNotClosedMonth');
    assert.strictEqual(validate.length <= 2, true, '역할 인자를 받는 시그니처면 예외 경로가 생긴다');
    ['admin', 'manager', 'staff'].forEach(() => {
      assert.strictEqual(validate('2026-08-15').blocked, true);
    });
  });
}

if (failures > 0) {
  console.error('\n✗ ' + failures + '개 검증 실패');
  process.exit(1);
}
console.log('\n✓ 마감월 가드레일 검증 통과');
