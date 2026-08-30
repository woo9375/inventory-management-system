// Standalone logic test for the TASK-003 onEdit changelog block.
// Mocks the minimal Sheet/Range API surface used. Does NOT touch any real Google Sheet.
// A single unified `values` map (col -> value) per row is the sole source of truth,
// so getRange(...).getValues() and e.range.getValues() never disagree (matches how a
// real Google Sheet works: there is only ever one underlying cell grid).

const MASTER_COLS = {
  NAME: 1, CATEGORY: 2, GRADE: 3, UNIT: 4, INIT_STOCK: 6,
  LEAD_TIME: 10, SAFETY_DAYS: 11, TARGET_DAYS: 12,
  TAX_TYPE: 18, UNIT_PRICE: 19, USAGE_STATUS: 23
};
const SHEET_CHANGELOG = "CHANGELOG";

// ---- extracted logic (kept in sync with src/Code.gs onEdit SHEET_MASTER changelog block) ----
function runChangelogBlock(e, sheet) {
  const row = e.range.getRow();
  const startCol = e.range.getColumn();
  const numRows = e.range.getNumRows();
  const numCols = e.range.getNumColumns();
  const TRACKED_COLS = {
    [MASTER_COLS.NAME + 1]: "품목명", [MASTER_COLS.CATEGORY + 1]: "카테고리",
    [MASTER_COLS.GRADE + 1]: "규격", [MASTER_COLS.UNIT + 1]: "단위",
    [MASTER_COLS.INIT_STOCK + 1]: "초기재고",
    [MASTER_COLS.LEAD_TIME + 1]: "리드타임", [MASTER_COLS.SAFETY_DAYS + 1]: "안전재고일수",
    [MASTER_COLS.TARGET_DAYS + 1]: "목표유지일수",
    [MASTER_COLS.TAX_TYPE + 1]: "과세구분", [MASTER_COLS.UNIT_PRICE + 1]: "매입단가",
    [MASTER_COLS.USAGE_STATUS + 1]: "사용유무"
  };

  let touchesTrackedCol = false;
  for (let c = startCol; c < startCol + numCols; c++) {
    if (TRACKED_COLS[c]) { touchesTrackedCol = true; break; }
  }
  if (!touchesTrackedCol) return [];

  const isSingleCell = (numRows === 1 && numCols === 1);
  const singleOldValue = isSingleCell
    ? ((e.oldValue !== undefined && e.oldValue !== null) ? e.oldValue : "(이전값 없음)")
    : null;

  const newValues = e.range.getValues();
  const codeNamePairs = sheet.getRange(row, 1, numRows, 2).getValues();

  const timestamp = "2026-08-30 12:00:00";
  const editor = "tester@example.com";
  const changeRecords = [];

  for (let r = 0; r < numRows; r++) {
    const itemCode = codeNamePairs[r][0];
    const itemName = codeNamePairs[r][1];
    if (!itemCode) continue;

    for (let c = 0; c < numCols; c++) {
      const absCol = startCol + c;
      const fieldName = TRACKED_COLS[absCol];
      if (!fieldName) continue;

      const newValue = newValues[r][c];
      const oldValue = isSingleCell ? singleOldValue : "(이전값 없음)";

      if (isSingleCell && String(oldValue) === String(newValue)) continue;

      changeRecords.push([timestamp, editor, itemCode, itemName, fieldName, oldValue, newValue]);
    }
  }
  return changeRecords;
}
// ---- end extracted logic ----

// grid: { row: { col: value } } — single source of truth, like a real sheet
function makeSheet(grid) {
  return {
    __grid: grid,
    getRange: function(r, c, numRows, numCols) {
      return {
        getValues: function() {
          const out = [];
          for (let i = 0; i < numRows; i++) {
            const rowMap = grid[r + i] || {};
            const rowOut = [];
            for (let j = 0; j < numCols; j++) {
              const col = c + j;
              rowOut.push(rowMap[col] !== undefined ? rowMap[col] : "");
            }
            out.push(rowOut);
          }
          return out;
        }
      };
    }
  };
}

function makeRangeEvent(sheet, row, col, numRows, numCols, oldValue) {
  return {
    range: {
      getRow: () => row,
      getColumn: () => col,
      getNumRows: () => numRows,
      getNumColumns: () => numCols,
      getValues: function() { return sheet.getRange(row, col, numRows, numCols).getValues(); }
    },
    oldValue: oldValue
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("  OK: " + msg);
}

console.log("=== Scenario 1: 단일 셀 수정 (품목명 B열, 값 실제 변경) ===");
{
  const sheet = makeSheet({ 3: { 1: "A001", 2: "새품목명" } });
  const e = makeRangeEvent(sheet, 3, 2, 1, 1, "이전품목명");
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 1, "1건 기록됨");
  assert(recs[0][5] === "이전품목명" && recs[0][6] === "새품목명", "이전값/새값 정확");
}

console.log("=== Scenario 2: 단일 셀 삭제 (값 -> 빈값) ===");
{
  const sheet = makeSheet({ 3: { 1: "A001", 2: "품목A", 4: "" } }); // D열(규격) 삭제됨
  const e = makeRangeEvent(sheet, 3, 4, 1, 1, "500ml");
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 1, "1건 기록됨");
  assert(recs[0][5] === "500ml" && recs[0][6] === "", "이전값 500ml -> 새값 빈값");
}

console.log("=== Scenario 3: 여러 셀 붙여넣기 (한 행, B:D 열) ===");
{
  const sheet = makeSheet({ 3: { 1: "A001", 2: "붙여넣은이름", 3: "새카테고리", 4: "새규격" } });
  const e = makeRangeEvent(sheet, 3, 2, 1, 3, undefined);
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 3, "3개 컬럼(품목명/카테고리/규격) 모두 기록, got " + recs.length);
  recs.forEach(r => assert(r[5] === "(이전값 없음)", "다중셀은 이전값 없음으로 표기: " + r[4]));
}

console.log("=== Scenario 4: 여러 행 붙여넣기 (B열만, 3개 행) ===");
{
  const sheet = makeSheet({
    3: { 1: "A001", 2: "이름1" },
    4: { 1: "A002", 2: "이름2" },
    5: { 1: "A003", 2: "이름3" },
  });
  const e = makeRangeEvent(sheet, 3, 2, 3, 1, undefined);
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 3, "3개 행 모두 기록, got " + recs.length);
  assert(recs[0][2] === "A001" && recs[1][2] === "A002" && recs[2][2] === "A003", "품목코드 행별로 정확히 매칭");
}

console.log("=== Scenario 5: 여러 셀 Clear (E열 단위, 2행) ===");
{
  const sheet = makeSheet({
    3: { 1: "A001", 2: "품목1", 5: "" },
    4: { 1: "A002", 2: "품목2", 5: "" },
  });
  const e = makeRangeEvent(sheet, 3, 5, 2, 1, undefined);
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 2, "Clear된 2개 행 모두 기록, got " + recs.length);
  assert(recs[0][6] === "" && recs[1][6] === "", "새값이 빈값으로 정확히 기록");
}

console.log("=== Scenario 6: 값이 동일한 경우 (단일 셀, 무시 확인) ===");
{
  const sheet = makeSheet({ 3: { 1: "A001", 2: "동일값" } });
  const e = makeRangeEvent(sheet, 3, 2, 1, 1, "동일값");
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 0, "값 변경 없으면 기록 안 함, got " + recs.length);
}

console.log("=== Scenario 7: 이전 값이 없는 경우 (oldValue undefined, 단일셀) ===");
{
  const sheet = makeSheet({ 3: { 1: "A001", 2: "새값" } });
  const e = makeRangeEvent(sheet, 3, 2, 1, 1, undefined);
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 1, "1건 기록");
  assert(recs[0][5] === "(이전값 없음)", "이전값 없음으로 표기됨");
}

console.log("=== Scenario 8: 숫자 변경 (매입단가 T열=20) ===");
{
  const sheet = makeSheet({ 3: { 1: "A001", 2: "품목", 20: 5000 } });
  const e = makeRangeEvent(sheet, 3, 20, 1, 1, 4500);
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 1 && recs[0][5] === 4500 && recs[0][6] === 5000, "숫자값 정확히 기록");
}

console.log("=== Scenario 9: 문자 변경 (카테고리 C열=3) ===");
{
  const sheet = makeSheet({ 3: { 1: "A001", 2: "품목", 3: "식자재" } });
  const e = makeRangeEvent(sheet, 3, 3, 1, 1, "음료");
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 1 && recs[0][5] === "음료" && recs[0][6] === "식자재", "문자값 정확히 기록");
}

console.log("=== Scenario 10: 빈 값 -> 값 (초기재고 G열=7) ===");
{
  const sheet = makeSheet({ 3: { 1: "A001", 2: "품목", 7: 100 } });
  const e = makeRangeEvent(sheet, 3, 7, 1, 1, "");
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 1 && recs[0][5] === "" && recs[0][6] === 100, "빈값->값 정확히 기록");
}

console.log("=== Scenario 11 (추가): 추적 대상 아닌 컬럼(H열=8 현재고, 자동계산)은 무시 ===");
{
  const sheet = makeSheet({ 3: { 1: "A001", 2: "품목", 8: 999 } });
  const e = makeRangeEvent(sheet, 3, 8, 1, 1, 50);
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 0, "추적 대상 외 컬럼은 기록 안 함");
}

console.log("=== Scenario 12 (추가): 품목코드 없는 빈 행에 붙여넣기는 무시 ===");
{
  const sheet = makeSheet({ 10: { 1: "", 2: "", 3: "카테고리값" } }); // A열(코드) 비어있음
  const e = makeRangeEvent(sheet, 10, 3, 1, 1, undefined);
  const recs = runChangelogBlock(e, sheet);
  assert(recs.length === 0, "품목코드 없는 행은 기록 안 함");
}

console.log("\nALL 12 SCENARIOS PASSED");
