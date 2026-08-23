


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

  const data = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();
  items = [];

  data.forEach(row => {
    if (!row[MASTER_COLS.CODE]) return;
    // 상태(사용여부)가 '미사용'인 품목은 제외
    if (row[MASTER_COLS.USAGE_STATUS] === '미사용') return;

    items.push({
      code: row[MASTER_COLS.CODE], name: row[MASTER_COLS.NAME], category: row[MASTER_COLS.CATEGORY],
      grade: row[MASTER_COLS.GRADE], unit: row[MASTER_COLS.UNIT],
      initStock: row[MASTER_COLS.INIT_STOCK], currentStock: row[MASTER_COLS.CURRENT_STOCK],
      dailyUsage: row[MASTER_COLS.DAILY_USAGE],
      leadTime: row[MASTER_COLS.LEAD_TIME], safetyDays: row[MASTER_COLS.SAFETY_DAYS],
      targetDays: row[MASTER_COLS.TARGET_DAYS],
      safetyStock: row[MASTER_COLS.SAFETY_STOCK], rop: row[MASTER_COLS.ROP],
      orderQty: row[MASTER_COLS.ORDER_QTY], status: row[MASTER_COLS.STATUS],
      taxType: row[MASTER_COLS.TAX_TYPE], unitPrice: row[MASTER_COLS.UNIT_PRICE],
      supplyPrice: row[MASTER_COLS.SUPPLY_PRICE],
      taxAmount: row[MASTER_COLS.TAX_AMOUNT], totalValue: row[MASTER_COLS.TOTAL_VALUE]
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

  const data = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();
  codes = data.filter(r => r[MASTER_COLS.CODE] && r[MASTER_COLS.USAGE_STATUS] !== '미사용').map(r => ({ code: r[MASTER_COLS.CODE], name: r[MASTER_COLS.NAME] }));
  
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
    
    const data = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();
    allCodes = data.filter(r => r[MASTER_COLS.CODE] && r[MASTER_COLS.USAGE_STATUS] !== '미사용').map(r => ({ code: r[MASTER_COLS.CODE], name: r[MASTER_COLS.NAME] }));
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

  // [v10.0] LockService 도입: 품목 등록 동시 충돌 방지
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "⏳ 다른 사용자가 작업 중입니다. 잠시 후 다시 시도해주세요." };
  }

  try {
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

    // [v10.0] 배치 쓰기: setValue() 6회 → setValues() 1회로 통합
    const newRowData = new Array(MASTER_COL_COUNT).fill("");
    newRowData[MASTER_COLS.CODE] = itemData.code;
    newRowData[MASTER_COLS.NAME] = itemData.name;
    newRowData[MASTER_COLS.CATEGORY] = itemData.category;
    newRowData[MASTER_COLS.GRADE] = itemData.grade;
    newRowData[MASTER_COLS.UNIT] = itemData.unit;
    newRowData[MASTER_COLS.INIT_STOCK] = itemData.initStock || 0;
    newRowData[MASTER_COLS.CURRENT_STOCK] = itemData.initStock || 0;
    newRowData[MASTER_COLS.DAILY_USAGE] = 0;
    newRowData[MASTER_COLS.LEAD_TIME] = itemData.leadTime || 3;
    newRowData[MASTER_COLS.SAFETY_DAYS] = itemData.safetyDays || 5;
    newRowData[MASTER_COLS.TARGET_DAYS] = itemData.targetDays || 30;
    newRowData[MASTER_COLS.TAX_TYPE] = itemData.taxType || "과세";
    newRowData[MASTER_COLS.UNIT_PRICE] = itemData.unitPrice || 0;
    newRowData[MASTER_COLS.USAGE_STATUS] = "사용";
    masterSheet.getRange(newRow, 1, 1, MASTER_COL_COUNT).setValues([newRowData]);

    CacheManager.invalidateAll();
    return { success: true, message: `✅ 품목 '${itemData.name}' 등록 완료` };
  } finally {
    lock.releaseLock();
  }
}



// [v7.0] 변경이력 기록 추가

function uploadItemMasterCSV(token, dataRows) {
  if (token !== 'SHEET_UI') {
    const session = validateSession(token);
    if (!session || session.role === 'staff') return { success: false, message: "권한이 없습니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  
  // 기존 코드 가져오기 (O(1) 조회를 위해 Set 사용)
  const existingCodes = new Set();
  if (masterLastRow >= 3) {
    const codeValues = masterSheet.getRange(3, MASTER_COLS.CODE + 1, masterLastRow - 2, 1).getValues();
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
        // [v10.0] MASTER_COLS 상수 사용으로 매직 넘버 제거
        const newRow = new Array(MASTER_COL_COUNT).fill("");
        newRow[MASTER_COLS.CODE] = code;
        newRow[MASTER_COLS.NAME] = row[1] || "";
        newRow[MASTER_COLS.CATEGORY] = cat;
        newRow[MASTER_COLS.GRADE] = row[3] || "C";
        newRow[MASTER_COLS.UNIT] = row[4] || "";
        const initStock = Number(row[5]) || 0;
        newRow[MASTER_COLS.INIT_STOCK] = initStock;
        newRow[MASTER_COLS.CURRENT_STOCK] = initStock; // [FIX] 현재고 = 초기재고로 동기화
        newRow[MASTER_COLS.DAILY_USAGE] = 0;
        newRow[MASTER_COLS.LEAD_TIME] = Number(row[6]) || 3;
        newRow[MASTER_COLS.SAFETY_DAYS] = Number(row[7]) || 5;
        newRow[MASTER_COLS.TARGET_DAYS] = Number(row[8]) || 30;
        newRow[MASTER_COLS.TAX_TYPE] = row[9] || "과세";
        newRow[MASTER_COLS.UNIT_PRICE] = Number(row[10]) || 0;
        newRow[MASTER_COLS.USAGE_STATUS] = "사용";
        
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
    // [v10.0] MASTER_COL_COUNT 상수 사용
    masterSheet.getRange(masterLastRow + 1, 1, newRows.length, MASTER_COL_COUNT).setValues(newRows);
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

  // [v10.0] LockService 도입: 품목 수정 동시 충돌 방지
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "⏳ 다른 사용자가 작업 중입니다. 잠시 후 다시 시도해주세요." };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(SHEET_MASTER);
    const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
    const data = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();
    
    let targetRowIdx = -1;
    let oldValues = null;
    data.forEach((row, idx) => {
      if (row[MASTER_COLS.CODE] === itemCode) {
        targetRowIdx = idx;
        oldValues = row;
      }
    });

    if (targetRowIdx === -1) return { success: false, message: "❌ 품목코드를 찾을 수 없습니다." };
    const targetRow = targetRowIdx + 3;

    // [v10.0] MASTER_COLS 기반 열 매핑 (1-based, getRange용)
    const colMap = {
      name: MASTER_COLS.NAME + 1, category: MASTER_COLS.CATEGORY + 1,
      grade: MASTER_COLS.GRADE + 1, unit: MASTER_COLS.UNIT + 1,
      initStock: MASTER_COLS.INIT_STOCK + 1, leadTime: MASTER_COLS.LEAD_TIME + 1,
      safetyDays: MASTER_COLS.SAFETY_DAYS + 1, targetDays: MASTER_COLS.TARGET_DAYS + 1,
      taxType: MASTER_COLS.TAX_TYPE + 1, unitPrice: MASTER_COLS.UNIT_PRICE + 1
    };
    
    // [v7.0] 변경이력 기록용 매핑
    const fieldNameMap = {
      name: "품목명", category: "카테고리", grade: "규격", unit: "단위",
      initStock: "초기재고", leadTime: "리드타임", safetyDays: "안전재고일수",
      targetDays: "목표유지일수", taxType: "과세구분", unitPrice: "매입단가"
    };
    // [v10.0] MASTER_COLS 기반 oldValue 인덱스 매핑 (0-based, 배열 접근용)
    const oldColMap = {
      name: MASTER_COLS.NAME, category: MASTER_COLS.CATEGORY,
      grade: MASTER_COLS.GRADE, unit: MASTER_COLS.UNIT,
      initStock: MASTER_COLS.INIT_STOCK, leadTime: MASTER_COLS.LEAD_TIME,
      safetyDays: MASTER_COLS.SAFETY_DAYS, targetDays: MASTER_COLS.TARGET_DAYS,
      taxType: MASTER_COLS.TAX_TYPE, unitPrice: MASTER_COLS.UNIT_PRICE
    };

    const changeRecords = [];
    const now = new Date();
    const itemName = oldValues[MASTER_COLS.NAME];

    // [v10.0] 배치 쓰기: 행 데이터를 메모리에서 업데이트 후 한 번에 쓰기
    const updatedRow = oldValues.slice(); // 복사
    Object.keys(updates).forEach(key => {
      if (colMap[key]) {
        const oldVal = oldValues[oldColMap[key]];
        const newVal = updates[key];
        
        // 실제 변경이 있는 경우만 이력 기록
        if (String(oldVal) !== String(newVal)) {
          changeRecords.push([now, session.name, itemCode, itemName, fieldNameMap[key] || key, oldVal, newVal]);
        }
        
        updatedRow[oldColMap[key]] = newVal;
      }
    });

    // 수식 열은 빈 값으로 (ARRAYFORMULA가 자동 채움)
    updatedRow[MASTER_COLS.SAFETY_STOCK] = "";
    updatedRow[MASTER_COLS.ROP] = "";
    updatedRow[MASTER_COLS.ORDER_QTY] = "";
    updatedRow[MASTER_COLS.STATUS] = "";
    updatedRow[MASTER_COLS.SUPPLY_PRICE] = "";
    updatedRow[MASTER_COLS.TAX_AMOUNT] = "";
    updatedRow[MASTER_COLS.TOTAL_VALUE] = "";
    masterSheet.getRange(targetRow, 1, 1, MASTER_COL_COUNT).setValues([updatedRow]);

    // [v7.0] 변경이력 시트에 기록
    if (changeRecords.length > 0) {
      const changelogSheet = ss.getSheetByName(SHEET_CHANGELOG);
      const clLastRow = Math.max(changelogSheet.getLastRow() + 1, 3);
      changelogSheet.getRange(clLastRow, 1, changeRecords.length, 7).setValues(changeRecords)
        .setHorizontalAlignment("center").setBackground(COLORS.autoBg);
    }

    CacheManager.invalidateAll();
    return { success: true, message: `✅ 품목 '${itemCode}' 수정 완료` };
  } finally {
    lock.releaseLock();
  }
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





function disableItemMaster(token, code) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (session.role === ROLES.STAFF) return { success: false, message: "삭제 권한이 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const data = masterSheet.getRange(1, 1, masterSheet.getLastRow(), MASTER_COL_COUNT).getValues();
  
  let targetRow = -1;
  for (let i = 2; i < data.length; i++) { // Header rows
    if (data[i][0] === code) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) return { success: false, message: "품목을 찾을 수 없습니다." };

  // Set X column (사용유무) to '미사용'
  masterSheet.getRange(targetRow, MASTER_COLS.USAGE_STATUS + 1).setValue("미사용");
  
  // [NF-02 FIX] 캐시 무효화 누락 수정 — 비활성화된 품목이 캐시에서 즉시 제거되도록
  CacheManager.invalidateAll();

  // Log change if logChange exists
  if (typeof logChange === "function") {
    logChange(session.username, code, data[targetRow-1][MASTER_COLS.NAME], "상태(사용여부)", data[targetRow-1][MASTER_COLS.USAGE_STATUS] || "사용", "미사용");
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
  const data = masterSheet.getRange(3, 1, numRows, MASTER_COL_COUNT).getValues();
  
  // 빈 행 제외 후 정렬: 사용 → 미사용 순서, 같은 상태 내에서는 품목코드 순
  const filledRows = data.filter(r => r[MASTER_COLS.CODE]); // 품목코드가 있는 행만
  const emptyRows = data.filter(r => !r[MASTER_COLS.CODE]); // 빈 행
  
  filledRows.sort(function(a, b) {
    const aDisabled = (a[MASTER_COLS.USAGE_STATUS] === '미사용') ? 1 : 0;
    const bDisabled = (b[MASTER_COLS.USAGE_STATUS] === '미사용') ? 1 : 0;
    if (aDisabled !== bDisabled) return aDisabled - bDisabled;
    // 같은 상태 내에서는 품목코드 순
    return String(a[MASTER_COLS.CODE]).localeCompare(String(b[MASTER_COLS.CODE]));
  });
  
  const sorted = filledRows.concat(emptyRows);
  
  // 수식 열(N,O,P,Q,U,V,W)의 값은 ARRAYFORMULA가 자동 계산하므로
  // 데이터 열(A~E, G~M, S~T, X)만 재기록
  // 하지만 ARRAYFORMULA는 A3부터 전체 범위를 참조하므로 전체 24열을 쓰되 수식 열은 빈 값으로
  const writeData = sorted.map(function(row) {
    const newRow = row.slice(); // 복사
    // 수식 열은 빈 값으로 (수식이 자동 채움)
    newRow[MASTER_COLS.SAFETY_STOCK] = ""; // N: 안전재고
    newRow[MASTER_COLS.ROP] = ""; // O: 발주점
    newRow[MASTER_COLS.ORDER_QTY] = ""; // P: 적정발주량
    newRow[MASTER_COLS.STATUS] = ""; // Q: 재고 상태
    newRow[MASTER_COLS.SUPPLY_PRICE] = ""; // U: 공급단가
    newRow[MASTER_COLS.TAX_AMOUNT] = ""; // V: 단위 세액
    newRow[MASTER_COLS.TOTAL_VALUE] = ""; // W: 재고 합계금액
    return newRow;
  });
  
  if (writeData.length > 0) {
    masterSheet.getRange(3, 1, numRows, MASTER_COL_COUNT).clearContent();
    masterSheet.getRange(3, 1, writeData.length, MASTER_COL_COUNT).setValues(writeData);
  }
}

/**
 * 구글 시트 UI(모달)에서 CSV 문자열을 받아 처리하는 함수
 */
function processCsvUploadFromSheet(csvString) {
  try {
    const lines = csvString.split('\n');
    const dataRows = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(',');
      if (cols.length >= 2) {
        dataRows.push(cols.map(c => c.replace(/^"|"$/g, '').trim()));
      }
    }
    
    if (dataRows.length === 0) {
      throw new Error("유효한 데이터가 없습니다.");
    }
    
    const result = uploadItemMasterCSV("SHEET_UI", dataRows);
    if (result.success) {
      return result.message;
    } else {
      throw new Error(result.message);
    }
  } catch (err) {
    throw new Error(err.message);
  }
}
