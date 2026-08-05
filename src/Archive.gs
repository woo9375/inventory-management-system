/**
 * 호텔덕구온천 구매 재고 관리 시스템 v7.0 — 아카이빙 & 백업 모듈
 * [v7.0] 시트 참조 변경 + 9열 입출고 구조
 */

// ═══════════════════════════════════════════════════════════════════
//  증분 동기화 엔진
// ═══════════════════════════════════════════════════════════════════

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
    // [v7.0] 업장관리 시트에서 업장 목록 조회
    const shopSheet = ss.getSheetByName(SHEET_SHOPS);
    const shopLastRow = shopSheet.getLastRow();
    if (shopLastRow < 3) return;
    
    const configRows = shopSheet.getRange(3, 1, shopLastRow - 2, 6).getValues();
    
    // 통합 시트의 기존 거래ID 목록 (중복 방지)
    const existingTxIds = new Set();
    const consLastRow = consolidated.getLastRow();
    if (consLastRow >= 3) {
      // [v7.0] 거래ID는 9열
      const txIds = consolidated.getRange(3, 9, consLastRow - 2, 1).getValues();
      txIds.forEach(r => { if (r[0]) existingTxIds.add(r[0].toString()); });
    }
    
    let newRows = [];
    configRows.forEach(row => {
      const shopName = row[1], status = row[3], gid = row[5];
      if (!shopName || status !== "생성완료" || !gid) return;
      
      const sh = ss.getSheets().find(s => s.getSheetId() == gid);
      if (!sh || sh.getLastRow() < 3) return;
      
      // [v7.0] 9열 구조
      const data = sh.getRange(3, 1, sh.getLastRow() - 2, TX_COLS).getValues();
      data.forEach(r => {
        const txId = r[8] ? r[8].toString() : ""; // [v7.0] 거래ID = 9번째 열 (index 8)
        if (r[1] && txId && !existingTxIds.has(txId)) {
          newRows.push(r);
          existingTxIds.add(txId);
        }
      });
    });
    
    if (newRows.length > 0) {
      newRows.sort((a, b) => toLocalDate(a[0]) - toLocalDate(b[0]));
      const appendRow = Math.max(consolidated.getLastRow() + 1, 3);
      consolidated.getRange(appendRow, 1, newRows.length, TX_COLS)
        .setValues(newRows)
        .setHorizontalAlignment("center")
        .setBackground(COLORS.autoBg);
    }
    
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

function archiveOldRecords() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const consolidated = ss.getSheetByName(SHEET_INOUT);
  const consLastRow = consolidated.getLastRow();
  if (consLastRow < 3) {
    Logger.log("[Archive] 아카이브 대상 데이터 없음");
    return;
  }
  
  // [v7.0] 9열 구조
  const allData = consolidated.getRange(3, 1, consLastRow - 2, TX_COLS).getValues();
  const today = new Date();
  const archiveCutoff = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  
  const archiveRows = [];
  const keepRows = [];
  
  allData.forEach(row => {
    if (!row[0] && !row[1]) return;
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
      // [v7.0] 9열 헤더
      const headers = ["날짜", "품목코드", "품목명", "구분", "수량", "단가", "담당자", "비고", "거래ID"];
      archiveSheet.getRange("A1:I1").setValues([headers])
        .setBackground(COLORS.headerBg).setFontColor(COLORS.headerText)
        .setFontWeight("bold").setHorizontalAlignment("center");
      archiveSheet.setFrozenRows(1);
    }
    
    const startRow = Math.max(archiveSheet.getLastRow() + 1, 2);
    const rows = monthBuckets[monthKey];
    archiveSheet.getRange(startRow, 1, rows.length, TX_COLS).setValues(rows)
      .setHorizontalAlignment("center");
  });
  
  // 기본 Sheet1 제거
  try {
    const defaultSheet = archiveSS.getSheetByName("Sheet1");
    if (defaultSheet && archiveSS.getSheets().length > 1) {
      archiveSS.deleteSheet(defaultSheet);
    }
  } catch(e) {}
  
  // 메인 시트 갱신
  consolidated.getRange(3, 1, consLastRow - 2, TX_COLS).clearContent();
  if (keepRows.length > 0) {
    consolidated.getRange(3, 1, keepRows.length, TX_COLS)
      .setValues(keepRows)
      .setHorizontalAlignment("center")
      .setBackground(COLORS.autoBg);
  }
  
  SpreadsheetApp.flush();
  Logger.log(`[Archive] ${archiveRows.length}건 → ${archiveName} 이관 완료 (${Object.keys(monthBuckets).length}개 월별 시트)`);
}

function _getOrCreateArchiveSpreadsheet(name) {
  const files = DriveApp.getFilesByName(name);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  
  const mainFile = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  const parentFolders = mainFile.getParents();
  const parentFolder = parentFolders.hasNext() ? parentFolders.next() : DriveApp.getRootFolder();
  
  const newSS = SpreadsheetApp.create(name);
  const newFile = DriveApp.getFileById(newSS.getId());
  parentFolder.addFile(newFile);
  
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

function backupToCSV() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const consolidated = ss.getSheetByName(SHEET_INOUT);
  const lastRow = consolidated.getLastRow();
  if (lastRow < 3) {
    Logger.log("[Backup] 백업할 데이터 없음");
    return;
  }
  
  const tz = Session.getScriptTimeZone();
  // [v7.0] 9열 구조
  const data = consolidated.getRange(2, 1, lastRow - 1, TX_COLS).getValues();
  
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
