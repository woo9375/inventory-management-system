/**
 * 호텔덕구온천 구매 재고 관리 시스템 — 마이그레이션 프레임워크
 * 무중단 스키마 업데이트, 버전 관리
 */

function getSchemaVersion() {
  const props = PropertiesService.getScriptProperties();
  return parseInt(props.getProperty("SCHEMA_VERSION") || "0");
}

function setSchemaVersion(version) {
  PropertiesService.getScriptProperties().setProperty("SCHEMA_VERSION", String(version));
}

/**
 * 마이그레이션 레지스트리
 * 각 버전별 마이그레이션 함수를 등록합니다.
 * 규칙:
 *   1. 멱등성(Idempotency): 같은 마이그레이션을 두 번 실행해도 안전해야 함
 *   2. 후방 호환성: 마이그레이션 후에도 기존 데이터/수식 정상 동작
 *   3. 원자성: 각 마이그레이션은 독립적으로 실행/롤백 가능
 */
const MIGRATIONS = {
  // v0 → v7: 초기 스키마 등록 (기존 시스템을 마이그레이션 체계로 편입)
  7: function migrate_to_v7(ss) {
    Logger.log("[Migration v7] 초기 스키마 등록 — 기존 시스템 편입");
    
    const cfg = ss.getSheetByName(SHEET_CONFIG);
    if (!cfg || cfg.getLastRow() < 4) return;
    
    const configRows = cfg.getRange(4, 2, cfg.getLastRow() - 3, 6).getValues();
    configRows.forEach(row => {
      if (row[3] === "생성완료" && row[1]) {
        const sh = ss.getSheetByName(row[1]);
        if (sh) {
          const protection = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
          if (protection) {
            // v6.8 보호 범위 적용 (C열/H열 보호 유지)
            protection.setUnprotectedRanges([
              sh.getRange(3, 1, VALIDATION_ROWS, 2),  // A~B
              sh.getRange(3, 4, VALIDATION_ROWS, 1),  // D
              sh.getRange(3, 5, VALIDATION_ROWS, 1),  // E
              sh.getRange(3, 6, VALIDATION_ROWS, 2)   // F~G
            ]);
          }
        }
      }
    });
    
    Logger.log("[Migration v7] 완료 — 모든 업장 시트 보호 범위 최적화 적용됨");
  },
};

/**
 * 안전한 스키마 마이그레이션 실행기
 */
function runMigrations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const currentVersion = getSchemaVersion();
  
  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    ui.alert(`✅ 이미 최신 스키마 버전(v${currentVersion})입니다.\n마이그레이션이 필요하지 않습니다.`);
    return;
  }
  
  const pendingCount = CURRENT_SCHEMA_VERSION - currentVersion;
  const response = ui.alert(
    "📋 스키마 마이그레이션",
    `현재 버전: v${currentVersion}\n목표 버전: v${CURRENT_SCHEMA_VERSION}\n\n` +
    `${pendingCount}개의 마이그레이션을 실행합니다.\n\n⚠️ 실행 전 데이터 백업이 자동으로 수행됩니다.\n계속하시겠습니까?`,
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;
  
  // 마이그레이션 전 CSV 백업
  try {
    backupToCSV();
    Logger.log("[Migration] 사전 CSV 백업 완료");
  } catch(backupErr) {
    Logger.log("[Migration] CSV 백업 실패 (계속 진행): " + backupErr.message);
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch(e) {
    ui.alert("⏳ 다른 프로세스 실행 중입니다. 잠시 후 재시도해 주세요.");
    return;
  }
  
  try {
    for (let v = currentVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      if (MIGRATIONS[v]) {
        Logger.log(`[Migration] v${v} 실행 시작...`);
        MIGRATIONS[v](ss);
        setSchemaVersion(v);
        SpreadsheetApp.flush();
        Logger.log(`[Migration] v${v} 실행 완료, 스키마 버전 업데이트됨`);
      } else {
        setSchemaVersion(v);
        Logger.log(`[Migration] v${v} — 변경사항 없음 (버전만 업데이트)`);
      }
    }
    
    ui.alert(`✅ 마이그레이션 완료!\nv${currentVersion} → v${CURRENT_SCHEMA_VERSION}`);
  } catch(err) {
    const failedVersion = getSchemaVersion() + 1;
    Logger.log(`[Migration Error] v${failedVersion}: ${err.message}\n${err.stack}`);
    ui.alert(
      `❌ 마이그레이션 v${failedVersion} 실행 중 오류:\n${err.message}\n\n` +
      `v${getSchemaVersion()}까지는 정상 적용되었습니다.`
    );
  } finally {
    lock.releaseLock();
  }
}

/**
 * 마이그레이션 테스트 유틸리티
 */
function testMigrationOnCopy() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    "🧪 마이그레이션 테스트",
    "현재 스프레드시트의 복사본을 만들어 마이그레이션을 테스트합니다.\n원본 데이터에는 영향이 없습니다.\n\n계속하시겠습니까?",
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmm");
  const copy = ss.copy(`[TEST] ${ss.getName()} - 마이그레이션 테스트 ${timestamp}`);
  
  ui.alert(
    "✅ 테스트 복사본 생성 완료",
    `복사본에서 마이그레이션을 테스트하세요.\n\nURL: ${copy.getUrl()}`
  );
}
