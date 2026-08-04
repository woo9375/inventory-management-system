/**
 * 호텔덕구온천 재고 관리 시스템 v1.0.0 — 진입점 모듈
 * onOpen, onEdit, createAll 등 시스템 핵심 진입점
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

  buildConfigSheet(ss);  
  buildTemplateSheet(ss);
  buildItemMaster(ss);   
  buildConsolidatedLog(ss); 
  buildDashboard(ss);    

  ss.deleteSheet(tempSheet);
  SpreadsheetApp.flush();
  
  refreshDashboard(true);
  _refreshPermissionDropdown(ss);
  _protectSystemSheets(ss);
  ui.alert("✅ 시스템 초기화가 완료되었습니다.\n\n기본 관리자 계정이 생성되었습니다:\n아이디: " + DEFAULT_ADMIN.username + "\n비밀번호: " + DEFAULT_ADMIN.password + "\n\n웹앱 배포 후 위 계정으로 로그인하세요.");
}


// ═══════════════════════════════════════════════════════════════════
//  가드레일 및 자동 거래ID 생성
// ═══════════════════════════════════════════════════════════════════

// [v6.8] onEdit 전면 개편: toast 전환, 다중셀 방어, 자동컬럼 보호, 거래확정 D열 차단
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const row = e.range.getRow();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // === 설정 시트 가드레일 ===
  if (sheetName === SHEET_CONFIG && row >= 4 && row <= 30) {
    const col = e.range.getColumn();
    if (col >= 2 && col <= 4) {
      if (sheet.getRange(row, 5).getValue() === "생성완료") {
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

  const SYSTEM_SHEETS = [SHEET_DASHBOARD, SHEET_INOUT, SHEET_MASTER, SHEET_CONFIG, SHEET_TEMPLATE];
  if (SYSTEM_SHEETS.includes(sheetName)) return;

  const startCol = e.range.getColumn();
  const endCol = startCol + e.range.getNumColumns() - 1;
  const numRows = e.range.getNumRows();

  // [v6.8] 자동 계산 컬럼(C=3, H=8) 직접 편집 감지 및 차단
  if (row >= 3) {
    const editedCOnly = (startCol === 3 && endCol === 3);
    const editedHOnly = (startCol === 8 && endCol === 8);
    if (editedCOnly || editedHOnly) {
      ss.toast("⛔ 자동 계산 컬럼(품목명/거래ID)은 직접 편집할 수 없습니다.", "편집 차단", 5);
      if (e.oldValue !== undefined) {
        e.range.setValue(e.oldValue);
      } else {
        e.range.clearContent();
      }
      return;
    }
  }

  const isTargetEdited = (startCol <= 2 && endCol >= 2) || (startCol <= 5 && endCol >= 5);

  const cfg = ss.getSheetByName(SHEET_CONFIG);
  if (cfg.getLastRow() < 4) return;
  
  const shopConfigData = cfg.getRange(4, 2, cfg.getLastRow() - 3, 6).getValues();
  const currentPrefix = (shopConfigData.find(r => r[1] === sheetName && r[3] === "생성완료") || [])[2];
  
  if (!currentPrefix || row < 3 || !isTargetEdited) return; 

  // [v6.8] 거래 확정(거래ID 발급 완료) 후 구분(D열) 변경 차단
  if (startCol <= 4 && endCol >= 4) {
    for (let i = 0; i < numRows; i++) {
      const txId = sheet.getRange(row + i, 8).getValue();
      if (txId && txId.toString().trim() !== "") {
        ss.toast("⛔ 이미 확정된 거래의 구분은 변경할 수 없습니다. 행 삭제 후 재입력하세요.", "변경 차단", 5);
        if (e.oldValue !== undefined) e.range.setValue(e.oldValue);
        return;
      }
    }
  }

  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 2).getValues();
  const itemMap = {};
  masterData.forEach(r => { if(r[0]) itemMap[r[0]] = r[1]; });

  const aDateValues = sheet.getRange(row, 1, numRows, 1).getValues();
  const codeValues = sheet.getRange(row, 2, numRows, 1).getValues();
  const cExisting = sheet.getRange(row, 3, numRows, 1).getValues();
  const hExisting = sheet.getRange(row, 8, numRows, 1).getValues();
  const hBgExisting = sheet.getRange(row, 8, numRows, 1).getBackgrounds();

  const cUpdates = [];
  const hUpdates = [];
  const hBgUpdates = [];
  let hasUpdates = false;
  const tz = Session.getScriptTimeZone();

  for (let i = 0; i < numRows; i++) {
    const code = codeValues[i][0];
    const existingId = hExisting[i][0];
    
    if (code) {
      cUpdates.push([itemMap[code] || "미등록 품목"]); 
      
      const aDateVal = aDateValues[i][0];
      const hasValidDate = aDateVal instanceof Date && !isNaN(aDateVal.getTime());

      if (!existingId && hasValidDate) {
        const dateStr = Utilities.formatDate(aDateVal, tz, "yyyyMMdd");
        const uniqueSuffix = Utilities.getUuid().replace(/-/g,"").substring(0,8).toUpperCase();
        hUpdates.push([`${currentPrefix}-${dateStr}-${uniqueSuffix}`]);
      } else {
        hUpdates.push([existingId || ""]);
      }
      hBgUpdates.push([COLORS.autoBg]);
      hasUpdates = true;
    } else {
      cUpdates.push([cExisting[i][0]]);
      hUpdates.push([existingId]);
      hBgUpdates.push([hBgExisting[i][0]]);
    }
  }

  if (hasUpdates) {
    sheet.getRange(row, 3, numRows, 1).setValues(cUpdates).setBackgrounds(hBgUpdates.map(()=>[COLORS.autoBg]));
    sheet.getRange(row, 8, numRows, 1).setValues(hUpdates).setBackgrounds(hBgUpdates).setHorizontalAlignment("center");
  }
}
