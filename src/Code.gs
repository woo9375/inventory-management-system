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
  // [TASK-019] 모든 항목이 menu* 래퍼를 거친다 — 실행 전 안내 대화상자를 거쳐야 본체가 돈다 (아래 "관리자 도구 대화상자" 참고)
  SpreadsheetApp.getUi()
    .createMenu("🏨 관리자 도구")
    .addItem("🔄 통합 갱신",                     "menuRefreshDashboard")
    .addItem("🔐 권한 재동기화",                 "menuSyncPermissions")
    .addItem("✅ 시즌 설정 검증",                 "menuValidateSeasonSettings")
    .addItem("💾 CSV 백업 실행",                 "menuBackupCSV")
    .addItem("🎨 시트 서식/검증 복구",             "menuRepairAllSheetFormatting")
    .addItem("🤝 거래처코드 일괄 부여",            "menuAssignMissingVendorCodes")
    .addToUi();
}

// ═══════════════════════════════════════════════════════════════════
//  [TASK-019 → TASK-023] 관리자 도구 대화상자
//
//  메뉴를 누르면 즉시 실행되던 것을 TASK-019가 ui.alert(YES/NO)로 막았고, TASK-023이 그 확인창을
//  웹앱과 같은 모양의 HtmlService 모달(AdminActionDialog.html)로 바꿨다. 흐름은
//    메뉴 → menu*() → openAdminActionDialog(id) → [실행] → google.script.run runAdminAction(id) → 본체(isSilent)
//  이고 결과는 같은 모달 안에 그려진다. 안내 문구는 Config.gs SYSTEM_ACTIONS 한 곳에서 온다(웹앱과 공유).
//
//  대화상자는 이 래퍼(menu*)에만 둔다. refreshDashboard(true)·backupToCSV()처럼 트리거·웹앱·
//  createAll·마이그레이션이 부르는 프로그램 경로에 대화상자가 끼어들면 안 되기 때문이다.
//  본체 함수(refreshDashboard, syncPermissions, …)의 시그니처와 동작은 그대로다 — isSilent=true로 부르면
//  알림창을 띄우지 않고 { success, message }만 돌려준다.
// ═══════════════════════════════════════════════════════════════════

/** 시트 대화상자 초기 크기 — 열린 뒤 대화상자 스크립트(fitDialog)가 내용 높이에 맞춰 다시 조절한다. */
const ADMIN_DIALOG_WIDTH = 480;
const ADMIN_DIALOG_HEIGHT = 300;

/**
 * SYSTEM_ACTIONS[id]의 안내문으로 관리자 도구 대화상자를 띄운다. 실행은 대화상자 안의 [실행] 버튼이 runAdminAction으로 한다.
 * @param {string} actionId Config.gs SYSTEM_ACTIONS 키 (scope가 'sheet' 또는 'both'인 것만)
 */
function openAdminActionDialog(actionId) {
  const action = getSystemAction(actionId);
  if (!action || action.scope === "webapp") throw new Error("알 수 없는 관리자 도구입니다: " + actionId);
  const t = HtmlService.createTemplateFromFile("AdminActionDialog");
  t.action = action;
  const html = t.evaluate().setWidth(ADMIN_DIALOG_WIDTH).setHeight(ADMIN_DIALOG_HEIGHT);
  SpreadsheetApp.getUi().showModalDialog(html, action.title);
}

/**
 * 대화상자의 [실행]이 부른다. 본체를 조용히(isSilent) 돌리고 결과를 돌려준다 — 본체의 ui.alert가 모달 위에 겹쳐 뜨지 않게.
 * 시트 대화상자는 메뉴를 누른 편집자 권한으로 돌므로 별도 토큰 검사가 없다(메뉴 본체와 같은 경계).
 * @return {{success: boolean, message: string}}
 */
function runAdminAction(actionId) {
  const action = getSystemAction(actionId);
  if (!action || action.scope === "webapp") return { success: false, message: "알 수 없는 작업입니다: " + actionId };
  try {
    switch (actionId) {
      case "refreshDashboard": {
        const r = refreshDashboard(true);
        return r || { success: true, message: "통합 갱신이 완료되었습니다." };
      }
      case "syncPermissions":
        return syncPermissions(true);
      case "validateSeason":
        return validateSeasonSettings(true);
      case "backupCSV":
        backupToCSV();
        return { success: true, message: "CSV 백업이 완료되었습니다.\n구글 드라이브 '시스템_데이터_백업' 폴더에 저장했습니다." };
      case "repairFormatting":
        return repairAllSheetFormatting(true);
      case "assignVendorCodes":
        return assignMissingVendorCodes(true);
      default:
        // [TASK-026] 품목 CSV 업로드(uploadItemCsv)는 시트 메뉴에서 빠졌다 — 웹앱 품목 관리 탭(JS_Items.html)이 uploadItemMasterCSV를 직접 부른다
        return { success: false, message: "이 작업은 대화상자에서 실행할 수 없습니다: " + actionId };
    }
  } catch (err) {
    console.error("[TASK-023] 관리자 도구 실행 실패(" + actionId + "): " + err.message + "\n" + err.stack);
    return { success: false, message: "작업 중 오류가 발생했습니다: " + err.message };
  }
}

function menuRefreshDashboard()        { openAdminActionDialog("refreshDashboard"); }
function menuSyncPermissions()         { openAdminActionDialog("syncPermissions"); }
function menuValidateSeasonSettings()  { openAdminActionDialog("validateSeason"); }
function menuBackupCSV()               { openAdminActionDialog("backupCSV"); }
function menuRepairAllSheetFormatting(){ openAdminActionDialog("repairFormatting"); }
function menuAssignMissingVendorCodes(){ openAdminActionDialog("assignVendorCodes"); }
// [TASK-026] 「📤 품목마스터 CSV 업로드」 메뉴와 시트 전용 업로드 창·수신 함수는 제거됐다.
//   품목 등록·수정·CSV 일괄 등록은 웹앱 품목 관리 탭(admin·manager)에서만 한다 — 구매팀은 시트를 편집하지 않는다.

/**
 * [TASK-016] 마스터·통합기록장·템플릿·업장 시트의 서식/드롭다운/보호 범위를
 * 현재 시트 행 수 기준으로 재적용한다.
 *
 * 서식은 적용 시점의 스냅샷이라 시트 행이 늘어나면 초과분이 맨살로 남는다.
 * 통합 갱신이 이를 자동 감지·복구하지만, 관리자가 즉시 되돌리고 싶을 때를 위한 수동 진입점이다.
 * 값(setValues/setFormula)은 건드리지 않으므로 데이터 유실 위험이 없고, 여러 번 눌러도 결과가 같다.
 *
 * [TASK-023] isSilent=true면 알림창 대신 { success, message }를 돌려준다 (시트 대화상자용).
 */
function repairAllSheetFormatting(isSilent = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    const r = reapplyAllSheetFormatting(ss);
    SpreadsheetApp.flush();
    const result = {
      success: true,
      message:
        "시트 서식/검증 복구 완료\n\n" +
        "대상 시트: " + r.sheets + "개\n" +
        "확충한 행: " + r.addedRows + "행\n" +
        // [v18] 열 확충을 조용히 하지 않는다 — 거래처 시트의 숨김 소스 열이 여기서 되살아난다
        (r.addedCols ? "확충한 열: " + r.addedCols + "열 (드롭다운 소스 등 숨김 보조 열)\n" : "") +
        "적용 범위: 3행 ~ 각 시트 마지막 행" +
        (r.missing.length ? "\n\n찾지 못한 시트: " + r.missing.join(", ") : "")
    };
    if (!isSilent) SpreadsheetApp.getUi().alert("🎨 " + result.message);
    return result;
  } catch (err) {
    console.error("[TASK-016] 서식 복구 실패: " + err.message + "\n" + err.stack);
    const result = { success: false, message: "서식 복구 중 오류가 발생했습니다:\n" + err.message };
    if (!isSilent) SpreadsheetApp.getUi().alert("❌ " + result.message);
    return result;
  }
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
  // [TASK-017] 거래처관리가 품목 마스터보다 먼저다 —
  //   품목 마스터의 거래처 드롭다운이 거래처 시트의 코드 목록을 소스로 잡기 때문이다.
  //   (기초데이터 시트를 업장관리보다 먼저 만드는 것과 같은 이유)
  buildVendors(ss);
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

  // [CR-01 FIX] 설정·마스터 시트를 직접 고치면 웹앱 캐시를 즉시 지운다.
  //   [TASK-027] 함수 맨 아래(업장 시트 처리 뒤)에 있던 것을 앞으로 옮겼다 — 시스템 시트는 그 앞의
  //   return에 걸려 이 무효화가 한 번도 실행되지 않았다. 시트에서 단가를 고쳐도 ITEM_CODE_MAP(TTL 10분)이
  //   옛 단가로 거래를 기록할 수 있었고, 시즌·기초데이터·업장 편집도 웹앱에 TTL이 끝나야 보였다.
  //   사용자관리·거래처관리도 캐시(CONFIG_DATA·VENDOR_LIST)에 들어가므로 함께 넣는다.
  const INVALIDATE_SHEETS = [SHEET_MASTER, SHEET_SHOPS, SHEET_SEASONS, SHEET_BASE_DATA, SHEET_USERS, SHEET_VENDORS];
  if (INVALIDATE_SHEETS.includes(sheetName)) {
    try { CacheManager.invalidateAll(); } catch (err) { console.warn("[onEdit] 캐시 무효화 실패: " + err.message); }
  }

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

  // [TASK-003] 품목 마스터 시트 직접 편집 시 변경이력 자동 기록 (다중 셀/붙여넣기/Clear 지원)
  //   [TASK-024] 품목 관리가 웹앱 API로 일원화된 뒤 이 블록은 **소유자가 시트에서 직접 고친 것**을 잡는 안전망이다.
  //   기록은 ItemService의 _appendChangelog(9열)로 — 경로 "시트편집". 추적 열은 MASTER_FIELD_COLS(웹앱과 같은 목록).
  if (sheetName === SHEET_MASTER && row >= 3) {
    const startCol = e.range.getColumn();
    const numRows = e.range.getNumRows();
    const numCols = e.range.getNumColumns();
    // 변경 추적 대상 컬럼 (1-based 열 번호 → 필드명). MASTER_FIELD_COLS는 0-based
    const TRACKED_COLS = {};
    Object.keys(MASTER_FIELD_COLS).forEach(function (key) { TRACKED_COLS[MASTER_FIELD_COLS[key] + 1] = MASTER_FIELD_LABELS[key]; });

    // 편집 범위가 추적 대상 컬럼을 하나라도 포함하는지 확인
    let touchesTrackedCol = false;
    for (let c = startCol; c < startCol + numCols; c++) {
      if (TRACKED_COLS[c]) { touchesTrackedCol = true; break; }
    }

    if (touchesTrackedCol) {
      try {
        // [GAS 제약] e.oldValue는 단일 셀 편집(입력/삭제)일 때만 제공되며,
        // 다중 셀 붙여넣기/드래그채우기/범위 Clear에서는 제공되지 않는다.
        // 이 경우 "(이전값 없음)"으로 표기하고 새 값만 정확히 기록한다(Task Human Approval 항목 참고).
        const isSingleCell = (numRows === 1 && numCols === 1);
        const singleOldValue = isSingleCell
          ? ((e.oldValue !== undefined && e.oldValue !== null) ? e.oldValue : "(이전값 없음)")
          : null;

        // 배치 조회: 편집 범위의 새 값 + 각 행의 품목코드/품목명 (개별 getValue() 반복 금지)
        const newValues = e.range.getValues();
        const codeNamePairs = sheet.getRange(row, 1, numRows, 2).getValues();

        const editor = Session.getActiveUser().getEmail() || "시트편집";
        const changeRecords = [];

        for (let r = 0; r < numRows; r++) {
          const itemCode = codeNamePairs[r][0];
          const itemName = codeNamePairs[r][1];
          if (!itemCode) continue; // 품목코드 없는 행(빈 템플릿 행 등)은 기록 대상 아님

          for (let c = 0; c < numCols; c++) {
            const absCol = startCol + c;
            const fieldName = TRACKED_COLS[absCol];
            if (!fieldName) continue;

            const newValue = newValues[r][c];
            const oldValue = isSingleCell ? singleOldValue : "(이전값 없음)";

            // 단일 셀 편집은 실제 값 변경 여부를 정확히 판별 가능 — 변경 없으면 스킵
            // 다중 셀 편집은 이전 값을 알 수 없으므로 대상 컬럼에 값이 있으면 기록(과다 기록 가능성은 Task에서 인지된 한계)
            if (isSingleCell && String(oldValue) === String(newValue)) continue;

            changeRecords.push({ itemCode: itemCode, itemName: itemName, fieldName: fieldName, oldValue: oldValue, newValue: newValue });
          }
        }

        if (changeRecords.length > 0) {
          // [TASK-003] 동시 편집 충돌 방지 — 여러 사용자가 동시에 붙여넣기해도 로그 행이 서로 덮어써지지 않도록 락 사용
          const clLock = LockService.getScriptLock();
          try {
            clLock.waitLock(5000);
            _appendChangelog(changeRecords, {
              actor: editor, route: CHANGELOG_ROUTES.SHEET,
              reason: isSingleCell ? "(시트 직접편집)" : "(시트 붙여넣기/일괄편집)"
            });
          } catch (lockErr) {
            console.error("[onEdit ChangeLog] 이력 기록 실패(락 또는 시트): " + lockErr.message);
          } finally {
            clLock.releaseLock();
          }
        }
      } catch(clErr) {
        console.error("[onEdit ChangeLog] 이력 기록 실패: " + clErr.message);
      }
    }
  }

  // [TASK-010] 📝 통합 입출고 기록장의 "마감 이월" 행 직접 수정/삭제 방어
  //   이월 행(거래ID SYS-…, 비고 "…마감 이월")은 마감 시점의 잔여 로트 스냅샷이다.
  //   이 값이 바뀌면 마감 원장과 현재 장부가 어긋나므로 되돌리고 경고한다.
  if (sheetName === SHEET_INOUT && row >= 3) {
    try {
      const _n = e.range.getNumRows();
      const _rows = sheet.getRange(row, 1, _n, TX_COLS).getValues();
      const _txIds = _rows.map(r => String(r[8] || ""));
      const _touchesCarryover = _rows.some((r, i) => isCarryoverRow(r) || _txIds[i].indexOf("SYS-") === 0);
      if (_touchesCarryover) {
        ss.toast("⛔ 월마감 이월 행은 수정할 수 없습니다. 마감 원장과 어긋나게 됩니다.", "마감 이월 행 보호", 8);
        if (e.oldValue !== undefined && _n === 1 && e.range.getNumColumns() === 1) {
          e.range.setValue(e.oldValue);
        } else {
          console.warn(`[TASK-010] 마감 이월 행 다중 편집 감지 — 자동 복원 불가. 시트: ${sheetName}, 행: ${row}`);
        }
        return;
      }
    } catch (carryErr) {
      console.error("[TASK-010] 이월 행 보호 검사 실패: " + carryErr.message);
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
  
  if (!currentPrefix || row < 3) return;

  // [TASK-010] 업장 시트 A열(날짜)에 마감된 기간의 날짜를 직접 입력하는 것을 차단한다.
  //   웹앱(addTransaction)만 막으면 시트 직접 입력이라는 우회 경로가 남는다.
  if (startCol <= 1 && endCol >= 1) {
    const _cutoff = getLatestClosingCutoff(ss);
    if (_cutoff) {
      const _tz = Session.getScriptTimeZone();
      const _dates = sheet.getRange(row, 1, numRows, 1).getValues();
      const _violates = _dates.some(r => {
        const d = r[0];
        if (!(d instanceof Date) || isNaN(d.getTime())) return false;
        return Utilities.formatDate(d, _tz, "yyyy-MM-dd") <= _cutoff;
      });
      if (_violates) {
        ss.toast(`⛔ ${_cutoff} 이전은 이미 월마감된 기간입니다. 과거 누락/정정은 오늘 날짜의 입고/출고로 등록하고 비고에 정정 사유를 남기세요.`, "마감 기간 입력 차단", 8);
        if (e.oldValue !== undefined && numRows === 1 && e.range.getNumColumns() === 1) {
          e.range.setValue(e.oldValue);
        } else {
          sheet.getRange(row, 1, numRows, 1).clearContent();
        }
        return;
      }
    }
  }

  if (!isTargetEdited) return;

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
