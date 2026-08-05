/**
 * 호텔덕구온천 재고 관리 시스템 v7.0 — 진입점 모듈
 * onOpen, onEdit, createAll 등 시스템 핵심 진입점
 * [v7.0] 시트 분리 + 9열 입출고 구조 + 단가 스냅샷
 */

// ═══════════════════════════════════════════════════════════════════
//  시스템 관리 메뉴
// ═══════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🏨 시스템 관리")
    .addItem("🆕 신규 업장 시트 생성",            "generateNewShops")
    .addItem("🔍 시트 상태 새로고침",              "refreshSheetStatus")
    .addItem("🔄 대시보드 및 재고 갱신",          "refreshDashboard")
    .addItem("🔐 권한 재동기화",                 "syncPermissions")
    .addItem("✅ 시즌 설정 검증",                 "validateSeasonSettings")
    .addSeparator()
    .addItem("🗑️ 품목코드 드롭다운 일괄 제거",     "removeItemCodeValidation")
    .addItem("🔧 업장 시트 보호범위 복구",         "fixSheetProtection")
    .addSeparator()
    .addItem("🔔 재고 알림 즉시 확인",            "checkAlerts")
    .addItem("⏰ 자동 동기화 설정 (자정)",         "setupDailyTrigger")
    .addToUi();
}

// ═══════════════════════════════════════════════════════════════════
//  시스템 초기 구축
// ═══════════════════════════════════════════════════════════════════

function createAll() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert("⚠️ 시스템 초기화 경고", "모든 시트가 삭제되고 시스템이 초기화됩니다.\n계속하시겠습니까?", ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const oldSheets  = ss.getSheets();
  const tempSheet  = ss.insertSheet("Temp_Reset_Sheet");
  oldSheets.forEach(s => { try { ss.deleteSheet(s); } catch (e) {} });

  // [v7.0] 개별 시트 빌더 호출 (순서 중요: 기초데이터 → 마스터 순서 — validation 참조)
  buildBaseDataSheet(ss);
  buildShopsSheet(ss);
  buildSeasonsSheet(ss);
  buildUsersSheet(ss);
  buildChangelogSheet(ss);
  buildTemplateSheet(ss);
  buildItemMaster(ss);   
  buildConsolidatedLog(ss); 
  buildDashboard(ss);    

  ss.deleteSheet(tempSheet);
  SpreadsheetApp.flush();
  
  refreshDashboard(true);
  _refreshPermissionDropdown(ss);
  _protectSystemSheets(ss);
  ui.alert("✅ 시스템 초기화가 완료되었습니다.\n\n5개의 기본 계정이 생성되었습니다. 초기 비밀번호는 dukgu1013! 입니다.\n\n웹앱 배포 후 해당 계정으로 로그인하세요.");
}


// ═══════════════════════════════════════════════════════════════════
//  가드레일 및 자동 거래ID/단가 스냅샷 생성
// ═══════════════════════════════════════════════════════════════════

// [v7.0] onEdit 업데이트: 시트 참조 변경 + 9열 구조 + 단가 스냅샷 자동 기록
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const row = e.range.getRow();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // === 업장관리 시트 가드레일 ===
  if (sheetName === SHEET_SHOPS && row >= 3 && row <= 30) {
    const col = e.range.getColumn();
    if (col >= 1 && col <= 3) {
      if (sheet.getRange(row, 4).getValue() === "생성완료") {
        ss.toast("🚨 이미 생성 완료된 업장명/태그는 변경할 수 없습니다.", "변경 차단", 5);
        if (e.oldValue !== undefined && e.oldValue !== null) {
          e.range.setValue(e.oldValue);
        } else {
          e.range.clearContent();
          Logger.log(`[RBAC Guard] 다중 셀 편집 롤백: ${sheetName} R${row}C${col}`);
        }
        return;
      }
    }
  }

  // [v7.0] 시스템 시트 목록 업데이트
  const SYSTEM_SHEETS = [SHEET_DASHBOARD, SHEET_INOUT, SHEET_MASTER, SHEET_TEMPLATE, SHEET_SHOPS, SHEET_SEASONS, SHEET_USERS, SHEET_BASE_DATA, SHEET_CHANGELOG];
  if (SYSTEM_SHEETS.includes(sheetName)) return;

  const startCol = e.range.getColumn();
  const endCol = startCol + e.range.getNumColumns() - 1;
  const numRows = e.range.getNumRows();

  // [v7.0] 자동 계산 컬럼(C=3, F=6 단가, I=9 거래ID) 직접 편집 감지 및 차단
  if (row >= 3) {
    const editedCOnly = (startCol === 3 && endCol === 3);
    const editedFOnly = (startCol === 6 && endCol === 6);
    const editedIOnly = (startCol === 9 && endCol === 9);
    if (editedCOnly || editedFOnly || editedIOnly) {
      ss.toast("⛔ 자동 계산 컬럼(품목명/단가/거래ID)은 직접 편집할 수 없습니다.", "편집 차단", 5);
      if (e.oldValue !== undefined) {
        e.range.setValue(e.oldValue);
      } else {
        e.range.clearContent();
      }
      return;
    }
  }

  const isTargetEdited = (startCol <= 2 && endCol >= 2) || (startCol <= 5 && endCol >= 5);

  // [v7.0] 업장관리 시트에서 설정 조회
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  if (shopSheet.getLastRow() < 3) return;
  
  const shopConfigData = shopSheet.getRange(3, 1, shopSheet.getLastRow() - 2, 6).getValues();
  const currentPrefix = (shopConfigData.find(r => r[1] === sheetName && r[3] === "생성완료") || [])[2];
  
  if (!currentPrefix || row < 3 || !isTargetEdited) return; 

  // [v7.0] 거래 확정(거래ID 발급 완료) 후 구분(D열) 변경 차단
  if (startCol <= 4 && endCol >= 4) {
    for (let i = 0; i < numRows; i++) {
      const txId = sheet.getRange(row + i, 9).getValue(); // [v7.0] 9열
      if (txId && txId.toString().trim() !== "") {
        ss.toast("⛔ 이미 확정된 거래의 구분은 변경할 수 없습니다. 행 삭제 후 재입력하세요.", "변경 차단", 5);
        if (e.oldValue !== undefined) e.range.setValue(e.oldValue);
        return;
      }
    }
  }

  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 20).getValues(); // [v7.0] 20열까지 읽기 (매입단가 포함)
  const itemMap = {};
  const priceMap = {};
  masterData.forEach(r => { 
    if(r[0]) {
      itemMap[r[0]] = r[1]; 
      priceMap[r[0]] = r[19] || 0; // T열(20번째) = 매입단가
    }
  });

  const aDateValues = sheet.getRange(row, 1, numRows, 1).getValues();
  const codeValues = sheet.getRange(row, 2, numRows, 1).getValues();
  const cExisting = sheet.getRange(row, 3, numRows, 1).getValues();
  const fExisting = sheet.getRange(row, 6, numRows, 1).getValues(); // [v7.0] 단가 스냅샷
  const iExisting = sheet.getRange(row, 9, numRows, 1).getValues(); // [v7.0] 거래ID (9열)
  const iBgExisting = sheet.getRange(row, 9, numRows, 1).getBackgrounds();

  const cUpdates = [];
  const fUpdates = []; // [v7.0] 단가 스냅샷
  const iUpdates = []; // [v7.0] 거래ID
  const iBgUpdates = [];
  let hasUpdates = false;
  const tz = Session.getScriptTimeZone();

  for (let i = 0; i < numRows; i++) {
    const code = codeValues[i][0];
    const existingId = iExisting[i][0];
    
    if (code) {
      cUpdates.push([itemMap[code] || "미등록 품목"]); 
      fUpdates.push([priceMap[code] || 0]); // [v7.0] 단가 스냅샷
      
      const aDateVal = aDateValues[i][0];
      const hasValidDate = aDateVal instanceof Date && !isNaN(aDateVal.getTime());

      if (!existingId && hasValidDate) {
        const dateStr = Utilities.formatDate(aDateVal, tz, "yyyyMMdd");
        const uniqueSuffix = Utilities.getUuid().replace(/-/g,"").substring(0,8).toUpperCase();
        iUpdates.push([`${currentPrefix}-${dateStr}-${uniqueSuffix}`]);
      } else {
        iUpdates.push([existingId || ""]);
      }
      iBgUpdates.push([COLORS.autoBg]);
      hasUpdates = true;
    } else {
      cUpdates.push([cExisting[i][0]]);
      fUpdates.push([fExisting[i][0]]);
      iUpdates.push([existingId]);
      iBgUpdates.push([iBgExisting[i][0]]);
    }
  }

  if (hasUpdates) {
    sheet.getRange(row, 3, numRows, 1).setValues(cUpdates).setBackgrounds(iBgUpdates.map(()=>[COLORS.autoBg]));
    sheet.getRange(row, 6, numRows, 1).setValues(fUpdates).setBackgrounds(iBgUpdates.map(()=>[COLORS.autoBg])); // [v7.0] 단가
    sheet.getRange(row, 9, numRows, 1).setValues(iUpdates).setBackgrounds(iBgUpdates).setHorizontalAlignment("center"); // [v7.0] 거래ID
  }
}
