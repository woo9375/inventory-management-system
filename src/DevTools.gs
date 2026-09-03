/**
 * 호텔덕구온천 재고 관리 시스템 — DEV 전용 도구 (TASK-004)
 *
 * ⚠️ 이 파일의 모든 쓰기 함수는 Production에서 실행되지 않는다.
 *    동일 소스가 Production Apps Script에도 배포되므로, 각 함수는 진입 즉시
 *    _requireDevEnv() 로 환경을 확인하고 DEV가 아니면 예외를 던진다.
 *    환경 판별은 Config.gs의 getAppEnv() — ScriptProperties APP_ENV === "DEV" 인 경우에만 DEV.
 *    ScriptProperties가 비어 있으면 항상 Production으로 간주된다(안전 기본값).
 *
 * DEV Apps Script 프로젝트에서 최초 1회 setupDevScriptProperties() 를 실행하여
 * APP_ENV / ARCHIVE_FOLDER_ID 를 설정한 뒤 사용한다.
 */

// DEV 시드 데이터 식별 접두어 — 이 접두어를 가진 데이터만 정리(reset) 대상이다.
const DEV_TEST_ITEM_PREFIX = "ITEM-TEST-";
// DEV 마감 데이터 폴더 (사용자가 Drive에 직접 생성한 폴더)
const DEV_ARCHIVE_FOLDER_ID = "1HdnbvTyNIu3nGmKnO3--2_R8N1rTZN9x";

/**
 * DEV 환경이 아니면 즉시 중단시키는 가드.
 * @private
 */
function _requireDevEnv() {
  if (!isDevEnv()) {
    throw new Error(
      "⛔ 이 함수는 DEV 환경에서만 실행할 수 있습니다. " +
      "현재 환경: " + getAppEnv() + ". " +
      "(DEV Apps Script 프로젝트에서 ScriptProperties APP_ENV=DEV 설정 후 사용하십시오.)"
    );
  }
}

/**
 * [DEV 최초 1회] DEV Apps Script 프로젝트의 ScriptProperties를 설정한다.
 *
 * ⚠️ 이 함수만은 환경 가드를 걸 수 없다(가드에 필요한 값을 세우는 함수이므로).
 *    대신 바인딩된 스프레드시트 ID가 DEV 스프레드시트인지 직접 확인하여
 *    Production 스프레드시트에 바인딩된 스크립트에서는 실행되지 않도록 막는다.
 */
function setupDevScriptProperties() {
  const DEV_SPREADSHEET_ID = "17ukRYqvpsRSuFoDHuk0ZTba1ATzC8_odCkw6kYEG5dE";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentId = ss ? ss.getId() : "";

  if (currentId !== DEV_SPREADSHEET_ID) {
    throw new Error(
      "⛔ 현재 스크립트는 DEV 스프레드시트에 바인딩되어 있지 않습니다.\n" +
      "현재 바인딩: " + currentId + "\n" +
      "기대값(DEV): " + DEV_SPREADSHEET_ID + "\n" +
      "Production에서는 절대 실행하지 마십시오."
    );
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty(ENV_PROPERTY_KEYS.APP_ENV, APP_ENV_DEV);
  props.setProperty(ENV_PROPERTY_KEYS.ARCHIVE_FOLDER_ID, DEV_ARCHIVE_FOLDER_ID);

  const msg = "✅ DEV ScriptProperties 설정 완료\n" +
    ENV_PROPERTY_KEYS.APP_ENV + " = " + APP_ENV_DEV + "\n" +
    ENV_PROPERTY_KEYS.ARCHIVE_FOLDER_ID + " = " + DEV_ARCHIVE_FOLDER_ID;
  console.log(msg);
  return msg;
}

/**
 * [읽기 전용] 현재 DEV 환경의 실제 상태를 조사하여 리포트를 반환한다.
 * 데이터를 전혀 변경하지 않으므로 상태 확인용으로 자유롭게 실행할 수 있다.
 * @returns {string} 사람이 읽을 수 있는 리포트
 */
function verifyDevEnvironment() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lines = [];
  const push = function(s) { lines.push(s); };

  push("═══ DEV Environment Verification ═══");
  push("APP_ENV               : " + getAppEnv());
  push("Spreadsheet           : " + ss.getName());
  push("Spreadsheet ID        : " + ss.getId());
  push("Archive folder (해석값) : " + getArchiveFolderId());
  push("  ├ 기본 상수          : " + ARCHIVE_FOLDER_ID);
  push("  └ DEV 기대값         : " + DEV_ARCHIVE_FOLDER_ID);
  push("Archive 분리 상태      : " +
    (getArchiveFolderId() === DEV_ARCHIVE_FOLDER_ID ? "✅ DEV 폴더로 분리됨"
      : (isDevEnv() ? "⚠️ DEV인데 Production 폴더를 가리킴 — setupDevScriptProperties() 실행 필요"
                    : "ℹ️ Production 기본값 사용 중")));
  push("Schema version        : v" + getSchemaVersion() + " (코드 목표: v" + CURRENT_SCHEMA_VERSION + ")");
  push("");

  // ── 시트 존재 확인 ──
  push("── Sheets ──");
  const expected = [
    SHEET_DASHBOARD, SHEET_INOUT, SHEET_MASTER, SHEET_TEMPLATE,
    SHEET_SHOPS, SHEET_SEASONS, SHEET_USERS, SHEET_BASE_DATA,
    SHEET_CHANGELOG, SHEET_SYSTEM_LOGS
  ];
  expected.forEach(function(name) {
    const sh = ss.getSheetByName(name);
    push((sh ? "✅" : "❌") + " " + name + (sh ? "  (rows=" + sh.getLastRow() + ", cols=" + sh.getLastColumn() + ")" : ""));
  });
  push("");

  // ── 단위 목록 상태 (TASK-002 검증) ──
  push("── 단위 목록 (기초데이터 B열) ──");
  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  if (baseSheet) {
    const baseLastRow = Math.max(baseSheet.getLastRow(), 3);
    const units = baseSheet.getRange(3, 2, baseLastRow - 2, 1).getValues()
      .flat().filter(function(v) { return v; }).map(function(v) { return String(v).trim(); });
    push("총 " + units.length + "종");
    const newUnits = ["망", "판", "마리", "족", "타레", "벌", "켤레", "매", "평", "본"];
    const missing = newUnits.filter(function(u) { return units.indexOf(u) === -1; });
    push("신규 10종 누락    : " + (missing.length === 0 ? "없음 ✅" : missing.join(", ") + " ❌"));
    push("'팩' 존재         : " + (units.indexOf("팩") > -1 ? "✅" : "❌"));
    push("'세트' 존재       : " + (units.indexOf("세트") > -1 ? "✅" : "❌"));
    push("'PACK' 잔존       : " + (units.indexOf("PACK") > -1 ? "⚠️ 있음" : "없음 ✅"));
    push("'CASE' 잔존       : " + (units.indexOf("CASE") > -1 ? "⚠️ 있음 (v13 미실행)" : "없음 ✅"));
    push("'조', '줄' 존재     : " + ((units.indexOf("조") > -1 && units.indexOf("줄") > -1) ? "✅" : "❌"));
  } else {
    push("❌ 기초데이터 시트 없음");
  }
  push("");

  // ── 품목 마스터 단위 사용 실태 (TASK-002 CASE 결정용 근거) ──
  push("── 품목 마스터 단위 사용 실태 ──");
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  if (masterSheet && masterSheet.getLastRow() >= 3) {
    const lastRow = masterSheet.getLastRow();
    const rows = masterSheet.getRange(3, 1, lastRow - 2, MASTER_COL_COUNT).getValues();
    let total = 0, caseCount = 0, packCount = 0, setCount = 0, emptyUnit = 0;
    const caseSamples = [];
    rows.forEach(function(r) {
      const code = r[MASTER_COLS.CODE];
      if (!code) return;
      total++;
      const u = String(r[MASTER_COLS.UNIT] || "").trim();
      const uu = u.toUpperCase();
      if (!u) { emptyUnit++; return; }
      if (uu === "CASE") { caseCount++; if (caseSamples.length < 10) caseSamples.push(code + " / " + r[MASTER_COLS.NAME]); }
      else if (uu === "PACK") { packCount++; }
      else if (uu === "SET") { setCount++; }
    });
    push("전체 품목 수      : " + total);
    push("단위 'CASE' 사용  : " + caseCount + "건   ← 목록에서는 삭제됨(v13). 품목 값은 수동 정정 대상");
    push("단위 'PACK' 사용  : " + packCount + "건");
    push("단위 'set' 사용   : " + setCount + "건");
    push("단위 비어있음     : " + emptyUnit + "건");
    if (caseSamples.length > 0) {
      push("CASE 사용 품목 예시(최대 10건):");
      caseSamples.forEach(function(s) { push("   - " + s); });
    }
  } else {
    push("품목 마스터 데이터 없음");
  }
  push("");

  // ── DEV 시드 데이터 존재 여부 ──
  push("── DEV 시드 데이터 ──");
  const seeded = _findDevTestItemRows(ss);
  push("시드 품목(" + DEV_TEST_ITEM_PREFIX + "*) : " + seeded.length + "건");
  seeded.forEach(function(s) { push("   - " + s.code + " / " + s.name + " / 단가 " + s.price); });

  const report = lines.join("\n");
  console.log(report);
  return report;
}

/**
 * 품목 마스터에서 DEV 시드 품목 행을 찾는다.
 * @private
 */
function _findDevTestItemRows(ss) {
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const out = [];
  if (!masterSheet || masterSheet.getLastRow() < 3) return out;
  const lastRow = masterSheet.getLastRow();
  const rows = masterSheet.getRange(3, 1, lastRow - 2, MASTER_COL_COUNT).getValues();
  rows.forEach(function(r, idx) {
    const code = String(r[MASTER_COLS.CODE] || "");
    if (code.indexOf(DEV_TEST_ITEM_PREFIX) === 0) {
      out.push({
        row: idx + 3,
        code: code,
        name: r[MASTER_COLS.NAME],
        price: r[MASTER_COLS.UNIT_PRICE]
      });
    }
  });
  return out;
}

/**
 * [DEV 전용] 결정적(deterministic) 테스트 품목을 품목 마스터에 시드한다.
 * 이미 존재하는 시드 품목은 값을 덮어써 항상 같은 상태가 되도록 한다(멱등).
 * 기존 운영 복제 데이터는 절대 건드리지 않는다.
 * @returns {string} 실행 리포트
 */
function seedDevData() {
  _requireDevEnv();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  if (!masterSheet) throw new Error("품목 마스터 시트를 찾을 수 없습니다.");

  // FIFO / 변경이력 테스트가 가능하도록 서로 다른 단가의 품목을 구성한다.
  const seeds = [
    { code: DEV_TEST_ITEM_PREFIX + "001", name: "테스트품목_단가1000", unit: "박스", initStock: 100, price: 1000 },
    { code: DEV_TEST_ITEM_PREFIX + "002", name: "테스트품목_단가2000", unit: "개",   initStock: 50,  price: 2000 },
    { code: DEV_TEST_ITEM_PREFIX + "003", name: "테스트품목_단가3000", unit: "팩",   initStock: 0,   price: 3000 }
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existing = _findDevTestItemRows(ss);
    const byCode = {};
    existing.forEach(function(e) { byCode[e.code] = e.row; });

    let updated = 0, inserted = 0;

    seeds.forEach(function(s) {
      const rowValues = new Array(MASTER_COL_COUNT).fill("");
      rowValues[MASTER_COLS.CODE] = s.code;
      rowValues[MASTER_COLS.NAME] = s.name;
      rowValues[MASTER_COLS.CATEGORY] = "소모품";
      rowValues[MASTER_COLS.GRADE] = "TEST";
      rowValues[MASTER_COLS.UNIT] = s.unit;
      rowValues[MASTER_COLS.INIT_STOCK] = s.initStock;
      rowValues[MASTER_COLS.LEAD_TIME] = 2;
      rowValues[MASTER_COLS.SAFETY_DAYS] = 3;
      rowValues[MASTER_COLS.TARGET_DAYS] = 7;
      rowValues[MASTER_COLS.TAX_TYPE] = "과세";
      rowValues[MASTER_COLS.UNIT_PRICE] = s.price;
      rowValues[MASTER_COLS.USAGE_STATUS] = "사용";

      // 수식 컬럼(H, N~Q, U~W)은 ARRAYFORMULA가 채우므로 건드리지 않는다.
      const writeRow = function(targetRow) {
        // 입력 가능한 구간만 개별 배치 쓰기 (수식 컬럼 덮어쓰기 방지)
        masterSheet.getRange(targetRow, 1, 1, 5).setValues([[
          rowValues[MASTER_COLS.CODE], rowValues[MASTER_COLS.NAME],
          rowValues[MASTER_COLS.CATEGORY], rowValues[MASTER_COLS.GRADE], rowValues[MASTER_COLS.UNIT]
        ]]);
        masterSheet.getRange(targetRow, MASTER_COLS.INIT_STOCK + 1, 1, 1).setValue(rowValues[MASTER_COLS.INIT_STOCK]);
        masterSheet.getRange(targetRow, MASTER_COLS.LEAD_TIME + 1, 1, 3).setValues([[
          rowValues[MASTER_COLS.LEAD_TIME], rowValues[MASTER_COLS.SAFETY_DAYS], rowValues[MASTER_COLS.TARGET_DAYS]
        ]]);
        masterSheet.getRange(targetRow, MASTER_COLS.TAX_TYPE + 1, 1, 2).setValues([[
          rowValues[MASTER_COLS.TAX_TYPE], rowValues[MASTER_COLS.UNIT_PRICE]
        ]]);
        masterSheet.getRange(targetRow, MASTER_COLS.USAGE_STATUS + 1, 1, 1).setValue(rowValues[MASTER_COLS.USAGE_STATUS]);
      };

      if (byCode[s.code]) {
        writeRow(byCode[s.code]);
        updated++;
      } else {
        const newRow = Math.max(masterSheet.getLastRow() + 1, 3);
        writeRow(newRow);
        inserted++;
      }
    });

    SpreadsheetApp.flush();
    CacheManager.invalidateAll();

    const msg = "✅ seedDevData 완료 — 신규 " + inserted + "건, 갱신 " + updated + "건 (총 " + seeds.length + "건)";
    console.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

/**
 * [DEV 전용] DEV 시드 데이터가 만든 흔적만 정리한다.
 * 삭제 범위:
 *   - 품목 마스터의 ITEM-TEST-* 행
 *   - 각 업장 시트 / 통합 입출고 기록장의 ITEM-TEST-* 거래 행
 *   - 변경이력의 ITEM-TEST-* 행
 * 그 외 데이터(운영에서 복제된 품목 4천여 건 등)는 절대 건드리지 않는다.
 * @returns {string} 실행 리포트
 */
function resetDevEnvironment() {
  _requireDevEnv();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const report = [];

    // 1) 거래 시트 정리 (업장 시트 + 통합 입출고) — 품목코드는 2번째 열
    const txSheetNames = [SHEET_INOUT];
    const shopSheet = ss.getSheetByName(SHEET_SHOPS);
    if (shopSheet && shopSheet.getLastRow() >= 3) {
      shopSheet.getRange(3, 1, shopSheet.getLastRow() - 2, 6).getValues().forEach(function(r) {
        if (r[1] && r[3] === "생성완료") txSheetNames.push(r[1]);
      });
    }
    txSheetNames.forEach(function(name) {
      const sh = ss.getSheetByName(name);
      if (!sh || sh.getLastRow() < 3) return;
      const n = sh.getLastRow() - 2;
      const data = sh.getRange(3, 1, n, TX_COLS).getValues();
      const kept = data.filter(function(r) {
        return String(r[1] || "").indexOf(DEV_TEST_ITEM_PREFIX) !== 0;
      });
      const removed = data.length - kept.length;
      if (removed > 0) {
        sh.getRange(3, 1, n, TX_COLS).clearContent();
        if (kept.length > 0) sh.getRange(3, 1, kept.length, TX_COLS).setValues(kept);
        report.push("거래 " + name + ": " + removed + "행 삭제");
      }
    });

    // 2) 변경이력 정리 — 품목코드는 3번째 열
    const clSheet = ss.getSheetByName(SHEET_CHANGELOG);
    if (clSheet && clSheet.getLastRow() >= 3) {
      const n = clSheet.getLastRow() - 2;
      const data = clSheet.getRange(3, 1, n, 7).getValues();
      const kept = data.filter(function(r) {
        return String(r[2] || "").indexOf(DEV_TEST_ITEM_PREFIX) !== 0;
      });
      const removed = data.length - kept.length;
      if (removed > 0) {
        clSheet.getRange(3, 1, n, 7).clearContent();
        if (kept.length > 0) clSheet.getRange(3, 1, kept.length, 7).setValues(kept);
        report.push("변경이력: " + removed + "행 삭제");
      }
    }

    // 3) 품목 마스터의 시드 품목 행 삭제 (아래에서 위로 삭제하여 인덱스 밀림 방지)
    const seedRows = _findDevTestItemRows(ss);
    const masterSheet = ss.getSheetByName(SHEET_MASTER);
    if (masterSheet && seedRows.length > 0) {
      seedRows.map(function(s) { return s.row; })
        .sort(function(a, b) { return b - a; })
        .forEach(function(rowNum) { masterSheet.deleteRow(rowNum); });
      report.push("품목 마스터: 시드 품목 " + seedRows.length + "행 삭제");
    }

    SpreadsheetApp.flush();
    CacheManager.invalidateAll();

    const msg = "✅ resetDevEnvironment 완료\n" +
      (report.length > 0 ? report.join("\n") : "삭제할 시드 데이터가 없었습니다.");
    console.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}
