


// ═══════════════════════════════════════════════════════════════════
//  API: 품목 마스터
//
//  [TASK-024] 쓰기 경로(addNewItem · updateItem · disableItemMaster · uploadItemMasterCSV)는 전부
//    검증(_validateItemFields) → 마스터 쓰기 → 이력(_appendChangelog) → 이력 실패 시 마스터 되돌림
//  순서를 지킨다. 이력 없이 마스터만 바뀐 상태를 남기지 않기 위해서다. 시트 드롭다운이 막아 주던
//  카테고리·단위·거래처·과세 검증을 웹앱 경로에서는 API가 맡는다 (구매팀은 시트를 뷰어로만 본다).
// ═══════════════════════════════════════════════════════════════════

/**
 * 품목 목록. 기본은 '미사용' 제외(기존 호출부 — 기초데이터·입출고 화면 — 의 계약).
 * [TASK-024] options.includeDisabled=true면 미사용까지 돌려준다 (품목 관리 화면용). 캐시 키도 따로 둔다.
 */
function getItemMasterData(token, options) {
  const session = validateSession(token);
  if (!session) return [];

  const includeDisabled = !!(options && options.includeDisabled);
  const CACHE_KEY = includeDisabled ? 'ITEM_MASTER_DATA_ALL' : 'ITEM_MASTER_DATA';
  let items = CacheManager.get(CACHE_KEY);
  if (items) return items;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  if (masterLastRow < 3) return [];

  const data = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();
  items = [];

  data.forEach(row => {
    if (!row[MASTER_COLS.CODE]) return;
    // 상태(사용여부)가 '미사용'인 품목은 제외
    if (!includeDisabled && row[MASTER_COLS.USAGE_STATUS] === '미사용') return;

    items.push({
      code: row[MASTER_COLS.CODE], name: row[MASTER_COLS.NAME], category: row[MASTER_COLS.CATEGORY],
      grade: row[MASTER_COLS.GRADE], unit: row[MASTER_COLS.UNIT],
      initStock: row[MASTER_COLS.INIT_STOCK], currentStock: row[MASTER_COLS.CURRENT_STOCK],
      dailyUsage: row[MASTER_COLS.DAILY_USAGE],
      leadTime: row[MASTER_COLS.LEAD_TIME], safetyDays: row[MASTER_COLS.SAFETY_DAYS],
      targetDays: row[MASTER_COLS.TARGET_DAYS],
      safetyStock: row[MASTER_COLS.SAFETY_STOCK], rop: row[MASTER_COLS.ROP],
      orderQty: row[MASTER_COLS.ORDER_QTY], status: row[MASTER_COLS.STATUS],
      vendorCode: row[MASTER_COLS.VENDOR_CODE], // [TASK-017] 거래처명이 아니라 코드만 실어 보낸다
      taxType: row[MASTER_COLS.TAX_TYPE], unitPrice: row[MASTER_COLS.UNIT_PRICE],
      supplyPrice: row[MASTER_COLS.SUPPLY_PRICE],
      taxAmount: row[MASTER_COLS.TAX_AMOUNT], totalValue: row[MASTER_COLS.TOTAL_VALUE],
      usageStatus: row[MASTER_COLS.USAGE_STATUS] || "사용" // [TASK-024] 관리 화면이 사용/미사용을 구분해 보여준다
    });
  });

  CacheManager.set(CACHE_KEY, items);
  return items;
}



function getItemCodes(token) {
  const session = validateSession(token);
  if (!session) return [];

  const CACHE_KEY = 'ITEM_CODES';
  let codes = CacheManager.get(CACHE_KEY);
  if (codes) return codes;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  if (masterLastRow < 3) return [];

  const data = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();
  codes = data.filter(r => r[MASTER_COLS.CODE] && r[MASTER_COLS.USAGE_STATUS] !== '미사용').map(r => ({ code: r[MASTER_COLS.CODE], name: r[MASTER_COLS.NAME] }));

  CacheManager.set(CACHE_KEY, codes);
  return codes;
}



// [v9.0] 서버 사이드 품목 검색 API (대량 데이터 전송 없이 서버에서 필터링)
function searchItemCodes(token, query) {
  const session = validateSession(token);
  if (!session) return [];
  if (!query || query.trim().length < 1) return [];

  const q = query.toLowerCase().trim();

  // 캐시된 전체 리스트가 있으면 그것을 사용
  const CACHE_KEY = 'ITEM_CODES';
  let allCodes = CacheManager.get(CACHE_KEY);

  if (!allCodes) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(SHEET_MASTER);
    const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
    if (masterLastRow < 3) return [];

    const data = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();
    allCodes = data.filter(r => r[MASTER_COLS.CODE] && r[MASTER_COLS.USAGE_STATUS] !== '미사용').map(r => ({ code: r[MASTER_COLS.CODE], name: r[MASTER_COLS.NAME] }));
    CacheManager.set(CACHE_KEY, allCodes);
  }

  // 서버에서 필터링 후 상위 15건만 반환
  const matches = allCodes.filter(function(item) {
    return item.name.toLowerCase().indexOf(q) > -1 || item.code.toLowerCase().indexOf(q) > -1;
  }).slice(0, 15);

  return matches;
}



// ═══════════════════════════════════════════════════════════════════
//  [TASK-024] 공통 헬퍼 — 검증 · 행 조립 · 변경이력
// ═══════════════════════════════════════════════════════════════════

const ITEM_BUSY_MESSAGE = "⏳ 다른 사용자가 작업 중입니다. 잠시 후 다시 시도해주세요.";

/** 문자열 정규화 — null/undefined는 빈 문자열, 나머지는 trim */
function _itemStr(v) {
  return (v === undefined || v === null) ? "" : String(v).trim();
}

/**
 * 검증에 쓰는 허용 목록. 시트 드롭다운(applyItemMasterFormatting)이 보는 것과 같은 소스다:
 *   카테고리 = 📂 기초데이터 C열, 단위 = B열, 거래처코드 = 🤝 거래처관리에서 사용 중인 코드.
 * 호출마다 시트를 읽는다(배치 2회). 캐시를 두면 기초데이터·거래처를 고친 직후 낡은 목록으로 거절하는 결함이 생긴다.
 */
function _loadItemCatalog(ss) {
  const categories = new Set();
  const units = new Set();
  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  if (baseSheet) {
    const last = Math.max(baseSheet.getLastRow(), 3);
    baseSheet.getRange(3, 2, last - 2, 2).getValues().forEach(function (r) { // B 단위 · C 카테고리
      const unit = _itemStr(r[0]); if (unit) units.add(unit);
      const cat = _itemStr(r[1]); if (cat) categories.add(cat);
    });
  }

  const vendorCodes = new Set();
  const vendorSheet = ss.getSheetByName(SHEET_VENDORS);
  if (vendorSheet && typeof _readVendors === "function") {
    _readVendors(vendorSheet).forEach(function (v) { if (v.usageStatus !== "미사용") vendorCodes.add(v.code); });
  }
  return { categories: categories, units: units, vendorCodes: vendorCodes };
}

/**
 * 품목 필드 검증 + 정규화. 추가·수정·CSV가 같은 규칙을 탄다.
 *
 * @param {Object} fields  API 필드명 키 — code, name, category, grade, unit, initStock, leadTime, safetyDays,
 *                         targetDays, vendorCode, taxType, unitPrice, usageStatus
 * @param {{partial?: boolean, catalog?: Object, existingCodes?: Set}} options
 *   partial=true(수정)면 fields에 **있는 키만** 검사한다. false(등록)면 전 필드를 검사하고 빈 값에 기본값을 넣는다.
 *   existingCodes가 있으면 code 중복을 거절한다.
 * @returns {{valid: boolean, message?: string, values?: Object}}  values = 시트에 쓸 정규화 값
 */
function _validateItemFields(fields, options) {
  const o = options || {};
  const partial = !!o.partial;
  const catalog = o.catalog || _loadItemCatalog(SpreadsheetApp.getActiveSpreadsheet());
  const f = fields || {};
  const has = function (k) { return !partial || Object.prototype.hasOwnProperty.call(f, k); };
  const fail = function (m) { return { valid: false, message: m }; };
  const values = {};

  if (has("code")) {
    const code = _itemStr(f.code);
    if (!code) return fail("품목코드를 입력해주세요.");
    if (o.existingCodes && o.existingCodes.has(code)) return fail("품목코드 '" + code + "'는 이미 존재합니다.");
    values.code = code;
  }
  if (has("name")) {
    const name = _itemStr(f.name);
    if (!name) return fail("품목명을 입력해주세요.");
    values.name = name;
  }
  if (has("category")) {
    const cat = _itemStr(f.category);
    if (!cat) return fail("카테고리를 선택해주세요.");
    if (!catalog.categories.has(cat)) return fail("카테고리 '" + cat + "'는 기초데이터에 없습니다.");
    values.category = cat;
  }
  if (has("grade")) values.grade = _itemStr(f.grade);
  if (has("unit")) {
    const unit = _itemStr(f.unit);
    if (!unit) return fail("단위를 선택해주세요.");
    if (!catalog.units.has(unit)) return fail("단위 '" + unit + "'는 기초데이터에 없습니다.");
    values.unit = unit;
  }
  if (has("vendorCode")) {
    // 거래처는 선택 입력이다 — 빈 값 허용, 있으면 사용 중인 거래처여야 한다
    const vc = _itemStr(f.vendorCode);
    if (vc && !catalog.vendorCodes.has(vc)) return fail("거래처코드 '" + vc + "'는 거래처관리에 없거나 미사용입니다.");
    values.vendorCode = vc;
  }
  if (has("taxType")) {
    const tax = _itemStr(f.taxType) || ITEM_TAX_TYPES[0];
    if (ITEM_TAX_TYPES.indexOf(tax) === -1) return fail("과세구분은 " + ITEM_TAX_TYPES.join("/") + " 중 하나여야 합니다.");
    values.taxType = tax;
  }
  const numericKeys = Object.keys(ITEM_NUMERIC_DEFAULTS);
  for (let i = 0; i < numericKeys.length; i++) {
    const k = numericKeys[i];
    if (!has(k)) continue;
    const raw = f[k];
    if (_itemStr(raw) === "") { values[k] = ITEM_NUMERIC_DEFAULTS[k]; continue; } // 빈 값 → 기본값
    const n = Number(raw);
    if (!isFinite(n) || n < 0) return fail(MASTER_FIELD_LABELS[k] + "은(는) 0 이상의 숫자여야 합니다.");
    values[k] = n;
  }
  if (has("usageStatus")) {
    const us = _itemStr(f.usageStatus) || ITEM_USAGE_STATUSES[0];
    if (ITEM_USAGE_STATUSES.indexOf(us) === -1) return fail("사용유무는 " + ITEM_USAGE_STATUSES.join("/") + " 중 하나여야 합니다.");
    values.usageStatus = us;
  }
  return { valid: true, values: values };
}

/** 정규화된 값 → 마스터 25열 행. 수식 열은 빈 값(ARRAYFORMULA가 채운다). */
function _buildMasterRow(v) {
  const row = new Array(MASTER_COL_COUNT).fill("");
  row[MASTER_COLS.CODE] = v.code;
  row[MASTER_COLS.NAME] = v.name;
  row[MASTER_COLS.CATEGORY] = v.category;
  row[MASTER_COLS.GRADE] = v.grade || "";
  row[MASTER_COLS.UNIT] = v.unit;
  row[MASTER_COLS.INIT_STOCK] = v.initStock;
  row[MASTER_COLS.CURRENT_STOCK] = v.initStock; // 현재고 = 초기재고로 시작 (recalcStockAndUsage가 이후 갱신)
  row[MASTER_COLS.DAILY_USAGE] = 0;
  row[MASTER_COLS.LEAD_TIME] = v.leadTime;
  row[MASTER_COLS.SAFETY_DAYS] = v.safetyDays;
  row[MASTER_COLS.TARGET_DAYS] = v.targetDays;
  row[MASTER_COLS.VENDOR_CODE] = v.vendorCode || "";
  row[MASTER_COLS.TAX_TYPE] = v.taxType;
  row[MASTER_COLS.UNIT_PRICE] = v.unitPrice;
  row[MASTER_COLS.USAGE_STATUS] = v.usageStatus || ITEM_USAGE_STATUSES[0];
  return row;
}

/**
 * 품목코드(A열)가 있는 마지막 행. getLastRow()는 시트 끝까지 흐르는 ARRAYFORMULA 탓에
 * 빈 행을 포함할 수 있어 쓰지 않는다. 데이터가 없으면 2(헤더).
 */
function _findMasterLastRow(masterSheet) {
  const maxRows = masterSheet.getMaxRows();
  if (maxRows < 3) return 2;
  const codes = masterSheet.getRange(3, 1, maxRows - 2, 1).getValues();
  for (let i = codes.length - 1; i >= 0; i--) {
    if (_itemStr(codes[i][0]) !== "") return i + 3;
  }
  return 2;
}

/** 마스터에 있는 품목코드 집합 (문자열) */
function _existingMasterCodes(masterSheet, lastRow) {
  const codes = new Set();
  if (lastRow >= 3) {
    masterSheet.getRange(3, 1, lastRow - 2, 1).getValues().forEach(function (r) {
      const c = _itemStr(r[0]); if (c) codes.add(c);
    });
  }
  return codes;
}

/**
 * [TASK-024] 마스터에 사람이 쓰는 데이터 열 블록 — [시작열(0-based), 열 수].
 * 수식 열(N~Q, V~X)과 스페이서(F, J, R)는 뺀다. ARRAYFORMULA는 **3행**에 살기 때문에 25열을 통째로 쓰면
 * 3행을 건드리는 순간 수식이 사라진다 — 마스터에 행을 쓰는 모든 코드는 이 블록으로만 쓴다.
 * X(재고 합계금액)는 StockEngine이 행별 값으로 쓰는 열이라 여기 없다 — 행이 움직이면 recalcStockAndUsage로 맞춘다.
 */
const MASTER_DATA_BLOCKS = [
  [MASTER_COLS.CODE, 5],          // A:E 코드·품목명·카테고리·규격·단위
  [MASTER_COLS.INIT_STOCK, 7],    // G:M 초기재고·현재고·일평균·(J 스페이서)·리드타임·안전재고일수·목표유지일수
  [MASTER_COLS.VENDOR_CODE, 3],   // S:U 거래처코드·과세구분·매입단가
  [MASTER_COLS.USAGE_STATUS, 1]   // Y   사용유무
];

/** 25열 행 배열(들)을 데이터 블록 단위로 쓴다 (블록당 setValues 1회 = 총 4회). 수식 열은 건드리지 않는다. */
function _writeMasterRows(masterSheet, startRow, rows) {
  MASTER_DATA_BLOCKS.forEach(function (b) {
    const values = rows.map(function (r) { return r.slice(b[0], b[0] + b[1]); });
    masterSheet.getRange(startRow, b[0] + 1, rows.length, b[1]).setValues(values);
  });
}

/** 데이터 블록만 비운다 — 등록/CSV 되돌리기용. clearContent를 25열에 걸면 3행 수식까지 지운다. */
function _clearMasterRows(masterSheet, startRow, numRows) {
  MASTER_DATA_BLOCKS.forEach(function (b) {
    masterSheet.getRange(startRow, b[0] + 1, numRows, b[1]).clearContent();
  });
}

/**
 * 마스터 끝에 행을 덧붙인다 (행 확충 포함). 검증·중복 검사는 호출자가 끝낸 뒤다.
 * @returns {number} 첫 번째로 쓴 행 번호 — 이력 기록이 실패하면 호출자가 이 행부터 되돌린다
 */
function _appendMasterRows(masterSheet, rows) {
  const lastRow = _findMasterLastRow(masterSheet);
  const startRow = lastRow + 1;
  // [TASK-016] 남은 행보다 많이 쓰면 setValues가 시트 밖을 가리켜 실패한다 — 먼저 확충
  _ensureMinRows(masterSheet, lastRow + rows.length);
  _writeMasterRows(masterSheet, startRow, rows);
  return startRow;
}

/** 등록 이력 1건 — 필드가 아니라 "품목이 생겼다"는 사건이므로 E열은 CHANGELOG_NEW_ITEM_FIELD */
function _newItemRecord(v) {
  return { itemCode: v.code, itemName: v.name, fieldName: CHANGELOG_NEW_ITEM_FIELD, oldValue: "-", newValue: v.name };
}

/** 변경이력 시트. 없으면 throw — 이력을 못 남기는 쓰기는 하지 않는다. */
function _requireChangelogSheet(ss) {
  const sheet = ss.getSheetByName(SHEET_CHANGELOG);
  if (!sheet) throw new Error("변경이력 시트(" + SHEET_CHANGELOG + ")가 없어 작업을 중단했습니다.");
  return sheet;
}

/**
 * [TASK-024] 변경이력 기록 — 마스터에 쓰는 모든 경로가 이 한 곳을 거친다.
 *
 * @param {Array<{itemCode, itemName, fieldName, oldValue, newValue}>} records
 * @param {{actor: string, route: string, reason?: string, when?: Date}} options
 *   route는 CHANGELOG_ROUTES 값. reason은 사람이 적은 사유(없으면 빈 값).
 * @returns {number} 기록한 행 수
 *
 * 실패하면 throw한다 — 호출자는 잡아서 마스터를 되돌린다.
 * 락은 잡지 않는다: 호출자가 이미 ScriptLock 안에 있다(addNewItem·updateItem·CSV·onEdit 모두). 같은 실행이
 * 락을 두 번 잡는 재진입 동작에 기대지 않기 위해서다.
 */
function _appendChangelog(records, options) {
  if (!records || records.length === 0) return 0;
  const o = options || {};
  const sheet = _requireChangelogSheet(SpreadsheetApp.getActiveSpreadsheet());
  const when = o.when || new Date();
  const actor = o.actor || "시스템";
  const route = o.route || CHANGELOG_ROUTES.WEBAPP;
  const reason = _itemStr(o.reason);
  const cell = function (v) { return (v === undefined || v === null) ? "" : v; };

  const rows = records.map(function (r) {
    return [when, actor, cell(r.itemCode), cell(r.itemName), cell(r.fieldName), cell(r.oldValue), cell(r.newValue), reason, route];
  });

  _ensureMinColumns(sheet, CHANGELOG_COL_COUNT); // v19 이전 시트(7열)에서도 죽지 않는다
  const startRow = Math.max(sheet.getLastRow() + 1, 3);
  _ensureMinRows(sheet, startRow + rows.length - 1);
  sheet.getRange(startRow, 1, rows.length, CHANGELOG_COL_COUNT).setValues(rows)
       .setHorizontalAlignment("center").setBackground(COLORS.autoBg);
  sheet.getRange(startRow, 1, rows.length, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  return rows.length;
}

/** 시트 값 비교 — 숫자 3과 "3", 빈 값과 null을 같은 것으로 본다 */
function _sameCellValue(a, b) {
  const s = function (v) { return (v === undefined || v === null) ? "" : String(v); };
  return s(a) === s(b);
}

/** 마스터 구조가 v17(25열)이 아니면 쓰지 않는다 — 코드 배포와 마이그레이션 사이 창에서 열이 밀린 채 쓰는 사고 방지 */
function _masterSchemaFailure(masterSheet, where) {
  if (_isMasterSchemaCurrent(masterSheet)) return null;
  _warnMasterSchemaStale(where);
  return { success: false, message: "❌ 품목 마스터 구조가 최신이 아닙니다. 스키마 마이그레이션을 먼저 실행해주세요." };
}



// ═══════════════════════════════════════════════════════════════════
//  [TASK-025] 품목 관리 화면 — 서버 페이징 조회
//
//  마스터는 4,300행이라 화면에 통째로 내리면 전송만 2.6초다(TASK-027 실측). 대신 "사람이 고치는 필드"만 추린
//  인덱스(ITEM_INDEX)를 캐시에 두고, 검색·카테고리·사용유무 필터와 정렬을 서버에서 끝낸 뒤 한 페이지(25건)만 돌려준다.
//  인덱스는 미사용 품목까지 담는다(관리 화면은 사용/미사용을 오간다). 한 행이 수정 모달을 채울 만큼의 필드를
//  들고 있어서, 수정을 눌렀을 때 서버를 다시 부르지 않는다.
//
//  콜드 미스는 마스터 1회 스캔(1.8초)이다. 등록·수정 직후에는 invalidateAll이 지운 인덱스를 같은 요청 안에서 다시
//  채워 둔다(_refreshItemIndexAfterWrite) — 저장 뒤 목록 재조회가 매번 콜드 미스로 3초 걸리는 것을 막기 위해서다.
// ═══════════════════════════════════════════════════════════════════

/** 마스터 25열 행 → 인덱스 항목. 수식 열(안전재고·발주점 등)은 싣지 않는다. */
function _itemIndexEntry(row) {
  return {
    code: _itemStr(row[MASTER_COLS.CODE]),
    name: _itemStr(row[MASTER_COLS.NAME]),
    category: _itemStr(row[MASTER_COLS.CATEGORY]),
    grade: _itemStr(row[MASTER_COLS.GRADE]),
    unit: _itemStr(row[MASTER_COLS.UNIT]),
    initStock: Number(row[MASTER_COLS.INIT_STOCK]) || 0,
    leadTime: Number(row[MASTER_COLS.LEAD_TIME]) || 0,
    safetyDays: Number(row[MASTER_COLS.SAFETY_DAYS]) || 0,
    targetDays: Number(row[MASTER_COLS.TARGET_DAYS]) || 0,
    vendorCode: _itemStr(row[MASTER_COLS.VENDOR_CODE]),
    taxType: _itemStr(row[MASTER_COLS.TAX_TYPE]) || ITEM_TAX_TYPES[0],
    unitPrice: Number(row[MASTER_COLS.UNIT_PRICE]) || 0,
    usageStatus: _itemStr(row[MASTER_COLS.USAGE_STATUS]) || ITEM_USAGE_STATUSES[0]
  };
}

/** 사용 품목 먼저, 같은 상태 안에서는 품목코드 순 — 시트 정렬(_sortMasterByUsageStatus)과 같은 순서 */
function _sortItemIndex(list) {
  list.sort(function (a, b) {
    const ad = a.usageStatus === "미사용" ? 1 : 0;
    const bd = b.usageStatus === "미사용" ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return a.code.localeCompare(b.code);
  });
  return list;
}

/** 25열 행 배열(코드 없는 행 포함) → 정렬된 인덱스 */
function _buildItemIndex(rows) {
  const list = [];
  rows.forEach(function (row) {
    if (_itemStr(row[MASTER_COLS.CODE]) === "") return;
    list.push(_itemIndexEntry(row));
  });
  return _sortItemIndex(list);
}

/**
 * 캐시에는 객체가 아니라 필드 순서가 고정된 배열로 넣는다 — 키 이름이 빠져 JSON이 절반 이하(4,300건 ≈ 800KB → 320KB)라
 * 90KB 청크 put/get 횟수가 10회 → 4회로 준다. 읽을 때 다시 객체로 편다(4,300건 수 ms).
 */
const ITEM_INDEX_FIELDS = ['code', 'name', 'category', 'grade', 'unit', 'initStock', 'leadTime', 'safetyDays', 'targetDays', 'vendorCode', 'taxType', 'unitPrice', 'usageStatus'];

function _setItemIndexCache(list) {
  CacheManager.set(CACHE_KEYS.ITEM_INDEX, list.map(function (it) {
    return ITEM_INDEX_FIELDS.map(function (f) { return it[f]; });
  }));
}

/** @returns {Object[]|null} 캐시가 없거나 모양이 다르면 null */
function _readItemIndexCache() {
  const packed = CacheManager.get(CACHE_KEYS.ITEM_INDEX);
  if (!Array.isArray(packed)) return null;
  return packed.map(function (row) {
    const it = {};
    ITEM_INDEX_FIELDS.forEach(function (f, i) { it[f] = row[i]; });
    return it;
  });
}

/** 인덱스 — 캐시 적중이면 시트를 읽지 않는다. 마스터가 비어 있으면 빈 배열. */
function _getItemIndex(ss) {
  const cached = _readItemIndexCache();
  if (cached) return cached;

  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const lastRow = _findMasterLastRow(masterSheet);
  let index = [];
  if (lastRow >= 3) {
    index = _buildItemIndex(masterSheet.getRange(3, 1, lastRow - 2, MASTER_COL_COUNT).getValues());
  }
  _setItemIndexCache(index);
  return index;
}

/**
 * 쓰기 직후 인덱스를 다시 채운다. invalidateAll이 지운 뒤에 부른다.
 *   rows가 있으면(updateItem — 이미 마스터 전체를 읽어 둔 경우) 그것으로 다시 만들고,
 *   없으면(addNewItem) 캐시에 있던 인덱스에 새 항목만 끼워 넣는다. 캐시가 비어 있었으면 다음 조회가 채운다.
 * 캐시 실패는 쓰기 성공을 뒤집지 않는다 — 삼켜 두고 다음 조회가 콜드 미스로 채운다.
 */
function _refreshItemIndexAfterWrite(rows, addedEntry, previousIndex) {
  try {
    if (rows) {
      _setItemIndexCache(_buildItemIndex(rows));
      return;
    }
    if (previousIndex && addedEntry) {
      const next = previousIndex.filter(function (it) { return it.code !== addedEntry.code; });
      next.push(addedEntry);
      _setItemIndexCache(_sortItemIndex(next));
    }
  } catch (e) {
    console.error("[TASK-025] 품목 인덱스 갱신 실패(다음 조회가 다시 만든다): " + e.message);
  }
}

/** 조회 인자 정규화 — 화면과 테스트가 같은 기본값을 본다 */
function _normalizeItemQuery(options) {
  const o = options || {};
  const q = _itemStr(o.q).toLowerCase();
  const category = _itemStr(o.category);
  const usageRaw = _itemStr(o.usage);
  const usage = (usageRaw === "all" || ITEM_USAGE_STATUSES.indexOf(usageRaw) >= 0) ? usageRaw : ITEM_USAGE_STATUSES[0];
  let page = parseInt(o.page, 10); if (!(page >= 1)) page = 1;
  let pageSize = parseInt(o.pageSize, 10); if (!(pageSize >= 1)) pageSize = ITEM_QUERY_PAGE_SIZE;
  if (pageSize > ITEM_QUERY_MAX_PAGE_SIZE) pageSize = ITEM_QUERY_MAX_PAGE_SIZE;
  return { q: q, category: category, usage: usage, page: page, pageSize: pageSize, withCatalog: !!o.withCatalog };
}

/**
 * 품목 목록 한 페이지. options: { q, category, usage: '사용'|'미사용'|'all', page, pageSize, withCatalog }
 *   q는 품목코드·품목명 부분 일치(대소문자 무시). usage 기본값은 '사용'.
 *   withCatalog=true면 필터·모달 드롭다운용 카탈로그(getItemCatalog)를 같이 싣는다 — 탭 진입이 왕복 1회로 끝나게.
 * @returns {{success, total, totalAll, page, pageSize, items, catalog?}}  total = 필터 적용 건수, totalAll = 인덱스 전체
 */
function queryItems(token, options) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (session.role === ROLES.STAFF) return { success: false, message: "품목 관리 권한이 없습니다." };

  const p = _normalizeItemQuery(options);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const index = _getItemIndex(ss);

  const filtered = index.filter(function (it) {
    if (p.usage !== "all" && it.usageStatus !== p.usage) return false;
    if (p.category && it.category !== p.category) return false;
    if (p.q && it.code.toLowerCase().indexOf(p.q) < 0 && it.name.toLowerCase().indexOf(p.q) < 0) return false;
    return true;
  });
  const start = (p.page - 1) * p.pageSize;
  const result = {
    success: true,
    total: filtered.length,
    totalAll: index.length,
    page: p.page,
    pageSize: p.pageSize,
    items: filtered.slice(start, start + p.pageSize)
  };
  if (p.withCatalog) result.catalog = getItemCatalog(token);
  return result;
}

/**
 * 품목 폼·필터가 쓰는 선택지 — 카테고리·단위(📂 기초데이터), 사용 중인 거래처(🤝 거래처관리).
 * 검증(_loadItemCatalog)과 같은 시트를 보지만 이쪽은 화면용이라 캐시(getBaseData · getVendorList)를 탄다.
 */
function getItemCatalog(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };

  const base = getBaseData(token) || {};
  const vendorRes = (typeof getVendorList === "function") ? getVendorList(token) : null;
  const vendors = (vendorRes && vendorRes.success && Array.isArray(vendorRes.vendors)) ? vendorRes.vendors : [];
  return {
    success: true,
    categories: (base.itemCategories || []).map(_itemStr).filter(Boolean),
    units: (base.units || []).map(_itemStr).filter(Boolean),
    vendors: vendors
      .filter(function (v) { return v.usageStatus !== "미사용"; })
      .map(function (v) { return { code: v.code, name: v.name, shortName: v.shortName || "" }; })
  };
}



// ═══════════════════════════════════════════════════════════════════
//  쓰기 API
// ═══════════════════════════════════════════════════════════════════

/**
 * 품목 등록 (웹앱). itemData: code·name·category·unit 필수, grade·initStock·leadTime·safetyDays·targetDays·
 * vendorCode·taxType·unitPrice 선택(기본값 적용), reason 선택(빈 값이면 "신규 등록").
 */
function addNewItem(token, itemData) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (session.role === ROLES.STAFF) return { success: false, message: "품목 등록 권한이 없습니다." };

  // [v10.0] LockService 도입: 품목 등록 동시 충돌 방지
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: ITEM_BUSY_MESSAGE };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(SHEET_MASTER);
    const stale = _masterSchemaFailure(masterSheet, "품목 등록");
    if (stale) return stale;
    _requireChangelogSheet(ss);

    const lastRow = _findMasterLastRow(masterSheet);
    const checked = _validateItemFields(itemData || {}, {
      catalog: _loadItemCatalog(ss), existingCodes: _existingMasterCodes(masterSheet, lastRow)
    });
    if (!checked.valid) return { success: false, message: "❌ " + checked.message };
    const values = checked.values;

    const newRow = _buildMasterRow(values);
    const startRow = _appendMasterRows(masterSheet, [newRow]);
    try {
      _appendChangelog([_newItemRecord(values)], {
        actor: session.name, route: CHANGELOG_ROUTES.WEBAPP,
        reason: _itemStr(itemData && itemData.reason) || CHANGELOG_NEW_ITEM_FIELD
      });
    } catch (clErr) {
      _clearMasterRows(masterSheet, startRow, 1);
      console.error("[TASK-024] addNewItem 이력 기록 실패 → 등록 취소: " + clErr.message);
      return { success: false, message: "❌ 변경이력을 기록하지 못해 등록을 취소했습니다: " + clErr.message };
    }

    // [TASK-025] 인덱스는 지우기 전에 읽어 두고, 지운 뒤 새 항목만 끼워 다시 채운다 (저장 직후 목록 재조회가 웜 히트)
    const prevIndex = _readItemIndexCache();
    CacheManager.invalidateAll();
    _refreshItemIndexAfterWrite(null, _itemIndexEntry(newRow), prevIndex);
    return { success: true, message: "✅ 품목 '" + values.name + "' 등록 완료", code: values.code, item: _itemIndexEntry(newRow) };
  } catch (err) {
    console.error("[TASK-024] addNewItem 실패: " + err.message);
    return { success: false, message: "❌ " + err.message };
  } finally {
    lock.releaseLock();
  }
}



/**
 * CSV 행 검증·분류 — 실제 등록과 사전 검증(dryRun)이 같은 함수를 탄다.
 * @returns {{newValues: Object[], ignoredCodes: string[], errors: string[]}}
 *   newValues = 등록할 정규화 값(파일 순서), ignoredCodes = 이미 마스터에 있어 건너뛴 코드, errors = "[코드] 사유"
 */
function _classifyCsvRows(ss, masterSheet, dataRows) {
  const masterLastRow = _findMasterLastRow(masterSheet);
  const existingCodes = _existingMasterCodes(masterSheet, masterLastRow);
  const catalog = _loadItemCatalog(ss);

  const newValues = [];
  const ignoredCodes = [];
  const errors = [];

  dataRows.forEach(function (row) {
    if (!row || row.length < 2) return;
    const code = _itemStr(row[0]);
    if (!code) return;
    if (existingCodes.has(code)) { ignoredCodes.push(code); return; }

    const checked = _validateItemFields({
      code: code, name: row[1], category: row[2], grade: row[3], unit: row[4],
      initStock: row[5], leadTime: row[6], safetyDays: row[7], targetDays: row[8],
      taxType: row[9], unitPrice: row[10]
      // 거래처코드는 CSV 포맷에 없다 — 빈 값으로 두고 나중에 웹앱에서 고른다 (TASK-017)
    }, { catalog: catalog, existingCodes: existingCodes });
    if (!checked.valid) { errors.push("[" + code + "] " + checked.message); return; }

    newValues.push(checked.values);
    existingCodes.add(code); // 같은 CSV 내 중복 방지
  });
  return { newValues: newValues, ignoredCodes: ignoredCodes, errors: errors };
}

/**
 * CSV 일괄 등록. 신규 코드만 추가하고 기존 코드는 건너뛴다(기존 품목 일괄 수정은 2차 과제).
 * dataRows 열 순서: [품목코드, 품목명, 카테고리, 규격, 단위, 초기재고, 리드타임, 안전재고일수, 목표유지일수, 과세구분, 매입단가]
 * [TASK-024] 행마다 _validateItemFields를 타고(한 행이라도 실패하면 전체 중단), 쓰기 전 마스터 스냅샷을 Drive에 남기며,
 *   추가된 품목마다 '신규 등록' 이력을 남긴다.
 * [TASK-025] options.dryRun=true면 검증·분류만 하고 아무것도 쓰지 않는다(백업도 없다) — 웹앱 미리보기용.
 *   응답 { success, dryRun:true, added, ignored, ignoredCodes, errors, preview }. 오류가 있으면 success:false.
 *   행 수 상한 ITEM_CSV_MAX_ROWS.
 */
function uploadItemMasterCSV(token, dataRows, options) {
  // [TASK-026] 시트 대화상자용 우회 토큰은 제거됐다 — 이제 웹앱 세션(admin·manager)만 이 함수를 부른다
  const session = validateSession(token);
  if (!session || session.role === 'staff') return { success: false, message: "권한이 없습니다." };
  const actor = session.name;
  if (!Array.isArray(dataRows) || dataRows.length === 0) return { success: false, message: "❌ 업로드할 데이터가 없습니다." };
  if (dataRows.length > ITEM_CSV_MAX_ROWS) {
    return { success: false, message: "❌ 한 번에 최대 " + ITEM_CSV_MAX_ROWS + "건까지 업로드할 수 있습니다. (파일: " + dataRows.length + "건)" };
  }
  const dryRun = !!(options && options.dryRun);

  // 사전 검증은 읽기만 한다 — 락을 잡지 않아 다른 사용자의 저장을 막지 않는다
  if (dryRun) {
    try {
      const ssDry = SpreadsheetApp.getActiveSpreadsheet();
      const masterDry = ssDry.getSheetByName(SHEET_MASTER);
      const staleDry = _masterSchemaFailure(masterDry, "CSV 사전 검증");
      if (staleDry) return staleDry;
      const c = _classifyCsvRows(ssDry, masterDry, dataRows);
      const previewOf = function (v) {
        return { code: v.code, name: v.name, category: v.category, grade: v.grade, unit: v.unit, initStock: v.initStock, taxType: v.taxType, unitPrice: v.unitPrice };
      };
      return {
        success: c.errors.length === 0,
        dryRun: true,
        message: c.errors.length > 0
          ? "❌ 검증에 실패한 행이 있어 등록할 수 없습니다. (총 " + c.errors.length + "건)"
          : "검증 통과: 신규 " + c.newValues.length + "건, 건너뜀 " + c.ignoredCodes.length + "건",
        added: c.newValues.length,
        ignored: c.ignoredCodes.length,
        ignoredCodes: c.ignoredCodes.slice(0, 50),
        errors: c.errors,
        preview: c.newValues.slice(0, 20).map(previewOf)
      };
    } catch (err) {
      console.error("[TASK-025] uploadItemMasterCSV dryRun 실패: " + err.message);
      return { success: false, message: "❌ " + err.message };
    }
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: ITEM_BUSY_MESSAGE };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(SHEET_MASTER);
    const stale = _masterSchemaFailure(masterSheet, "CSV 업로드");
    if (stale) return stale;
    _requireChangelogSheet(ss);

    const classified = _classifyCsvRows(ss, masterSheet, dataRows);
    const newValues = classified.newValues;
    const ignoredCount = classified.ignoredCodes.length;
    const errors = classified.errors;

    // [v9.0 FIX] throw 대신 return으로 에러 전달 (withFailureHandler 대신 withSuccessHandler에서 처리)
    if (errors.length > 0) {
      return {
        success: false,
        message: "❌ 검증에 실패한 행이 있어 업로드를 중단했습니다. (총 " + errors.length + "건)\n" + errors.join("\n"),
        errors: errors
      };
    }
    if (newValues.length === 0) {
      return { success: true, message: "CSV 업로드 완료: 0건 신규 등록, " + ignoredCount + "건 무시(중복)", added: 0, ignored: ignoredCount };
    }

    // 쓰기 전 스냅샷 — 되돌릴 근거. 백업이 안 되면 올리지 않는다.
    let backupName;
    try {
      backupName = backupMasterSnapshot("업로드전");
    } catch (bErr) {
      console.error("[TASK-024] CSV 업로드 전 백업 실패: " + bErr.message);
      return { success: false, message: "❌ 업로드 전 백업에 실패해 중단했습니다: " + bErr.message };
    }

    const rows = newValues.map(_buildMasterRow);
    const startRow = _appendMasterRows(masterSheet, rows);
    try {
      _appendChangelog(newValues.map(_newItemRecord), { actor: actor, route: CHANGELOG_ROUTES.CSV, reason: "CSV 일괄 등록" });
    } catch (clErr) {
      _clearMasterRows(masterSheet, startRow, rows.length);
      console.error("[TASK-024] CSV 업로드 이력 기록 실패 → 업로드 취소: " + clErr.message);
      return { success: false, message: "❌ 변경이력을 기록하지 못해 업로드를 취소했습니다: " + clErr.message };
    }

    // [TASK-016] CSV 업로드는 서식 적용 범위를 넘겨 행이 늘어나는 대표 경로다.
    //   신규 행에도 배경색·정렬·드롭다운·숫자서식이 즉시 적용되도록 재적용한다.
    applyItemMasterFormatting(ss, masterSheet);
    SpreadsheetApp.flush();
    recalcStockAndUsage(ss); // 재고 다시 계산

    CacheManager.invalidateAll();
    return {
      success: true,
      message: "CSV 업로드 완료: " + rows.length + "건 신규 등록, " + ignoredCount + "건 무시(중복) · 업로드 전 백업: " + backupName,
      added: rows.length, ignored: ignoredCount, backupFile: backupName
    };
  } catch (err) {
    console.error("[TASK-024] uploadItemMasterCSV 실패: " + err.message);
    return { success: false, message: "❌ " + err.message };
  } finally {
    lock.releaseLock();
  }
}



/**
 * 품목 수정 (웹앱). updates: MASTER_FIELD_COLS의 키 중 바꿀 것 + reason(필수).
 * 품목코드는 바꿀 수 없다(입출고 기록의 키). 실제로 달라진 필드만 쓰고 이력에 남긴다.
 * usageStatus를 '미사용'↔'사용'으로 바꾸면 정렬(_sortMasterByUsageStatus)까지 한다.
 */
function updateItem(token, itemCode, updates) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };
  if (session.role === ROLES.STAFF) return { success: false, message: "품목 수정 권한이 없습니다." };

  const u = updates || {};
  const reason = _itemStr(u.reason);
  if (!reason) return { success: false, message: "❌ 변경사유를 입력해주세요." };
  if (u.code !== undefined && _itemStr(u.code) !== _itemStr(itemCode)) {
    return { success: false, message: "❌ 품목코드는 변경할 수 없습니다. (입출고 기록이 참조하는 키입니다)" };
  }
  const fields = {};
  Object.keys(MASTER_FIELD_COLS).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(u, k)) fields[k] = u[k];
  });
  if (Object.keys(fields).length === 0) return { success: false, message: "❌ 수정할 항목이 없습니다." };

  // [v10.0] LockService 도입: 품목 수정 동시 충돌 방지
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: ITEM_BUSY_MESSAGE };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(SHEET_MASTER);
    const stale = _masterSchemaFailure(masterSheet, "품목 수정");
    if (stale) return stale;
    _requireChangelogSheet(ss);

    const masterLastRow = _findMasterLastRow(masterSheet);
    if (masterLastRow < 3) return { success: false, message: "❌ 품목코드를 찾을 수 없습니다." };
    const data = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();

    let targetRowIdx = -1;
    for (let i = 0; i < data.length; i++) {
      if (_itemStr(data[i][MASTER_COLS.CODE]) === _itemStr(itemCode)) { targetRowIdx = i; break; }
    }
    if (targetRowIdx === -1) return { success: false, message: "❌ 품목코드를 찾을 수 없습니다." };
    const targetRow = targetRowIdx + 3;
    const oldValues = data[targetRowIdx];
    const itemName = oldValues[MASTER_COLS.NAME];

    const checked = _validateItemFields(fields, { partial: true, catalog: _loadItemCatalog(ss) });
    if (!checked.valid) return { success: false, message: "❌ " + checked.message };

    // 실제 변경이 있는 필드만 이력 기록 — 값이 같은데 저장을 누른 것은 변경이 아니다
    const changeRecords = [];
    const updatedRow = oldValues.slice();
    Object.keys(checked.values).forEach(function (key) {
      const col = MASTER_FIELD_COLS[key];
      const oldVal = oldValues[col];
      const newVal = checked.values[key];
      if (_sameCellValue(oldVal, newVal)) return;
      changeRecords.push({ itemCode: _itemStr(itemCode), itemName: itemName, fieldName: MASTER_FIELD_LABELS[key], oldValue: oldVal, newValue: newVal });
      updatedRow[col] = newVal;
    });
    if (changeRecords.length === 0) return { success: false, noChanges: true, message: "변경된 내용이 없습니다." };

    const usageChanged = changeRecords.some(function (r) { return r.fieldName === MASTER_FIELD_LABELS.usageStatus; });
    const initStockChanged = changeRecords.some(function (r) { return r.fieldName === MASTER_FIELD_LABELS.initStock; });

    // [v10.0] 배치 쓰기: 행 데이터를 메모리에서 갱신한 뒤 데이터 블록만 쓴다 (수식 열은 건드리지 않는다 — 3행이면 ARRAYFORMULA가 지워진다)
    _writeMasterRows(masterSheet, targetRow, [updatedRow]);
    try {
      _appendChangelog(changeRecords, { actor: session.name, route: CHANGELOG_ROUTES.WEBAPP, reason: reason });
    } catch (clErr) {
      _writeMasterRows(masterSheet, targetRow, [oldValues]);
      console.error("[TASK-024] updateItem 이력 기록 실패 → 수정 취소: " + clErr.message);
      return { success: false, message: "❌ 변경이력을 기록하지 못해 수정을 취소했습니다: " + clErr.message };
    }

    // 여기부터는 변경과 이력이 이미 저장된 뒤다 — 정렬·재계산이 실패해도 "수정 실패"로 보고하지 않는다
    let note = "";
    let moved = false;
    if (usageChanged) {
      // [v9.0] 미사용 품목을 시트 최하단으로 정렬 (데이터 가독성 개선)
      try {
        moved = _sortMasterByUsageStatus(masterSheet);
      } catch (sortErr) {
        console.error("[TASK-024] updateItem 정렬 실패 (변경·이력은 저장됨): " + sortErr.message);
        note = " (변경은 저장됐지만 시트 정렬에 실패했습니다: " + sortErr.message + ")";
      }
    }
    // 초기재고가 바뀌면 현재고·상태가, 행이 움직였으면 StockEngine이 행별로 쓰는 X열이 달라진다 — 바로 다시 계산
    if (initStockChanged || moved) recalcStockAndUsage(ss);

    CacheManager.invalidateAll();
    // [TASK-025] 이미 읽어 둔 마스터 전체(data)에 바뀐 행만 끼워 인덱스를 다시 채운다 — 저장 직후 목록 재조회가 웜 히트
    const indexRows = data.slice();
    indexRows[targetRowIdx] = updatedRow;
    _refreshItemIndexAfterWrite(indexRows);
    return {
      success: true,
      message: "✅ 품목 '" + itemCode + "' 수정 완료" + note,
      changes: changeRecords.map(function (r) { return { field: r.fieldName, oldValue: r.oldValue, newValue: r.newValue }; }),
      item: _itemIndexEntry(updatedRow)
    };
  } catch (err) {
    console.error("[TASK-024] updateItem 실패: " + err.message);
    return { success: false, message: "❌ " + err.message };
  } finally {
    lock.releaseLock();
  }
}



// [v7.0] 변경이력 조회 API — [TASK-024] 9열(H 변경사유, I 경로) 포함
function getItemChangelog(token, itemCode) {
  const session = validateSession(token);
  if (!session) return { success: false, records: [] };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const changelogSheet = ss.getSheetByName(SHEET_CHANGELOG);
  if (!changelogSheet) return { success: true, records: [] };
  const lastRow = changelogSheet.getLastRow();
  if (lastRow < 3) return { success: true, records: [] };

  // v19 이전 시트(7열)라면 있는 만큼만 읽는다 — H·I는 빈 값으로 온다
  const numCols = Math.min(CHANGELOG_COL_COUNT, changelogSheet.getMaxColumns());
  const data = changelogSheet.getRange(3, 1, lastRow - 2, numCols).getValues();
  const tz = Session.getScriptTimeZone();
  const records = [];
  const target = _itemStr(itemCode);

  data.forEach(row => {
    if (_itemStr(row[CHANGELOG_COLS.CODE]) !== target) return;
    const d = row[CHANGELOG_COLS.DATE];
    records.push({
      date: d instanceof Date ? Utilities.formatDate(d, tz, "yyyy-MM-dd HH:mm") : d,
      user: row[CHANGELOG_COLS.USER],
      code: row[CHANGELOG_COLS.CODE],
      name: row[CHANGELOG_COLS.NAME],
      field: row[CHANGELOG_COLS.FIELD],
      oldValue: row[CHANGELOG_COLS.OLD],
      newValue: row[CHANGELOG_COLS.NEW],
      reason: row[CHANGELOG_COLS.REASON] === undefined ? "" : row[CHANGELOG_COLS.REASON],
      route: row[CHANGELOG_COLS.ROUTE] === undefined ? "" : row[CHANGELOG_COLS.ROUTE]
    });
  });

  records.reverse(); // 최근순
  return { success: true, records: records };
}



/**
 * 품목 비활성화(논리 삭제) — 사용유무를 '미사용'으로. 물리 삭제는 없다.
 * [TASK-024] updateItem을 거치므로 검증·이력·정렬이 같은 경로를 탄다 (예전의 미정의 logChange 호출로
 *   이력이 항상 빠지던 결함 수정). reason은 선택(기본 "(품목 비활성화)").
 * 시그니처 (token, code)는 그대로 — 세 번째 인자는 선택.
 */
function disableItemMaster(token, code, reason) {
  const result = updateItem(token, code, { usageStatus: "미사용", reason: _itemStr(reason) || "(품목 비활성화)" });
  if (!result.success) {
    if (result.noChanges) return { success: false, message: "이미 미사용 상태인 품목입니다." };
    return result;
  }
  // [TASK-025] 화면이 목록을 다시 받지 않고 이 행으로 고친다
  return { success: true, message: "품목이 성공적으로 삭제(비활성화)되었습니다.", item: result.item };
}



// ═══════════════════════════════════════════════════════════════════
//  [v9.0 → TASK-024] 품목 마스터 사용/미사용 정렬 — 사용 → 미사용, 같은 상태 안에서는 품목코드 순
//
//  TASK-024 DEV 검증에서 옛 구현의 결함 두 가지가 실제로 터졌다.
//   1) 전체 데이터를 clearContent()한 뒤 25열로 되썼다. Sheets는 큰 setValues를 3000행 단위로 나눠 적용하는데,
//      뒤 덩어리가 데이터 검증(setAllowInvalid(false))에 걸리자 — 옛 단위 값 하나 때문에 — 앞 3000행만 쓰이고
//      나머지는 지워진 채 끝났다 (DEV 마스터 4292행 → 3001행).
//   2) 수식 열(N~Q, V~X)에 ""를 썼다. ARRAYFORMULA는 3행에 살기 때문에 3행을 되쓰는 순간 수식이 사라진다.
//
//  그래서 지금 구현은
//   · 수식 열은 아예 건드리지 않는다 — 데이터 열 블록(MASTER_DATA_BLOCKS: A:E · G:M · S:U · Y)만 쓴다.
//   · clearContent 없이 같은 크기 범위를 덮어쓴다 (정렬 전후 행 수가 같다).
//   · 쓰기 전에 데이터 검증을 걷어내고 끝나면 applyItemMasterFormatting으로 되살린다 — 이미 시트에 있던 값을
//     자리만 바꾸는 일이 검증에 거절당하면 안 된다.
//   · 쓰다 실패하면 원래 값을 같은 블록으로 되돌린다.
//   · 이미 정렬돼 있으면 한 글자도 쓰지 않는다.
//  H·I(현재고·일평균)는 블록에 실려 함께 움직이지만 X(재고 합계금액)는 StockEngine이 행별 값으로 쓰는 열이라
//  블록 밖이다 — 호출자(updateItem)가 정렬 뒤 recalcStockAndUsage로 다시 맞춘다.
// ═══════════════════════════════════════════════════════════════════

/**
 * @returns {boolean} 실제로 행을 옮겼으면 true (이미 정렬돼 있었으면 false)
 * 실패하면 원복을 시도한 뒤 throw — 호출자는 "변경은 저장됐지만 정렬은 실패" 로 다룬다.
 */
function _sortMasterByUsageStatus(masterSheet) {
  // [TASK-017] 마이그레이션 전 시트(24열)에서 돌면 열이 한 칸씩 어긋나 사용유무가 날아간다.
  if (!_isMasterSchemaCurrent(masterSheet)) {
    _warnMasterSchemaStale("품목 마스터 정렬");
    return false;
  }

  const lastRow = _findMasterLastRow(masterSheet);
  if (lastRow < 4) return false; // 데이터 1행 이하면 정렬 불필요
  const numRows = lastRow - 2;
  const data = masterSheet.getRange(3, 1, numRows, MASTER_COL_COUNT).getValues();

  // 코드 없는 빈 행은 자리를 지키고, 코드 있는 행만 정렬한다
  const indexed = data.map(function (row, i) { return { row: row, i: i }; });
  const filled = indexed.filter(function (x) { return _itemStr(x.row[MASTER_COLS.CODE]) !== ""; });
  const empty = indexed.filter(function (x) { return _itemStr(x.row[MASTER_COLS.CODE]) === ""; });
  filled.sort(function (a, b) {
    const aDisabled = (a.row[MASTER_COLS.USAGE_STATUS] === "미사용") ? 1 : 0;
    const bDisabled = (b.row[MASTER_COLS.USAGE_STATUS] === "미사용") ? 1 : 0;
    if (aDisabled !== bDisabled) return aDisabled - bDisabled;
    return String(a.row[MASTER_COLS.CODE]).localeCompare(String(b.row[MASTER_COLS.CODE]));
  });
  const sorted = filled.concat(empty);
  if (sorted.every(function (x, i) { return x.i === i; })) return false; // 이미 정렬됨 — 쓰지 않는다

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataRange = masterSheet.getRange(3, 1, numRows, MASTER_COL_COUNT);
  const writeBlocks = function (rows) { _writeMasterRows(masterSheet, 3, rows); };

  dataRange.clearDataValidations(); // 자리만 바꾸는 값이 드롭다운 검증에 거절당하지 않게
  try {
    writeBlocks(sorted.map(function (x) { return x.row; }));
  } catch (writeErr) {
    console.error("[TASK-024] 품목 마스터 정렬 쓰기 실패 → 원복 시도: " + writeErr.message);
    try {
      writeBlocks(data);
    } catch (restoreErr) {
      console.error("[TASK-024] 정렬 원복도 실패 — 수동 확인 필요 (Drive 백업/버전 기록): " + restoreErr.message);
    }
    throw writeErr;
  } finally {
    applyItemMasterFormatting(ss, masterSheet); // 드롭다운 검증·서식 복원
  }
  return true;
}
