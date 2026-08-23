


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
  if (session.role === ROLES.STAFF && shopName && shopName !== "all") {
    if (!session.assignedShops || !session.assignedShops.includes(shopName)) {
      return [];
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  limit = limit || 50;

  let sheet;
  if (shopName && shopName !== "all") {
    sheet = ss.getSheetByName(shopName);
    if (!sheet) return [];
  } else {
    sheet = ss.getSheetByName(SHEET_INOUT);
  }

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

  // [CR-02 FIX] IDOR 방어: Staff는 자신의 담당 업장만 접근 가능 (복수 업장 배열 검증으로 수정)
  if (session.role === ROLES.STAFF) {
    if (!session.assignedShops || !session.assignedShops.includes(shopName)) {
      return { success: false, message: "⛔ 담당 업장이 아닙니다." };
    }
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

    // [v7.0] 품목코드 유효성 검증 (오기입 방지)
    if (!itemInfoMap[txData.code]) {
      return { success: false, message: "❌ 품목 마스터에 등록되지 않은 품목코드입니다. 등록된 품목을 선택해주세요." };
    }

    // [NF-05 FIX] 수량 유효성 검증: 0 이하 값 차단
    const qty = Number(txData.qty);
    if (!qty || qty <= 0 || !Number.isFinite(qty)) {
      return { success: false, message: "❌ 수량은 0보다 큰 유효한 숫자여야 합니다." };
    }

    const itemName = itemInfoMap[txData.code].name;
    const unitPrice = itemInfoMap[txData.code].price || 0;

  // 거래ID 자동 생성
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  const shopData = shopSheet.getRange(3, 1, shopSheet.getLastRow() - 2, 6).getValues();
  const shopConfig = shopData.find(r => r[1] === shopName && r[3] === "생성완료");
  const prefix = shopConfig ? shopConfig[2] : "XX";

  const tz = Session.getScriptTimeZone();
  const dateStr = Utilities.formatDate(new Date(txData.date), tz, "yyyyMMdd");
  const uniqueSuffix = Utilities.getUuid().replace(/-/g,"").substring(0,8).toUpperCase();
  const txId = `${prefix}-${dateStr}-${uniqueSuffix}`;

  const lastRow = sheet.getLastRow();
  const newRow = Math.max(lastRow + 1, 3);
  
  // [v7.0] 9열 구조: 단가 스냅샷 포함
  sheet.getRange(newRow, 1, 1, TX_COLS).setValues([[
    new Date(txData.date), txData.code, itemName, txData.type,
    Number(txData.qty), unitPrice, // [v7.0] 단가 스냅샷
    txData.person || session.name, txData.note || "", txId
  ]]);
  sheet.getRange(newRow, 1, 1, TX_COLS).setHorizontalAlignment("center");
    sheet.getRange(newRow, 3).setBackground(COLORS.autoBg);  // 품목명
    sheet.getRange(newRow, 6).setBackground(COLORS.autoBg);  // 단가
    sheet.getRange(newRow, 9).setBackground(COLORS.autoBg);  // 거래ID

    CacheManager.invalidateAll();
    return { success: true, message: `✅ ${shopName} 입출고 기록 저장 완료 (거래ID: ${txId})`, txId: txId };
  } finally {
    lock.releaseLock();
  }
}

