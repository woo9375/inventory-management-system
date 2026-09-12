// ═══════════════════════════════════════════════════════════════════
//  [TASK-018] API: 거래처(매입처) 관리 (CRUD)
//
//  조회는 전 로그인 사용자에게 열어 둔다 — 품목 화면 등 다른 모듈이 거래처명을
//  코드로 되찾아야 하기 때문이다. 쓰기(추가/수정/삭제)는 admin 전용.
//
//  거래처코드는 사용자가 적지 않는다. 서버가 VND-001 형식으로 채번한다.
//  품목 마스터가 이름이 아니라 이 코드로만 거래처를 참조하므로(TASK-017),
//  코드가 사람 손을 타면 참조가 통째로 미아가 된다.
// ═══════════════════════════════════════════════════════════════════


/**
 * 거래처 시트를 집어온다. 없으면 null.
 *
 * TASK-017 마이그레이션(v17) 전에는 이 시트가 없다. 그 상태에서 getRange를 부르면
 * "null의 속성을 읽을 수 없습니다" 같은 무의미한 에러가 사용자에게 그대로 뜬다.
 * 호출부가 무엇을 해야 하는지 알 수 있는 메시지로 바꾸기 위해 존재 여부를 여기서 가른다.
 */
function _getVendorSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_VENDORS);
}

/** 시트가 없을 때 전 API가 공유하는 응답 */
function _vendorSheetMissingResponse() {
  return {
    success: false,
    message: "❌ '" + SHEET_VENDORS + "' 시트가 없습니다. 스프레드시트 메뉴에서 스키마 마이그레이션(v17)을 먼저 실행해주세요."
  };
}

/** 시트 행(0-based 배열) → 클라이언트가 쓰는 객체 */
function _vendorRowToObject(row) {
  return {
    code: String(row[VENDOR_COLS.CODE] || "").trim(),
    name: String(row[VENDOR_COLS.NAME] || "").trim(),
    shortName: String(row[VENDOR_COLS.SHORT_NAME] || "").trim(),
    bizNo: String(row[VENDOR_COLS.BIZ_NO] || "").trim(),
    ceo: String(row[VENDOR_COLS.CEO] || "").trim(),
    bizType: String(row[VENDOR_COLS.BIZ_TYPE] || "").trim(),
    bizItem: String(row[VENDOR_COLS.BIZ_ITEM] || "").trim(),
    address: String(row[VENDOR_COLS.ADDRESS] || "").trim(),
    phone: String(row[VENDOR_COLS.PHONE] || "").trim(),
    email: String(row[VENDOR_COLS.EMAIL] || "").trim(),
    bizEntity: String(row[VENDOR_COLS.BIZ_ENTITY] || "").trim(),
    note: String(row[VENDOR_COLS.NOTE] || "").trim(),
    usageStatus: String(row[VENDOR_COLS.USAGE_STATUS] || "").trim() || "사용"
  };
}

/**
 * 거래처 데이터가 실제로 들어찬 마지막 행. 없으면 2(헤더까지).
 *
 * sheet.getLastRow()를 쓰면 안 된다. 이 시트에는 13열 폼 밖 숨김 N열에
 * 드롭다운 소스 FILTER 수식이 들어 있고(TASK-017), 수식 셀도 "내용 있는 행"으로 잡힌다.
 * 거래처가 하나도 없어도 N3 때문에 getLastRow()가 3을 돌려주므로,
 * 그 값으로 추가 위치를 정하면 첫 거래처가 3행을 건너뛰고 4행에 앉는다.
 *
 * [v18] 판정 기준을 A열 단독에서 **A열 또는 B열**로 넓혔다.
 *   초기 거래처는 시트에 직접 붙여넣는 경로를 쓰는데(TASK-017), 그때 거래처코드 열은
 *   비어 있다 — 코드는 나중에 일괄 부여한다. 코드만 보면 그렇게 들어온 수십 행이
 *   통째로 "빈 행"으로 잡혀, 웹앱에서 등록한 새 거래처가 3행부터 그 데이터를 덮어쓴다.
 *   거래처명이 적힌 행은 코드가 없어도 이미 쓰인 행이다.
 */
function _lastVendorRow(sheet) {
  const maxRow = sheet.getMaxRows();
  if (maxRow < 3) return 2;
  const rows = sheet.getRange(3, 1, maxRow - 2, 2).getValues(); // A(코드) · B(거래처명)
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0] || "").trim() || String(rows[i][1] || "").trim()) return i + 3;
  }
  return 2;
}

/** 시트에서 거래처 행 전체를 읽어 객체 배열로 (코드 없는 빈 행 제외) */
function _readVendors(sheet) {
  const lastRow = _lastVendorRow(sheet);
  if (lastRow < 3) return [];
  const rows = sheet.getRange(3, 1, lastRow - 2, VENDOR_COL_COUNT).getValues();
  return rows.filter(function (r) { return String(r[VENDOR_COLS.CODE] || "").trim(); })
             .map(_vendorRowToObject);
}

/**
 * 거래처코드 자동 채번 — 기존 코드 중 가장 큰 번호 + 1.
 *
 * "행 개수 + 1"로 매기지 않는 이유: 중간 행이 삭제되면 이미 쓰인 번호가 다시 나온다.
 * 코드는 품목 마스터가 붙들고 있는 참조 키라 재사용되면 남의 거래처를 가리키게 된다.
 * 자릿수는 3자리로 채우되, 999를 넘으면 자리수를 늘려 계속 증가시킨다.
 */
function _nextVendorCode(existingCodes) {
  return _formatVendorCode(_maxVendorCodeNumber(existingCodes) + 1);
}

/** 코드 문자열 표기 규칙 — 채번(_nextVendorCode)과 일괄 부여(_backfillVendorCodes)가 공유한다 */
function _formatVendorCode(n) {
  return VENDOR_CODE_PREFIX + (n < 1000 ? ("00" + n).slice(-3) : String(n));
}

/** 이미 쓰인 코드 중 가장 큰 번호. 하나도 없으면 0 */
function _maxVendorCodeNumber(existingCodes) {
  let max = 0;
  const pattern = new RegExp("^" + VENDOR_CODE_PREFIX + "(\\d+)$");
  (existingCodes || []).forEach(function (code) {
    const m = pattern.exec(String(code || "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}

/** 이름 비교용 정규화 — 앞뒤 공백과 대소문자 차이로 중복을 놓치지 않는다 */
function _normalizeVendorName(name) {
  return String(name || "").trim().toLowerCase();
}

/**
 * 거래처 목록 조회. 모든 로그인 사용자 호출 가능.
 * 미사용 거래처도 함께 돌려준다 — 화면의 사용여부 필터가 클라이언트에서 걸린다.
 */
function getVendorList(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };

  const cached = CacheManager.get(CACHE_KEYS.VENDOR_LIST);
  if (cached) return { success: true, vendors: cached, userRole: session.role };

  const sheet = _getVendorSheet();
  if (!sheet) return _vendorSheetMissingResponse();

  const vendors = _readVendors(sheet);
  CacheManager.set(CACHE_KEYS.VENDOR_LIST, vendors);
  return { success: true, vendors: vendors, userRole: session.role };
}

/**
 * 거래처 신규 등록. admin 전용.
 * 코드는 서버가 채번하므로 클라이언트가 보낸 code 값은 무시한다.
 */
function addVendorRecord(token, data) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const payload = data || {};
  const name = String(payload.name || "").trim();
  if (!name) return { success: false, message: "거래처명은 필수입니다." };

  // 채번과 중복 검사는 "읽고 나서 쓴다". 두 사용자가 동시에 등록하면 같은 번호가 나가므로 잠근다.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "⏳ 다른 사용자가 작업 중입니다. 잠시 후 다시 시도해주세요." };
  }

  try {
    const sheet = _getVendorSheet();
    if (!sheet) return _vendorSheetMissingResponse();

    const vendors = _readVendors(sheet);
    const duplicate = vendors.find(function (v) {
      return _normalizeVendorName(v.name) === _normalizeVendorName(name);
    });
    if (duplicate) {
      return { success: false, message: "❌ 이미 등록된 거래처명입니다. (" + duplicate.code + ")" };
    }

    const code = _nextVendorCode(vendors.map(function (v) { return v.code; }));

    const newRow = new Array(VENDOR_COL_COUNT).fill("");
    newRow[VENDOR_COLS.CODE] = code;
    newRow[VENDOR_COLS.NAME] = name;
    newRow[VENDOR_COLS.SHORT_NAME] = String(payload.shortName || "").trim();
    newRow[VENDOR_COLS.BIZ_NO] = String(payload.bizNo || "").trim();
    newRow[VENDOR_COLS.CEO] = String(payload.ceo || "").trim();
    newRow[VENDOR_COLS.BIZ_TYPE] = String(payload.bizType || "").trim();
    newRow[VENDOR_COLS.BIZ_ITEM] = String(payload.bizItem || "").trim();
    newRow[VENDOR_COLS.ADDRESS] = String(payload.address || "").trim();
    newRow[VENDOR_COLS.PHONE] = String(payload.phone || "").trim();
    newRow[VENDOR_COLS.EMAIL] = String(payload.email || "").trim();
    newRow[VENDOR_COLS.BIZ_ENTITY] = VENDOR_BIZ_ENTITIES.indexOf(payload.bizEntity) >= 0 ? payload.bizEntity : "";
    newRow[VENDOR_COLS.NOTE] = String(payload.note || "").trim();
    newRow[VENDOR_COLS.USAGE_STATUS] = payload.usageStatus === "미사용" ? "미사용" : "사용";

    // 시트 끝을 넘겨 쓰면 setValues가 범위 밖을 가리켜 실패한다(TASK-016과 같은 사고).
    const targetRow = Math.max(_lastVendorRow(sheet) + 1, 3);
    _ensureMinRows(sheet, targetRow);
    sheet.getRange(targetRow, 1, 1, VENDOR_COL_COUNT).setValues([newRow]);

    CacheManager.invalidateAll();
    return { success: true, message: "✅ 거래처 '" + name + "' 등록 완료 (" + code + ")", code: code };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 거래처 수정. admin 전용.
 * 거래처코드는 바꾸지 않는다 — 품목 마스터가 그 코드로 참조 중이다.
 */
function updateVendorRecord(token, code, data) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const targetCode = String(code || "").trim();
  if (!targetCode) return { success: false, message: "거래처코드가 없습니다." };

  const payload = data || {};
  const name = String(payload.name || "").trim();
  if (!name) return { success: false, message: "거래처명은 필수입니다." };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "⏳ 다른 사용자가 작업 중입니다. 잠시 후 다시 시도해주세요." };
  }

  try {
    const sheet = _getVendorSheet();
    if (!sheet) return _vendorSheetMissingResponse();

    const lastRow = _lastVendorRow(sheet);
    if (lastRow < 3) return { success: false, message: "❌ 거래처를 찾을 수 없습니다." };

    const rows = sheet.getRange(3, 1, lastRow - 2, VENDOR_COL_COUNT).getValues();
    let targetIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][VENDOR_COLS.CODE] || "").trim() === targetCode) { targetIdx = i; break; }
    }
    if (targetIdx === -1) return { success: false, message: "❌ 거래처를 찾을 수 없습니다." };

    // 이름 중복 검사에서 자기 자신은 빼야 한다. 이름을 그대로 두고 전화만 고치는 수정이 막히면 안 된다.
    for (let i = 0; i < rows.length; i++) {
      if (i === targetIdx) continue;
      if (!String(rows[i][VENDOR_COLS.CODE] || "").trim()) continue;
      if (_normalizeVendorName(rows[i][VENDOR_COLS.NAME]) === _normalizeVendorName(name)) {
        return { success: false, message: "❌ 이미 등록된 거래처명입니다. (" + rows[i][VENDOR_COLS.CODE] + ")" };
      }
    }

    const updated = rows[targetIdx].slice();
    updated[VENDOR_COLS.CODE] = targetCode; // 코드는 고정
    updated[VENDOR_COLS.NAME] = name;
    updated[VENDOR_COLS.SHORT_NAME] = String(payload.shortName || "").trim();
    updated[VENDOR_COLS.BIZ_NO] = String(payload.bizNo || "").trim();
    updated[VENDOR_COLS.CEO] = String(payload.ceo || "").trim();
    updated[VENDOR_COLS.BIZ_TYPE] = String(payload.bizType || "").trim();
    updated[VENDOR_COLS.BIZ_ITEM] = String(payload.bizItem || "").trim();
    updated[VENDOR_COLS.ADDRESS] = String(payload.address || "").trim();
    updated[VENDOR_COLS.PHONE] = String(payload.phone || "").trim();
    updated[VENDOR_COLS.EMAIL] = String(payload.email || "").trim();
    updated[VENDOR_COLS.BIZ_ENTITY] = VENDOR_BIZ_ENTITIES.indexOf(payload.bizEntity) >= 0 ? payload.bizEntity : "";
    updated[VENDOR_COLS.NOTE] = String(payload.note || "").trim();
    updated[VENDOR_COLS.USAGE_STATUS] = payload.usageStatus === "미사용" ? "미사용" : "사용";

    sheet.getRange(targetIdx + 3, 1, 1, VENDOR_COL_COUNT).setValues([updated]);

    CacheManager.invalidateAll();
    return { success: true, message: "✅ 거래처 '" + name + "' 수정 완료" };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 품목 마스터에서 이 거래처를 참조 중인 품목을 찾는다.
 *
 * @return {{ok: boolean, message: string, items: Array}} ok=false면 판정 자체가 불가능한 상태다.
 *
 * 판정 불가를 "참조 없음"으로 뭉개지 않는 이유: 이 함수의 답이 물리 삭제를 허가한다.
 * 마이그레이션 전 시트에서 MASTER_COLS.VENDOR_CODE(18)는 거래처코드가 아니라 과세구분 열이라
 * 언제나 "참조 없음"이 나오고, 그 답을 믿으면 사용 중인 거래처가 지워진다.
 */
function _findItemsUsingVendor(code) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  if (!masterSheet) {
    return { ok: false, message: "❌ 품목 마스터 시트가 없어 거래처 사용 여부를 확인할 수 없습니다.", items: [] };
  }
  if (!_isMasterSchemaCurrent(masterSheet)) {
    return {
      ok: false,
      items: [],
      message: "❌ 품목 마스터가 아직 거래처코드 열이 없는 구조입니다. " +
               "사용 중인 거래처를 지울 위험이 있어 삭제를 중단했습니다. " +
               "스프레드시트 메뉴에서 스키마 마이그레이션(v17)을 먼저 실행해주세요."
    };
  }

  const lastRow = masterSheet.getLastRow();
  if (lastRow < 3) return { ok: true, message: "", items: [] };

  const rows = masterSheet.getRange(3, 1, lastRow - 2, MASTER_COL_COUNT).getValues();
  const items = [];
  rows.forEach(function (r) {
    if (!r[MASTER_COLS.CODE]) return;
    if (String(r[MASTER_COLS.VENDOR_CODE] || "").trim() !== code) return;
    items.push({ code: r[MASTER_COLS.CODE], name: r[MASTER_COLS.NAME] });
  });
  return { ok: true, message: "", items: items };
}

/**
 * 거래처 삭제. admin 전용.
 *
 * 품목 마스터가 참조 중이면 물리 삭제를 거절한다(논리 삭제로 유도).
 * 행을 지워 버리면 그 품목의 거래처코드가 어디도 가리키지 않는 미아가 되기 때문이다.
 */
function deleteVendorRecord(token, code) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const targetCode = String(code || "").trim();
  if (!targetCode) return { success: false, message: "거래처코드가 없습니다." };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "⏳ 다른 사용자가 작업 중입니다. 잠시 후 다시 시도해주세요." };
  }

  try {
    const sheet = _getVendorSheet();
    if (!sheet) return _vendorSheetMissingResponse();

    const lastRow = _lastVendorRow(sheet);
    if (lastRow < 3) return { success: false, message: "❌ 거래처를 찾을 수 없습니다." };

    const rows = sheet.getRange(3, 1, lastRow - 2, VENDOR_COL_COUNT).getValues();
    let targetIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][VENDOR_COLS.CODE] || "").trim() === targetCode) { targetIdx = i; break; }
    }
    if (targetIdx === -1) return { success: false, message: "❌ 거래처를 찾을 수 없습니다." };

    const usage = _findItemsUsingVendor(targetCode);
    if (!usage.ok) return { success: false, message: usage.message };

    if (usage.items.length > 0) {
      const sample = usage.items.slice(0, 5)
        .map(function (i) { return i.code + " " + i.name; })
        .join(", ");
      return {
        success: false,
        message: "❌ 이 거래처를 사용 중인 품목이 " + usage.items.length + "건 있어 삭제할 수 없습니다.\n" +
                 "품목: " + sample + (usage.items.length > 5 ? " 외 " + (usage.items.length - 5) + "건" : "") + "\n" +
                 "거래를 끊으시려면 사용여부를 '미사용'으로 바꿔주세요.",
        inUse: true,
        itemCount: usage.items.length
      };
    }

    const vendorName = String(rows[targetIdx][VENDOR_COLS.NAME] || "").trim();
    sheet.deleteRow(targetIdx + 3);

    // 행을 지우면 그 행의 **모든** 셀이 사라진다. 3행을 지웠다면 숨김 N열(N3)에 들어 있던
    // 드롭다운 소스 FILTER 수식까지 함께 날아가고, 품목 마스터의 거래처 드롭다운이 통째로 빈다.
    // applyVendorsFormatting은 수식이 없거나 어긋났을 때만 다시 세우므로 여기서 부르면 복구된다.
    applyVendorsFormatting(sheet);

    CacheManager.invalidateAll();
    return { success: true, message: "✅ 거래처 '" + (vendorName || targetCode) + "' 삭제 완료" };
  } finally {
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════════════════
//  [v18] 거래처코드 일괄 부여
//
//  초기 거래처(DEV 59건)는 시트에 직접 붙여넣는다 — 웹앱 폼으로 수십 건을 치는 것보다
//  그편이 빠르기 때문이다. 그런데 거래처코드는 사람이 정하는 값이 아니라 서버 채번 값이라
//  붙여넣기 경로에는 코드를 채워 주는 손이 없다. 코드가 빈 행은
//    · 웹앱 목록에서 아예 보이지 않고(_readVendors가 코드 없는 행을 거른다),
//    · 품목 마스터가 참조할 수단이 없으며,
//    · 드롭다운 소스 FILTER에도 걸리지 않는다.
//  그 손을 여기서 대신한다. 재실행해도 이미 있는 코드는 건드리지 않는다(멱등).
// ═══════════════════════════════════════════════════════════════════

/**
 * 거래처명이 있는데 거래처코드가 빈 행에 VND-NNN을 위에서부터 순서대로 부여한다.
 *
 * 이미 부여된 코드는 절대 다시 쓰지 않는다 — 품목 마스터가 붙들고 있는 참조 키라
 * 번호가 하나라도 바뀌면 그 품목이 남의 거래처를 가리키게 된다.
 * 번호는 시트에 남아 있는 가장 큰 번호 다음부터 이어 붙인다(삭제된 번호 재사용 금지).
 *
 * @returns {{assigned: number, total: number, firstCode: string, lastCode: string}}
 */
function _backfillVendorCodes(sheet) {
  const lastRow = _lastVendorRow(sheet);
  if (lastRow < 3) return { assigned: 0, total: 0, firstCode: "", lastCode: "" };

  const count = lastRow - 2;
  const rows = sheet.getRange(3, 1, count, 2).getValues(); // A(코드) · B(거래처명)
  const codes = rows.map(function (r) { return String(r[0] || "").trim(); });

  let seq = _maxVendorCodeNumber(codes);
  let assigned = 0, firstCode = "", lastCode = "";

  const out = rows.map(function (r, i) {
    if (codes[i]) return [codes[i]];                 // 이미 있는 코드는 그대로 되쓴다
    if (!String(r[1] || "").trim()) return [""];     // 거래처명도 없는 행은 빈 행이다
    seq += 1;
    assigned += 1;
    const code = _formatVendorCode(seq);
    if (!firstCode) firstCode = code;
    lastCode = code;
    return [code];
  });

  if (assigned > 0) {
    sheet.getRange(3, VENDOR_COLS.CODE + 1, count, 1).setValues(out);
    try {
      if (typeof CacheManager !== "undefined" && CacheManager.invalidateAll) CacheManager.invalidateAll();
    } catch (e) {
      console.log("[v18] 거래처 캐시 무효화 실패(코드 부여는 완료): " + e.message);
    }
  }
  return { assigned: assigned, total: count, firstCode: firstCode, lastCode: lastCode };
}

/**
 * [v18] 스프레드시트 관리자 메뉴 진입점 — 시트에 붙여넣은 거래처에 코드를 채운다.
 *
 * 마이그레이션(v18)도 같은 일을 하지만 그건 한 번만 돈다. 거래처를 나중에 또
 * 한꺼번에 붙여넣는 일이 있으므로(Production 초기 입력이 그렇다) 손으로 부를 길을 남긴다.
 */
// [TASK-023] isSilent=true면 알림창 대신 { success, message }를 돌려준다 (시트 대화상자용). 채번 로직은 그대로다.
function assignMissingVendorCodes(isSilent = false) {
  const notify = (result, icon) => {
    if (!isSilent) SpreadsheetApp.getUi().alert(icon + " " + result.message);
    return result;
  };
  const sheet = _getVendorSheet();
  if (!sheet) {
    return notify({ success: false, message: "'" + SHEET_VENDORS + "' 시트가 없습니다.\n스프레드시트 메뉴에서 스키마 마이그레이션을 먼저 실행해주세요." }, "❌");
  }
  try {
    const r = _backfillVendorCodes(sheet);
    SpreadsheetApp.flush();
    if (r.assigned === 0) {
      return notify({ success: true, message: "거래처코드가 비어 있는 행이 없습니다.\n(검사한 행: " + r.total + "행)" }, "✅");
    }
    return notify({
      success: true,
      message:
        "거래처코드 " + r.assigned + "건 부여 완료\n\n" +
        "부여한 코드: " + r.firstCode + " ~ " + r.lastCode + "\n" +
        "검사한 행: " + r.total + "행\n\n" +
        "한 번 부여한 코드는 바꾸지 마세요 — 품목 마스터가 거래처명이 아니라 이 코드로 거래처를 참조합니다."
    }, "✅");
  } catch (err) {
    console.error("[v18] 거래처코드 부여 실패: " + err.message + "\n" + err.stack);
    return notify({ success: false, message: "거래처코드 부여 중 오류가 발생했습니다:\n" + err.message }, "❌");
  }
}