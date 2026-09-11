


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



// ═══════════════════════════════════════════════════════════════════
//  [TASK-019] 거래 검증·행 생성 공용 헬퍼
//
//  단건 등록(addTransaction)과 일괄 업로드(uploadBulkTransactions)가 같은 함수를 탄다.
//  "일괄 업로드도 기존 재고 갱신 흐름과 유효성 검사를 동일하게" 타야 한다는 요구를
//  규칙을 두 벌로 복제하지 않고 코드 한 벌로 보장하기 위한 분리다.
//  (검증 순서·오류 문구는 분리 전 addTransaction과 동일하다)
// ═══════════════════════════════════════════════════════════════════

/**
 * 거래 입력값(날짜·품목코드·구분·비고)을 정규화하고, 시트를 열지 않아도 되는 검증을 수행한다.
 * 품목코드 존재 여부와 수량은 마스터 맵이 필요하므로 _validateTxAgainstMaster가 맡는다.
 *
 * @param {Object} txData { date, code, type, qty, note }
 * @param {{closingCutoff?: string|null}} [opts] 일괄 업로드가 1회 조회한 마감 기준일을 재사용할 때 넘긴다
 * @return {{ok:true, value:{code:string, type:string, note:string, dateText:string, transactionDate:Date}} | {ok:false, message:string}}
 */
function _normalizeTxInput(txData, opts) {
  if (!txData || typeof txData !== "object") return { ok: false, message: "거래 정보가 올바르지 않습니다." };

  const code = String(txData.code || "").trim();
  const type = String(txData.type || "").trim();
  const note = String(txData.note || "").trim();
  const dateText = String(txData.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return { ok: false, message: "❌ 거래일은 YYYY-MM-DD 형식으로 입력해야 합니다." };
  }
  const transactionDate = new Date(dateText + "T00:00:00");
  if (isNaN(transactionDate.getTime())) return { ok: false, message: "❌ 유효한 거래일을 입력하세요." };

  // [TASK-010] 마감된 과거 기간의 거래 등록 차단 — 역할(Admin/Manager/Staff) 예외 없음.
  // 마감월 원장은 이미 별도 스프레드시트로 분리되었고 잔여 로트는 익월 1일 이월 행으로
  // 스냅샷되어 있어, 그보다 앞선 거래가 삽입되면 FIFO 체인이 이월분과 이중 계상된다.
  const closedCheck = (opts && opts.closingCutoff !== undefined)
    ? evaluateClosingCutoff(dateText, opts.closingCutoff)
    : validateNotClosedMonth(dateText);
  if (closedCheck.blocked) return { ok: false, message: closedCheck.message };

  if (!VALID_TRANSACTION_TYPES.includes(type)) {
    return { ok: false, message: "❌ 유효하지 않은 거래 구분입니다." };
  }
  if (note.length > MAX_TRANSACTION_NOTE_LENGTH) {
    return { ok: false, message: `❌ 비고는 ${MAX_TRANSACTION_NOTE_LENGTH}자 이내로 입력하세요.` };
  }
  return { ok: true, value: { code: code, type: type, note: note, dateText: dateText, transactionDate: transactionDate } };
}

/**
 * 품목 마스터 맵을 기준으로 품목코드 존재 여부와 수량을 검증한다.
 * @return {{ok:true, value:{qty:number, itemName:string, unitPrice:number, itemInfo:Object}} | {ok:false, message:string}}
 */
function _validateTxAgainstMaster(code, rawQty, itemInfoMap) {
  // [v7.0] 품목코드 유효성 검증 (오기입 방지)
  if (!itemInfoMap[code]) {
    return { ok: false, message: "❌ 품목 마스터에 등록되지 않은 품목코드입니다. 등록된 품목을 선택해주세요." };
  }
  // [NF-05 FIX] 수량 유효성 검증: 0 이하 값 차단
  const qty = Number(rawQty);
  if (!qty || qty <= 0 || qty > MAX_TRANSACTION_QTY || !Number.isFinite(qty)) {
    return { ok: false, message: "❌ 수량은 0보다 큰 유효한 숫자여야 합니다." };
  }
  return {
    ok: true,
    value: { qty: qty, itemName: itemInfoMap[code].name, unitPrice: itemInfoMap[code].price || 0, itemInfo: itemInfoMap[code] }
  };
}

/**
 * 품목 맵 캐시를 읽는다. 마스터 시트 풀 스캔 대신 캐시를 쓰고, 없으면 만든다.
 * [TASK-005] 배포 직후 남아 있는 구버전 캐시(initStock 누락)는 강제 갱신한다.
 */
function _loadItemInfoMap(ss) {
  let itemInfoMap = CacheManager.get(CACHE_KEYS.ITEM_MAP);
  if (!itemInfoMap) itemInfoMap = CacheManager.buildItemMapCache(ss);

  const anyCode = Object.keys(itemInfoMap)[0];
  if (anyCode && itemInfoMap[anyCode].initStock === undefined) {
    itemInfoMap = CacheManager.buildItemMapCache(ss);
  }
  return itemInfoMap;
}

/** 업장관리 시트에서 거래ID 접두사(태그)를 찾는다. 없으면 "XX". */
function _getShopTxPrefix(ss, shopName) {
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  const shopData = shopSheet.getRange(3, 1, Math.max(shopSheet.getLastRow() - 2, 1), 6).getValues();
  const shopConfig = shopData.find(r => r[1] === shopName && r[3] === "생성완료");
  return shopConfig ? shopConfig[2] : "XX";
}

/**
 * 검증이 끝난 거래 1건을 시트 행(TX_COLS)으로 만든다.
 * [TASK-005] 입고는 1행, 출고/폐기는 FIFO 잔여 로트별로 분할 저장(Parent-Child 거래ID).
 *
 * @param {Object} p { transactionDate, code, itemName, type, qty, unitPrice, note, personName, prefix, splits }
 * @return {{rows:Array<Array>, parentTxId:string, txIds:string[], splitCount:number, overdraftQty:number}}
 */
function _buildTxRows(p) {
  const tz = Session.getScriptTimeZone();
  const dateStr = Utilities.formatDate(p.transactionDate, tz, "yyyyMMdd");
  const uniqueSuffix = Utilities.getUuid().replace(/-/g, "").substring(0, 8).toUpperCase();
  const parentTxId = `${p.prefix}-${dateStr}-${uniqueSuffix}`;

  const splits = p.splits;
  const totalSplits = splits.length;
  const rows = splits.map((split, i) => {
    let rowNote = p.note;
    if (p.type !== "입고") {
      let tag = "";
      if (split.isOverdraft) {
        tag = "[FIFO 초과출고]";
      } else if (totalSplits > 1) {
        tag = `[FIFO ${i + 1}/${totalSplits}, 로트일자: ${split.lotLabel}]`;
      }
      if (tag) rowNote = rowNote ? `${rowNote} ${tag}` : tag;
    }
    const rowTxId = (p.type === "입고") ? parentTxId : `${parentTxId}-${String(i + 1).padStart(2, "0")}`;
    return [
      p.transactionDate, p.code, p.itemName, p.type,
      split.qty, split.unitPrice,
      p.personName, rowNote, rowTxId
    ];
  });

  const overdraftQty = splits.reduce((sum, s) => sum + (s.isOverdraft ? s.qty : 0), 0);
  return { rows: rows, parentTxId: parentTxId, txIds: rows.map(r => r[8]), splitCount: totalSplits, overdraftQty: overdraftQty };
}

/**
 * 완성된 행들을 업장 시트 마지막 행 뒤에 1회 setValues로 붙인다(Batch I/O).
 * [v7.0] 9열 구조: 품목명(C)·단가(F)·거래ID(I)는 자동 컬럼 색으로 칠한다.
 * @return {number} 시작 행 번호
 */
function _appendTxRows(sheet, finalRows) {
  const lastRow = sheet.getLastRow();
  const startRow = Math.max(lastRow + 1, 3);
  sheet.getRange(startRow, 1, finalRows.length, TX_COLS)
    .setValues(finalRows)
    .setHorizontalAlignment("center");
  sheet.getRange(startRow, 3, finalRows.length, 1).setBackground(COLORS.autoBg);  // 품목명
  sheet.getRange(startRow, 6, finalRows.length, 1).setBackground(COLORS.autoBg);  // 단가
  sheet.getRange(startRow, 9, finalRows.length, 1).setBackground(COLORS.autoBg);  // 거래ID
  return startRow;
}


// [v7.0] 단가 스냅샷 포함 저장
function addTransaction(token, shopName, txData) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (!txData || typeof txData !== "object") return { success: false, message: "거래 정보가 올바르지 않습니다." };

  if (!_canAccessShop(session, shopName)) {
    return { success: false, message: "⛔ 접근할 수 없거나 활성 상태가 아닌 업장입니다." };
  }

  const input = _normalizeTxInput(txData);
  if (!input.ok) return { success: false, message: input.message };
  const code = input.value.code;
  const type = input.value.type;
  const note = input.value.note;
  const transactionDate = input.value.transactionDate;

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
    const itemInfoMap = _loadItemInfoMap(ss);
    const master = _validateTxAgainstMaster(code, txData.qty, itemInfoMap);
    if (!master.ok) return { success: false, message: master.message };
    const qty = master.value.qty;
    const itemName = master.value.itemName;
    const unitPrice = master.value.unitPrice;

    // [TASK-005] 입고는 기존대로 1행, 출고/폐기는 FIFO 잔여 로트별로 분할 저장
    const splits = (type === "입고")
      ? [{ qty: qty, unitPrice: unitPrice, lotLabel: "", isOverdraft: false }]
      : _calculateFifoOutboundSplits(sheet, code, qty, master.value.itemInfo);

    const built = _buildTxRows({
      transactionDate: transactionDate, code: code, itemName: itemName, type: type,
      qty: qty, unitPrice: unitPrice, note: note,
      personName: session.name, prefix: _getShopTxPrefix(ss, shopName), splits: splits
    });

    // [v7.0] 9열 구조: 단가 스냅샷 포함 / [TASK-005] N개 분할행을 1회 setValues로 배치 삽입
    _appendTxRows(sheet, built.rows);

    CacheManager.invalidateAll();

    const totalSplits = built.splitCount;
    const txIds = built.txIds;
    let message = (totalSplits > 1)
      ? `✅ [${type} 완료] ${totalSplits}개 로트로 분할 저장되었습니다. (거래ID: ${txIds[0]} 외 ${totalSplits - 1}건)`
      : `✅ ${shopName} 입출고 기록 저장 완료 (거래ID: ${txIds[0]})`;
    if (built.overdraftQty > 0) {
      message += ` ⚠️ 가용 로트보다 ${built.overdraftQty} 많이 ${type}되어 초과분은 마스터 단가로 기록되었습니다.`;
    }

    return {
      success: true,
      message: message,
      txId: txIds[0],
      parentTxId: built.parentTxId,
      txIds: txIds,
      splitCount: totalSplits,
      overdraftQty: built.overdraftQty
    };
  } finally {
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════════════════
//  [TASK-019] 입출고 일괄 업로드
// ═══════════════════════════════════════════════════════════════════

/**
 * 웹앱이 CSV/XLSX를 클라이언트에서 파싱해 넘긴 행 배열을 업장 시트에 저장한다.
 *
 * 단건 등록(addTransaction)과 같은 검증·FIFO 분할·행 구조를 그대로 탄다(위 공용 헬퍼).
 *
 * 처리 방식
 *   · options.dryRun = true → 검증만 하고 아무것도 쓰지 않는다(파일 전체, 최대 BULK_TX_MAX_ROWS행).
 *     클라이언트는 먼저 파일 전체를 검증해 오류를 한꺼번에 보여 주고, 전부 통과했을 때만 저장을 시작한다.
 *     그래야 "앞 청크는 저장되고 뒤 청크는 실패"하는 반쪽 업로드가 생기지 않는다.
 *   · 저장 호출은 BULK_TX_CHUNK_SIZE행 이하로 제한한다(GAS 6분 실행 제한 대비).
 *     청크 안에서 오류가 하나라도 있으면 그 청크는 통째로 저장하지 않는다.
 *   · 같은 청크 안의 선행 행이 후행 행의 FIFO에 반영된다 — 입고 뒤 출고가 함께 있으면 그 입고 로트부터 소진한다.
 *     시트는 1회만 읽고 메모리에 누적하므로 행마다 시트를 다시 읽지 않는다(Batch I/O).
 *   · 담당자는 addTransaction과 같이 로그인 사용자(session.name)로 기록한다. 파일의 담당자 열은 무시한다.
 *
 * @param {string} token
 * @param {string} shopName
 * @param {Array<{rowNo?:number, date:string, code:string, type:string, qty:number|string, note?:string}>} rows
 *        rowNo는 파일상의 행 번호(오류 메시지용). 없으면 배열 순번을 쓴다.
 * @param {{dryRun?:boolean}} [options]
 * @return {{success:boolean, message:string, dryRun:boolean, total:number,
 *           errors:Array<{row:number, message:string}>,
 *           saved?:number, rowsWritten?:number, splitCount?:number, overdraftCount?:number}}
 */
function uploadBulkTransactions(token, shopName, rows, options) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (!_canAccessShop(session, shopName)) {
    return { success: false, message: "⛔ 접근할 수 없거나 활성 상태가 아닌 업장입니다." };
  }

  const dryRun = !!(options && options.dryRun);
  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: false, dryRun: dryRun, total: 0, errors: [], message: "❌ 업로드할 행이 없습니다." };
  }
  const limit = dryRun ? BULK_TX_MAX_ROWS : BULK_TX_CHUNK_SIZE;
  if (rows.length > limit) {
    return {
      success: false, dryRun: dryRun, total: rows.length, errors: [],
      message: `❌ 한 번에 최대 ${limit}건까지 처리할 수 있습니다. (요청: ${rows.length}건)`
    };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(shopName);
  if (!sheet) {
    return { success: false, dryRun: dryRun, total: rows.length, errors: [], message: `❌ 업장 '${shopName}'을 찾을 수 없습니다.` };
  }

  const itemInfoMap = _loadItemInfoMap(ss);
  // 마감 기준일은 1회만 조회한다 — 마감 이력이 없는 환경에서 행마다 통합 시트를 풀 스캔하지 않도록
  const closingCutoff = getLatestClosingCutoff(ss);

  // ── 1단계: 전체 검증 (쓰기 없음) ──
  const errors = [];
  const validated = [];
  rows.forEach((raw, i) => {
    const rowNo = (raw && Number(raw.rowNo) > 0) ? Number(raw.rowNo) : (i + 1);
    const base = _normalizeTxInput(raw, { closingCutoff: closingCutoff });
    if (!base.ok) { errors.push({ row: rowNo, message: base.message }); return; }
    const master = _validateTxAgainstMaster(base.value.code, raw.qty, itemInfoMap);
    if (!master.ok) { errors.push({ row: rowNo, message: master.message }); return; }
    validated.push({
      rowNo: rowNo,
      code: base.value.code, type: base.value.type, note: base.value.note, transactionDate: base.value.transactionDate,
      qty: master.value.qty, itemName: master.value.itemName, unitPrice: master.value.unitPrice, itemInfo: master.value.itemInfo
    });
  });

  if (errors.length > 0) {
    return {
      success: false, dryRun: dryRun, total: rows.length, errors: errors,
      message: `❌ ${errors.length}건의 오류가 있어 저장하지 않았습니다. 파일을 수정한 뒤 다시 업로드하세요.`
    };
  }
  if (dryRun) {
    return { success: true, dryRun: true, total: rows.length, errors: [], message: `✅ ${rows.length}건 검증 통과` };
  }

  // ── 2단계: 저장 ──
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, dryRun: false, total: rows.length, errors: [], message: "⏳ 다른 사용자가 작업 중입니다. 잠시 후 다시 시도해주세요." };
  }

  try {
    const prefix = _getShopTxPrefix(ss, shopName);
    const lastRow = sheet.getLastRow();
    const existing = lastRow >= 3 ? sheet.getRange(3, 1, lastRow - 2, TX_COLS).getValues() : [];
    const pending = [];
    let splitRows = 0;
    let overdraftCount = 0;

    validated.forEach(v => {
      const splits = (v.type === "입고")
        ? [{ qty: v.qty, unitPrice: v.unitPrice, lotLabel: "", isOverdraft: false }]
        : _calculateFifoOutboundSplitsFromRows(existing.concat(pending), v.code, v.qty, v.itemInfo);
      const built = _buildTxRows({
        transactionDate: v.transactionDate, code: v.code, itemName: v.itemName, type: v.type,
        qty: v.qty, unitPrice: v.unitPrice, note: v.note,
        personName: session.name, prefix: prefix, splits: splits
      });
      built.rows.forEach(r => pending.push(r));
      if (built.splitCount > 1) splitRows += built.splitCount;
      if (built.overdraftQty > 0) overdraftCount++;
    });

    _appendTxRows(sheet, pending);
    CacheManager.invalidateAll();

    let message = `✅ ${validated.length}건 저장 완료 (시트 ${pending.length}행)`;
    if (splitRows > 0) message += ` · FIFO 로트 분할 포함`;
    if (overdraftCount > 0) message += ` ⚠️ 초과출고 ${overdraftCount}건은 마스터 단가로 기록되었습니다.`;

    return {
      success: true, dryRun: false, total: rows.length, errors: [],
      saved: validated.length, rowsWritten: pending.length,
      splitCount: splitRows, overdraftCount: overdraftCount,
      message: message
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
  // 대상 품목의 과거 입출고 내역만 메모리에서 필터링 (시트 재스캔 1회)
  const lastRow = sheet.getLastRow();
  const rows = lastRow >= 3 ? sheet.getRange(3, 1, lastRow - 2, TX_COLS).getValues() : [];
  return _calculateFifoOutboundSplitsFromRows(rows, code, requestedQty, masterItemInfo);
}

/**
 * [TASK-019] _calculateFifoOutboundSplits의 메모리 버전 — 시트 대신 이미 읽어 둔 행 배열을 받는다.
 * 일괄 업로드가 시트를 1회만 읽고, 같은 청크 안에서 앞서 만든 행(pending)을 이어 붙여
 * 후행 출고의 FIFO에 반영하기 위해 분리했다. 계산 규칙은 그대로다.
 *
 * @param {Array<Array>} rows 업장 시트 3행 이후의 행 배열(TX_COLS 구조). 배열 순서가 같은 날짜 안의 선후를 정한다.
 */
function _calculateFifoOutboundSplitsFromRows(rows, code, requestedQty, masterItemInfo) {
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

  rows.forEach((row, idx) => {
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
