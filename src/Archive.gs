/**
 * 호텔덕구온천 구매 재고 관리 시스템 v7.0 — 월마감 & 백업 모듈
 * [v7.0] 시트 참조 변경 + 9열 입출고 구조
 */


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

  // [TASK-011] 음수 재고 가드레일 — 시트를 건드리기 전에 검사한다.
  //   마감은 과거 내역을 아카이브로 잘라내고 잔여 로트(remaining > 0)만 이월하므로,
  //   음수 재고 상태로 마감하면 결손 수량이 흔적 없이 0으로 둔갑해 영구 유실된다.
  const negativeItems = collectNegativeStockItems(masterData, txData);
  if (negativeItems.length > 0) {
    const sample = negativeItems.slice(0, 3).map(it => `${it.code}(${it.name}: ${it.stock}개)`).join(", ");
    const etc = negativeItems.length > 3 ? ` 외 ${negativeItems.length - 3}건` : "";
    return {
      success: false,
      message: `❌ [월마감 차단] 현재고가 음수인 품목이 ${negativeItems.length}건 있습니다 (${sample}${etc}). 누락된 입고 전표 등록 또는 재고 실사 조정을 완료한 후 마감해주세요.`
    };
  }
  
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
  let shopTrim = { sheets: 0, removed: 0 };

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

    // [TASK-006] 업장 시트에서도 마감 대상 행을 제거한다.
    // 통합 시트는 업장 시트로부터 재구성되는 파생 뷰이므로, 업장 시트를 그대로 두면
    // 다음 재취합에서 아카이브한 과거 행이 되살아나고 이월 행이 지워져 마감이 무효화된다.
    shopTrim = _trimShopSheetsForClosing(ss, cutoffDate);

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

  // [TASK-006] 마감은 재고/초기재고를 통째로 바꾸므로 캐시를 즉시 버린다.
  // (캐시 TTL 60초 동안 웹앱이 마감 전 수치를 그대로 보여주던 문제)
  try { CacheManager.invalidateAll(); } catch (e) { console.warn('[TASK-006] 캐시 무효화 실패: ' + e.message); }

  // [TASK-010] 마감 성공이 확정된 시점에 마감 기준일을 기록한다.
  // 이후 addTransaction/onEdit이 이 값을 기준으로 과거 마감월 입력을 차단한다.
  setLatestClosingCutoff(cutoffDate);

  let closingMessage = `${year}년 ${month}월 마감 완료. ${archiveRows.length}건 보관, ${newCarryoverRows.length}건 이월됨.`;
  if (shopTrim.removed > 0) {
    closingMessage += ` 업장 시트 ${shopTrim.sheets}곳에서 ${shopTrim.removed}건 정리됨.`;
  }
  if (doubleCountRisks.length > 0) {
    closingMessage += ` ⚠️ 초기재고 이중 계상 위험 ${doubleCountRisks.length}건 감지 (실행 로그 확인).`;
  }

  return { success: true, message: closingMessage };
  } finally {
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════════════════
//  [TASK-011] 음수 재고 마감 가드레일
// ═══════════════════════════════════════════════════════════════════

/**
 * 마감을 차단해야 하는 음수 재고 품목을 수집한다.
 *
 * 마스터 H열(현재고)은 recalcStockAndUsage()가 갱신하는 파생값이라 마지막 재계산
 * 이후의 입출고를 반영하지 못했을 수 있다. 그래서 기록값(H열)과 초기재고+실적으로
 * 재계산한 값을 함께 보고, **둘 중 하나라도 음수면** 차단 대상으로 판정한다
 * (더 보수적인 쪽 수량을 보고한다). 미사용 품목은 실사 대상이 아니므로 제외한다.
 *
 * @param {Array<Array>} masterData 품목 마스터 3행 이후 (24열)
 * @param {Array<Array>} txData     통합 입출고 기록장 3행 이후 (9열)
 * @return {Array<{code: string, name: string, stock: number}>} 음수 재고 품목
 */
function collectNegativeStockItems(masterData, txData) {
  const deltaMap = {};
  (txData || []).forEach(row => {
    const code = row[1];
    if (!code) return;
    const type = row[3];
    const qty = Number(row[4]) || 0;
    if (type === "입고") deltaMap[code] = (deltaMap[code] || 0) + qty;
    if (type === "출고" || type === "폐기") deltaMap[code] = (deltaMap[code] || 0) - qty;
  });

  const negatives = [];
  (masterData || []).forEach(row => {
    const code = row[MASTER_COLS.CODE];
    if (!code) return;
    if (String(row[MASTER_COLS.USAGE_STATUS]).trim() === "미사용") return;

    const computed = (Number(row[MASTER_COLS.INIT_STOCK]) || 0) + (deltaMap[code] || 0);
    const recorded = Number(row[MASTER_COLS.CURRENT_STOCK]) || 0;
    const stock = Math.min(computed, recorded);
    if (stock < 0) {
      negatives.push({ code: code, name: row[MASTER_COLS.NAME] || code, stock: stock });
    }
  });

  return negatives;
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
    if (!code || !isCarryoverRow(row)) return;
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


/** 월마감이 생성하는 이월 입고 행의 비고 태그 */
const CARRYOVER_NOTE_TAG = "마감 이월";

/**
 * 해당 행이 월마감으로 생성된 "이월 입고" 행인지 판별한다.
 * 이월 행은 통합 시트(SHEET_INOUT)에만 존재하고 업장 시트에는 없으므로,
 * 재취합(consolidateAllSheets)이 이 행을 지우지 않도록 식별하는 데 쓴다.
 * @param {Array<*>} row TX_COLS(9열) 입출고 행
 * @return {boolean}
 */
function isCarryoverRow(row) {
  if (!row) return false;
  return row[3] === "입고" && String(row[7] || "").indexOf(CARRYOVER_NOTE_TAG) >= 0;
}

/**
 * [TASK-006] 마감 대상 행을 업장 시트에서도 제거한다.
 *
 * 통합 시트(SHEET_INOUT)는 `consolidateAllSheets()`가 업장 시트로부터 통째로 재구성하는
 * **파생 뷰**다. 월마감이 통합 시트만 정리하면, 다음 재취합(자정 트리거 / '신규 내역 취합' /
 * '시트 동기화')에서 아카이브했던 과거 행이 업장 시트로부터 되살아나고 이월 행은 사라진다.
 * 그 결과 초기재고분이 통째로 증발한다 (2026-09-01 DEV에서 실제 발생).
 *
 * 원본은 이 함수가 호출되기 전에 이미 Google Drive 아카이브 스프레드시트로 이관되어 있으며,
 * 거래ID 접두사(TX/AX/MB/WB/HA)로 어느 업장의 행이었는지 역추적할 수 있다.
 *
 * @param {Spreadsheet} ss
 * @param {Date} cutoffDate 이 시각 이전(이하) 행을 제거한다
 * @return {{sheets: number, removed: number}} 정리한 업장 시트 수와 제거 행 수
 */
function _trimShopSheetsForClosing(ss, cutoffDate) {
  const result = { sheets: 0, removed: 0 };

  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  if (!shopSheet) return result;

  const shopLastRow = shopSheet.getLastRow();
  if (shopLastRow < 3) return result;

  const configRows = shopSheet.getRange(3, 1, shopLastRow - 2, 6).getValues();

  configRows.forEach(row => {
    const shopName = row[1], status = row[3], gid = row[5];
    if (!shopName || status !== "생성완료" || !gid) return;

    const sh = ss.getSheets().find(s => s.getSheetId() == gid);
    if (!sh) return;

    const last = sh.getLastRow();
    if (last < 3) return;

    const rows = sh.getRange(3, 1, last - 2, TX_COLS).getValues();
    const keepRows = [];
    let removedHere = 0;

    rows.forEach(r => {
      // 품목코드가 있어야 실제 거래 행이다 (consolidateAllSheets와 동일 기준).
      // 입력 중인 행이나 메모 등 그 외의 행은 마감이 임의로 지우지 않는다.
      if (!r[1]) {
        if (r.some(v => v !== '' && v !== null && v !== undefined)) keepRows.push(r);
        return;
      }
      const dateVal = toLocalDate(r[0]);
      // 날짜를 읽을 수 없는 행도 임의 삭제하지 않고 남긴다
      if (isNaN(dateVal.getTime()) || dateVal > cutoffDate) {
        keepRows.push(r);
      } else {
        removedHere++;
      }
    });

    if (removedHere <= 0) return;

    // clearContent는 서식을 보존하므로 입력 시트의 스타일이 유지된다
    sh.getRange(3, 1, last - 2, TX_COLS).clearContent();
    if (keepRows.length > 0) {
      sh.getRange(3, 1, keepRows.length, TX_COLS).setValues(keepRows);
    }

    result.sheets++;
    result.removed += removedHere;
  });

  return result;
}


// ═══════════════════════════════════════════════════════════════════
//  [TASK-010] 마감 기준일(cutoff) 추적 — 과거 마감월 데이터 수정 차단의 기준
//
//  회계 장부 동결 원칙에 따라 마감된 월의 데이터는 Super Admin을 포함해
//  누구도 소급 수정/입력할 수 없다. 과거 오류는 당월 정정 거래로 처리한다.
//  (배경: 마감된 월의 원장은 이미 별도 스프레드시트로 분리되었고, 남은 로트는
//   익월 1일자 "마감 이월" 입고 행 하나로 스냅샷되어 있다. 그보다 앞선 날짜의
//   거래가 사후 삽입되면 FIFO 로트 체인이 이월 스냅샷과 이중 계상된다.)
// ═══════════════════════════════════════════════════════════════════

/** 최신 마감 기준일을 담아 두는 ScriptProperties 키 (값: "yyyy-MM-dd") */
const CLOSING_CUTOFF_PROPERTY = "LAST_CLOSED_CUTOFF";

/** Date → "yyyy-MM-dd" (스크립트 타임존 기준). 문자열 비교로 날짜를 다루기 위한 공통 변환 */
function _toDateKey(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

/**
 * 최신 마감 기준일을 ScriptProperties에 기록한다.
 * @param {Date|string} cutoff 마감 기준일 (Date 또는 "yyyy-MM-dd")
 */
function setLatestClosingCutoff(cutoff) {
  // instanceof 대신 덕 타이핑 — 다른 실행 컨텍스트에서 만들어진 Date도 받아들인다
  const isDate = cutoff && typeof cutoff.getTime === "function" && !isNaN(cutoff.getTime());
  const key = isDate ? _toDateKey(cutoff) : String(cutoff).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
  PropertiesService.getScriptProperties().setProperty(CLOSING_CUTOFF_PROPERTY, key);
}

/**
 * 최신 마감 기준일을 조회한다.
 *
 * 1순위는 ScriptProperties 캐시다(거래 등록마다 시트를 풀 스캔하지 않기 위함).
 * 값이 없으면 통합 입출고 기록장의 "마감 이월" 입고 행을 훑어 역산한다.
 * 이월 행의 날짜는 마감 **익월 1일**이므로, 마감 기준일은 그 하루 전날이다.
 *
 * @param {Spreadsheet} [ss] 생략 시 필요할 때만 활성 스프레드시트를 연다
 * @return {string|null} "yyyy-MM-dd" 또는 마감 이력이 없으면 null
 */
function getLatestClosingCutoff(ss) {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty(CLOSING_CUTOFF_PROPERTY);
  if (cached && /^\d{4}-\d{2}-\d{2}$/.test(String(cached).trim())) {
    return String(cached).trim();
  }

  const spreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = spreadsheet.getSheetByName(SHEET_INOUT);
  if (!txSheet) return null;

  const lastRow = txSheet.getLastRow();
  if (lastRow < 3) return null;

  const rows = txSheet.getRange(3, 1, lastRow - 2, TX_COLS).getValues();
  let latestCarryover = null;
  rows.forEach(row => {
    if (!isCarryoverRow(row)) return;
    const d = toLocalDate(row[0]);
    if (isNaN(d.getTime())) return;
    if (!latestCarryover || d > latestCarryover) latestCarryover = d;
  });

  if (!latestCarryover) return null;

  // 이월 행 날짜(익월 1일)의 하루 전 = 마감 기준일(마감월 말일)
  const cutoff = new Date(latestCarryover.getFullYear(), latestCarryover.getMonth(), latestCarryover.getDate() - 1);
  const key = _toDateKey(cutoff);
  props.setProperty(CLOSING_CUTOFF_PROPERTY, key); // 다음 조회부터는 캐시 사용
  return key;
}

/**
 * 거래일이 마감된 기간에 속하는지 검사한다.
 * 역할(Admin/Manager/Staff)과 무관하게 동일하게 적용된다.
 *
 * @param {string} dateText 거래일 "yyyy-MM-dd"
 * @param {Spreadsheet} [ss]
 * @return {{blocked: boolean, cutoff: string|null, message: string}}
 */
function validateNotClosedMonth(dateText, ss) {
  const cutoff = getLatestClosingCutoff(ss);
  // 마감 이력이 없으면(cutoff === null) 모든 유효한 날짜를 허용한다
  if (!cutoff) return { blocked: false, cutoff: null, message: "" };

  // cutoff는 마감월 말일이므로 그날까지가 차단 대상이고 익월 1일부터 허용된다
  if (String(dateText) > cutoff) return { blocked: false, cutoff: cutoff, message: "" };

  return {
    blocked: true,
    cutoff: cutoff,
    message: `❌ ${cutoff} 이전 기간(해당일 포함)은 이미 월마감되었습니다. ` +
             `과거 누락/정정 데이터는 당월 재고조정 거래로 등록해주세요.`
  };
}

/**
 * [TASK-010] 웹앱 클라이언트가 날짜 선택 하한(min)을 설정하기 위해 호출한다.
 * 서버 검증(addTransaction)이 1차 방어이고 이 값은 UX 보조(이중 방어)다.
 *
 * @param {string} token 세션 토큰
 * @return {{success: boolean, cutoff: string|null, minDate: string|null}}
 */
function getClosingCutoffInfo(token) {
  const session = validateSession(token);
  if (!session) return { success: false, cutoff: null, minDate: null };

  const cutoff = getLatestClosingCutoff();
  if (!cutoff) return { success: true, cutoff: null, minDate: null };

  const c = new Date(cutoff + "T00:00:00");
  const minDate = _toDateKey(new Date(c.getFullYear(), c.getMonth(), c.getDate() + 1));
  return { success: true, cutoff: cutoff, minDate: minDate };
}
