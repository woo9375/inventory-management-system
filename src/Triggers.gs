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

// [CR-01 FIX] onEdit 함수가 Code.gs와 중복 선언되어 GAS 함수 오버라이딩으로
// Code.gs의 핵심 가드레일 로직이 무시되는 치명적 버그 수정.
// 캐시 무효화 로직은 Code.gs의 onEdit 하단으로 병합 완료.
