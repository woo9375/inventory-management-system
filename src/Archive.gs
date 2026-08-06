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


// ═══════════════════════════════════════════════════════════════════
//  [v9.0] 수동 월마감 및 선입선출 이월 시스템
// ═══════════════════════════════════════════════════════════════════

function executeMonthlyClosing(token, year, month) {
  const session = validateSession(token);
  if (!session || session.role !== 'admin') {
    return { success: false, message: "권한이 없습니다." };
  }
  
  if (ARCHIVE_FOLDER_ID === "여기에_폴더ID_입력" || !ARCHIVE_FOLDER_ID) {
    return { success: false, message: "시스템 설정 오류: ARCHIVE_FOLDER_ID 가 설정되지 않았습니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName(SHEET_INOUT);
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  
  const txLastRow = Math.max(txSheet.getLastRow(), 3);
  const txData = txLastRow >= 3 ? txSheet.getRange(3, 1, txLastRow - 2, TX_COLS).getValues() : [];
  
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 20).getValues(); // 7번째 열(인덱스 6)이 초기재고
  
  // 마감일 기준: 해당 연/월의 마지막 날
  const cutoffDate = new Date(year, month, 0, 23, 59, 59);
  
  const archiveRows = [];
  const keepRows = [];
  
  txData.forEach(row => {
    if (!row[0] && !row[1]) return;
    const dateVal = toLocalDate(row[0]);
    if (!isNaN(dateVal.getTime()) && dateVal <= cutoffDate) {
      archiveRows.push(row);
    } else {
      keepRows.push(row);
    }
  });
  
  if (archiveRows.length === 0 && masterData.every(r => (Number(r[6]) || 0) === 0)) {
    return { success: false, message: "해당 기간에 아카이브할 입출고 데이터나 초기 재고가 없습니다." };
  }
  
  // 1. 드라이브 폴더/파일 생성 및 데이터 이관
  let baseFolder;
  try {
    baseFolder = DriveApp.getFolderById(ARCHIVE_FOLDER_ID);
  } catch (e) {
    return { success: false, message: "아카이브 폴더를 찾을 수 없습니다. 폴더 ID를 확인하세요." };
  }
  
  const yearStr = year.toString();
  let yearFolder;
  const yearFolders = baseFolder.getFoldersByName(yearStr);
  if (yearFolders.hasNext()) {
    yearFolder = yearFolders.next();
  } else {
    yearFolder = baseFolder.createFolder(yearStr);
  }
  
  const monthStr = String(month).padStart(2, '0');
  const archiveName = `[입출고마감]_${yearStr}_${monthStr}`;
  
  // 새 스프레드시트 생성
  const newSS = SpreadsheetApp.create(archiveName);
  const newFile = DriveApp.getFileById(newSS.getId());
  yearFolder.addFile(newFile);
  try { DriveApp.getRootFolder().removeFile(newFile); } catch(e) {}
  
  const archiveSheet = newSS.getSheets()[0];
  archiveSheet.setName(`${yearStr}-${monthStr} 마감`);
  
  // 헤더 및 데이터 쓰기
  const headers = ["날짜", "품목코드", "품목명", "구분", "수량", "단가", "담당자", "비고", "거래ID"];
  archiveSheet.getRange("A1:I1").setValues([headers])
    .setBackground(COLORS.headerBg).setFontColor(COLORS.headerText)
    .setFontWeight("bold").setHorizontalAlignment("center");
  archiveSheet.setFrozenRows(1);
  
  if (archiveRows.length > 0) {
    archiveSheet.getRange(2, 1, archiveRows.length, TX_COLS).setValues(archiveRows)
      .setHorizontalAlignment("center");
  }
  
  // 2. FIFO 이월 로직 계산
  const lotsMap = {};
  const outEventsMap = {};
  const itemNames = {};
  
  // 초기 재고 반영 (가장 먼저 들어온 것으로 취급)
  masterData.forEach(row => {
    const code = row[0];
    const name = row[1];
    const initStock = Number(row[6]) || 0;
    const unitPrice = Number(row[19]) || 0;
    if (code) {
      itemNames[code] = name;
      if (initStock > 0) {
        lotsMap[code] = [{ date: 0, qty: initStock, price: unitPrice, remaining: initStock }];
      }
    }
  });
  
  // 마감 대상 데이터(archiveRows)만 FIFO 계산에 반영
  archiveRows.forEach(row => {
    const dateVal = toLocalDate(row[0]).getTime();
    const code = row[1];
    const type = row[3];
    const qty = Number(row[4]) || 0;
    const price = Number(row[5]) || 0;
    
    if (!code || isNaN(dateVal)) return;
    itemNames[code] = row[2]; // 이름 백업
    
    if (type === "입고") {
      if (!lotsMap[code]) lotsMap[code] = [];
      lotsMap[code].push({ date: dateVal, qty: qty, price: price, remaining: qty });
    }
    if (type === "출고" || type === "폐기") {
      if (!outEventsMap[code]) outEventsMap[code] = [];
      outEventsMap[code].push({ date: dateVal, qty: qty, type: type });
    }
  });
  
  // FIFO 적용
  const newCarryoverRows = [];
  const carryoverDate = Utilities.formatDate(new Date(year, month, 1), Session.getScriptTimeZone(), "yyyy-MM-dd"); // 다음 달 1일
  
  Object.keys(lotsMap).forEach(code => {
    const lots = lotsMap[code].sort((a, b) => a.date - b.date);
    const outs = (outEventsMap[code] || []).sort((a, b) => a.date - b.date);
    
    outs.forEach(out => {
      let remainingOut = out.qty;
      for (let lot of lots) {
        if (remainingOut <= 0) break;
        if (lot.remaining <= 0) continue;
        
        const deducted = Math.min(lot.remaining, remainingOut);
        lot.remaining -= deducted;
        remainingOut -= deducted;
      }
    });
    
    // 남은 로트를 [이월_입고] 트랜잭션으로 변환
    lots.forEach(lot => {
      if (lot.remaining > 0) {
        const txId = Utilities.getUuid();
        newCarryoverRows.push([
          carryoverDate, code, itemNames[code] || code, "입고", 
          lot.remaining, lot.price, "System", 
          `${year}년 ${month}월 마감 이월`, txId
        ]);
      }
    });
  });
  
  // 3. 메인 시트 갱신 (리셋 및 이월기록/남은기록 추가)
  txSheet.getRange(3, 1, Math.max(txLastRow - 2, 1), TX_COLS).clearContent();
  
  const finalRowsToInsert = [...newCarryoverRows, ...keepRows];
  if (finalRowsToInsert.length > 0) {
    txSheet.getRange(3, 1, finalRowsToInsert.length, TX_COLS)
      .setValues(finalRowsToInsert)
      .setHorizontalAlignment("center")
      .setBackground(COLORS.autoBg);
  }
  
  // 4. 품목 마스터의 '초기재고' 열(7번째 열)을 모두 0으로 리셋 (이중 카운팅 방지)
  const newInitStocks = masterData.map(r => [0]);
  if (newInitStocks.length > 0) {
    masterSheet.getRange(3, 7, newInitStocks.length, 1).setValues(newInitStocks);
  }
  
  SpreadsheetApp.flush();
  recalcStockAndUsage(ss);
  
  return { 
    success: true, 
    message: `${year}년 ${month}월 마감 완료. ${archiveRows.length}건 보관, ${newCarryoverRows.length}건 이월됨.` 
  };
}
