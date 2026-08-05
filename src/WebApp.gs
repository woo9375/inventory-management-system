/**
 * 호텔덕구온천 재고 관리 시스템 v7.0 — 웹앱 서버 모듈
 * [v7.0] 시트 분리 + 변경이력 + 단가 스냅샷 + 기초데이터 CRUD
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

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// ═══════════════════════════════════════════════════════════════════
//  API: 인증
// ═══════════════════════════════════════════════════════════════════

function login(username, password) { return authenticateUser(username, password); }
function logout(token) { return logoutUser(token); }

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
  // [v7.0] 시즌 데이터를 시즌설정 시트에서 읽기
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);

  const currentSeason = seasonSheet.getRange("B2").getValue() || "비수기";
  const seasonMultiplier = seasonSheet.getRange("D2").getValue() || 1.0;

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

// [v7.0] 변경이력 기록 추가
function updateItem(token, itemCode, updates) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (session.role === ROLES.STAFF) return { success: false, message: "품목 수정 권한이 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const data = masterSheet.getRange(3, 1, masterLastRow - 2, 20).getValues();
  
  let targetRow = -1;
  let oldValues = null;
  data.forEach((row, idx) => {
    if (row[0] === itemCode) {
      targetRow = idx + 3;
      oldValues = row;
    }
  });

  if (targetRow === -1) return { success: false, message: "❌ 품목코드를 찾을 수 없습니다." };

  const colMap = {
    name: 2, category: 3, grade: 4, unit: 5,
    initStock: 7, leadTime: 11, safetyDays: 12, targetDays: 13,
    taxType: 19, unitPrice: 20
  };
  
  // [v7.0] 변경이력 기록용 매핑
  const fieldNameMap = {
    name: "품목명", category: "카테고리", grade: "ABC 등급", unit: "단위",
    initStock: "초기재고", leadTime: "리드타임", safetyDays: "안전재고일수",
    targetDays: "목표유지일수", taxType: "과세구분", unitPrice: "매입단가"
  };
  const oldColMap = {
    name: 1, category: 2, grade: 3, unit: 4,
    initStock: 6, leadTime: 10, safetyDays: 11, targetDays: 12,
    taxType: 18, unitPrice: 19
  };

  const changeRecords = [];
  const now = new Date();
  const itemName = oldValues[1]; // 품목명

  Object.keys(updates).forEach(key => {
    if (colMap[key]) {
      const oldVal = oldValues[oldColMap[key]];
      const newVal = updates[key];
      
      // 실제 변경이 있는 경우만 이력 기록
      if (String(oldVal) !== String(newVal)) {
        changeRecords.push([now, session.name, itemCode, itemName, fieldNameMap[key] || key, oldVal, newVal]);
      }
      
      masterSheet.getRange(targetRow, colMap[key]).setValue(newVal);
    }
  });

  // [v7.0] 변경이력 시트에 기록
  if (changeRecords.length > 0) {
    const changelogSheet = ss.getSheetByName(SHEET_CHANGELOG);
    const clLastRow = Math.max(changelogSheet.getLastRow() + 1, 3);
    changelogSheet.getRange(clLastRow, 1, changeRecords.length, 7).setValues(changeRecords)
      .setHorizontalAlignment("center").setBackground(COLORS.autoBg);
  }

  return { success: true, message: `✅ 품목 '${itemCode}' 수정 완료` };
}

// [v7.0] 변경이력 조회 API
function getItemChangelog(token, itemCode) {
  const session = validateSession(token);
  if (!session) return { success: false, records: [] };
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const changelogSheet = ss.getSheetByName(SHEET_CHANGELOG);
  const lastRow = changelogSheet.getLastRow();
  if (lastRow < 3) return { success: true, records: [] };
  
  const data = changelogSheet.getRange(3, 1, lastRow - 2, 7).getValues();
  const tz = Session.getScriptTimeZone();
  const records = [];
  
  data.forEach(row => {
    if (row[2] === itemCode) {
      records.push({
        date: row[0] instanceof Date ? Utilities.formatDate(row[0], tz, "yyyy-MM-dd HH:mm") : row[0],
        user: row[1],
        code: row[2],
        name: row[3],
        field: row[4],
        oldValue: row[5],
        newValue: row[6]
      });
    }
  });
  
  records.reverse(); // 최근순
  return { success: true, records: records };
}


// ═══════════════════════════════════════════════════════════════════
//  API: 입출고 기록
// ═══════════════════════════════════════════════════════════════════

function getShopList(token) {
  const session = validateSession(token);
  if (!session) return [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // [v7.0] 업장관리 시트
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  const lastRow = shopSheet.getLastRow();
  if (lastRow < 3) return [];

  const data = shopSheet.getRange(3, 1, lastRow - 2, 6).getValues();
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

  // [v7.0] 9열 구조
  const data = sheet.getRange(3, 1, lastRow - 2, TX_COLS).getValues();
  const records = [];

  data.forEach(row => {
    if (!row[1]) return;
    records.push({
      date: row[0] instanceof Date ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd") : row[0],
      code: row[1], name: row[2], type: row[3],
      qty: row[4], unitPrice: row[5], // [v7.0] 단가 스냅샷
      person: row[6], note: row[7], txId: row[8] // [v7.0] 열 위치 변경
    });
  });

  records.reverse();
  return records.slice(0, limit);
}

// [v7.0] 단가 스냅샷 포함 저장
function addTransaction(token, shopName, txData) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(shopName);
  if (!sheet) return { success: false, message: `❌ 업장 '${shopName}'을 찾을 수 없습니다.` };

  // 품목명 & 매입단가 자동 조회
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 20).getValues();
  const itemMap = {};
  const priceMap = {};
  masterData.forEach(r => { 
    if(r[0]) {
      itemMap[r[0]] = r[1]; 
      priceMap[r[0]] = r[19] || 0; // T열 = 매입단가
    }
  });

  // [v7.0] 품목코드 유효성 검증 (오기입 방지)
  if (!itemMap[txData.code]) {
    return { success: false, message: "❌ 품목 마스터에 등록되지 않은 품목코드입니다. 등록된 품목을 선택해주세요." };
  }

  const itemName = itemMap[txData.code];
  const unitPrice = priceMap[txData.code] || 0;

  // 거래ID 자동 생성
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  const shopData = shopSheet.getRange(3, 1, shopSheet.getLastRow() - 2, 6).getValues();
  const shopConfig = shopData.find(r => r[1] === shopName && r[3] === "생성완료");
  const prefix = shopConfig ? shopConfig[2] : "XX";

  const tz = Session.getScriptTimeZone();
  const dateStr = Utilities.formatDate(new Date(txData.date), tz, "yyyyMMdd");
  const uniqueSuffix = Utilities.getUuid().replace(/-/g,"").substring(0,8).toUpperCase();
  const txId = `${prefix}-${dateStr}-${uniqueSuffix}`;

  const lastRow = sheet.getLastRow();
  const newRow = Math.max(lastRow + 1, 3);
  
  // [v7.0] 9열 구조: 단가 스냅샷 포함
  sheet.getRange(newRow, 1, 1, TX_COLS).setValues([[
    new Date(txData.date), txData.code, itemName, txData.type,
    Number(txData.qty), unitPrice, // [v7.0] 단가 스냅샷
    txData.person || session.name, txData.note || "", txId
  ]]);
  sheet.getRange(newRow, 1, 1, TX_COLS).setHorizontalAlignment("center");
  sheet.getRange(newRow, 3).setBackground(COLORS.autoBg);  // 품목명
  sheet.getRange(newRow, 6).setBackground(COLORS.autoBg);  // 단가
  sheet.getRange(newRow, 9).setBackground(COLORS.autoBg);  // 거래ID

  return { success: true, message: `✅ ${shopName} 입출고 기록 저장 완료 (거래ID: ${txId})`, txId: txId };
}


// ═══════════════════════════════════════════════════════════════════
//  API: 설정 데이터
// ═══════════════════════════════════════════════════════════════════

function getConfigData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();

  // [v7.0] 업장 목록 — 업장관리 시트
  const shops = [];
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  if (shopSheet.getLastRow() >= 3) {
    const shopData = shopSheet.getRange(3, 1, shopSheet.getLastRow() - 2, 6).getValues();
    shopData.forEach(row => {
      if (row[1]) {
        shops.push({ category: row[0], name: row[1], tag: row[2], status: row[3] });
      }
    });
  }

  // [v7.0] 시즌 설정 — 시즌설정 시트
  const seasons = [];
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);
  const seasonData = seasonSheet.getRange("A5:D" + Math.max(seasonSheet.getLastRow(), 8)).getValues();
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

  // 사용자 목록
  const users = [];
  if (session.role === ROLES.ADMIN) {
    const result = getUserList(token);
    if (result.success) {
      result.users.forEach(u => users.push(u));
    }
  }

  // [v7.0] 기초데이터 시트에서 카테고리/단위 목록 조회
  const baseDataSheet = ss.getSheetByName(SHEET_BASE_DATA);
  const categories = baseDataSheet.getRange("C3:C50").getValues().flat().filter(v => v);
  const units = baseDataSheet.getRange("B3:B50").getValues().flat().filter(v => v);

  return { success: true, shops, seasons, users, categories, units, userRole: session.role };
}


// ═══════════════════════════════════════════════════════════════════
//  API: 업장 관리 (CRUD) — admin 전용
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
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);

  // 중복 체크
  const lastRow = shopSheet.getLastRow();
  if (lastRow >= 3) {
    const existing = shopSheet.getRange(3, 2, lastRow - 2, 1).getValues().flat();
    if (existing.includes(shopData.name)) {
      return { success: false, message: "이미 존재하는 업장명입니다." };
    }
  }

  const newRow = Math.max(lastRow + 1, 3);
  shopSheet.getRange(newRow, 1, 1, 4).setValues([[
    shopData.category, shopData.name, shopData.tag, "대기"
  ]]);
  shopSheet.getRange(newRow, 1, 1, 3).setBackground(COLORS.inputBg).setHorizontalAlignment("center");
  shopSheet.getRange(newRow, 4, 1, 3).setBackground(COLORS.autoBg).setHorizontalAlignment("center");

  generateNewShops();

  return { success: true, message: `✅ 업장 '${shopData.name}' 추가 및 시트 생성 완료` };
}

function deleteShop(token, shopName) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  const lastRow = shopSheet.getLastRow();
  if (lastRow < 3) return { success: false, message: "업장이 없습니다." };

  const data = shopSheet.getRange(3, 1, lastRow - 2, 6).getValues();
  let targetRowIdx = -1;
  data.forEach((row, idx) => {
    if (row[1] === shopName) targetRowIdx = idx;
  });

  if (targetRowIdx === -1) return { success: false, message: "업장을 찾을 수 없습니다." };

  const targetSheet = ss.getSheetByName(shopName);
  if (targetSheet) {
    try { ss.deleteSheet(targetSheet); } catch(e) {
      return { success: false, message: "시트 삭제 실패: " + e.message };
    }
  }

  const rowNum = targetRowIdx + 3;
  shopSheet.getRange(rowNum, 1, 1, 6).clearContent();

  _refreshPermissionDropdown(ss);
  return { success: true, message: `✅ 업장 '${shopName}' 삭제 완료` };
}


// ═══════════════════════════════════════════════════════════════════
//  API: 시즌 관리 (CRUD) — admin 전용
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
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);

  // [v7.0] 데이터 시작 행: 5행
  const lastRow = Math.max(seasonSheet.getLastRow(), 5);
  const seasonCol = seasonSheet.getRange("A5:A" + (lastRow + 5)).getValues().flat();
  let emptyRow = -1;
  for (let i = 0; i < seasonCol.length; i++) {
    if (!seasonCol[i]) { emptyRow = i + 5; break; }
  }
  if (emptyRow === -1) emptyRow = lastRow + 1;

  seasonSheet.getRange(emptyRow, 1, 1, 4).setValues([[
    seasonData.name,
    new Date(seasonData.start),
    new Date(seasonData.end),
    Number(seasonData.multiplier)
  ]]);
  seasonSheet.getRange(emptyRow, 2, 1, 2).setNumberFormat("yyyy-mm-dd");
  seasonSheet.getRange(emptyRow, 1, 1, 4).setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  return { success: true, message: `✅ 시즌 '${seasonData.name}' 추가 완료` };
}

function updateSeason(token, seasonName, updates) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);
  const lastRow = Math.max(seasonSheet.getLastRow(), 8);
  const seasonData = seasonSheet.getRange("A5:D" + lastRow).getValues();

  let targetRow = -1;
  seasonData.forEach((row, idx) => {
    if (row[0] === seasonName) targetRow = idx + 5;
  });
  if (targetRow === -1) return { success: false, message: "시즌을 찾을 수 없습니다." };

  if (updates.name) seasonSheet.getRange(targetRow, 1).setValue(updates.name);
  if (updates.start) { seasonSheet.getRange(targetRow, 2).setValue(new Date(updates.start)).setNumberFormat("yyyy-mm-dd"); }
  if (updates.end) { seasonSheet.getRange(targetRow, 3).setValue(new Date(updates.end)).setNumberFormat("yyyy-mm-dd"); }
  if (updates.multiplier) seasonSheet.getRange(targetRow, 4).setValue(Number(updates.multiplier));

  return { success: true, message: `✅ 시즌 '${seasonName}' 수정 완료` };
}

function deleteSeason(token, seasonName) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);
  const lastRow = Math.max(seasonSheet.getLastRow(), 8);
  const seasonData = seasonSheet.getRange("A5:D" + lastRow).getValues();

  let targetRow = -1;
  seasonData.forEach((row, idx) => {
    if (row[0] === seasonName) targetRow = idx + 5;
  });
  if (targetRow === -1) return { success: false, message: "시즌을 찾을 수 없습니다." };

  seasonSheet.getRange(targetRow, 1, 1, 4).clearContent();
  return { success: true, message: `✅ 시즌 '${seasonName}' 삭제 완료` };
}


// ═══════════════════════════════════════════════════════════════════
//  API: 사용자 계정 관리 (Proxy)
// ═══════════════════════════════════════════════════════════════════

function createUser(token, userData) { return createUserAccount(token, userData); }
function updateUser(token, username, updates) { return updateUserAccount(token, username, updates); }
function deleteUser(token, username) { return deleteUserAccount(token, username); }
function resetPassword(token, username, newPw) { return resetUserPassword(token, username, newPw); }
function getUsers(token) { return getUserList(token); }
function changePassword(token, oldPw, newPw) { return changeMyPassword(token, oldPw, newPw); }


// ═══════════════════════════════════════════════════════════════════
//  [v7.0] API: 기초데이터 관리 (CRUD) — admin 전용
// ═══════════════════════════════════════════════════════════════════

function getBaseData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  const lastRow = Math.max(baseSheet.getLastRow(), 3);

  const mainCategories = baseSheet.getRange("A3:A" + lastRow).getValues().flat().filter(v => v);
  const units = baseSheet.getRange("B3:B" + lastRow).getValues().flat().filter(v => v);
  const itemCategories = baseSheet.getRange("C3:C" + lastRow).getValues().flat().filter(v => v);

  return { success: true, mainCategories, units, itemCategories, userRole: session.role };
}

function addBaseDataItem(token, type, value) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  if (!value || !value.trim()) return { success: false, message: "값을 입력해주세요." };

  const colMap = { mainCategory: 1, unit: 2, itemCategory: 3 };
  const col = colMap[type];
  if (!col) return { success: false, message: "잘못된 타입입니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  const lastRow = Math.max(baseSheet.getLastRow(), 3);

  // 기존 데이터 읽기
  const existing = baseSheet.getRange(3, col, lastRow - 2, 1).getValues().flat().filter(v => v);
  if (existing.includes(value.trim())) {
    return { success: false, message: "이미 존재하는 항목입니다." };
  }

  // 빈 행 찾기
  const colData = baseSheet.getRange(3, col, lastRow + 5 - 2, 1).getValues().flat();
  let emptyRow = -1;
  for (let i = 0; i < colData.length; i++) {
    if (!colData[i]) { emptyRow = i + 3; break; }
  }
  if (emptyRow === -1) emptyRow = lastRow + 1;

  baseSheet.getRange(emptyRow, col).setValue(value.trim())
    .setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  return { success: true, message: `✅ '${value.trim()}' 추가 완료` };
}

function deleteBaseDataItem(token, type, value) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const colMap = { mainCategory: 1, unit: 2, itemCategory: 3 };
  const col = colMap[type];
  if (!col) return { success: false, message: "잘못된 타입입니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  const lastRow = Math.max(baseSheet.getLastRow(), 3);

  const data = baseSheet.getRange(3, col, lastRow - 2, 1).getValues();
  let targetRow = -1;
  data.forEach((row, idx) => {
    if (row[0] === value) targetRow = idx + 3;
  });

  if (targetRow === -1) return { success: false, message: "항목을 찾을 수 없습니다." };

  baseSheet.getRange(targetRow, col).clearContent();

  // 빈 행 정리: 데이터를 위로 당기기
  const remaining = data.map(r => r[0]).filter(v => v && v !== value);
  baseSheet.getRange(3, col, data.length, 1).clearContent();
  if (remaining.length > 0) {
    baseSheet.getRange(3, col, remaining.length, 1).setValues(remaining.map(v => [v]))
      .setBackground(COLORS.inputBg).setHorizontalAlignment("center");
  }

  return { success: true, message: `✅ '${value}' 삭제 완료` };
}


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
