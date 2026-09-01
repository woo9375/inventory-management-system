/**
 * 호텔덕구온천 구매 재고 관리 시스템 v7.0 — 아카이빙 & 백업 모듈
 * [v7.0] 시트 참조 변경 + 9열 입출고 구조
 */


// ═══════════════════════════════════════════════════════════════════
//  자동 아카이빙 파이프라인
// ═══════════════════════════════════════════════════════════════════

function archiveOldRecords() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log("[Archive] 다른 작업이 실행 중이어서 자동 보관을 건너뜁니다.");
    return;
  }

  try {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const consolidated = ss.getSheetByName(SHEET_INOUT);
  const consLastRow = consolidated.getLastRow();
  if (consLastRow < 3) {
    console.log("[Archive] 아카이브 대상 데이터 없음");
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
    console.log("[Archive] 아카이브 대상 데이터 없음");
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
    
    const rows = monthBuckets[monthKey];
    const existingIds = new Set();
    if (archiveSheet.getLastRow() >= 2) {
      archiveSheet.getRange(2, 9, archiveSheet.getLastRow() - 1, 1).getValues()
        .forEach(row => { if (row[0]) existingIds.add(String(row[0])); });
    }
    const newRows = rows.filter(row => row[8] && !existingIds.has(String(row[8])));
    if (newRows.length > 0) {
      const startRow = Math.max(archiveSheet.getLastRow() + 1, 2);
      archiveSheet.getRange(startRow, 1, newRows.length, TX_COLS).setValues(newRows)
        .setHorizontalAlignment("center");
    }
  });
  
  // 기본 Sheet1 제거
  try {
    const defaultSheet = archiveSS.getSheetByName("Sheet1");
    if (defaultSheet && archiveSS.getSheets().length > 1) {
      archiveSS.deleteSheet(defaultSheet);
    }
  } catch(e) {}
  
  SpreadsheetApp.flush();
  Logger.log(`[Archive] ${archiveRows.length}건 안전 보관 완료 (${Object.keys(monthBuckets).length}개 월별 시트, 원본 유지)`);
  } catch (e) {
    _logError(e, "archiveOldRecords");
    throw e;
  } finally {
    lock.releaseLock();
  }
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
    console.error("[Archive] 루트 폴더 제거 실패 (계속 진행): " + e.message);
  }
  
  return newSS;
}


// ═══════════════════════════════════════════════════════════════════
//  CSV 백업 유틸리티
// ═══════════════════════════════════════════════════════════════════

function backupToCSV() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();
  const timestamp = Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmmss");
  
  // 1. Get Folder
  const mainFile = DriveApp.getFileById(ss.getId());
  const parentFolder = mainFile.getParents().hasNext() ? mainFile.getParents().next() : DriveApp.getRootFolder();
  
  const FOLDER_NAME = "시스템_데이터_백업";
  let backupFolder;
  const folders = parentFolder.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) {
    backupFolder = folders.next();
  } else {
    backupFolder = parentFolder.createFolder(FOLDER_NAME);
  }

  // 2. Helper function to generate CSV from 2D array
  const generateCSV = (data) => {
    return data.map(row => 
      row.map(cell => {
        if (cell instanceof Date) {
          return Utilities.formatDate(cell, tz, "yyyy-MM-dd");
        }
        return `"${String(cell).replace(/"/g, '""')}"`;
      }).join(",")
    ).join("\n");
  };

  // 3. Backup INOUT Sheet
  const consolidated = ss.getSheetByName(SHEET_INOUT);
  const lastRowInOut = consolidated.getLastRow();
  if (lastRowInOut >= 3) {
    const dataInOut = consolidated.getRange(2, 1, lastRowInOut - 1, TX_COLS).getValues(); // v7.0: 9 columns
    const csvInOut = generateCSV(dataInOut);
    const fileNameInOut = `입출고_백업_${timestamp}.csv`;
    backupFolder.createFile(fileNameInOut, csvInOut, MimeType.CSV);
    console.log(`[Backup] CSV 백업 완료: ${fileNameInOut}`);
  }

  // 4. Backup MASTER Sheet
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const lastRowMaster = masterSheet.getLastRow();
  if (lastRowMaster >= 2) {
    const dataMaster = masterSheet.getRange(1, 1, lastRowMaster, masterSheet.getLastColumn()).getValues();
    const csvMaster = generateCSV(dataMaster);
    const fileNameMaster = `품목마스터_백업_${timestamp}.csv`;
    backupFolder.createFile(fileNameMaster, csvMaster, MimeType.CSV);
    console.log(`[Backup] CSV 백업 완료: ${fileNameMaster}`);
  }
}


// ═══════════════════════════════════════════════════════════════════
//  [v9.0] 수동 월마감 및 선입선출 이월 시스템
// ═══════════════════════════════════════════════════════════════════

function executeMonthlyClosing(token, year, month) {
  const session = validateSession(token);
  if (!session || session.role !== 'admin') {
    return { success: false, message: "권한이 없습니다." };
  }
  
  // [TASK-004] 환경별 아카이브 폴더 사용 (ScriptProperties 미설정 시 기존 상수와 동일)
  const archiveFolderId = getArchiveFolderId();
  if (archiveFolderId === "여기에_폴더ID_입력" || !archiveFolderId) {
    return { success: false, message: "시스템 설정 오류: ARCHIVE_FOLDER_ID 가 설정되지 않았습니다." };
  }

  // [FIX] 락(Lock) 서비스 도입: 월마감 중 동시 입출고 등 데이터 충돌 원천 차단
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // 30초 대기
  } catch (e) {
    return { success: false, message: "⏳ 다른 작업(입출고 등)이 처리 중입니다. 잠시 후 다시 시도해주세요." };
  }

  try {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = ss.getSheetByName(SHEET_INOUT);
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  
  const txLastRow = Math.max(txSheet.getLastRow(), 3);
  const txData = txLastRow >= 3 ? txSheet.getRange(3, 1, txLastRow - 2, TX_COLS).getValues() : [];
  
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues(); // MASTER_COLS.INIT_STOCK(인덱스 6)이 초기재고
  
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
    baseFolder = DriveApp.getFolderById(archiveFolderId);
  } catch (e) {
    if (e.message.includes('permission') || e.message.includes('권한')) {
      return { success: false, message: "⚠️ Google Drive 접근 권한이 필요합니다.\\n[확장프로그램] > [Apps Script]로 이동하여 스크립트를 1회 직접 실행하고 권한(Drive API)을 허용해주세요." };
    }
    return { success: false, message: `아카이브 폴더 오류: ${e.message} (ID: ${archiveFolderId})` };
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
    const code = row[MASTER_COLS.CODE];
    const name = row[MASTER_COLS.NAME];
    const initStock = Number(row[MASTER_COLS.INIT_STOCK]) || 0;
    const unitPrice = Number(row[MASTER_COLS.UNIT_PRICE]) || 0;
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
        // [INFO FIX] 이월 거래ID를 메인 포맷(PREFIX-YYYYMMDD-UUID8)과 통일
        const monthStr = String(month).padStart(2, '0');
        const uniqueSuffix = Utilities.getUuid().replace(/-/g,"").substring(0,8).toUpperCase();
        const txId = `SYS-${year}${monthStr}01-${uniqueSuffix}`;
        newCarryoverRows.push([
          carryoverDate, code, itemNames[code] || code, "입고", 
          lot.remaining, lot.price, "System", 
          `${year}년 ${month}월 마감 이월`, txId
        ]);
      }
    });
  });
  
  // 3. 메인 시트 갱신 (INIT_STOCK 리셋 → 이월기록/남은기록 추가)
  // [FIX] 데이터 유실 방지(Write-then-Clear): 삭제하기 전 구성된 데이터가 있을 경우에만 덮어씀
  const finalRowsToInsert = [...newCarryoverRows, ...keepRows];

  // [TASK-006] 리셋 전 초기재고를 메모리에 백업 (중간 실패 시 원복용)
  const initStockBackup = masterData.map(r => [Number(r[MASTER_COLS.INIT_STOCK]) || 0]);
  let txSheetMutated = false;

  try {
    // [TASK-006] 초기재고 리셋을 이월 행 삽입보다 **먼저** 수행한다.
    //   이월 행을 먼저 쓰면 그 직후 실패 시 `INIT_STOCK + 이월입고`가 이중 계상되지만,
    //   이 순서에서는 최악의 경우에도 재고가 일시적으로 작게 보일 뿐 이중 계상은 없다.
    if (initStockBackup.length > 0) {
      masterSheet.getRange(3, MASTER_COLS.INIT_STOCK + 1, initStockBackup.length, 1)
        .setValues(initStockBackup.map(() => [0]));
    }
    SpreadsheetApp.flush();

    // 기존 데이터 클리어 후 삽입 (원자성 확보)
    txSheetMutated = true;
    txSheet.getRange(3, 1, Math.max(txLastRow - 2, 1), TX_COLS).clearContent();

    if (finalRowsToInsert.length > 0) {
      txSheet.getRange(3, 1, finalRowsToInsert.length, TX_COLS)
        .setValues(finalRowsToInsert)
        .setHorizontalAlignment("center")
        .setBackground(COLORS.autoBg);
    }

    SpreadsheetApp.flush();
  } catch (e) {
    // [TASK-006] 원복을 시도한 뒤 에러를 그대로 다시 던진다 (실패를 성공으로 둔갑시키지 않는다)
    restoreInitStockAfterFailure(masterSheet, initStockBackup, txSheetMutated, e);
    throw e;
  }

  // [TASK-006] recalc 이전 사전 검증: 리셋 결과를 시트에서 다시 읽어 이중 계상 위험을 감지
  const postResetMaster = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();
  const doubleCountRisks = detectCarryoverDoubleCount(postResetMaster, finalRowsToInsert);

  // [TASK-006] 마감 직후가 G열 수동 입력으로 인한 이중 계상 위험이 가장 큰 시점이므로 보호를 갱신한다.
  // 보호 적용 실패가 마감 자체를 되돌리게 해서는 안 되므로 로그만 남긴다.
  try {
    applyInitStockProtection(ss);
  } catch (e) {
    console.warn(`[TASK-006] 초기재고 보호 적용 실패(마감은 정상 완료): ${e.message}`);
  }

  recalcStockAndUsage(ss);

  let closingMessage = `${year}년 ${month}월 마감 완료. ${archiveRows.length}건 보관, ${newCarryoverRows.length}건 이월됨.`;
  if (doubleCountRisks.length > 0) {
    closingMessage += ` ⚠️ 초기재고 이중 계상 위험 ${doubleCountRisks.length}건 감지 (실행 로그 확인).`;
  }

  return { success: true, message: closingMessage };
  } finally {
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════════════════
//  [TASK-006] 월마감 초기재고 정합성 보조 함수
// ═══════════════════════════════════════════════════════════════════

/**
 * 월마감 중간 실패 시 품목 마스터의 초기재고(G열)를 마감 전 값으로 되돌린다.
 *
 * 단, 입출고 시트에 이월 행을 이미 쓴 뒤라면 원복이 곧 `INIT_STOCK + 이월입고`
 * 이중 계상이 되므로 복원하지 않고 수동 복구 안내만 로그에 남긴다.
 *
 * @param {Sheet} masterSheet 품목 마스터 시트
 * @param {Array<Array<number>>} initStockBackup 리셋 전 초기재고 (행당 1열)
 * @param {boolean} txSheetMutated 입출고 시트를 이미 변경했는지 여부
 * @param {Error} cause 원인 예외
 * @return {boolean} 실제로 복원했으면 true
 */
function restoreInitStockAfterFailure(masterSheet, initStockBackup, txSheetMutated, cause) {
  const reason = (cause && cause.message) ? cause.message : String(cause);

  if (txSheetMutated) {
    console.error(
      `[TASK-006][월마감 실패] 입출고 시트 변경 이후 실패하여 초기재고를 원복하지 않습니다. ` +
      `(원복 시 이월 입고와 이중 계상됨) 아카이브 시트에서 수동 복구가 필요합니다. 원인: ${reason}`
    );
    return false;
  }

  try {
    if (initStockBackup && initStockBackup.length > 0) {
      masterSheet.getRange(3, MASTER_COLS.INIT_STOCK + 1, initStockBackup.length, 1)
        .setValues(initStockBackup);
      SpreadsheetApp.flush();
    }
    console.warn(`[TASK-006][월마감 실패] 초기재고를 마감 전 값으로 원복했습니다. 원인: ${reason}`);
    return true;
  } catch (restoreErr) {
    console.error(`[TASK-006][월마감 실패] 초기재고 원복 자체가 실패했습니다: ${restoreErr.message} (원인: ${reason})`);
    return false;
  }
}

/**
 * 초기재고 이중 계상 위험 사전 감지.
 *
 * `recalcStockAndUsage()`는 현재고를 `INIT_STOCK + Σ입고 - Σ출고 - Σ폐기`로 구하므로,
 * INIT_STOCK > 0 인 품목에 "마감 이월" 입고 행이 함께 존재하면 그 수량이 두 번 계상된다.
 * 자동 교정은 하지 않고(원인 규명이 우선) 경고 로그만 남긴다.
 *
 * @param {Array<Array<*>>} masterRows 품목 마스터 데이터 (MASTER_COLS 기준)
 * @param {Array<Array<*>>} txRows 입출고 행 (TX_COLS 9열 기준)
 * @return {Array<{code: string, initStock: number, carryoverQty: number}>} 위험 목록
 */
function detectCarryoverDoubleCount(masterRows, txRows) {
  const carryoverQty = {};
  (txRows || []).forEach(row => {
    const code = row[1];
    if (!code || row[3] !== "입고") return;
    if (String(row[7] || "").indexOf("마감 이월") < 0) return;
    carryoverQty[code] = (carryoverQty[code] || 0) + (Number(row[4]) || 0);
  });

  const risks = [];
  (masterRows || []).forEach(row => {
    const code = row[MASTER_COLS.CODE];
    const initStock = Number(row[MASTER_COLS.INIT_STOCK]) || 0;
    if (!code || initStock <= 0) return;
    if (!carryoverQty[code]) return;

    risks.push({ code: code, initStock: initStock, carryoverQty: carryoverQty[code] });
    console.warn(
      `[TASK-006][WARN] 초기재고 이중 계상 위험: ${code} — INIT_STOCK=${initStock}, ` +
      `마감 이월 입고 수량=${carryoverQty[code]}`
    );
  });

  return risks;
}
