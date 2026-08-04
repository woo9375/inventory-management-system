/**
 * 호텔덕구온천 재고 관리 시스템 v1.0.0 — 웹앱 서버 모듈
 * [MODIFIED] 전체 API에 토큰 검증 적용 + 인증/사용자/업장/시즌 관리 API 추가
 */

// ═══════════════════════════════════════════════════════════════════
//  웹앱 진입점
// ═══════════════════════════════════════════════════════════════════

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('호텔덕구온천 재고 관리 시스템')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** HTML 파일 인클루드 헬퍼 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// ═══════════════════════════════════════════════════════════════════
//  [NEW] API: 인증
// ═══════════════════════════════════════════════════════════════════

function login(username, password) {
  return authenticateUser(username, password);
}

function logout(token) {
  return logoutUser(token);
}

function getSessionUser(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "세션이 만료되었습니다." };
  return { success: true, user: session };
}


// ═══════════════════════════════════════════════════════════════════
//  API: 대시보드 데이터
// ═══════════════════════════════════════════════════════════════════

function getDashboardData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const configSheet = ss.getSheetByName(SHEET_CONFIG);

  const currentSeason = configSheet.getRange("O1").getValue() || "비수기";
  const seasonMultiplier = configSheet.getRange("O2").getValue() || 1.0;

  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 17).getValues();

  let totalItems = 0, riskCount = 0, orderCount = 0, normalCount = 0;
  const alertItems = [];

  masterData.forEach(row => {
    if (!row[0]) return;
    totalItems++;
    const status = row[16];
    if (status === STATUS_RISK) {
      riskCount++;
      alertItems.push({
        code: row[0], name: row[1], grade: row[3],
        currentStock: row[7], safetyStock: row[13],
        rop: row[14], orderQty: row[15], status: "risk"
      });
    } else if (status === STATUS_ORDER) {
      orderCount++;
      alertItems.push({
        code: row[0], name: row[1], grade: row[3],
        currentStock: row[7], safetyStock: row[13],
        rop: row[14], orderQty: row[15], status: "order"
      });
    } else if (status === STATUS_OK) {
      normalCount++;
    }
  });

  return {
    success: true,
    season: currentSeason,
    seasonMultiplier: seasonMultiplier,
    date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
    kpi: { total: totalItems, risk: riskCount, order: orderCount, normal: normalCount },
    alertItems: alertItems
  };
}


// ═══════════════════════════════════════════════════════════════════
//  API: 품목 마스터
// ═══════════════════════════════════════════════════════════════════

function getItemMasterData(token) {
  const session = validateSession(token);
  if (!session) return [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  if (masterLastRow < 3) return [];

  const data = masterSheet.getRange(3, 1, masterLastRow - 2, 23).getValues();
  const items = [];

  data.forEach(row => {
    if (!row[0]) return;
    items.push({
      code: row[0], name: row[1], category: row[2], grade: row[3], unit: row[4],
      initStock: row[6], currentStock: row[7], dailyUsage: row[8],
      leadTime: row[10], safetyDays: row[11], targetDays: row[12],
      safetyStock: row[13], rop: row[14], orderQty: row[15], status: row[16],
      taxType: row[18], unitPrice: row[19], supplyPrice: row[20],
      taxAmount: row[21], totalValue: row[22]
    });
  });

  return items;
}

function getItemCodes(token) {
  const session = validateSession(token);
  if (!session) return [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  if (masterLastRow < 3) return [];

  const data = masterSheet.getRange(3, 1, masterLastRow - 2, 2).getValues();
  return data.filter(r => r[0]).map(r => ({ code: r[0], name: r[1] }));
}

function addNewItem(token, itemData) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (session.role === ROLES.STAFF) return { success: false, message: "품목 등록 권한이 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const lastRow = masterSheet.getLastRow();
  const newRow = Math.max(lastRow + 1, 3);

  masterSheet.getRange(newRow, 1, 1, 5).setValues([[
    itemData.code, itemData.name, itemData.category, itemData.grade, itemData.unit
  ]]);
  masterSheet.getRange(newRow, 7).setValue(itemData.initStock || 0);
  masterSheet.getRange(newRow, 8).setValue(itemData.initStock || 0);
  masterSheet.getRange(newRow, 9).setValue(0);
  masterSheet.getRange(newRow, 11, 1, 3).setValues([[
    itemData.leadTime || 3, itemData.safetyDays || 5, itemData.targetDays || 30
  ]]);
  masterSheet.getRange(newRow, 19, 1, 2).setValues([[
    itemData.taxType || "과세", itemData.unitPrice || 0
  ]]);

  return { success: true, message: `✅ 품목 '${itemData.name}' 등록 완료` };
}

function updateItem(token, itemCode, updates) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (session.role === ROLES.STAFF) return { success: false, message: "품목 수정 권한이 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const data = masterSheet.getRange(3, 1, masterLastRow - 2, 1).getValues();
  
  let targetRow = -1;
  data.forEach((row, idx) => {
    if (row[0] === itemCode) targetRow = idx + 3;
  });

  if (targetRow === -1) return { success: false, message: "❌ 품목코드를 찾을 수 없습니다." };

  const colMap = {
    name: 2, category: 3, grade: 4, unit: 5,
    initStock: 7, leadTime: 11, safetyDays: 12, targetDays: 13,
    taxType: 19, unitPrice: 20
  };

  Object.keys(updates).forEach(key => {
    if (colMap[key]) {
      masterSheet.getRange(targetRow, colMap[key]).setValue(updates[key]);
    }
  });

  return { success: true, message: `✅ 품목 '${itemCode}' 수정 완료` };
}


// ═══════════════════════════════════════════════════════════════════
//  API: 입출고 기록
// ═══════════════════════════════════════════════════════════════════

function getShopList(token) {
  const session = validateSession(token);
  if (!session) return [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = cfg.getLastRow();
  if (lastRow < 4) return [];

  const data = cfg.getRange(4, 2, lastRow - 3, 6).getValues();
  const shops = [];
  data.forEach(row => {
    if (row[1] && row[3] === "생성완료") {
      shops.push({ category: row[0], name: row[1], tag: row[2] });
    }
  });
  return shops;
}

function getRecentTransactions(token, shopName, limit) {
  const session = validateSession(token);
  if (!session) return [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  limit = limit || 50;

  let sheet;
  if (shopName && shopName !== "all") {
    sheet = ss.getSheetByName(shopName);
    if (!sheet) return [];
  } else {
    sheet = ss.getSheetByName(SHEET_INOUT);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];

  const data = sheet.getRange(3, 1, lastRow - 2, 8).getValues();
  const records = [];

  data.forEach(row => {
    if (!row[1]) return;
    records.push({
      date: row[0] instanceof Date ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd") : row[0],
      code: row[1], name: row[2], type: row[3],
      qty: row[4], person: row[5], note: row[6], txId: row[7]
    });
  });

  records.reverse();
  return records.slice(0, limit);
}

function addTransaction(token, shopName, txData) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(shopName);
  if (!sheet) return { success: false, message: `❌ 업장 '${shopName}'을 찾을 수 없습니다.` };

  // 품목명 자동 조회
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 2).getValues();
  const itemMap = {};
  masterData.forEach(r => { if(r[0]) itemMap[r[0]] = r[1]; });

  const itemName = itemMap[txData.code] || "미등록 품목";

  // 거래ID 자동 생성
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const cfgData = cfg.getRange(4, 2, cfg.getLastRow() - 3, 6).getValues();
  const shopConfig = cfgData.find(r => r[1] === shopName && r[3] === "생성완료");
  const prefix = shopConfig ? shopConfig[2] : "XX";

  const tz = Session.getScriptTimeZone();
  const dateStr = Utilities.formatDate(new Date(txData.date), tz, "yyyyMMdd");
  const uniqueSuffix = Utilities.getUuid().replace(/-/g,"").substring(0,8).toUpperCase();
  const txId = `${prefix}-${dateStr}-${uniqueSuffix}`;

  const lastRow = sheet.getLastRow();
  const newRow = Math.max(lastRow + 1, 3);
  
  sheet.getRange(newRow, 1, 1, 8).setValues([[
    new Date(txData.date), txData.code, itemName, txData.type,
    Number(txData.qty), txData.person || session.name, txData.note || "", txId
  ]]);
  sheet.getRange(newRow, 1, 1, 8).setHorizontalAlignment("center");
  sheet.getRange(newRow, 3).setBackground(COLORS.autoBg);
  sheet.getRange(newRow, 8).setBackground(COLORS.autoBg);

  return { success: true, message: `✅ ${shopName} 입출고 기록 저장 완료 (거래ID: ${txId})`, txId: txId };
}


// ═══════════════════════════════════════════════════════════════════
//  API: 설정 데이터
// ═══════════════════════════════════════════════════════════════════

function getConfigData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = cfg.getLastRow();

  // 업장 목록
  const shops = [];
  if (lastRow >= 4) {
    const shopData = cfg.getRange(4, 2, lastRow - 3, 6).getValues();
    shopData.forEach(row => {
      if (row[1]) {
        shops.push({ category: row[0], name: row[1], tag: row[2], status: row[3] });
      }
    });
  }

  // 시즌 설정
  const seasons = [];
  const seasonData = cfg.getRange("N4:Q" + Math.max(lastRow, 7)).getValues();
  const tz = Session.getScriptTimeZone();
  seasonData.forEach(row => {
    if (row[0]) {
      seasons.push({
        name: row[0],
        start: row[1] instanceof Date ? Utilities.formatDate(row[1], tz, "yyyy-MM-dd") : row[1],
        end: row[2] instanceof Date ? Utilities.formatDate(row[2], tz, "yyyy-MM-dd") : row[2],
        multiplier: row[3]
      });
    }
  });

  // 사용자 목록 (admin만 전체 조회, 그 외는 본인 정보만)
  const users = [];
  if (session.role === ROLES.ADMIN) {
    const result = getUserList(token);
    if (result.success) {
      result.users.forEach(u => users.push(u));
    }
  }

  // 카테고리, 단위 목록
  const categories = cfg.getRange("U4:U15").getValues().flat().filter(v => v);
  const units = cfg.getRange("T4:T24").getValues().flat().filter(v => v);

  return { success: true, shops, seasons, users, categories, units, userRole: session.role };
}


// ═══════════════════════════════════════════════════════════════════
//  [NEW] API: 업장 관리 (CRUD) — admin 전용
// ═══════════════════════════════════════════════════════════════════

function addShop(token, shopData) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  if (!shopData.category || !shopData.name || !shopData.tag) {
    return { success: false, message: "분류, 업장명, 태그는 필수입니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);

  // 중복 체크
  const lastRow = cfg.getLastRow();
  if (lastRow >= 4) {
    const existing = cfg.getRange(4, 3, lastRow - 3, 1).getValues().flat();
    if (existing.includes(shopData.name)) {
      return { success: false, message: "이미 존재하는 업장명입니다." };
    }
  }

  // 설정 시트에 업장 행 추가
  const newRow = Math.max(lastRow + 1, 4);
  cfg.getRange(newRow, 2, 1, 4).setValues([[
    shopData.category, shopData.name, shopData.tag, "대기"
  ]]);
  cfg.getRange(newRow, 2, 1, 3).setBackground(COLORS.inputBg).setHorizontalAlignment("center");
  cfg.getRange(newRow, 5, 1, 3).setBackground(COLORS.autoBg).setHorizontalAlignment("center");

  // 즉시 시트 생성 실행
  generateNewShops();

  return { success: true, message: `✅ 업장 '${shopData.name}' 추가 및 시트 생성 완료` };
}

function deleteShop(token, shopName) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = cfg.getLastRow();
  if (lastRow < 4) return { success: false, message: "업장이 없습니다." };

  const data = cfg.getRange(4, 2, lastRow - 3, 6).getValues();
  let targetRowIdx = -1;
  data.forEach((row, idx) => {
    if (row[1] === shopName) targetRowIdx = idx;
  });

  if (targetRowIdx === -1) return { success: false, message: "업장을 찾을 수 없습니다." };

  // 업장 시트 삭제
  const targetSheet = ss.getSheetByName(shopName);
  if (targetSheet) {
    try { ss.deleteSheet(targetSheet); } catch(e) {
      return { success: false, message: "시트 삭제 실패: " + e.message };
    }
  }

  // 설정 시트 행 정리
  const rowNum = targetRowIdx + 4;
  cfg.getRange(rowNum, 2, 1, 6).clearContent();

  _refreshPermissionDropdown(ss);
  return { success: true, message: `✅ 업장 '${shopName}' 삭제 완료` };
}


// ═══════════════════════════════════════════════════════════════════
//  [NEW] API: 시즌 관리 (CRUD) — admin 전용
// ═══════════════════════════════════════════════════════════════════

function addSeason(token, seasonData) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  if (!seasonData.name || !seasonData.start || !seasonData.end || !seasonData.multiplier) {
    return { success: false, message: "시즌명, 시작일, 종료일, 배수는 필수입니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);

  // 비어있는 행 찾기 (N4부터)
  const lastRow = Math.max(cfg.getLastRow(), 4);
  const seasonCol = cfg.getRange("N4:N" + (lastRow + 5)).getValues().flat();
  let emptyRow = -1;
  for (let i = 0; i < seasonCol.length; i++) {
    if (!seasonCol[i]) { emptyRow = i + 4; break; }
  }
  if (emptyRow === -1) emptyRow = lastRow + 1;

  cfg.getRange(emptyRow, 14, 1, 4).setValues([[
    seasonData.name,
    new Date(seasonData.start),
    new Date(seasonData.end),
    Number(seasonData.multiplier)
  ]]);
  cfg.getRange(emptyRow, 15, 1, 2).setNumberFormat("yyyy-mm-dd");
  cfg.getRange(emptyRow, 14, 1, 4).setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  return { success: true, message: `✅ 시즌 '${seasonData.name}' 추가 완료` };
}

function updateSeason(token, seasonName, updates) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = Math.max(cfg.getLastRow(), 7);
  const seasonData = cfg.getRange("N4:Q" + lastRow).getValues();

  let targetRow = -1;
  seasonData.forEach((row, idx) => {
    if (row[0] === seasonName) targetRow = idx + 4;
  });
  if (targetRow === -1) return { success: false, message: "시즌을 찾을 수 없습니다." };

  if (updates.name) cfg.getRange(targetRow, 14).setValue(updates.name);
  if (updates.start) { cfg.getRange(targetRow, 15).setValue(new Date(updates.start)).setNumberFormat("yyyy-mm-dd"); }
  if (updates.end) { cfg.getRange(targetRow, 16).setValue(new Date(updates.end)).setNumberFormat("yyyy-mm-dd"); }
  if (updates.multiplier) cfg.getRange(targetRow, 17).setValue(Number(updates.multiplier));

  return { success: true, message: `✅ 시즌 '${seasonName}' 수정 완료` };
}

function deleteSeason(token, seasonName) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = Math.max(cfg.getLastRow(), 7);
  const seasonData = cfg.getRange("N4:Q" + lastRow).getValues();

  let targetRow = -1;
  seasonData.forEach((row, idx) => {
    if (row[0] === seasonName) targetRow = idx + 4;
  });
  if (targetRow === -1) return { success: false, message: "시즌을 찾을 수 없습니다." };

  cfg.getRange(targetRow, 14, 1, 4).clearContent();
  return { success: true, message: `✅ 시즌 '${seasonName}' 삭제 완료` };
}


// ═══════════════════════════════════════════════════════════════════
//  [NEW] API: 사용자 계정 관리 (Proxy)
// ═══════════════════════════════════════════════════════════════════

function createUser(token, userData) { return createUserAccount(token, userData); }
function updateUser(token, username, updates) { return updateUserAccount(token, username, updates); }
function deleteUser(token, username) { return deleteUserAccount(token, username); }
function resetPassword(token, username, newPw) { return resetUserPassword(token, username, newPw); }
function getUsers(token) { return getUserList(token); }
function changePassword(token, oldPw, newPw) { return changeMyPassword(token, oldPw, newPw); }


// ═══════════════════════════════════════════════════════════════════
//  API: 시스템 명령 실행
// ═══════════════════════════════════════════════════════════════════

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
        const cfg = ss2.getSheetByName(SHEET_CONFIG);
        const lastRow = Math.max(cfg.getLastRow(), 4);
        const data = cfg.getRange("N4:Q" + lastRow).getValues();
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
        return { success: true, message: "💾 CSV 백업이 완료되었습니다." };
      case "incrementalSync":
        incrementalSync();
        return { success: true, message: "🔄 증분 동기화가 완료되었습니다." };
      case "generateShops":
        generateNewShops();
        return { success: true, message: "🆕 업장 시트 생성이 완료되었습니다." };
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
