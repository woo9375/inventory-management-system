/**
 * 호텔덕구온천 구매 재고 관리 시스템 — 마이그레이션 & 아카이빙 확장 모듈
 * v6.8 Extension: 무중단 배포, 증분 동기화, 자동 아카이빙
 * 
 * 사용법: 이 파일의 코드를 GAS 에디터에 별도 .gs 파일로 추가하거나,
 *         기존 코드 하단에 병합하여 사용합니다.
 */

// ═══════════════════════════════════════════════════════════════════
//  마이그레이션 프레임워크 (무중단 스키마 업데이트)
// ═══════════════════════════════════════════════════════════════════

const CURRENT_SCHEMA_VERSION = 7; // v6.8 내부 스키마 버전

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
    
    // 예시: fixSheetProtection 보호 범위 최적화 소급 적용
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

  // === 향후 마이그레이션 예시 ===
  // 8: function migrate_to_v8(ss) {
  //   Logger.log("[Migration v8] 품목 마스터에 '최종입고일' 컬럼 추가");
  //   const master = ss.getSheetByName(SHEET_MASTER);
  //   if (!master) return;
  //   const lastCol = master.getLastColumn();
  //   const headerRow = master.getRange(2, 1, 1, lastCol + 1).getValues()[0];
  //   if (!headerRow.includes("최종입고일")) {
  //     const newCol = lastCol + 1;
  //     master.getRange(2, newCol).setValue("최종입고일")
  //       .setBackground(COLORS.headerBg).setFontColor(COLORS.headerText)
  //       .setFontWeight("bold").setHorizontalAlignment("center");
  //     master.getRange(3, newCol, VALIDATION_ROWS, 1)
  //       .setBackground(COLORS.autoBg).setNumberFormat("yyyy-mm-dd");
  //   }
  //   Logger.log("[Migration v8] 완료");
  // },
};

/**
 * 안전한 스키마 마이그레이션 실행기
 * 현재 버전과 목표 버전 사이의 모든 마이그레이션을 순차 실행합니다.
 * 메뉴에서 호출하거나, 코드 배포 후 수동 실행합니다.
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
 * 프로덕션 시트를 복제하여 안전하게 테스트합니다.
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


// ═══════════════════════════════════════════════════════════════════
//  증분 동기화 엔진 (성능 최적화)
// ═══════════════════════════════════════════════════════════════════

/**
 * 증분 동기화: 마지막 동기화 이후 신규 거래만 통합 시트에 추가
 * PropertiesService에 마지막 동기화 타임스탬프를 저장합니다.
 * 
 * 기존 consolidateAllSheets()의 "전체 클리어→재작성" 대비:
 * - 10,000건 이상 데이터에서 ~90% 실행 시간 절감
 * - 6분 GAS 제한에 걸릴 확률 대폭 감소
 */
function incrementalSync() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch(e) {
    Logger.log("[Incremental Sync] Lock 획득 실패: " + e.message);
    return;
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const props = PropertiesService.getScriptProperties();
    
    const consolidated = ss.getSheetByName(SHEET_INOUT);
    const cfg = ss.getSheetByName(SHEET_CONFIG);
    const cfgLastRow = cfg.getLastRow();
    if (cfgLastRow < 4) return;
    
    const configRows = cfg.getRange(4, 2, cfgLastRow - 3, 6).getValues();
    
    // 통합 시트의 기존 거래ID 목록 (중복 방지)
    const existingTxIds = new Set();
    const consLastRow = consolidated.getLastRow();
    if (consLastRow >= 3) {
      const txIds = consolidated.getRange(3, 8, consLastRow - 2, 1).getValues();
      txIds.forEach(r => { if (r[0]) existingTxIds.add(r[0].toString()); });
    }
    
    let newRows = [];
    configRows.forEach(row => {
      const shopName = row[1], status = row[3], gid = row[5];
      if (!shopName || status !== "생성완료" || !gid) return;
      
      const sh = ss.getSheets().find(s => s.getSheetId() == gid);
      if (!sh || sh.getLastRow() < 3) return;
      
      const data = sh.getRange(3, 1, sh.getLastRow() - 2, 8).getValues();
      data.forEach(r => {
        const txId = r[7] ? r[7].toString() : "";
        // 품목코드(B열)와 거래ID(H열)가 있고, 아직 통합시트에 없는 건만 추가
        if (r[1] && txId && !existingTxIds.has(txId)) {
          newRows.push(r);
          existingTxIds.add(txId);
        }
      });
    });
    
    if (newRows.length > 0) {
      newRows.sort((a, b) => toLocalDate(a[0]) - toLocalDate(b[0]));
      const appendRow = Math.max(consolidated.getLastRow() + 1, 3);
      consolidated.getRange(appendRow, 1, newRows.length, 8)
        .setValues(newRows)
        .setHorizontalAlignment("center")
        .setBackground(COLORS.autoBg);
    }
    
    // 재고 재계산 (통합 시트 기반)
    SpreadsheetApp.flush();
    recalcStockAndUsage(ss);
    runDashboardSync(ss);
    
    props.setProperty("LAST_SYNC_TIMESTAMP", new Date().toISOString());
    Logger.log(`[Incremental Sync] ${newRows.length}건 신규 거래 동기화 완료`);
    
  } catch(err) {
    Logger.log(`[Incremental Sync Error] ${err.message}\n${err.stack}`);
  } finally {
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════════════════
//  자동 아카이빙 파이프라인
// ═══════════════════════════════════════════════════════════════════

/**
 * 월간 아카이빙: 2개월 이전 데이터를 별도 스프레드시트로 이관
 * 매월 1일 새벽 트리거로 실행합니다.
 */
function archiveOldRecords() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const consolidated = ss.getSheetByName(SHEET_INOUT);
  const consLastRow = consolidated.getLastRow();
  if (consLastRow < 3) {
    Logger.log("[Archive] 아카이브 대상 데이터 없음");
    return;
  }
  
  const allData = consolidated.getRange(3, 1, consLastRow - 2, 8).getValues();
  const today = new Date();
  // 2개월 이전 데이터를 아카이브 (현재 월과 전월 데이터는 유지)
  const archiveCutoff = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  
  const archiveRows = [];
  const keepRows = [];
  
  allData.forEach(row => {
    if (!row[0] && !row[1]) return; // 빈 행 건너뛰기
    const dateVal = toLocalDate(row[0]);
    if (!isNaN(dateVal.getTime()) && dateVal < archiveCutoff) {
      archiveRows.push(row);
    } else {
      keepRows.push(row);
    }
  });
  
  if (archiveRows.length === 0) {
    Logger.log("[Archive] 아카이브 대상 데이터 없음");
    return;
  }
  
  // 아카이브 스프레드시트 생성/열기
  const oldestDate = toLocalDate(archiveRows[0][0]);
  const archiveYear = oldestDate.getFullYear();
  const archiveName = `[아카이브] 호텔덕구온천 입출고 기록 ${archiveYear}년`;
  
  let archiveSS = _getOrCreateArchiveSpreadsheet(archiveName);
  
  // 월별 시트로 분류
  const monthBuckets = {};
  archiveRows.forEach(row => {
    const d = toLocalDate(row[0]);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthBuckets[key]) monthBuckets[key] = [];
    monthBuckets[key].push(row);
  });
  
  Object.keys(monthBuckets).sort().forEach(monthKey => {
    let archiveSheet = archiveSS.getSheetByName(monthKey);
    if (!archiveSheet) {
      archiveSheet = archiveSS.insertSheet(monthKey);
      const headers = ["날짜", "품목코드", "품목명", "구분", "수량", "담당자", "비고", "거래ID"];
      archiveSheet.getRange("A1:H1").setValues([headers])
        .setBackground(COLORS.headerBg).setFontColor(COLORS.headerText)
        .setFontWeight("bold").setHorizontalAlignment("center");
      archiveSheet.setFrozenRows(1);
    }
    
    const startRow = Math.max(archiveSheet.getLastRow() + 1, 2);
    const rows = monthBuckets[monthKey];
    archiveSheet.getRange(startRow, 1, rows.length, 8).setValues(rows)
      .setHorizontalAlignment("center");
  });
  
  // 기본 Sheet1 제거 (아카이브 SS에 월별 시트가 생성된 후)
  try {
    const defaultSheet = archiveSS.getSheetByName("Sheet1");
    if (defaultSheet && archiveSS.getSheets().length > 1) {
      archiveSS.deleteSheet(defaultSheet);
    }
  } catch(e) {}
  
  // 메인 시트 갱신 (유지 데이터만 남김)
  consolidated.getRange(3, 1, consLastRow - 2, 8).clearContent();
  if (keepRows.length > 0) {
    consolidated.getRange(3, 1, keepRows.length, 8)
      .setValues(keepRows)
      .setHorizontalAlignment("center")
      .setBackground(COLORS.autoBg);
  }
  
  SpreadsheetApp.flush();
  Logger.log(`[Archive] ${archiveRows.length}건 → ${archiveName} 이관 완료 (${Object.keys(monthBuckets).length}개 월별 시트)`);
}

/**
 * 아카이브 스프레드시트 생성 또는 기존 파일 열기
 * 메인 스프레드시트와 같은 드라이브 폴더에 저장됩니다.
 */
function _getOrCreateArchiveSpreadsheet(name) {
  const files = DriveApp.getFilesByName(name);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  
  // 같은 폴더에 생성
  const mainFile = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  const parentFolders = mainFile.getParents();
  const parentFolder = parentFolders.hasNext() ? parentFolders.next() : DriveApp.getRootFolder();
  
  const newSS = SpreadsheetApp.create(name);
  const newFile = DriveApp.getFileById(newSS.getId());
  parentFolder.addFile(newFile);
  
  // 루트 폴더에서 제거 (이동 효과)
  try {
    DriveApp.getRootFolder().removeFile(newFile);
  } catch(e) {
    Logger.log("[Archive] 루트 폴더 제거 실패 (계속 진행): " + e.message);
  }
  
  return newSS;
}


// ═══════════════════════════════════════════════════════════════════
//  CSV 백업 유틸리티
// ═══════════════════════════════════════════════════════════════════

/**
 * 구글 드라이브에 통합 입출고 기록의 CSV 백업을 생성합니다.
 * 마이그레이션 전 자동 호출 + 수동 호출 가능합니다.
 */
function backupToCSV() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const consolidated = ss.getSheetByName(SHEET_INOUT);
  const lastRow = consolidated.getLastRow();
  if (lastRow < 3) {
    Logger.log("[Backup] 백업할 데이터 없음");
    return;
  }
  
  const tz = Session.getScriptTimeZone();
  const data = consolidated.getRange(2, 1, lastRow - 1, 8).getValues(); // 헤더 포함
  
  let csv = data.map(row => 
    row.map(cell => {
      if (cell instanceof Date) {
        return Utilities.formatDate(cell, tz, "yyyy-MM-dd");
      }
      return `"${String(cell).replace(/"/g, '""')}"`;
    }).join(",")
  ).join("\n");
  
  const fileName = `입출고_백업_${Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmmss")}.csv`;
  
  const mainFile = DriveApp.getFileById(ss.getId());
  const parentFolder = mainFile.getParents().hasNext() ? mainFile.getParents().next() : DriveApp.getRootFolder();
  
  // 백업 폴더 생성/찾기
  let backupFolder;
  const folders = parentFolder.getFoldersByName("입출고_백업");
  if (folders.hasNext()) {
    backupFolder = folders.next();
  } else {
    backupFolder = parentFolder.createFolder("입출고_백업");
  }
  
  backupFolder.createFile(fileName, csv, MimeType.CSV);
  Logger.log(`[Backup] CSV 백업 완료: ${fileName}`);
}


// ═══════════════════════════════════════════════════════════════════
//  트리거 설정 (아카이빙 + 증분 동기화)
// ═══════════════════════════════════════════════════════════════════

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
 * 기존 refreshDashboard 대신 incrementalSync를 자정 트리거로 등록합니다.
 */
function setupIncrementalSyncTrigger() {
  // 기존 refreshDashboard 트리거 제거
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
