// Standalone logic test for MIGRATIONS[11] (unit list migration), mocking the
// subset of SpreadsheetApp Range/Sheet API the migration function uses.
// This does NOT touch any real Google Sheet - pure in-memory simulation.

const COLORS = { inputBg: "#fffde7" };
const SHEET_BASE_DATA = "BASE";
const SHEET_MASTER = "MASTER";
const MASTER_COLS = { UNIT: 4 }; // 0-based, matches real Config.gs

function makeSheetStore(baseUnits, masterUnits) {
  // baseUnits: array of strings (col B rows starting at row 3)
  // masterUnits: array of strings (col E rows starting at row 3)
  const state = {
    base: baseUnits.slice(),
    master: masterUnits.slice(),
  };

  function makeRange(colArrayRef) {
    return {
      _ref: colArrayRef,
      getValues: function() { return this._ref.arr.map(v => [v]); },
      setValues: function(vals) {
        // vals: [[v], [v], ...] - overwrite starting at ref
        for (let i = 0; i < vals.length; i++) this._ref.arr[i] = vals[i][0];
        return this;
      },
      clearContent: function() {
        for (let i = 0; i < this._ref.arr.length; i++) this._ref.arr[i] = "";
        return this;
      },
      setBackground: function() { return this; },
      setHorizontalAlignment: function() { return this; },
    };
  }

  const ss = {
    getSheetByName: function(name) {
      if (name === SHEET_BASE_DATA) {
        return {
          getLastRow: function() { return 2 + state.base.length; },
          getRange: function(row, col, numRows, numCols) {
            // only support col=2 (B) usage as in the real migration
            return makeRange({ get arr() { return state.base; }, set arr(v) { state.base = v; } });
          }
        };
      }
      if (name === SHEET_MASTER) {
        return {
          getLastRow: function() { return 2 + state.master.length; },
          getRange: function(row, col, numRows, numCols) {
            return makeRange({ get arr() { return state.master; }, set arr(v) { state.master = v; } });
          }
        };
      }
      return null;
    }
  };

  return { ss, state };
}

// ---- extracted migration logic (kept in sync with src/Migration.gs MIGRATIONS[11]) ----
function migrate_to_v11(ss) {
  const NEW_UNITS = ["망", "판", "마리", "족", "타레", "벌", "켤레", "매", "평", "본"];
  const RENAME_MAP = { "PACK": "팩", "SET": "세트" };

  function normalizedRename(value) {
    const s = String(value).trim();
    const key = s.toUpperCase();
    return RENAME_MAP.hasOwnProperty(key) ? RENAME_MAP[key] : null;
  }

  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  let renamedCount = 0, caseCountInList = 0, toAdd = [];
  if (baseSheet) {
    const baseLastRow = Math.max(baseSheet.getLastRow(), 3);
    let unitCol = baseLastRow >= 3 ? baseSheet.getRange(3, 2, baseLastRow - 2, 1).getValues().flat() : [];

    unitCol = unitCol.map(function(v) {
      if (!v) return v;
      const renamed = normalizedRename(v);
      if (renamed) { renamedCount++; return renamed; }
      return v;
    });

    unitCol = unitCol.filter(function(v) { return Boolean(v); });

    const existingTrimmed = unitCol.map(function(v) { return String(v).trim(); });
    toAdd = NEW_UNITS.filter(function(u) { return existingTrimmed.indexOf(u) === -1; });
    const finalUnits = unitCol.concat(toAdd);

    if (baseLastRow >= 3) baseSheet.getRange(3, 2, baseLastRow - 2, 1).clearContent();
    if (finalUnits.length > 0) {
      baseSheet.getRange(3, 2, finalUnits.length, 1).setValues(finalUnits.map(function(v) { return [v]; }));
    }
  }

  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  let masterRenamed = 0, masterCaseCount = 0;
  if (masterSheet) {
    const masterLastRow = masterSheet.getLastRow();
    if (masterLastRow >= 3) {
      const unitRange = masterSheet.getRange(3, MASTER_COLS.UNIT + 1, masterLastRow - 2, 1);
      const masterUnits = unitRange.getValues();
      const updated = masterUnits.map(function(row) {
        const renamed = normalizedRename(row[0]);
        if (renamed) { masterRenamed++; return [renamed]; }
        if (String(row[0]).trim().toUpperCase() === "CASE") { masterCaseCount++; }
        return row;
      });
      unitRange.setValues(updated);
    }
  }

  return { renamedCount, toAdd, masterRenamed, masterCaseCount };
}
// ---- end extracted logic ----

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  OK: " + msg);
}

console.log("=== Test 1: first run on realistic seed data ===");
const initialBase = ["박스","개","묶음","병","캔","kg","L","포","롤","장","세트","EA","PACK","CASE","봉","통","말","자루","ml","g","대","미터","포대","봉지","르베","권","갑","단"];
const initialMaster = ["박스", "PACK", "set", "CASE", "개", "CASE", "Set"]; // 7 items using various units
const { ss, state } = makeSheetStore(initialBase, initialMaster);

const r1 = migrate_to_v11(ss);
console.log("Result 1:", r1);
assert(r1.renamedCount === 1, "base list: exactly 1 rename (PACK->팩), got " + r1.renamedCount);
assert(state.base.indexOf("CASE") !== -1, "CASE retained in base unit list");
assert(state.base.indexOf("팩") !== -1, "팩 present in base unit list");
assert(state.base.indexOf("PACK") === -1, "PACK no longer present in base unit list");
assert(r1.toAdd.length === 10, "10 new units queued for addition, got " + r1.toAdd.length);
["망","판","마리","족","타레","벌","켤레","매","평","본"].forEach(function(u) {
  assert(state.base.indexOf(u) !== -1, "new unit '" + u + "' present in base list");
});
assert(r1.masterRenamed === 3, "master data: PACK/set/Set -> 3 renamed, got " + r1.masterRenamed);
assert(r1.masterCaseCount === 2, "master data: 2 CASE entries detected, got " + r1.masterCaseCount);
assert(state.master.indexOf("CASE") !== -1, "CASE values NOT touched in master data (still present)");
assert(state.master.filter(v => v === "CASE").length === 2, "both CASE rows unchanged");
assert(state.master.indexOf("팩") !== -1 && state.master.indexOf("세트") !== -1, "master PACK/set renamed correctly");

console.log("\n=== Test 2: idempotency - run again on already-migrated state ===");
const r2 = migrate_to_v11(ss);
console.log("Result 2:", r2);
assert(r2.renamedCount === 0, "second run: no more PACK/set renames needed, got " + r2.renamedCount);
assert(r2.toAdd.length === 0, "second run: no more units to add, got " + r2.toAdd.length);
assert(r2.masterRenamed === 0, "second run: no more master renames, got " + r2.masterRenamed);
assert(r2.masterCaseCount === 2, "second run: CASE count unchanged (still untouched), got " + r2.masterCaseCount);
assert(state.base.length === initialBase.length + 10, "base list length stable after 2nd run: " + state.base.length);

console.log("\nALL TESTS PASSED");
