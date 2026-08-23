/**
 * 호텔덕구온천 구매 재고 관리 시스템 v7.0 — 대시보드 모듈
 * [v7.0] 시트 참조 변경 + 9열 입출고 구조
 */

function consolidateAllSheets(ss) {
  const consolidated = ss.getSheetByName(SHEET_INOUT);
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  
  const shopLastRow = shopSheet.getLastRow();
  if (shopLastRow < 3) return;
  const configRows = shopSheet.getRange(3, 1, shopLastRow - 2, 6).getValues();

  let allDataRows = [];
  configRows.forEach((row) => {
    const shopName = row[1], status = row[3], gid = row[5];
    if (!shopName || status !== "생성완료" || !gid) return;

    const sh = ss.getSheets().find(s => s.getSheetId() == gid);
    if (!sh) return; 

    const last = sh.getLastRow();
    if (last < 3) return;

    const rows = sh.getRange(3, 1, last - 2, TX_COLS).getValues();
    rows.forEach(r => { if (r[1]) allDataRows.push(r); });
  });

  allDataRows.sort((a, b) => {
    const da = toLocalDate(a[0]);
    const db = toLocalDate(b[0]);
    return da - db;
  });

  // [FIX] 데이터 유실 방지(Write-then-Clear): 모든 데이터 수집 후 마지막에 덮어쓰기
  const lastRow = consolidated.getLastRow();
  if (lastRow >= 3) {
    consolidated.getRange(3, 1, lastRow - 2, TX_COLS).clearContent();
  }
  if (allDataRows.length > 0) {
    consolidated.getRange(3, 1, allDataRows.length, TX_COLS).setValues(allDataRows).setHorizontalAlignment("center").setBackground(COLORS.autoBg);
  }
}

function refreshDashboard(isSilent = false) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(30000); 
  } catch (e) {
    if (!isSilent) SpreadsheetApp.getUi().alert("⏳ 다른 프로세스가 실행 중입니다. 잠시 후 재시도해 주세요.");
    return;
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    consolidateAllSheets(ss); 
    SpreadsheetApp.flush();
    
    recalcStockAndUsage(ss);
    
    runDashboardSync(ss);
    
    // [FIX] 수동 취합 완료 시간 기록
    PropertiesService.getScriptProperties().setProperty("LAST_SYNC_TIMESTAMP", new Date().toISOString());
    
    if (!isSilent) SpreadsheetApp.getUi().alert("🔄 [동기화 완료] 정적 재고 집계 및 최신화가 완료되었습니다.");
    
  } catch (err) {
    const msg = `[대시보드 동기화 실패]\n${err.message}\n${err.stack}`;
    console.log(msg);
    if (!isSilent) SpreadsheetApp.getUi().alert("❌ 동기화 중 오류 발생:\n" + err.message);
    if (SEND_EMAIL_ALERT) {
      try {
        MailApp.sendEmail({ to: ALERT_EMAIL, subject: "[호텔덕구온천] 동기화 오류", body: msg });
      } catch(mailErr) { _logError(mailErr, "sendAlertEmail"); }
    }
  } finally {
    lock.releaseLock();
  }
}

function runDashboardSync(ss) {
  const dashSheet = ss.getSheetByName(SHEET_DASHBOARD);
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const lastRow = dashSheet.getLastRow();
  
  if (lastRow >= 11) {
    const clearRange = dashSheet.getRange(11, 2, Math.max(lastRow - 10, 1), 8);
    clearRange.clearContent().setBackground(null).setFontColor(null).setFontWeight(null).setBorder(false, false, false, false, false, false);
  }

  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  if (masterLastRow < 3) return _renderNoOrderMessage(dashSheet);
  
  // [v9.0] MASTER_COL_COUNT열 읽기 + 미사용 품목 제외
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();
  const outputList = [];
  masterData.forEach(row => {
    // [v9.0] 미사용 품목은 대시보드에서 제외
    if (row[MASTER_COLS.USAGE_STATUS] === '미사용') return;
    if (row[MASTER_COLS.STATUS] === STATUS_RISK || row[MASTER_COLS.STATUS] === STATUS_ORDER) {
      outputList.push([row[MASTER_COLS.CODE], row[MASTER_COLS.NAME], row[MASTER_COLS.GRADE], row[MASTER_COLS.CURRENT_STOCK], row[MASTER_COLS.SAFETY_STOCK], row[MASTER_COLS.ROP], row[MASTER_COLS.ORDER_QTY], row[MASTER_COLS.STATUS]]);
    }
  });

  if (outputList.length === 0) return _renderNoOrderMessage(dashSheet);

  dashSheet.getRange(11, 2, outputList.length, 8).setValues(outputList).setHorizontalAlignment("center").setVerticalAlignment("middle");
  outputList.forEach((row, i) => {
    const statusCell = dashSheet.getRange(11 + i, 9);
    dashSheet.getRange(11 + i, 8).setBackground(COLORS.autoBg).setFontWeight("bold");
    statusCell.setBackground(row[7] === STATUS_RISK ? COLORS.riskBg : COLORS.orderBg).setFontColor("#ffffff").setFontWeight("bold");
  });
}

function _renderNoOrderMessage(dashSheet) {
  const r = dashSheet.getRange("B11:I11");
  r.clearContent();
  dashSheet.getRange("B11").setValue("발주 필요 품목 없음 ✅").setFontColor(COLORS.normalBg).setFontWeight("bold").setHorizontalAlignment("center");
  r.setBackground(COLORS.grayBg);
}

function checkAlerts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  if (masterSheet.getLastRow() < 3) return;
  const data = masterSheet.getRange(3, 1, masterSheet.getLastRow() - 2, 17).getValues();
  
  const riskLines = [], orderLines = [];
  data.forEach(row => {
    if (!row[0]) return;
    const line = `· ${row[0]} [${row[1]}] 현재고: ${row[7]} (발주점: ${row[14]})`;
    if (row[16] === STATUS_RISK) riskLines.push(line);
    if (row[16] === STATUS_ORDER) orderLines.push(line);
  });

  let message = "";
  if (riskLines.length > 0) message += "🚨 안전재고 붕괴 — 즉시 구매결의 필요:\n" + riskLines.join("\n") + "\n\n";
  if (orderLines.length > 0) message += "⚠️ 발주점 도달 — 안전재고 확보 요망:\n" + orderLines.join("\n");

  if (!message) return SpreadsheetApp.getUi().alert("✅ 모든 자재의 현재고가 안전 범위 내에 있습니다.");
  SpreadsheetApp.getUi().alert("🔔 실시간 재고 위험 정보\n\n" + message);

  if (SEND_EMAIL_ALERT && message) {
    try {
      MailApp.sendEmail({
        to: ALERT_EMAIL, subject: "[호텔덕구온천] ⚠️ 재고 위험 알림",
        body: "아래 품목 재고를 확인해 주세요.\n\n" + message
      });
    } catch(err) {}
  }
}
