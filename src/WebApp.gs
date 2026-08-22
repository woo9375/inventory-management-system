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
//  API: 수동 동기화 (새로고침)
// ═══════════════════════════════════════════════════════════════════
function forceRefreshData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  CacheManager.invalidateAll();
  return { success: true };
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
  // [v9.0] 24열까지 읽어서 사용유무(X열=24번째) 필터링
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 24).getValues();

  let totalItems = 0, riskCount = 0, orderCount = 0, normalCount = 0;
  const alertItems = [];

  masterData.forEach(row => {
    if (!row[0]) return;
    // [v9.0] 미사용 품목은 대시보드 통계에서 제외
    if (row[23] === '미사용') return;
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

  const CACHE_KEY = 'ITEM_MASTER_DATA';
  let items = CacheManager.get(CACHE_KEY);
  if (items) return items;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  if (masterLastRow < 3) return [];

  const data = masterSheet.getRange(3, 1, masterLastRow - 2, 24).getValues();
  items = [];

  data.forEach(row => {
    if (!row[0]) return;
    // 상태(사용여부)가 '미사용'인 품목은 제외
    if (row[23] === '미사용') return;

    items.push({
      code: row[0], name: row[1], category: row[2], grade: row[3], unit: row[4],
      initStock: row[6], currentStock: row[7], dailyUsage: row[8],
      leadTime: row[10], safetyDays: row[11], targetDays: row[12],
      safetyStock: row[13], rop: row[14], orderQty: row[15], status: row[16],
      taxType: row[18], unitPrice: row[19], supplyPrice: row[20],
      taxAmount: row[21], totalValue: row[22]
    });
  });

  CacheManager.set(CACHE_KEY, items);
  return items;
}

function getItemCodes(token) {
  const session = validateSession(token);
  if (!session) return [];

  const CACHE_KEY = 'ITEM_CODES';
  let codes = CacheManager.get(CACHE_KEY);
  if (codes) return codes;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  if (masterLastRow < 3) return [];

  const data = masterSheet.getRange(3, 1, masterLastRow - 2, 24).getValues();
  codes = data.filter(r => r[0] && r[23] !== '미사용').map(r => ({ code: r[0], name: r[1] }));
  
  CacheManager.set(CACHE_KEY, codes);
  return codes;
}

// [v9.0] 서버 사이드 품목 검색 API (대량 데이터 전송 없이 서버에서 필터링)
function searchItemCodes(token, query) {
  const session = validateSession(token);
  if (!session) return [];
  if (!query || query.trim().length < 1) return [];

  const q = query.toLowerCase().trim();
  
  // 캐시된 전체 리스트가 있으면 그것을 사용
  const CACHE_KEY = 'ITEM_CODES';
  let allCodes = CacheManager.get(CACHE_KEY);
  
  if (!allCodes) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(SHEET_MASTER);
    const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
    if (masterLastRow < 3) return [];
    
    const data = masterSheet.getRange(3, 1, masterLastRow - 2, 24).getValues();
    allCodes = data.filter(r => r[0] && r[23] !== '미사용').map(r => ({ code: r[0], name: r[1] }));
    CacheManager.set(CACHE_KEY, allCodes);
  }
  
  // 서버에서 필터링 후 상위 15건만 반환
  const matches = allCodes.filter(function(item) {
    return item.name.toLowerCase().indexOf(q) > -1 || item.code.toLowerCase().indexOf(q) > -1;
  }).slice(0, 15);
  
  return matches;
}

function addNewItem(token, itemData) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (session.role === ROLES.STAFF) return { success: false, message: "품목 등록 권한이 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const lastRow = masterSheet.getLastRow();
  
  // [FIX] 품목코드 중복 검증
  if (lastRow >= 3) {
    const existingCodes = masterSheet.getRange(3, 1, lastRow - 2, 1).getValues().flat();
    if (existingCodes.includes(itemData.code)) {
      return { success: false, message: `❌ 품목코드 '${itemData.code}'는 이미 존재합니다.` };
    }
  }

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

  CacheManager.invalidateAll();
  return { success: true, message: `✅ 품목 '${itemData.name}' 등록 완료` };
}

// [v7.0] 변경이력 기록 추가

function uploadItemMasterCSV(token, dataRows) {
  const session = validateSession(token);
  if (!session || session.role === 'staff') return { success: false, message: "권한이 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  
  // 기존 코드 가져오기 (O(1) 조회를 위해 Set 사용)
  const existingCodes = new Set();
  if (masterLastRow >= 3) {
    const codeValues = masterSheet.getRange(3, 1, masterLastRow - 2, 1).getValues();
    codeValues.forEach(row => { if (row[0]) existingCodes.add(row[0].toString()); });
  }
  
  // 기초데이터 카테고리 유효성 검사를 위한 준비
  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  const baseLastRow = Math.max(baseSheet.getLastRow(), 3);
  const validCategories = new Set(baseSheet.getRange(3, 3, baseLastRow - 2, 1).getValues().flat().filter(v => v));
  
  const newRows = [];
  let ignoredCount = 0;
  const errors = [];
  
  // CSV 데이터(dataRows) 포맷: [품목코드, 품목명, 카테고리, ABC등급, 단위, ... ]
  // 최소 품목코드(0)와 품목명(1)이 있어야 함
  dataRows.forEach(row => {
    if (!row || row.length < 2) return;
    const code = row[0].toString().trim();
    if (!code) return;
    
    if (existingCodes.has(code)) {
      ignoredCount++;
    } else {
      const cat = row[2] ? row[2].toString().trim() : "";
      if (cat && !validCategories.has(cat)) {
        errors.push(`[${code}] '${cat}'`);
      } else {
        // [v9.0 FIX] 24열 구조로 확장 (사용유무 컬럼 포함)
        const newRow = new Array(24).fill("");
        newRow[0] = code; // 품목코드
        newRow[1] = row[1] || ""; // 품목명
        newRow[2] = cat; // 카테고리
        newRow[3] = row[3] || "C"; // 규격
        newRow[4] = row[4] || ""; // 단위
        const initStock = Number(row[5]) || 0;
        newRow[6] = initStock; // 초기재고
        newRow[7] = initStock; // [FIX] 현재고 = 초기재고로 동기화
        newRow[8] = 0; // 일평균 사용량
        newRow[10] = Number(row[6]) || 3; // 리드타임 (시트 K열=11, 0-indexed=10)
        newRow[11] = Number(row[7]) || 5; // 안전재고일수 (시트 L열=12, 0-indexed=11)
        newRow[12] = Number(row[8]) || 30; // 목표유지일수 (시트 M열=13, 0-indexed=12)
        newRow[18] = row[9] || "과세"; // 과세구분
        newRow[19] = Number(row[10]) || 0; // 매입단가
        newRow[23] = "사용"; // [v9.0] 사용유무 기본값
        
        newRows.push(newRow);
        existingCodes.add(code); // 같은 CSV 내 중복 방지
      }
    }
  });
  
  // [v9.0 FIX] throw 대신 return으로 에러 전달 (withFailureHandler 대신 withSuccessHandler에서 처리)
  if (errors.length > 0) {
    return { 
      success: false, 
      message: `❌ 미등록 카테고리가 포함된 품목이 있어 업로드가 중단되었습니다. (총 ${errors.length}건)\n기초데이터에 먼저 추가하시거나 올바른 카테고리를 입력해주세요.\n오류 항목: ${errors.join(', ')}`
    };
  }
  
  if (newRows.length > 0) {
    // [v9.0 FIX] 24열 구조로 기록
    masterSheet.getRange(masterLastRow + 1, 1, newRows.length, 24).setValues(newRows);
    SpreadsheetApp.flush();
    recalcStockAndUsage(ss); // 재고 다시 계산
  }
  
  CacheManager.invalidateAll();
  return { 
    success: true, 
    message: "CSV 업로드 완료: " + newRows.length + "건 신규 등록, " + ignoredCount + "건 무시(중복)"
  };
}

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
    name: "품목명", category: "카테고리", grade: "규격", unit: "단위",
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

  CacheManager.invalidateAll();
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

  const CACHE_KEY = 'SHOP_LIST';
  let shops = CacheManager.get(CACHE_KEY);
  if (shops) return shops;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // [v7.0] 업장관리 시트
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  const lastRow = shopSheet.getLastRow();
  if (lastRow < 3) return [];

  const data = shopSheet.getRange(3, 1, lastRow - 2, 7).getValues();
  shops = [];
  data.forEach(row => {
    if (row[1] && row[3] === "생성완료") {
      shops.push({ 
        category: row[0], 
        name: row[1], 
        tag: row[2],
        assignees: row[6] ? row[6].toString().split(',').map(s=>s.trim()).filter(Boolean) : []
      });
    }
  });
  CacheManager.set(CACHE_KEY, shops);
  
  if (session.role === ROLES.STAFF) {
    const assigned = session.assignedShops || [];
    return shops.filter(shop => assigned.includes(shop.name));
  }
  return shops;
}

function getRecentTransactions(token, shopName, limit) {
  const session = validateSession(token);
  if (!session) return [];

  // [CR-02 FIX] IDOR 방어: Staff는 자신의 담당 업장만 조회 가능
  if (session.role === ROLES.STAFF && shopName && shopName !== "all") {
    if (!session.assignedShops || !session.assignedShops.includes(shopName)) {
      return [];
    }
  }

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

  // [CR-02 FIX] IDOR 방어: Staff는 자신의 담당 업장만 접근 가능 (복수 업장 배열 검증으로 수정)
  if (session.role === ROLES.STAFF) {
    if (!session.assignedShops || !session.assignedShops.includes(shopName)) {
      return { success: false, message: "⛔ 담당 업장이 아닙니다." };
    }
  }

  // [FIX] 락(Lock) 서비스 도입: 동시 입출고 충돌 방지
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 10초 대기
  } catch (e) {
    return { success: false, message: "⏳ 다른 사용자가 작업 중입니다. 잠시 후 다시 시도해주세요." };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(shopName);
    if (!sheet) return { success: false, message: `❌ 업장 '${shopName}'을 찾을 수 없습니다.` };

    // [FIX] 품목명 & 매입단가 자동 조회 시 마스터 시트 풀 스캔 대신 캐시 활용
    let itemInfoMap = CacheManager.get(CACHE_KEYS.ITEM_MAP);
    if (!itemInfoMap) {
      itemInfoMap = CacheManager.buildItemMapCache(ss);
    }

    // [v7.0] 품목코드 유효성 검증 (오기입 방지)
    if (!itemInfoMap[txData.code]) {
      return { success: false, message: "❌ 품목 마스터에 등록되지 않은 품목코드입니다. 등록된 품목을 선택해주세요." };
    }

    // [NF-05 FIX] 수량 유효성 검증: 0 이하 값 차단
    const qty = Number(txData.qty);
    if (!qty || qty <= 0 || !Number.isFinite(qty)) {
      return { success: false, message: "❌ 수량은 0보다 큰 유효한 숫자여야 합니다." };
    }

    const itemName = itemInfoMap[txData.code].name;
    const unitPrice = itemInfoMap[txData.code].price || 0;

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

    CacheManager.invalidateAll();
    return { success: true, message: `✅ ${shopName} 입출고 기록 저장 완료 (거래ID: ${txId})`, txId: txId };
  } finally {
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════════════════
//  API: 설정 데이터
// ═══════════════════════════════════════════════════════════════════

function getConfigData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };

  const CACHE_KEY = `CONFIG_DATA_${session.role}`;
  let cachedData = CacheManager.get(CACHE_KEY);
  if (cachedData) return cachedData;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();

  // [v7.0] 업장 목록 — 업장관리 시트
  const shops = [];
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  if (shopSheet.getLastRow() >= 3) {
    const shopData = shopSheet.getRange(3, 1, shopSheet.getLastRow() - 2, 7).getValues();
    shopData.forEach(row => {
      if (row[1]) {
        shops.push({ 
          category: row[0], 
          name: row[1], 
          tag: row[2], 
          status: row[3],
          assignees: row[6] ? row[6].toString().split(',').map(s=>s.trim()).filter(Boolean) : []
        });
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

  const finalData = { success: true, shops, seasons, users, categories, units, userRole: session.role };
  CacheManager.set(CACHE_KEY, finalData);
  return finalData;
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

  // [v9.0] 태그 ID 유효성 검사: 영어 대문자 2~3자만 허용
  const tagPattern = /^[A-Z]{2,3}$/;
  if (!tagPattern.test(shopData.tag)) {
    return { success: false, message: "❌ 태그 ID는 영어 대문자 2~3자로만 입력해야 합니다. (예: TX, MB, AXC)" };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);

  // [v9.0] 중복 체크 강화: 태그 + (분류+업장명) 복합 중복
  const lastRow = shopSheet.getLastRow();
  if (lastRow >= 3) {
    const existingData = shopSheet.getRange(3, 1, lastRow - 2, 3).getValues(); // [분류, 업장명, 태그]
    for (let i = 0; i < existingData.length; i++) {
      const row = existingData[i];
      if (!row[1]) continue; // 빈 행 스킵
      // 태그 중복 검사
      if (row[2] === shopData.tag) {
        return { success: false, message: `❌ 태그 '${shopData.tag}'는 이미 업장 '${row[1]}'에서 사용 중입니다.` };
      }
      // 업장명 중복 검사
      if (row[1] === shopData.name) {
        return { success: false, message: "❌ 이미 존재하는 업장명입니다." };
      }
      // (분류+업장명) 복합 중복 검사
      if (row[0] === shopData.category && row[1] === shopData.name) {
        return { success: false, message: `❌ '${shopData.category}' 분류에 '${shopData.name}' 업장이 이미 존재합니다.` };
      }
    }
  }

  const newRow = Math.max(lastRow + 1, 3);
  shopSheet.getRange(newRow, 1, 1, 4).setValues([[
    shopData.category, shopData.name, shopData.tag, "대기"
  ]]);

  shopSheet.getRange(newRow, 1, 1, 3).setBackground(COLORS.inputBg).setHorizontalAlignment("center");
  shopSheet.getRange(newRow, 4, 1, 3).setBackground(COLORS.autoBg).setHorizontalAlignment("center");
  shopSheet.getRange(newRow, 7).setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  SpreadsheetApp.flush();
  generateNewShops();

  CacheManager.invalidateAll();
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

  // [v9.0] 소프트 삭제: 시트를 숨김 처리하고 상태를 '삭제됨'으로 변경 (데이터 보존)
  const targetSheet = ss.getSheetByName(shopName);
  if (targetSheet) {
    try {
      targetSheet.hideSheet(); // 시트 숨김 (물리적 삭제 대신)
    } catch(e) {
      return { success: false, message: "시트 숨김 처리 실패: " + e.message };
    }
  }

  // 업장관리 시트에서 상태를 '삭제됨'으로 변경
  const rowNum = targetRowIdx + 3;
  shopSheet.getRange(rowNum, 4).setValue("삭제됨");
  shopSheet.getRange(rowNum, 1, 1, 3).setBackground("#f0f0f0").setFontColor("#999999"); // 시각적 비활성화
  shopSheet.getRange(rowNum, 4, 1, 3).setBackground("#f0f0f0").setFontColor("#999999");

  _refreshPermissionDropdown(ss);
  CacheManager.invalidateAll();
  return { success: true, message: `✅ 업장 '${shopName}' 비활성화 완료 (데이터 보존됨)` };
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

  CacheManager.invalidateAll();
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

  CacheManager.invalidateAll();
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
  CacheManager.invalidateAll();
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

  const CACHE_KEY = `BASE_DATA_${session.role}`;
  let cached = CacheManager.get(CACHE_KEY);
  if (cached) return cached;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  const lastRow = Math.max(baseSheet.getLastRow(), 3);

  const mainCategories = baseSheet.getRange("A3:A" + lastRow).getValues().flat().filter(v => v);
  const units = baseSheet.getRange("B3:B" + lastRow).getValues().flat().filter(v => v);
  const itemCategories = baseSheet.getRange("C3:C" + lastRow).getValues().flat().filter(v => v);

  const result = { success: true, mainCategories, units, itemCategories, userRole: session.role };
  CacheManager.set(CACHE_KEY, result);
  return result;
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

  CacheManager.invalidateAll();
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
    if (String(row[0]).trim() === String(value).trim()) targetRow = idx + 3;
  });

  if (targetRow === -1) return { success: false, message: "항목을 찾을 수 없습니다." };

  baseSheet.getRange(targetRow, col).clearContent();

  // 빈 행 정리: 데이터를 위로 당기기
  const remaining = data.map(r => r[0]).filter(v => v && String(v).trim() !== String(value).trim());
  baseSheet.getRange(3, col, data.length, 1).clearContent();
  if (remaining.length > 0) {
    baseSheet.getRange(3, col, remaining.length, 1).setValues(remaining.map(v => [v]))
      .setBackground(COLORS.inputBg).setHorizontalAlignment("center");
  }

  CacheManager.invalidateAll();
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

// ═══════════════════════════════════════════════════════════════════
//  API: 마지막 동기화 시간 조회
// ═══════════════════════════════════════════════════════════════════
function getLastSyncTime(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  const props = PropertiesService.getScriptProperties();
  const time = props.getProperty("LAST_SYNC_TIMESTAMP");
  return { success: true, timestamp: time };
}



function disableItemMaster(token, code) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (session.role === ROLES.STAFF) return { success: false, message: "삭제 권한이 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const data = masterSheet.getDataRange().getValues();
  
  let targetRow = -1;
  for (let i = 2; i < data.length; i++) { // Header rows
    if (data[i][0] === code) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) return { success: false, message: "품목을 찾을 수 없습니다." };

  // Set X column (column 24) to '미사용'
  masterSheet.getRange(targetRow, 24).setValue("미사용");
  
  // [NF-02 FIX] 캐시 무효화 누락 수정 — 비활성화된 품목이 캐시에서 즉시 제거되도록
  CacheManager.invalidateAll();

  // Log change if logChange exists
  if (typeof logChange === "function") {
    logChange(session.username, code, data[targetRow-1][1], "상태(사용여부)", data[targetRow-1][23] || "사용", "미사용");
  }

  // [v9.0] 미사용 품목을 시트 최하단으로 정렬 (데이터 가독성 개선)
  _sortMasterByUsageStatus(masterSheet);

  return { success: true, message: "품목이 성공적으로 삭제(비활성화)되었습니다." };
}

// [v9.0] 품목 마스터 사용/미사용 정렬 헬퍼 (수식 보호하면서 데이터만 정렬)
function _sortMasterByUsageStatus(masterSheet) {
  const lastRow = masterSheet.getLastRow();
  if (lastRow < 4) return; // 데이터 2행 이하면 정렬 불필요
  
  const numRows = lastRow - 2;
  // 수식이 아닌 데이터 열만 읽기 (A~E: 1~5, G~M: 7~13, S~T: 19~20, X: 24)
  // ARRAYFORMULA가 N,O,P,Q,U,V,W열에 걸려있으므로 이 열들은 수식이 자동 계산
  const data = masterSheet.getRange(3, 1, numRows, 24).getValues();
  
  // 빈 행 제외 후 정렬: 사용 → 미사용 순서, 같은 상태 내에서는 품목코드 순
  const filledRows = data.filter(r => r[0]); // 품목코드가 있는 행만
  const emptyRows = data.filter(r => !r[0]); // 빈 행
  
  filledRows.sort(function(a, b) {
    const aDisabled = (a[23] === '미사용') ? 1 : 0;
    const bDisabled = (b[23] === '미사용') ? 1 : 0;
    if (aDisabled !== bDisabled) return aDisabled - bDisabled;
    // 같은 상태 내에서는 품목코드 순
    return String(a[0]).localeCompare(String(b[0]));
  });
  
  const sorted = filledRows.concat(emptyRows);
  
  // 수식 열(N,O,P,Q,U,V,W)의 값은 ARRAYFORMULA가 자동 계산하므로
  // 데이터 열(A~E, G~M, S~T, X)만 재기록
  // 하지만 ARRAYFORMULA는 A3부터 전체 범위를 참조하므로 전체 24열을 쓰되 수식 열은 빈 값으로
  const writeData = sorted.map(function(row) {
    const newRow = row.slice(); // 복사
    // 수식 열은 빈 값으로 (수식이 자동 채움)
    newRow[13] = ""; // N: 안전재고
    newRow[14] = ""; // O: 발주점
    newRow[15] = ""; // P: 적정발주량
    newRow[16] = ""; // Q: 재고 상태
    newRow[20] = ""; // U: 공급단가
    newRow[21] = ""; // V: 단위 세액
    newRow[22] = ""; // W: 재고 합계금액
    return newRow;
  });
  
  if (writeData.length > 0) {
    masterSheet.getRange(3, 1, numRows, 24).clearContent();
    masterSheet.getRange(3, 1, writeData.length, 24).setValues(writeData);
  }
}
