/**
 * 호텔덕구온천 재고 관리 시스템 v7.0 — 진입점 모듈
 * onOpen, onEdit, createAll 등 시스템 핵심 진입점
 * [v7.0] 시트 분리 + 9열 입출고 구조 + 단가 스냅샷
 */

// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
//  관리자 도구 메뉴
// ═══════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🏨 관리자 도구")
    .addItem("🔄 통합 갱신",                     "refreshDashboard")
    .addItem("🔐 권한 재동기화",                 "syncPermissions")
    .addItem("✅ 시즌 설정 검증",                 "validateSeasonSettings")
    .addItem("💾 CSV 백업 실행",                 "backupCSV")
    .addToUi();
}

/**
 * 구글 시트 커스텀 메뉴에서 CSV 백업을 실행하기 위한 래퍼 함수
 * 실제 로직은 Archive.gs의 backupToCSV()를 호출합니다.
 */
function backupCSV() {
  backupToCSV();
  SpreadsheetApp.getUi().alert("✅ CSV 백업이 완료되었습니다.");
}

// ═══════════════════════════════════════════════════════════════════
//  시스템 초기 구축
// ═══════════════════════════════════════════════════════════════════

function createAll() {
  const ui = SpreadsheetApp.getUi();
  try {
    _getInitialAdminConfiguration();
  } catch (e) {
    ui.alert("초기화 중단", e.message, ui.ButtonSet.OK);
    return;
  }
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
  buildSystemLogsSheet(ss); // [v10.0] 시스템 에러 로그 시트

  ss.deleteSheet(tempSheet);
  SpreadsheetApp.flush();
  
  generateNewShops(); // 자동 업장 시트 생성
  
  refreshDashboard(true);
  _refreshPermissionDropdown(ss);
  _protectSystemSheets(ss);
  ui.alert("✅ 시스템 초기화가 완료되었습니다.\n\nScript Properties에 설정한 최초 관리자 계정이 생성되었습니다.\n\n웹앱 배포 후 해당 계정으로 로그인하세요.");
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
          console.log(`[RBAC Guard] 다중 셀 편집 롤백: ${sheetName} R${row}C${col}`);
        }
        return;
      }
    }
  }

  // [v9.0] 품목 마스터 시트 직접 편집 시 변경이력 자동 기록
  if (sheetName === SHEET_MASTER && row >= 3) {
    const col = e.range.getColumn();
    // 변경 추적 대상 컬럼 (1-based 열 번호 → 필드명, MASTER_COLS는 0-based)\n    // B(NAME+1), C(CATEGORY+1), D(GRADE+1), E(UNIT+1), G(INIT_STOCK+1),\n    // K(LEAD_TIME+1), L(SAFETY_DAYS+1), M(TARGET_DAYS+1), S(TAX_TYPE+1), T(UNIT_PRICE+1), X(USAGE_STATUS+1)\n    const TRACKED_COLS = { \n      [MASTER_COLS.NAME + 1]: "품목명", [MASTER_COLS.CATEGORY + 1]: "카테고리",\n      [MASTER_COLS.GRADE + 1]: "규격", [MASTER_COLS.UNIT + 1]: "단위",\n      [MASTER_COLS.INIT_STOCK + 1]: "초기재고",\n      [MASTER_COLS.LEAD_TIME + 1]: "리드타임", [MASTER_COLS.SAFETY_DAYS + 1]: "안전재고일수",\n      [MASTER_COLS.TARGET_DAYS + 1]: "목표유지일수",\n      [MASTER_COLS.TAX_TYPE + 1]: "과세구분", [MASTER_COLS.UNIT_PRICE + 1]: "매입단가",\n      [MASTER_COLS.USAGE_STATUS + 1]: "사용유무"\n    };
    
    if (TRACKED_COLS[col] && e.range.getNumRows() === 1 && e.range.getNumColumns() === 1) {
      try {
        const itemCode = sheet.getRange(row, 1).getValue(); // A열: 품목코드
        const itemName = sheet.getRange(row, 2).getValue(); // B열: 품목명
        const oldValue = (e.oldValue !== undefined && e.oldValue !== null) ? e.oldValue : "(이전값 없음)";
        const newValue = e.range.getValue();
        const fieldName = TRACKED_COLS[col];
        
        // 값이 실제로 변경되었을 때만 기록
        if (String(oldValue) !== String(newValue) && itemCode) {
          const changelogSheet = ss.getSheetByName(SHEET_CHANGELOG);
          if (changelogSheet) {
            const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
            const editor = Session.getActiveUser().getEmail() || "시트편집";
            changelogSheet.appendRow([timestamp, editor, itemCode, itemName, fieldName, oldValue, newValue]);
          }
        }
      } catch(clErr) {
        console.error("[onEdit ChangeLog] 이력 기록 실패: " + clErr.message);
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
  // [CR-03 FIX] clearContent() 대신 마스터 데이터 참조 재생성으로 안전 복구
  if (row >= 3) {
    const editedCOnly = (startCol === 3 && endCol === 3);
    const editedFOnly = (startCol === 6 && endCol === 6);
    const editedIOnly = (startCol === 9 && endCol === 9);
    if (editedCOnly || editedFOnly || editedIOnly) {
      ss.toast("⛔ 자동 계산 컬럼은 편집 불가합니다. 복구 중...", "편집 차단", 5);
      if (e.oldValue !== undefined && numRows === 1 && e.range.getNumColumns() === 1) {
        // 단일 셀: 원본값 복원
        e.range.setValue(e.oldValue);
      } else {
        // 다중 셀 또는 oldValue 없음: 해당 열의 자동계산을 재실행하여 복구
        const _numRows = numRows;
        const _startRow = row;
        const _codeValues = sheet.getRange(_startRow, 2, _numRows, 1).getValues();
        const _masterSheet = ss.getSheetByName(SHEET_MASTER);
        const _mLastRow = Math.max(_masterSheet.getLastRow(), 3);
        // [v8.0] 캐시 활용 (자동계산 컬럼 복구)
        let _itemInfoMap = CacheManager.get(CACHE_KEYS.ITEM_MAP);
        if (!_itemInfoMap) {
          _itemInfoMap = CacheManager.buildItemMapCache(ss);
        }
        
        if (editedCOnly) {
          // 품목명(C열) 재생성
          const restored = _codeValues.map(r => {
             const info = _itemInfoMap[r[0]];
             return [r[0] ? (info ? info.name : "미등록 품목") : ""];
          });
          sheet.getRange(_startRow, 3, _numRows, 1).setValues(restored).setBackground(COLORS.autoBg);
        } else if (editedFOnly) {
          // 단가(F열) 재생성
          const restored = _codeValues.map(r => {
             const info = _itemInfoMap[r[0]];
             return [r[0] ? (info ? info.price : 0) : ""];
          });
          sheet.getRange(_startRow, 6, _numRows, 1).setValues(restored).setBackground(COLORS.autoBg);
        } else if (editedIOnly) {
          // 거래ID(I열)는 한번 발급되면 불변 — toast 경고만
          ss.toast("⚠️ 거래ID는 시스템 자동 생성 값입니다. Ctrl+Z로 원상 복구하세요.", "경고", 5);
        }
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

  // [v8.0] 캐시를 활용한 품목 맵 조회 (30초 제한 회피)
  let itemInfoMap = CacheManager.get(CACHE_KEYS.ITEM_MAP);
  if (!itemInfoMap) {
    itemInfoMap = CacheManager.buildItemMapCache(ss);
  }

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
      const info = itemInfoMap[code] || { name: "미등록 품목", price: 0 };
      cUpdates.push([info.name]); 
      fUpdates.push([info.price]); // [v7.0] 단가 스냅샷
      
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

  // [CR-01 FIX] Triggers.gs에서 병합: 설정 시트 편집 시 캐시 무효화
  const INVALIDATE_SHEETS = [SHEET_MASTER, SHEET_SHOPS, SHEET_SEASONS, SHEET_BASE_DATA];
  if (INVALIDATE_SHEETS.includes(sheetName)) {
    try { CacheManager.invalidateAll(); } catch(err) {}
  }
}

// ═══════════════════════════════════════════════════════════════════
//  🚨 시스템 에러 로깅 헬퍼 (v10.0)
// ═══════════════════════════════════════════════════════════════════

function _logError(err, contextName = "Unknown Context", severity = "ERROR") {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return; // 트리거 등에서 SS가 없는 경우 예외 처리
    const logSheet = ss.getSheetByName(SHEET_SYSTEM_LOGS);
    if (!logSheet) return;
    
    // 현재 세션 사용자명 가져오기 (가급적 시도)
    let username = "SYSTEM";
    try {
      const activeUser = Session.getActiveUser().getEmail();
      if (activeUser) username = activeUser;
    } catch(e) {}

    const now = new Date();
    const errMsg = err.message || String(err);
    const stack = err.stack || "";
    
    // 로그 시트에 추가
    logSheet.appendRow([now, contextName, username, errMsg, stack, severity]);
    
    // 심각도가 HIGH인 경우 콘솔에도 출력
    if (severity === "HIGH") {
      console.error(`[${contextName}] ${errMsg}\n${stack}`);
    }
  } catch(e) {
    // 로깅 중 발생하는 에러는 무시 (무한루프 방지)
    console.error("Failed to write to System_Logs: " + e.message);
  }
}
