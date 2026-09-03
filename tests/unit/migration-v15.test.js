/**
 * [v15] MIGRATIONS[15] 단위 '조', '줄' 추가 단위 테스트
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');

// ── In-memory Sheet & SpreadsheetApp Mock ──
function makeSheetStore(initialUnits) {
  const state = {
    units: initialUnits.slice()
  };

  const sheet = {
    getLastRow: () => Math.max(state.units.length + 2, 3),
    getRange: (row, col, numRows, numCols) => {
      const range = {
        getValues: () => state.units.map(u => [u]),
        setValues: (vals) => {
          state.units = vals.map(r => r[0]);
          return range;
        },
        clearContent: () => {
          state.units = [];
          return range;
        },
        setBackground: () => range,
        setHorizontalAlignment: () => range
      };
      return range;
    }
  };

  const ss = {
    getSheetByName: (name) => {
      if (name === '📂 기초데이터') return sheet;
      return null;
    }
  };

  return { ss, state };
}

// ── vm Sandbox Setup ──
function createSandbox() {
  const context = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    COLORS: { inputBg: '#fffde7' },
    SHEET_BASE_DATA: '📂 기초데이터',
    SpreadsheetApp: {
      flush: () => {}
    },
    CacheManager: {
      invalidateAll: () => {}
    }
  };

  const ctx = vm.createContext(context);
  const migrationSrc = fs.readFileSync(path.join(SRC, 'Migration.gs'), 'utf8');
  vm.runInContext(migrationSrc, ctx, { filename: 'Migration.gs' });

  ctx.__evalIn = (expr) => vm.runInContext(expr, ctx);
  return ctx;
}

console.log('=== [v15] 단위 목록 \'조\', \'줄\' 추가 테스트 ===');

// Test 1: Config.gs CURRENT_SCHEMA_VERSION >= 15
// [TASK-016] 정확히 15로 고정하면 이후 마이그레이션이 추가될 때마다 무관한 테스트가 깨진다.
// v15가 적용 대상에 포함되는지만 보면 되므로 하한 비교로 바꾼다.
const configSrc = fs.readFileSync(path.join(SRC, 'Config.gs'), 'utf8');
const versionMatch = configSrc.match(/const CURRENT_SCHEMA_VERSION\s*=\s*(\d+);/);
assert.ok(versionMatch, 'CURRENT_SCHEMA_VERSION 상수가 존재해야 함');
const currentVersion = Number(versionMatch[1]);
assert.ok(currentVersion >= 15, `CURRENT_SCHEMA_VERSION이 15 이상이어야 함 (실제: ${currentVersion})`);
console.log('  OK: CURRENT_SCHEMA_VERSION >= 15 (실제: ' + currentVersion + ')');

// Test 2: SheetBuilder.gs 초기 units 배열에 '조', '줄' 포함 확인
const sheetBuilderSrc = fs.readFileSync(path.join(SRC, 'SheetBuilder.gs'), 'utf8');
assert.ok(sheetBuilderSrc.includes('["조"]'), 'SheetBuilder.gs에 ["조"] 포함');
assert.ok(sheetBuilderSrc.includes('["줄"]'), 'SheetBuilder.gs에 ["줄"] 포함');
console.log('  OK: SheetBuilder.gs 기본 units에 \'조\', \'줄\' 포함');

// Test 3: MIGRATIONS[15] 실행 - 신규 단위 추가
const sandbox = createSandbox();
const migrate15 = sandbox.__evalIn('MIGRATIONS[15]');
assert.ok(typeof migrate15 === 'function', 'MIGRATIONS[15] 함수가 정의되어 있어야 함');

const seedUnits = ["박스", "개", "묶음", "병", "캔", "kg", "L", "포", "세트", "EA", "팩"];
const { ss, state } = makeSheetStore(seedUnits);

migrate15(ss);
assert.ok(state.units.includes("조"), "'조' 단위가 추가되어야 함");
assert.ok(state.units.includes("줄"), "'줄' 단위가 추가되어야 함");
assert.strictEqual(state.units.length, seedUnits.length + 2, '정확히 2개 단위가 추가되어야 함');
console.log('  OK: MIGRATIONS[15] 신규 단위 \'조\', \'줄\' 정상 추가');

// Test 4: 멱등성(Idempotency) - 2회 연속 실행 시 중복 추가되지 않음
const lenAfterFirst = state.units.length;
migrate15(ss);
assert.strictEqual(state.units.length, lenAfterFirst, '재실행 시 단위 개수가 유지되어야 함 (중복 없음)');
console.log('  OK: MIGRATIONS[15] 멱등성 검증 통과 (재실행 시 중복 없음)');

// Test 5: 부분 존재 - '조'만 이미 있을 때 '줄'만 추가
const { ss: ssPartial, state: statePartial } = makeSheetStore(["박스", "개", "조"]);
migrate15(ssPartial);
assert.ok(statePartial.units.includes("조"), "'조' 유지");
assert.ok(statePartial.units.includes("줄"), "'줄' 추가");
assert.strictEqual(statePartial.units.filter(u => u === "조").length, 1, "'조'가 1개만 존재해야 함");
assert.strictEqual(statePartial.units.length, 4, '총 4개여야 함');
console.log('  OK: 부분 존재 시 누락된 단위만 선별 추가');

// Test 6: 시트 부재 시 예외 없이 스킵
const ssEmpty = { getSheetByName: () => null };
assert.doesNotThrow(() => {
  migrate15(ssEmpty);
}, '기초데이터 시트가 없어도 예외를 던지지 않아야 함');
console.log('  OK: 시트 부재 시 graceful skip');

console.log('\n✓ MIGRATIONS[15] 전체 검증 통과');
