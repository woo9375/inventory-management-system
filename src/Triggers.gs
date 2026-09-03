/**
 * 호텔덕구온천 구매 재고 관리 시스템 — 트리거 설정 모듈
 */

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === "refreshDashboard") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("refreshDashboard").timeBased().everyDays(1).atHour(0).create();
  const removed = _deleteLegacyArchiveTriggers();
  SpreadsheetApp.getUi().alert(
    "⏰ 자정 동기화 배치 트리거가 가동되었습니다." +
    (removed > 0 ? `\n🧹 레거시 자동 아카이빙 트리거 ${removed}건을 함께 정리했습니다.` : "")
  );
}

/**
 * [TASK-008] 레거시 자동 아카이빙(archiveOldRecords) 트리거 정리.
 * 자동 아카이빙은 수동 월마감(executeMonthlyClosing)으로 일원화되어 폐기되었으나,
 * 과거에 등록된 시간 기반 트리거가 프로젝트에 남아 있으면 존재하지 않는 함수를
 * 호출하며 실패 알림을 발생시키므로 1회 실행하여 정리한다.
 */
function removeLegacyArchiveTrigger() {
  const removed = _deleteLegacyArchiveTriggers();
  SpreadsheetApp.getUi().alert(
    removed > 0
      ? `🧹 레거시 자동 아카이빙 트리거 ${removed}건을 삭제했습니다.`
      : "✅ 삭제할 레거시 자동 아카이빙 트리거가 없습니다."
  );
}

/**
 * archiveOldRecords 핸들러를 가진 프로젝트 트리거를 모두 삭제하고 삭제 건수를 반환.
 */
function _deleteLegacyArchiveTriggers() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "archiveOldRecords") {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  if (removed > 0) Logger.log(`[Triggers] 레거시 archiveOldRecords 트리거 ${removed}건 삭제`);
  return removed;
}

// [CR-01 FIX] onEdit 함수가 Code.gs와 중복 선언되어 GAS 함수 오버라이딩으로
// Code.gs의 핵심 가드레일 로직이 무시되는 치명적 버그 수정.
// 캐시 무효화 로직은 Code.gs의 onEdit 하단으로 병합 완료.
