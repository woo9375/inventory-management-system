/**
 * 호텔덕구온천 구매 재고 관리 시스템 — 트리거 설정 모듈
 */

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === "refreshDashboard") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("refreshDashboard").timeBased().everyDays(1).atHour(0).create();
  SpreadsheetApp.getUi().alert("⏰ 자정 동기화 배치 트리거가 가동되었습니다.");
}

/**
 * 아카이빙 트리거 설정 (매월 1일 새벽 2시)
 */
function setupArchiveTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "archiveOldRecords") ScriptApp.deleteTrigger(t);
  });
  
  ScriptApp.newTrigger("archiveOldRecords")
    .timeBased()
    .onMonthDay(1)
    .atHour(2)
    .create();
    
  SpreadsheetApp.getUi().alert("📦 매월 1일 새벽 2시 자동 아카이빙이 설정되었습니다.");
}

/**
 * 증분 동기화를 일간 배치로 전환
 */
function setupIncrementalSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "refreshDashboard" || 
        t.getHandlerFunction() === "incrementalSync") {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  ScriptApp.newTrigger("incrementalSync")
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .create();
    
  SpreadsheetApp.getUi().alert("🔄 자정 증분 동기화 트리거가 설정되었습니다.\n(기존 전체 동기화 트리거는 해제됨)");
}
