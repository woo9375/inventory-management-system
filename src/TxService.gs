


// ═══════════════════════════════════════════════════════════════════
//  API: 입출고 기록
// ═══════════════════════════════════════════════════════════════════

function getShopList(token) {
  const session = validateSession(token);
  if (!session) return [];

  const CACHE_KEY = 'SHOP_LIST';
  let shops = CacheManager.get(CACHE_KEY);
  if (shops) return shops;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // [v7.0] 업장관리 시트
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  const lastRow = shopSheet.getLastRow();
  if (lastRow < 3) return [];

  const data = shopSheet.getRange(3, 1, lastRow - 2, 7).getValues();
  shops = [];
  data.forEach(row => {
    if (row[1] && row[3] === "생성완료") {
      shops.push({ 
        category: row[0], 
        name: row[1], 
        tag: row[2],
        assignees: row[6] ? row[6].toString().split(',').map(s=>s.trim()).filter(Boolean) : []
      });
    }
  });
  CacheManager.set(CACHE_KEY, shops);
  
  if (session.role === ROLES.STAFF) {
    const assigned = session.assignedShops || [];
    return shops.filter(shop => assigned.includes(shop.name));
  }
  return shops;
}



function getRecentTransactions(token, shopName, limit) {
  const session = validateSession(token);
  if (!session) return [];

  // [CR-02 FIX] IDOR 방어: Staff는 자신의 담당 업장만 조회 가능
  if (shopName === "all" && session.role === ROLES.STAFF) return [];
  if (!shopName || !_canAccessShop(session, shopName)) {
    return [];
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  limit = Math.max(1, Math.min(Number(limit) || 50, 100));

  let sheet;
  sheet = ss.getSheetByName(shopName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];

  // [v7.0] 9열 구조
  const data = sheet.getRange(3, 1, lastRow - 2, TX_COLS).getValues();
  const records = [];

  data.forEach(row => {
    if (!row[1]) return;
    records.push({
      date: row[0] instanceof Date ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd") : row[0],
      code: row[1], name: row[2], type: row[3],
      qty: row[4], unitPrice: row[5], // [v7.0] 단가 스냅샷
      person: row[6], note: row[7], txId: row[8] // [v7.0] 열 위치 변경
    });
  });

  records.reverse();
  return records.slice(0, limit);
}



// [v7.0] 단가 스냅샷 포함 저장
function addTransaction(token, shopName, txData) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (!txData || typeof txData !== "object") return { success: false, message: "거래 정보가 올바르지 않습니다." };

  if (!_canAccessShop(session, shopName)) {
    return { success: false, message: "⛔ 접근할 수 없거나 활성 상태가 아닌 업장입니다." };
  }

  const code = String(txData.code || "").trim();
  const type = String(txData.type || "").trim();
  const note = String(txData.note || "").trim();
  const dateText = String(txData.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return { success: false, message: "❌ 거래일은 YYYY-MM-DD 형식으로 입력해야 합니다." };
  }
  const transactionDate = new Date(dateText + "T00:00:00");
  if (isNaN(transactionDate.getTime())) return { success: false, message: "❌ 유효한 거래일을 입력하세요." };

  // [TASK-010] 마감된 과거 기간의 거래 등록 차단 — 역할(Admin/Manager/Staff) 예외 없음.
  // 마감월 원장은 이미 별도 스프레드시트로 분리되었고 잔여 로트는 익월 1일 이월 행으로
  // 스냅샷되어 있어, 그보다 앞선 거래가 삽입되면 FIFO 체인이 이월분과 이중 계상된다.
  const closedCheck = validateNotClosedMonth(dateText);
  if (closedCheck.blocked) {
    return { success: false, message: closedCheck.message };
  }
  if (!VALID_TRANSACTION_TYPES.includes(type)) {
    return { success: false, message: "❌ 유효하지 않은 거래 구분입니다." };
  }
  if (note.length > MAX_TRANSACTION_NOTE_LENGTH) {
    return { success: false, message: `❌ 비고는 ${MAX_TRANSACTION_NOTE_LENGTH}자 이내로 입력하세요.` };
  }

  // [FIX] 락(Lock) 서비스 도입: 동시 입출고 충돌 방지
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 10초 대기
  } catch (e) {
    return { success: false, message: "⏳ 다른 사용자가 작업 중입니다. 잠시 후 다시 시도해주세요." };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(shopName);
    if (!sheet) return { success: false, message: `❌ 업장 '${shopName}'을 찾을 수 없습니다.` };

    // [FIX] 품목명 & 매입단가 자동 조회 시 마스터 시트 풀 스캔 대신 캐시 활용
    let itemInfoMap = CacheManager.get(CACHE_KEYS.ITEM_MAP);
    if (!itemInfoMap) {
      itemInfoMap = CacheManager.buildItemMapCache(ss);
    }

    // [TASK-005] 배포 직후 남아 있는 구버전 캐시(initStock 누락)는 강제 갱신
    if (itemInfoMap[code] && itemInfoMap[code].initStock === undefined) {
      itemInfoMap = CacheManager.buildItemMapCache(ss);
    }

    // [v7.0] 품목코드 유효성 검증 (오기입 방지)
    if (!itemInfoMap[code]) {
      return { success: false, message: "❌ 품목 마스터에 등록되지 않은 품목코드입니다. 등록된 품목을 선택해주세요." };
    }

    // [NF-05 FIX] 수량 유효성 검증: 0 이하 값 차단
    const qty = Number(txData.qty);
    if (!qty || qty <= 0 || qty > MAX_TRANSACTION_QTY || !Number.isFinite(qty)) {
      return { success: false, message: "❌ 수량은 0보다 큰 유효한 숫자여야 합니다." };
    }

    const itemName = itemInfoMap[code].name;
    const unitPrice = itemInfoMap[code].price || 0;

    // 거래ID 자동 생성
    const shopSheet = ss.getSheetByName(SHEET_SHOPS);
    const shopData = shopSheet.getRange(3, 1, shopSheet.getLastRow() - 2, 6).getValues();
    const shopConfig = shopData.find(r => r[1] === shopName && r[3] === "생성완료");
    const prefix = shopConfig ? shopConfig[2] : "XX";

    const tz = Session.getScriptTimeZone();
    const dateStr = Utilities.formatDate(transactionDate, tz, "yyyyMMdd");
    const uniqueSuffix = Utilities.getUuid().replace(/-/g,"").substring(0,8).toUpperCase();
    const parentTxId = `${prefix}-${dateStr}-${uniqueSuffix}`;

    // [TASK-005] 입고는 기존대로 1행, 출고/폐기는 FIFO 잔여 로트별로 분할 저장
    const splits = (type === "입고")
      ? [{ qty: qty, unitPrice: unitPrice, lotLabel: "", isOverdraft: false }]
      : _calculateFifoOutboundSplits(sheet, code, qty, itemInfoMap[code]);

    const totalSplits = splits.length;
    const finalRows = splits.map((split, i) => {
      let rowNote = note;
      if (type !== "입고") {
        let tag = "";
        if (split.isOverdraft) {
          tag = "[FIFO 초과출고]";
        } else if (totalSplits > 1) {
          tag = `[FIFO ${i + 1}/${totalSplits}, 로트일자: ${split.lotLabel}]`;
        }
        if (tag) rowNote = rowNote ? `${rowNote} ${tag}` : tag;
      }
      const rowTxId = (type === "입고") ? parentTxId : `${parentTxId}-${String(i + 1).padStart(2, "0")}`;
      return [
        transactionDate, code, itemName, type,
        split.qty, split.unitPrice,
        session.name, rowNote, rowTxId
      ];
    });

    const lastRow = sheet.getLastRow();
    const startRow = Math.max(lastRow + 1, 3);

    // [v7.0] 9열 구조: 단가 스냅샷 포함 / [TASK-005] N개 분할행을 1회 setValues로 배치 삽입
    sheet.getRange(startRow, 1, finalRows.length, TX_COLS)
      .setValues(finalRows)
      .setHorizontalAlignment("center");
    sheet.getRange(startRow, 3, finalRows.length, 1).setBackground(COLORS.autoBg);  // 품목명
    sheet.getRange(startRow, 6, finalRows.length, 1).setBackground(COLORS.autoBg);  // 단가
    sheet.getRange(startRow, 9, finalRows.length, 1).setBackground(COLORS.autoBg);  // 거래ID

    CacheManager.invalidateAll();

    const txIds = finalRows.map(r => r[8]);
    const overdraftQty = splits.reduce((sum, s) => sum + (s.isOverdraft ? s.qty : 0), 0);
    let message = (totalSplits > 1)
      ? `✅ [${type} 완료] ${totalSplits}개 로트로 분할 저장되었습니다. (거래ID: ${txIds[0]} 외 ${totalSplits - 1}건)`
      : `✅ ${shopName} 입출고 기록 저장 완료 (거래ID: ${txIds[0]})`;
    if (overdraftQty > 0) {
      message += ` ⚠️ 가용 로트보다 ${overdraftQty} 많이 ${type}되어 초과분은 마스터 단가로 기록되었습니다.`;
    }

    return {
      success: true,
      message: message,
      txId: txIds[0],
      parentTxId: parentTxId,
      txIds: txIds,
      splitCount: totalSplits,
      overdraftQty: overdraftQty
    };
  } finally {
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════════════════
//  [TASK-005] FIFO 출고 분할 계산
// ═══════════════════════════════════════════════════════════════════

/**
 * 출고/폐기 요청 수량을 FIFO 잔여 로트에 배분한다.
 *
 * 로트 구성은 StockEngine.recalcStockAndUsage() / Archive.executeMonthlyClosing()과
 * 동일한 규칙을 따른다: 마스터 초기재고를 date=0의 최초 로트로 편입하고,
 * 업장 시트의 "입고" 행을 로트로, "출고"/"폐기" 행을 소진 이벤트로 취급한다.
 *
 * @param {Sheet} sheet 업장 입출고 시트
 * @param {string} code 품목코드
 * @param {number} requestedQty 이번에 출고/폐기할 수량 (> 0)
 * @param {Object} masterItemInfo { price, initStock } 품목 마스터 정보
 * @return {Array<{qty:number, unitPrice:number, lotLabel:string, isOverdraft:boolean}>}
 */
function _calculateFifoOutboundSplits(sheet, code, requestedQty, masterItemInfo) {
  const EPS = 1e-9;
  const round = (n) => Math.round(n * 1e6) / 1e6;

  const masterPrice = Number(masterItemInfo && masterItemInfo.price) || 0;
  const initStock = Number(masterItemInfo && masterItemInfo.initStock) || 0;

  const lots = [];
  const outs = [];

  // 초기재고 = FIFO에서 가장 오래된 로트(date=0)
  if (initStock > 0) {
    lots.push({ date: 0, seq: -1, price: masterPrice, remaining: initStock, isInit: true });
  }

  // 대상 품목의 과거 입출고 내역만 메모리에서 필터링 (시트 재스캔 1회)
  const lastRow = sheet.getLastRow();
  if (lastRow >= 3) {
    const data = sheet.getRange(3, 1, lastRow - 2, TX_COLS).getValues();
    data.forEach((row, idx) => {
      if (!row[1] || String(row[1]).trim() !== code) return;
      const qty = Number(row[4]) || 0;
      if (qty <= 0) return;
      const dateVal = toLocalDate(row[0]).getTime();
      if (isNaN(dateVal)) return;

      const type = row[3];
      if (type === "입고") {
        lots.push({ date: dateVal, seq: idx, price: Number(row[5]) || 0, remaining: qty, isInit: false });
      } else if (type === "출고" || type === "폐기") {
        outs.push({ date: dateVal, seq: idx, qty: qty });
      }
    });
  }

  lots.sort((a, b) => (a.date - b.date) || (a.seq - b.seq));
  outs.sort((a, b) => (a.date - b.date) || (a.seq - b.seq));

  // 기존 출고/폐기를 오래된 로트부터 차감 → 현재 시점의 미소진 로트 산출
  outs.forEach(out => {
    let remainingOut = out.qty;
    for (let i = 0; i < lots.length && remainingOut > EPS; i++) {
      const lot = lots[i];
      if (lot.remaining <= EPS) continue;
      const deducted = Math.min(lot.remaining, remainingOut);
      lot.remaining = round(lot.remaining - deducted);
      remainingOut = round(remainingOut - deducted);
    }
  });

  // 이번 요청 수량을 잔여 로트 순서대로 소진
  const tz = Session.getScriptTimeZone();
  const splits = [];
  let remainingReq = requestedQty;

  for (let i = 0; i < lots.length && remainingReq > EPS; i++) {
    const lot = lots[i];
    if (lot.remaining <= EPS) continue;
    const take = round(Math.min(lot.remaining, remainingReq));
    lot.remaining = round(lot.remaining - take);
    remainingReq = round(remainingReq - take);
    splits.push({
      qty: take,
      unitPrice: lot.price,
      lotLabel: lot.isInit ? "초기재고" : Utilities.formatDate(new Date(lot.date), tz, "yyyy-MM-dd"),
      isOverdraft: false
    });
  }

  // 가용 로트 부족(초과 출고): 잔여 수량은 현재 마스터 매입단가로 기록
  if (remainingReq > EPS) {
    splits.push({ qty: remainingReq, unitPrice: masterPrice, lotLabel: "초과출고", isOverdraft: true });
  }

  return splits;
}
