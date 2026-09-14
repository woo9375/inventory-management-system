/**
 * 호텔덕구온천 재고 관리 시스템 v7.0 — 웹앱 서버 모듈
 * [v7.0] 시트 분리 + 변경이력 + 단가 스냅샷 + 기초데이터 CRUD
 */

// ═══════════════════════════════════════════════════════════════════
//  웹앱 진입점
// ═══════════════════════════════════════════════════════════════════

function doGet(e) {
  // [FIX] 스트레스 테스트 엔드포인트는 인증 없이 호출될 수 없도록 막습니다 (로컬 디버그용으로만 제한)
  // if (e && e.parameter.action === 'test') {
  //   generateStressTestData();
  //   runProfiling();
  //   testFIFO();
  //   testMonthlyClosing();
  //   return ContentService.createTextOutput("테스트 및 프로파일링 완료. Apps Script 편집기에서 로그(실행)를 확인하세요.");
  // }
  
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('호텔덕구온천 재고 관리 시스템')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


function login(username, password) { return authenticateUser(username, password); }
function logout(token) { return logoutUser(token); }

function getSessionUser(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "세션이 만료되었습니다." };
  return { success: true, user: session };
}


function forceRefreshData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  CacheManager.invalidateAll();
  return { success: true };
}

function getDashboardData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (session.role === ROLES.STAFF) return { success: false, message: "대시보드 조회 권한이 없습니다." };

  // [TASK-027] 마스터 4,300행 스캔 결과를 캐시한다(역할과 무관한 값). 로그인마다 3초 넘게 걸리던 호출이다.
  //   현재고·상태는 통합 갱신이 바꾸며 그쪽이 invalidateAll로 지운다. date는 캐시 시점의 값이 그대로 남는데,
  //   이 값은 "재고 상태를 마지막으로 읽은 시각"이므로 캐시 시점을 보여 주는 것이 맞다.
  const cachedDashboard = CacheManager.get(CACHE_KEYS.DASHBOARD);
  if (cachedDashboard) return cachedDashboard;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  // [v7.0] 시즌 데이터를 시즌설정 시트에서 읽기
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);

  const currentSeason = seasonSheet.getRange("B2").getValue() || "비수기";
  const seasonMultiplier = seasonSheet.getRange("D2").getValue() || 1.0;

  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  // [v9.0] MASTER_COL_COUNT열까지 읽어서 사용유무 필터링
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();

  let totalItems = 0, riskCount = 0, orderCount = 0, normalCount = 0;
  const alertItems = [];

  masterData.forEach(row => {
    if (!row[MASTER_COLS.CODE]) return;
    // [v9.0] 미사용 품목은 대시보드 통계에서 제외
    if (row[MASTER_COLS.USAGE_STATUS] === '미사용') return;
    totalItems++;
    const status = row[MASTER_COLS.STATUS];
    if (status === STATUS_RISK) {
      riskCount++;
      alertItems.push({
        code: row[MASTER_COLS.CODE], name: row[MASTER_COLS.NAME], grade: row[MASTER_COLS.GRADE],
        currentStock: row[MASTER_COLS.CURRENT_STOCK], safetyStock: row[MASTER_COLS.SAFETY_STOCK],
        rop: row[MASTER_COLS.ROP], orderQty: row[MASTER_COLS.ORDER_QTY], status: "risk"
      });
    } else if (status === STATUS_ORDER) {
      orderCount++;
      alertItems.push({
        code: row[MASTER_COLS.CODE], name: row[MASTER_COLS.NAME], grade: row[MASTER_COLS.GRADE],
        currentStock: row[MASTER_COLS.CURRENT_STOCK], safetyStock: row[MASTER_COLS.SAFETY_STOCK],
        rop: row[MASTER_COLS.ROP], orderQty: row[MASTER_COLS.ORDER_QTY], status: "order"
      });
    } else if (status === STATUS_OK) {
      normalCount++;
    }
  });

  const dashboard = {
    success: true,
    season: currentSeason,
    seasonMultiplier: seasonMultiplier,
    date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"),
    kpi: { total: totalItems, risk: riskCount, order: orderCount, normal: normalCount },
    alertItems: alertItems
  };
  CacheManager.set(CACHE_KEYS.DASHBOARD, dashboard);
  return dashboard;
}


// [TASK-018] 거래처 관리 — 프런트가 부르는 공개 이름.
//   구현은 VendorService.gs에 있고 이름이 서로 다르다(getVendors ↔ getVendorList).
//   GAS는 모든 .gs가 전역 스코프 하나를 공유하므로 같은 이름을 양쪽에 두면 나중에 로드된 쪽이
//   조용히 이기고, 래퍼가 자기 자신을 부르는 무한 재귀가 된다.
//   계정 관리(createUser ↔ createUserAccount)가 쓰는 것과 같은 회피 방식이다.
function getVendors(token) { return getVendorList(token); }
function addVendor(token, data) { return addVendorRecord(token, data); }
function updateVendor(token, code, data) { return updateVendorRecord(token, code, data); }
function deleteVendor(token, code) { return deleteVendorRecord(token, code); }


function createUser(token, userData) { return createUserAccount(token, userData); }
function updateUser(token, username, updates) { return updateUserAccount(token, username, updates); }
function deleteUser(token, username) { return deleteUserAccount(token, username); }
function resetPassword(token, username, newPw) { return resetUserPassword(token, username, newPw); }
function getUsers(token) { return getUserList(token); }
function changePassword(token, oldPw, newPw) { return changeMyPassword(token, oldPw, newPw); }


function runSystemCommand(token, command) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  try {
    switch (command) {
      case "refreshDashboard":
        refreshDashboard(true);
        return { success: true, message: "🔄 대시보드 및 재고 갱신이 완료되었습니다." };
      case "syncPermissions":
        const ss1 = SpreadsheetApp.getActiveSpreadsheet();
        _refreshPermissionDropdown(ss1);
        _protectSystemSheets(ss1);
        return { success: true, message: "🔐 권한 동기화가 완료되었습니다." };
      case "validateSeason":
        const ss2 = SpreadsheetApp.getActiveSpreadsheet();
        const seasonSheet = ss2.getSheetByName(SHEET_SEASONS);
        const lastRow = Math.max(seasonSheet.getLastRow(), 5);
        const data = seasonSheet.getRange("A5:D" + lastRow).getValues();
        let errors = [];
        data.forEach(row => {
          if (!row[0]) return;
          const start = toLocalDate(row[1]);
          const end = toLocalDate(row[2]);
          if (isNaN(start.getTime()) || isNaN(end.getTime())) errors.push(`[${row[0]}] 날짜 형식 오류`);
          else if (start > end) errors.push(`[${row[0]}] 시작일 > 종료일`);
          if (isNaN(Number(row[3])) || Number(row[3]) <= 0) errors.push(`[${row[0]}] 배수 오류`);
        });
        if (errors.length > 0) return { success: false, message: "⚠️ 시즌 설정 오류:\n" + errors.join("\n") };
        return { success: true, message: "✅ 시즌 설정 검증 완료" };
      case "backupCSV":
        backupToCSV();
        return { success: true, message: "💾 시스템 데이터 백업이 완료되었습니다." };
      case "incrementalSync":
        refreshDashboard(true);
        return { success: true, message: "🔄 신규 내역 취합 및 동기화가 완료되었습니다." };

      case "refreshSheetStatus":
        refreshSheetStatus();
        return { success: true, message: "🔍 시트 상태가 새로고침되었습니다." };
      default:
        return { success: false, message: "❌ 알 수 없는 명령입니다." };
    }
  } catch (err) {
    return { success: false, message: "❌ 오류 발생: " + err.message };
  }
}

function getLastSyncTime(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  const props = PropertiesService.getScriptProperties();
  const time = props.getProperty("LAST_SYNC_TIMESTAMP");
  return { success: true, timestamp: time };
}

/**
 * [TASK-027] 로그인 직후 화면이 필요로 하는 것을 한 번에 돌려준다.
 *   google.script.run 왕복은 빈 함수도 약 1초라, 네 호출을 따로 쏘던 것을 1회로 묶었다.
 *   각 항목은 기존 API를 그대로 부르므로 권한 규칙(예: staff는 대시보드 불가)이 그대로 적용된다.
 */
function getBootstrapData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  return {
    success: true,
    dashboard: getDashboardData(token),
    shops: getShopList(token),
    closing: getClosingCutoffInfo(token),
    lastSync: getLastSyncTime(token)
  };
}
