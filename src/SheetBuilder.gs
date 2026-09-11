/**
 * 호텔덕구온천 구매 재고 관리 시스템 v7.0 — 시트 생성 모듈
 * [v7.0] 통합 설정 → 개별 시트 분리 + 변경이력 시트 + 9열 입출고 구조
 */


// ═══════════════════════════════════════════════════════════════════
//  공용 서식 헬퍼 — 시트 생성(build*), 마이그레이션, 관리자 메뉴, 자가 복구가 함께 쓴다
//
//  [TASK-009] VALIDATION_ROWS를 500 → 2000으로 올려도 이미 만들어진 시트의
//  503행 이후에는 서식·유효성 검사가 없다. 기존 시트에 같은 서식을 다시 굽기 위해
//  build* 안에 있던 서식 로직을 이 함수들로 분리해 MIGRATIONS[12]가 재사용한다.
//
//  [TASK-016] 그 뒤 품목이 2000건을 넘자 2003행부터 같은 결함이 재발했다.
//  상수를 다시 올리는 것(2000 → 5000)만으로는 언젠가 또 재발하므로,
//  적용 범위를 고정 상수가 아니라 시트의 현재 행 수(_formatRowCount)로 바꿨다.
//  단일 진입점 reapplyAllSheetFormatting()을 MIGRATIONS[16] · 관리자 메뉴 ·
//  통합 갱신의 자가 복구가 공유하므로 서식 규칙이 여러 벌로 갈라지지 않는다.
//
//  (서식만 다시 칠할 뿐 setValues/setFormula를 호출하지 않으므로 데이터는 보존된다.)
// ═══════════════════════════════════════════════════════════════════

/**
 * 서식 적용에 필요한 최소 행 수를 보장한다.
 * 새 시트의 기본 행 수(1000)는 VALIDATION_ROWS + 2보다 작아 getRange가 실패하므로,
 * 부족하면 마지막 행 뒤로 필요한 만큼 한 번에 확충한다.
 * @returns {number} 실제로 추가한 행 수
 */
function _ensureMinRows(sheet, requiredRows) {
  const maxRows = sheet.getMaxRows();
  if (maxRows >= requiredRows) return 0;
  const toAdd = requiredRows - maxRows;
  sheet.insertRowsAfter(maxRows, toAdd);
  return toAdd;
}

/**
 * [TASK-017] 서식 적용에 필요한 최소 열 수를 보장한다. _ensureMinRows의 열 버전.
 *
 * 왜 필요한가: 컬럼이 늘어나는 마이그레이션(v17: 24 → 25열)에서 서식 헬퍼는 항상
 * **최신** 열 수(MASTER_COL_COUNT)를 기준으로 getRange를 부른다. 그런데 마이그레이션은
 * 낮은 버전부터 순서대로 도는 탓에, 아직 열이 늘지 않은 시점(v14)에도 같은 헬퍼가 불린다.
 * 열이 모자라면 getRange가 시트 밖을 가리켜 마이그레이션 전체가 그 자리에서 죽는다.
 * (_ensureMinRows가 행에 대해 막아 주는 것과 똑같은 사고를 열에 대해 막는다.)
 *
 * @returns {number} 실제로 추가한 열 수
 */
function _ensureMinColumns(sheet, requiredCols) {
  const maxCols = sheet.getMaxColumns();
  if (maxCols >= requiredCols) return 0;
  const toAdd = requiredCols - maxCols;
  sheet.insertColumnsAfter(maxCols, toAdd);
  return toAdd;
}

/**
 * [TASK-017] 품목 마스터가 v17(25열) 구조인지 셀 1개 조회로 판정한다.
 *
 * 왜 필요한가 — 코드 배포와 시트 마이그레이션은 **동시에 일어나지 않는다**.
 * 코드는 git push로 즉시 나가지만 runMigrations()는 사람이 스프레드시트 메뉴에서 눌러야 한다.
 * 그 사이 창에서는 코드가 믿는 열 번호(MASTER_COLS)와 시트의 실제 열이 한 칸 어긋난다.
 *
 * 이 어긋남이 위험한 이유는 읽기가 아니라 **쓰기** 때문이다.
 *   MASTER_COLS.TOTAL_VALUE + 1 = 24열인데, 아직 안 밀린 시트에서 24열은 사용유무다.
 *   자정 트리거(refreshDashboard → recalcStockAndUsage)가 이 창에 걸리면
 *   FIFO 평가액이 전 품목의 사용유무 값을 덮어써 조용히 지운다.
 * 그래서 마스터에 값을 되쓰는 함수는 쓰기 전에 이 함수로 구조를 확인하고, 어긋나면 멈춘다.
 *
 * 마지막 열(사용유무) 헤더를 보는 이유: 그 자리에 헤더가 있다는 것이 곧 열이 밀렸다는 증거다.
 */
function _isMasterSchemaCurrent(masterSheet) {
  if (!masterSheet) return false;
  if (masterSheet.getMaxColumns() < MASTER_COL_COUNT) return false;
  return String(masterSheet.getRange(2, MASTER_COLS.USAGE_STATUS + 1).getValue()).trim() === "사용유무";
}

/** [TASK-017] 스키마가 어긋났을 때 남기는 공통 경고 — 조치 방법까지 한 줄로 알려준다 */
function _warnMasterSchemaStale(where) {
  console.error("[TASK-017] " + where + " 중단 — 품목 마스터가 아직 v17(25열) 구조가 아닙니다. " +
    "코드는 배포됐지만 마이그레이션이 실행되지 않은 상태입니다. " +
    "스프레드시트 메뉴에서 스키마 마이그레이션(v17)을 먼저 실행하십시오. " +
    "(그대로 쓰면 재고 합계금액이 사용유무 열을 덮어씁니다)");
}

/**
 * [TASK-017] 열 번호(1-based)를 A1 표기 문자로 바꾼다. 25 → "Y"
 * 조건부 서식 수식처럼 A1 문자열이 꼭 필요한 자리에서만 쓴다.
 */
function _colLetter(col) {
  let n = col, out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * [TASK-016] 서식을 적용할 데이터 행 수를 계산한다 (헤더 2행 제외 — 데이터는 3행부터).
 *
 * VALIDATION_ROWS를 고정 상한으로 쓰면 시트가 그보다 커졌을 때 초과분이 맨살로 남는다.
 * 상수를 500→2000(TASK-009)→5000(TASK-016)으로 올리는 것만으로는 같은 결함이 계속 재발하므로,
 * 상수는 **하한**으로만 쓰고 실제 적용 범위는 시트의 현재 행 수를 따라가게 한다.
 *
 * 행 확충과 행수 계산을 한 호출로 묶은 이유: 순서를 뒤집으면(계산 후 확충) getRange가
 * 시트 밖을 가리켜 GAS 런타임 에러가 난다. 호출처가 순서를 틀릴 수 없게 한 벌로 만든다.
 *
 * @returns {number} 3행부터 시트 마지막 행까지의 행 수
 */
function _formatRowCount(sheet) {
  _ensureMinRows(sheet, VALIDATION_ROWS + 2);
  return sheet.getMaxRows() - 2;
}

/**
 * [TASK-016] 업장 시트의 편집 허용(보호 예외) 범위를 현재 행 수에 맞춰 재설정한다.
 *
 * generateNewShops() / fixSheetProtection() / MIGRATIONS[12] / MIGRATIONS[16]이 각자
 * 똑같은 3개 범위를 복붙하고 있어 한 곳만 고치면 나머지와 어긋났다. 한 벌로 모은다.
 * 이 범위가 좁으면 서식이 살아 있어도 해당 행 입력이 시트 보호에 막힌다.
 *
 * @returns {boolean} 시트 보호가 걸려 있어 실제로 갱신했으면 true
 */
function _applyShopUnprotectedRanges(sheet) {
  const protection = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
  if (!protection) return false;
  const rows = _formatRowCount(sheet);
  protection.setUnprotectedRanges([
    sheet.getRange(3, 1, rows, 2),  // A~B (날짜, 품목코드)
    sheet.getRange(3, 4, rows, 2),  // D~E (구분, 수량)
    sheet.getRange(3, 7, rows, 2)   // G~H (담당자, 비고)
  ]);
  return true;
}

/** 🗂️ 품목 마스터 — 배경색/정렬/드롭다운/숫자서식/조건부서식을 3행부터 시트 끝까지 적용 */
function applyItemMasterFormatting(ss, sheet) {
  // [TASK-017] 아래 getRange는 모두 25열 기준이다. 열이 모자란 시트(v17 이전 구조)에서
  //   호출돼도 죽지 않도록 먼저 열 수를 확보한다.
  _ensureMinColumns(sheet, MASTER_COL_COUNT);
  const rows = _formatRowCount(sheet);

  // Validation — [v7.0] 기초데이터 시트 참조
  const baseDataSheet = ss.getSheetByName(SHEET_BASE_DATA);
  if (baseDataSheet) {
    sheet.getRange(3, 3, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(baseDataSheet.getRange("C3:C50")).setAllowInvalid(false).build());
    sheet.getRange(3, 5, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(baseDataSheet.getRange("B3:B50")).setAllowInvalid(false).build());
  }

  // [TASK-017] 회계 블록(S~Y)의 기존 검증을 먼저 지운다.
  //   v17이 S열을 끼워 넣으면 그 오른쪽 셀의 데이터 검증도 값과 함께 한 칸씩 밀려 온다.
  //   지우지 않고 새 검증만 덮어쓰면 밀려난 옛 검증이 엉뚱한 열에 남는다
  //   (예: 과세/비과세 드롭다운이 매입단가 열에 눌러앉아 숫자 입력을 막는다).
  //   이 블록의 검증은 전부 아래에서 다시 세우므로 지우고 시작하는 편이 항상 안전하다.
  sheet.getRange(3, MASTER_COLS.VENDOR_CODE + 1, rows, MASTER_COL_COUNT - MASTER_COLS.VENDOR_CODE).setDataValidation(null);

  // [TASK-017] 거래처코드(S열) 드롭다운 — 🤝 거래처관리의 '사용중' 코드만 고를 수 있다.
  //   requireValueInRange는 조건 필터를 걸 수 없으므로, 거래처 시트가 FILTER로 미리 걸러 둔
  //   숨김 열(N열)을 소스로 쓴다. 거래처 시트가 아직 없으면 검증 없이 빈 칸으로 둔다
  //   (기존 품목에 거래처 소급 입력을 강제하지 않는다는 요구사항).
  const vendorSheet = ss.getSheetByName(SHEET_VENDORS);
  if (vendorSheet) {
    sheet.getRange(3, MASTER_COLS.VENDOR_CODE + 1, rows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInRange(_vendorActiveCodeRange(vendorSheet), true).setAllowInvalid(false).build());
  }

  sheet.getRange(3, MASTER_COLS.TAX_TYPE + 1, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["과세", "비과세"]).setAllowInvalid(false).build());
  // [v9.0] 사용유무 드롭다운 ([TASK-017] X열 → Y열 = 25번째 열)
  sheet.getRange(3, MASTER_COLS.USAGE_STATUS + 1, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["사용", "미사용"]).setAllowInvalid(false).build());

  // Number format — 매입단가·공급단가·단위세액·재고합계금액(U~X)
  sheet.getRange(3, MASTER_COLS.UNIT_PRICE + 1, rows, 4).setNumberFormat("#,##0");
  // [TASK-011] 현재고(H열) — 음수 재고를 -5 형태로 명확히 노출
  sheet.getRange(3, 8, rows, 1).setNumberFormat("#,##0");

  // Colors — 입력 컬럼 (노란색 톤)
  sheet.getRange(3, 1, rows, 5).setBackground(COLORS.inputBg); // 기본
  sheet.getRange(3, 7, rows, 1).setBackground(COLORS.inputBg); // 초기재고
  sheet.getRange(3, 11, rows, 3).setBackground(COLORS.inputBg); // 발주설정
  // [TASK-017] 거래처코드(S) · 과세구분(T) · 매입단가(U) — 셋 다 손입력 컬럼이라 색이 같다.
  //   연속 구간이므로 setBackground 3회 대신 한 범위로 칠한다(Batch I/O).
  sheet.getRange(3, MASTER_COLS.VENDOR_CODE + 1, rows, 3).setBackground(COLORS.inputBg);
  sheet.getRange(3, MASTER_COLS.USAGE_STATUS + 1, rows, 1).setBackground(COLORS.inputBg); // [v9.0] 사용유무

  // 자동 컬럼 (파란색 톤)
  sheet.getRange(3, 8, rows, 2).setBackground(COLORS.autoBg); // 현재고, 일평균
  sheet.getRange(3, 14, rows, 4).setBackground(COLORS.autoBg); // 발주자동수식
  sheet.getRange(3, MASTER_COLS.SUPPLY_PRICE + 1, rows, 3).setBackground(COLORS.autoBg); // 회계자동수식 (V~X)

  // Spacer 처리
  sheet.getRange(2, 6, rows + 1, 1).setBackground(COLORS.grayBg);
  sheet.getRange(2, 10, rows + 1, 1).setBackground(COLORS.grayBg);
  sheet.getRange(2, 18, rows + 1, 1).setBackground(COLORS.grayBg);

  sheet.getRange(3, 1, rows, MASTER_COL_COUNT).setHorizontalAlignment("center");

  const cfRules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_RISK).setBackground(COLORS.riskBg).setFontColor("#fff").setRanges([sheet.getRange(3, 17, rows, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_ORDER).setBackground(COLORS.orderBg).setFontColor("#fff").setRanges([sheet.getRange(3, 17, rows, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_OK).setBackground(COLORS.normalBg).setFontColor("#fff").setRanges([sheet.getRange(3, 17, rows, 1)]).build(),
    // [TASK-011] 현재고 음수(초과출고/실사 결손) 강조 — 미사용 행 회색 규칙보다 앞서야 우선 적용된다
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setBackground("#fce8e6").setFontColor("#c53929").setBold(true).setRanges([sheet.getRange(3, 8, rows, 1)]).build(),
    // [v9.0] 미사용 행 전체를 회색 처리 — [TASK-017] 판정 열이 X → Y로 밀렸다.
    //   열 문자를 상수에서 뽑는 이유는 다음에 또 열이 끼어들 때 이 문자열만 놓치는 실수를 막기 위함이다.
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + _colLetter(MASTER_COLS.USAGE_STATUS + 1) + '3="미사용"').setBackground("#f0f0f0").setFontColor("#999999").setRanges([sheet.getRange(3, 1, rows, MASTER_COL_COUNT)]).build()
  ];
  sheet.setConditionalFormatRules(cfRules);
}

/** 📋 입출고_템플릿 · 각 업장 시트 — 입력/자동 컬럼 서식과 유효성 검사를 적용 */
function applyTxInputSheetFormatting(sheet) {
  const rows = _formatRowCount(sheet);

  sheet.getRange(3, 1, rows, 1).setNumberFormat("yyyy-mm-dd");
  sheet.getRange(3, 1, rows, 2).setBackground(COLORS.inputBg);
  sheet.getRange(3, 4, rows, 1).setBackground(COLORS.inputBg); // 구분
  sheet.getRange(3, 5, rows, 1).setBackground(COLORS.inputBg); // 수량
  sheet.getRange(3, 7, rows, 2).setBackground(COLORS.inputBg); // 담당자, 비고
  sheet.getRange(3, 3, rows, 1).setBackground(COLORS.autoBg);  // 품목명(자동)
  sheet.getRange(3, 6, rows, 1).setBackground(COLORS.autoBg);  // 단가(자동)
  sheet.getRange(3, 9, rows, 1).setBackground(COLORS.autoBg);  // 거래ID(자동)
  sheet.getRange(3, 1, rows, TX_COLS).setHorizontalAlignment("center");

  sheet.getRange(3, 4, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["입고", "출고", "폐기"]).setAllowInvalid(false).build());
  sheet.getRange(3, 5, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build());
  sheet.getRange(3, 6, rows, 1).setNumberFormat("#,##0"); // 단가 포맷

  // [TASK-016] AND(...) → IF(...): 판정 결과는 같지만 비용이 다르다.
  //   INDIRECT는 휘발성이라 편집 때마다 규칙 범위 전체가 재계산되는데,
  //   AND()는 인자를 모두 평가하므로 빈 행에서도 MATCH가 돌았다.
  //   IF()는 선택된 가지만 평가하므로 대부분을 차지하는 빈 행이 MATCH를 건너뛴다.
  //   (서식 범위를 시트 끝까지 넓히는 이번 변경의 전제 조건)
  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=IF($B3="", FALSE, ISERROR(MATCH($B3, INDIRECT("'${SHEET_MASTER}'!$A$3:$A"), 0)))`)
    .setBackground("#fce8e6").setFontColor("#c53929")
    .setRanges([sheet.getRange(3, 2, rows, 1)])
    .build();
  sheet.setConditionalFormatRules([rule]);
}

/** 📝 통합 입출고 기록장 — 전 컬럼 자동(파란색) 서식과 날짜/단가 숫자서식을 적용 */
function applyConsolidatedLogFormatting(sheet) {
  const rows = _formatRowCount(sheet);

  sheet.getRange(3, 1, rows, 1).setNumberFormat("yyyy-mm-dd");
  sheet.getRange(3, 6, rows, 1).setNumberFormat("#,##0");
  sheet.getRange(3, 1, rows, TX_COLS).setBackground(COLORS.autoBg).setHorizontalAlignment("center");
}

/**
 * [TASK-016] 서식/검증/보호 범위를 전 시트에 현재 행 수 기준으로 재적용한다.
 *
 * MIGRATIONS[16], 관리자 메뉴(repairAllSheetFormatting), 자가 복구(_healSheetFormattingIfStale)가
 * 모두 이 함수 하나만 호출한다. 같은 규칙을 마이그레이션·메뉴·빌더에 세 벌로 두면
 * 이후 컬럼 추가나 색상 변경 때 반드시 어긋나기 때문이다.
 *
 * 값(setValues/setFormula)은 일절 건드리지 않으므로 입력 데이터는 보존되고, 재실행해도 결과가 같다(멱등).
 *
 * ⚠️ 업장 시트의 품목코드(B열) 드롭다운은 의도적으로 재적용하지 않는다.
 *    removeItemCodeValidation()(RBAC.gs)이 "품목코드 직접 입력" 구조로 전환한 운영 결정이므로,
 *    여기서 다시 목록 검증을 걸면 그 결정을 되돌리게 된다.
 *
 * @returns {{sheets: number, addedRows: number, missing: string[]}}
 */
function reapplyAllSheetFormatting(ss) {
  const result = { sheets: 0, addedRows: 0, addedCols: 0, missing: [] };

  const track = function (name, sheet, apply) {
    if (!sheet) { result.missing.push(name); return; }
    const rowsBefore = sheet.getMaxRows();
    // [v18] 열 확충도 센다. _ensureMinColumns는 필요하면 말없이 열을 늘리는데,
    //   결과 보고에 행만 있으면 사용자 눈에는 "누르지도 않은 열이 생겼다"로 보인다.
    //   무엇을 했는지 보고에 적어 두면 같은 일이 결함 신고가 되지 않는다.
    const colsBefore = sheet.getMaxColumns();
    apply(sheet);
    result.addedRows += sheet.getMaxRows() - rowsBefore;
    result.addedCols += sheet.getMaxColumns() - colsBefore;
    result.sheets++;
  };

  // [TASK-017] 거래처관리를 품목 마스터보다 먼저 굽는다.
  //   품목 마스터의 거래처 드롭다운이 거래처 시트의 FILTER 소스 열(N열)을 참조하므로,
  //   소스가 복구된 뒤에 드롭다운을 걸어야 순서가 어긋나지 않는다.
  track(SHEET_VENDORS, ss.getSheetByName(SHEET_VENDORS), function (sh) { applyVendorsFormatting(sh); });
  track(SHEET_MASTER, ss.getSheetByName(SHEET_MASTER), function (sh) { applyItemMasterFormatting(ss, sh); });
  track(SHEET_INOUT, ss.getSheetByName(SHEET_INOUT), function (sh) { applyConsolidatedLogFormatting(sh); });

  [SHEET_TEMPLATE].concat(_getActiveShopNames()).forEach(function (name) {
    track(name, ss.getSheetByName(name), function (sh) {
      applyTxInputSheetFormatting(sh);
      // 템플릿은 보호 대상이 아니다 — 업장 시트만 편집 허용 범위를 넓힌다
      if (name !== SHEET_TEMPLATE) _applyShopUnprotectedRanges(sh);
    });
  });

  console.log("[TASK-016] 서식 재적용 완료 — 시트 " + result.sheets + "개, " + result.addedRows + "행 확충" +
    (result.addedCols ? ", " + result.addedCols + "열 확충" : "") +
    (result.missing.length ? " (없는 시트: " + result.missing.join(", ") + ")" : ""));
  return result;
}

/**
 * [TASK-016] 품목 마스터의 서식 커버리지가 시트 행 수에 못 미치는지 셀 1개 조회로 판정한다.
 *
 * 마지막 행 A열 배경이 입력색이 아니면 그 행은 서식 적용 범위 밖이다 — 즉 시트 행이
 * 늘어난 뒤(하단 "행 추가" 버튼, 대량 붙여넣기) 서식이 따라가지 못한 상태다.
 * 조건부 서식 결과는 getBackground에 반영되지 않으므로 정적 배경색만 보면 된다.
 */
function _isItemMasterFormattingStale(sheet) {
  const lastRow = sheet.getMaxRows();
  if (lastRow < 3) return false;
  const bg = String(sheet.getRange(lastRow, 1).getBackground() || "").toLowerCase();
  return bg !== String(COLORS.inputBg).toLowerCase();
}

/**
 * [TASK-016] 서식 커버리지가 깨져 있으면 자동으로 복구한다.
 *
 * 상수를 올리는 대응(TASK-009 → TASK-016)이 반복된 이유는 서식 적용이 언제나
 * "적용 시점의 스냅샷"이고, 그 뒤 행이 늘어나면 아무도 다시 굽지 않았기 때문이다.
 * 관리자가 서식이 깨진 것을 눈으로 보기 전에는 복구 메뉴를 누르지 않으므로,
 * 통합 갱신(refreshDashboard — 자정 트리거 포함)이 셀 1개 조회 비용으로 이를 점검한다.
 *
 * @returns {boolean} 실제로 복구를 실행했으면 true
 */
function _healSheetFormattingIfStale(ss) {
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  if (!masterSheet || !_isItemMasterFormattingStale(masterSheet)) return false;
  console.log("[TASK-016] 서식 커버리지 이탈 감지 (최대 행: " + masterSheet.getMaxRows() + ") — 자동 복구 실행");
  reapplyAllSheetFormatting(ss);
  return true;
}

// ═══════════════════════════════════════════════════════════════════
//  🤝 거래처관리 시트 (TASK-017)
// ═══════════════════════════════════════════════════════════════════

/**
 * [TASK-017] 품목 마스터 거래처 드롭다운의 소스 범위 — 🤝 거래처관리 N열(숨김).
 *
 * 이 열에는 "사용여부=사용"인 거래처코드만 FILTER로 흘러 들어온다.
 * 범위 폭을 고정 상수로 두지 않는 이유는 TASK-016과 같다 — 거래처가 늘어나면
 * 상수 바깥의 코드는 드롭다운에서 조용히 사라진다. 시트의 실제 행 수를 따라간다.
 */
function _vendorActiveCodeRange(vendorSheet) {
  const rows = Math.max(vendorSheet.getMaxRows() - 2, 1);
  return vendorSheet.getRange(3, VENDOR_ACTIVE_CODE_COL, rows, 1);
}

/**
 * 🤝 거래처관리 — 배경색/정렬/드롭다운/조건부서식과 드롭다운 소스 수식을 적용한다.
 *
 * 품목 마스터와 달리 VALIDATION_ROWS(5000)로 미리 굽지 않는다. 거래처는 수백 건 규모라
 * 기본 행 수로 충분하고, 범위는 어차피 시트의 현재 행 수를 따라가므로 나중에 행을
 * 늘려도 reapplyAllSheetFormatting이 따라잡는다(TASK-016의 교훈은 "상수 상한을 두지 말 것"이지
 * "무조건 5000행을 구울 것"이 아니다).
 */
function applyVendorsFormatting(sheet) {
  // 드롭다운 소스(N열)까지 열을 확보한 뒤에 서식을 건다
  _ensureMinColumns(sheet, VENDOR_ACTIVE_CODE_COL);
  const rows = Math.max(sheet.getMaxRows() - 2, 1);

  // 전 컬럼 손입력 — 옛 검증을 지우고 아래에서 필요한 것만 다시 세운다(멱등)
  sheet.getRange(3, 1, rows, VENDOR_COL_COUNT)
    .setBackground(COLORS.inputBg)
    .setHorizontalAlignment("center")
    .setDataValidation(null);

  // 주소·비고는 길어서 가운데 정렬이 오히려 읽기 나쁘다
  sheet.getRange(3, VENDOR_COLS.ADDRESS + 1, rows, 1).setHorizontalAlignment("left");
  sheet.getRange(3, VENDOR_COLS.NOTE + 1, rows, 1).setHorizontalAlignment("left");

  // 코드·사업자번호·전화는 텍스트 서식이 필수다.
  //   숫자로 해석되면 "031-0000-..."의 앞자리 0이 날아가고 "123-45-67890"이 날짜/수식이 된다.
  [VENDOR_COLS.CODE, VENDOR_COLS.BIZ_NO, VENDOR_COLS.PHONE].forEach(function (c) {
    sheet.getRange(3, c + 1, rows, 1).setNumberFormat("@");
  });

  // 거래처코드 표기 규칙 경고 — setAllowInvalid(true)라 '차단'이 아니라 '경고 삼각형'이다.
  //   Human이 59건을 한 번에 붙여넣는 경로를 검증이 막아서는 안 되기 때문이다.
  sheet.getRange(3, VENDOR_COLS.CODE + 1, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied('=OR($A3="", REGEXMATCH(TO_TEXT($A3), "^' + VENDOR_CODE_PREFIX + '\\d{3,}$"))')
      .setAllowInvalid(true).build());

  sheet.getRange(3, VENDOR_COLS.BIZ_ENTITY + 1, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(VENDOR_BIZ_ENTITIES).setAllowInvalid(false).build());

  // 사용여부 — 거래처는 물리 삭제 금지(사용 중인 품목이 참조 중일 수 있다). 이 드롭다운이 논리 삭제 수단이다.
  sheet.getRange(3, VENDOR_COLS.USAGE_STATUS + 1, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(["사용", "미사용"]).setAllowInvalid(false).build());

  // ── 드롭다운 소스(N열, 숨김) ──
  // 데이터 검증의 requireValueInRange에는 조건을 걸 수 없다. "사용 중인 거래처만"을
  // 만들려면 걸러진 목록이 시트에 실제로 존재해야 하므로, 13열 입력 폼 밖에 숨김 열로 둔다.
  const srcCol = VENDOR_ACTIVE_CODE_COL;
  const usageA1 = _colLetter(VENDOR_COLS.USAGE_STATUS + 1);
  const codeA1 = _colLetter(VENDOR_COLS.CODE + 1);
  const srcFormula = '=IFERROR(SORT(FILTER($' + codeA1 + '$3:$' + codeA1 + ', $' + usageA1 + '$3:$' + usageA1 + '="사용")), "")';

  sheet.getRange(2, srcCol).setValue(VENDOR_ACTIVE_CODE_HEADER)
    .setBackground(COLORS.grayBg).setFontSize(8).setFontColor("#666666").setHorizontalAlignment("center");

  // 서식 재적용은 원칙적으로 값을 쓰지 않는다. 이 수식만 예외인 이유는 사용자 데이터가 아니라
  // 드롭다운을 지탱하는 배선이기 때문이다 — 지워졌거나 어긋났을 때만 되살린다.
  const srcCell = sheet.getRange(3, srcCol);
  if (srcCell.getFormula() !== srcFormula) srcCell.setFormula(srcFormula);
  sheet.hideColumns(srcCol);

  sheet.setConditionalFormatRules([
    // 거래처코드 중복 = PK 위반. 회색 규칙보다 앞서야 미사용 행에서도 눈에 띈다.
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($' + codeA1 + '3<>"", COUNTIF($' + codeA1 + '$3:$' + codeA1 + ', $' + codeA1 + '3)>1)')
      .setBackground("#fce8e6").setFontColor("#c53929").setBold(true)
      .setRanges([sheet.getRange(3, VENDOR_COLS.CODE + 1, rows, 1)]).build(),
    // 미사용 거래처는 행 전체를 회색 — 품목 마스터와 같은 관례
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + usageA1 + '3="미사용"')
      .setBackground("#f0f0f0").setFontColor("#999999")
      .setRanges([sheet.getRange(3, 1, rows, VENDOR_COL_COUNT)]).build()
  ]);
}

/**
 * [TASK-017] 🤝 거래처관리 시트를 생성한다 (A~M 13열 + N열 드롭다운 소스).
 *
 * 초기 59건은 Human이 직접 붙여넣으므로 데이터는 한 줄도 심지 않는다 — 빈 폼만 만든다.
 */
function buildVendors(ss) {
  // 이미 있으면 그 시트를 고쳐 쓴다.
  //   insertSheet는 같은 이름이 있으면 예외를 던진다. 그런데 이 함수는 마이그레이션(v17)이
  //   부르는 함수이고, 마이그레이션은 중간에 실패했다가 사람이 다시 실행하는 일이 실제로 있다.
  //   시트를 만든 직후 실패하면 "반쯤 만들어진 시트"가 남는데, 그때 여기서 예외를 던지거나
  //   호출부가 "이미 있으니 스킵"해 버리면 그 반쯤 만들어진 상태가 그대로 굳는다.
  //   아래 작업은 전부 같은 값을 다시 쓰는 멱등 연산이라 재실행이 곧 복구가 된다.
  const sheet = ss.getSheetByName(SHEET_VENDORS) || ss.insertSheet(SHEET_VENDORS);
  sheet.getRange("A1:M1").merge()
    .setValue("🤝 거래처(매입처) 관리 — 행 삭제 금지. 거래를 끊을 때는 M열 사용여부를 '미사용'으로 바꾸세요.")
    .setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");

  const headers = [
    "거래처코드", "거래처명", "약어명", "사업자번호", "대표자명", "업태", "업종",
    "주소", "전화", "이메일", "사업자구분", "비고", "사용여부"
  ];
  sheet.getRange("A2:M2").setValues([headers]);
  _formatHeader(sheet, "A2:M2");

  // 헤더 그룹 색 — 식별정보 / 사업자정보 / 연락처 / 상태
  sheet.getRange("A2:C2").setBackground("#16a085"); // 식별
  sheet.getRange("D2:G2").setBackground("#34495e"); // 사업자
  sheet.getRange("H2:J2").setBackground("#2980b9"); // 연락처
  sheet.getRange("K2:L2").setBackground("#8e44ad"); // 분류/비고
  sheet.getRange("M2").setBackground("#7f8c8d");    // 사용여부

  sheet.getRange("A2").setNote(
    "거래처코드는 " + VENDOR_CODE_PREFIX + "001 형식으로 부여합니다.\n" +
    "한 번 부여한 코드는 바꾸지 마세요 — 품목 마스터가 거래처명이 아니라 이 코드로만 거래처를 참조합니다.\n" +
    "형식이 어긋나면 셀에 경고 삼각형이 표시되지만 입력은 막지 않습니다.");

  sheet.setFrozenRows(2);
  // ⚠️ setFrozenColumns는 쓰지 않는다.
  //   1행 제목이 A1:M1 병합이라 2열만 고정하면 병합 범위를 가로질러 잘리게 되고,
  //   Sheets가 "병합된 셀의 일부만 포함된 열을 고정할 수 없습니다"로 거부해 시트 생성이 통째로 실패한다.
  //   품목 마스터도 같은 이유로 행 고정만 쓴다(A1:Y1 병합 + setFrozenRows).

  applyVendorsFormatting(sheet);

  sheet.setColumnWidth(1, 100);  // 거래처코드
  sheet.setColumnWidth(2, 200);  // 거래처명
  sheet.setColumnWidth(3, 100);  // 약어명
  sheet.setColumnWidth(4, 130);  // 사업자번호
  sheet.setColumnWidth(5, 100);  // 대표자명
  sheet.setColumnWidth(6, 120);  // 업태
  sheet.setColumnWidth(7, 120);  // 업종
  sheet.setColumnWidth(8, 260);  // 주소
  sheet.setColumnWidth(9, 130);  // 전화
  sheet.setColumnWidth(10, 180); // 이메일
  sheet.setColumnWidth(11, 100); // 사업자구분
  sheet.setColumnWidth(12, 160); // 비고
  sheet.setColumnWidth(13, 90);  // 사용여부
}


// ═══════════════════════════════════════════════════════════════════
//  🏢 업장관리 시트
// ═══════════════════════════════════════════════════════════════════

function buildShopsSheet(ss) {
  const sheet = ss.insertSheet(SHEET_SHOPS);
  sheet.getRange("A1:F1").merge().setValue("🏢 업장 관리").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");

  sheet.getRange("A2:F2").setValues([["분류 (드롭다운)", "업장명 (고유)", "거래 ID 태그", "시트 생성 상태", "바로가기", "Sheet ID (GID)"]])
       .setBackground("#1b3a4b").setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");

  sheet.getRange("A3:C6").setValues([
    ["식음", "맛다락", "TX"],
    ["식음", "술다락", "AX"],
    ["스파월드", "남탕", "MB"],
    ["스파월드", "여탕", "WB"]
  ]);
  sheet.getRange("D3:D6").setValues([["대기"], ["대기"], ["대기"], ["대기"]]);
  sheet.getRange("A3:F30").setHorizontalAlignment("center");
  sheet.getRange("A3:C30").setBackground(COLORS.inputBg);
  sheet.getRange("D3:F30").setBackground(COLORS.autoBg);

  // 분류 드롭다운 (기초데이터 시트 참조 — createAll에서 기초데이터 시트가 먼저 생성되어야 함)
  // 초기 생성 시에는 하드코딩, 이후 기초데이터 시트 참조로 전환
  sheet.getRange("A3:A30").setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["호텔","콘도","빌리지","스파월드","식음","조리","관리","구매","판촉"])
      .setAllowInvalid(false).build()
  );

  sheet.setColumnWidth(1, 110); sheet.setColumnWidth(2, 130); sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 120); sheet.setColumnWidth(5, 140); sheet.setColumnWidth(6, 120);
  sheet.setFrozenRows(2);
}


// ═══════════════════════════════════════════════════════════════════
//  📅 시즌설정 시트
// ═══════════════════════════════════════════════════════════════════

function buildSeasonsSheet(ss) {
  const sheet = ss.insertSheet(SHEET_SEASONS);
  sheet.getRange("A1:D1").merge().setValue("📅 시즌 설정").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");

  // 현재 시즌 표시
  sheet.getRange("A2:B2").setValues([["현재 적용 시즌 ➔", `=IFERROR(INDEX(FILTER(A5:A, B5:B<=TODAY(), C5:C>=TODAY()), 1), "비수기")`]]);
  sheet.getRange("A2").setFontWeight("bold").setHorizontalAlignment("right");
  sheet.getRange("B2").setFontWeight("bold").setFontColor("blue").setHorizontalAlignment("center");

  sheet.getRange("C2:D2").setValues([["현재 안전재고 배수 ➔", `=IFERROR(INDEX(FILTER(D5:D, B5:B<=TODAY(), C5:C>=TODAY()), 1), 1.0)`]]);
  sheet.getRange("C2").setFontWeight("bold").setHorizontalAlignment("right");
  sheet.getRange("D2").setFontWeight("bold").setFontColor("red").setHorizontalAlignment("center");

  sheet.getRange("A4:D4").setValues([["시즌명", "시작일", "종료일", "안전재고배수"]]).setBackground("#8e44ad").setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");

  sheet.getRange("A5:D8").setValues([
    ["비수기", new Date(2026, 0, 1), new Date(2026, 5, 30), 1.0],
    ["여름성수기", new Date(2026, 6, 1), new Date(2026, 7, 31), 1.2],
    ["가을", new Date(2026, 8, 1), new Date(2026, 10, 30), 1.0],
    ["겨울성수기", new Date(2026, 11, 1), new Date(2027, 1, 28), 1.5]
  ]);
  sheet.getRange("B5:C20").setNumberFormat("yyyy-mm-dd");
  sheet.getRange("A5:D20").setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  sheet.setColumnWidth(1, 120); sheet.setColumnWidth(2, 120); sheet.setColumnWidth(3, 120); sheet.setColumnWidth(4, 120);
  sheet.setFrozenRows(4);
}


// ═══════════════════════════════════════════════════════════════════
//  👤 사용자관리 시트
// ═══════════════════════════════════════════════════════════════════

function buildUsersSheet(ss) {
  const sheet = ss.insertSheet(SHEET_USERS);
  sheet.getRange("A1:F1").merge().setValue("👤 사용자 계정 관리").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");

  sheet.getRange("A2:F2").setValues([["아이디 (회사이메일)", "비밀번호 해시", "성함", "부서", "역할", "배정 업장"]]).setBackground("#2c3e50").setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");

  // 최초 계정은 배포 환경의 Script Properties에서만 가져옵니다.
  const initialAdmin = _getInitialAdminConfiguration();
  const userData = [[
    initialAdmin.username,
    _hashPassword(initialAdmin.password).stored,
    initialAdmin.name,
    initialAdmin.dept,
    ROLES.ADMIN
  ]];

  sheet.getRange(3, 1, userData.length, 6).setValues(userData.map(row => row.concat([""])));
  sheet.getRange("A3:F30").setBackground(COLORS.inputBg).setHorizontalAlignment("center");
  sheet.getRange("B3:B30").setFontSize(7).setFontColor("#999999"); // 해시 컬럼은 작게 표시

  sheet.setColumnWidth(1, 180); sheet.setColumnWidth(2, 100); sheet.setColumnWidth(3, 80); sheet.setColumnWidth(4, 100); sheet.setColumnWidth(5, 80); sheet.setColumnWidth(6, 180);
  sheet.setFrozenRows(2);
}


// ═══════════════════════════════════════════════════════════════════
//  📂 기초데이터 시트
// ═══════════════════════════════════════════════════════════════════

function buildBaseDataSheet(ss) {
  const sheet = ss.insertSheet(SHEET_BASE_DATA);
  sheet.getRange("A1:C1").merge().setValue("📂 기초 데이터 (드롭다운 목록)").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");

  // 대분류 목록 (A열)
  sheet.getRange("A2").setValue("대분류 목록").setFontWeight("bold").setHorizontalAlignment("center").setBackground(COLORS.grayBg);
  const categories = [["호텔"], ["콘도"], ["빌리지"], ["스파월드"], ["식음"], ["조리"], ["관리"], ["구매"], ["판촉"]];
  sheet.getRange(3, 1, categories.length, 1).setValues(categories).setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  // 단위 목록 (B열)
  sheet.getRange("B2").setValue("단위 목록").setFontWeight("bold").setHorizontalAlignment("center").setBackground(COLORS.grayBg);
  // [v11] PACK→팩, set→세트 명칭 통일, 신규 단위 10종 추가
  // [v13] CASE 제거 — 사용자 결정으로 기초데이터 단위 목록에서 삭제(MIGRATIONS[13] 참고)
  // [v15] 단위 '조', '줄' 추가
  const units = [["박스"], ["개"], ["묶음"], ["병"], ["캔"], ["kg"], ["L"], ["포"], ["롤"], ["장"], ["세트"], ["EA"], ["팩"], ["봉"], ["통"], ["말"], ["자루"], ["ml"], ["g"], ["대"], ["미터"], ["포대"], ["봉지"], ["르베"], ["권"], ["갑"], ["단"], ["망"], ["판"], ["마리"], ["족"], ["타레"], ["벌"], ["켤레"], ["매"], ["평"], ["본"], ["조"], ["줄"]];
  sheet.getRange(3, 2, units.length, 1).setValues(units).setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  // 품목 카테고리 (C열)
  sheet.getRange("C2").setValue("품목 카테고리").setFontWeight("bold").setHorizontalAlignment("center").setBackground(COLORS.grayBg);
  const itemCategories = [
    ["원재료"], ["어메니티"], ["세제류"], ["소모품"],
    ["식재료"], ["음료"], ["청소용품"], ["린넨류"],
    ["위생용품"], ["사무용품"], ["시설자재"], ["저장품"], ["기타"]
  ];
  sheet.getRange(3, 3, itemCategories.length, 1).setValues(itemCategories).setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  sheet.setColumnWidth(1, 120); sheet.setColumnWidth(2, 100); sheet.setColumnWidth(3, 120);
  sheet.setFrozenRows(2);
}


// ═══════════════════════════════════════════════════════════════════
//  📋 변경이력 시트
// ═══════════════════════════════════════════════════════════════════

function buildChangelogSheet(ss) {
  const sheet = ss.insertSheet(SHEET_CHANGELOG);
  sheet.getRange("A1:G1").merge().setValue("📋 품목 마스터 변경 이력").setBackground(COLORS.grayBg).setFontStyle("italic");

  sheet.getRange("A2:G2").setValues([["변경일시", "변경자", "품목코드", "품목명", "변경필드", "변경 전", "변경 후"]])
       .setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setFrozenRows(2);

  sheet.getRange("A3:G500").setBackground(COLORS.autoBg).setHorizontalAlignment("center");
  sheet.getRange("A3:A500").setNumberFormat("yyyy-mm-dd hh:mm:ss");

  sheet.setColumnWidth(1, 160); sheet.setColumnWidth(2, 100); sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 150); sheet.setColumnWidth(5, 120); sheet.setColumnWidth(6, 150); sheet.setColumnWidth(7, 150);

  sheet.protect().setDescription("변경이력 보호").setWarningOnly(true);
}


// ═══════════════════════════════════════════════════════════════════
//  📋 입출고 템플릿 시트 (9열 구조)
// ═══════════════════════════════════════════════════════════════════

function buildTemplateSheet(ss) {
  const sheet = ss.insertSheet(SHEET_TEMPLATE);
  sheet.getRange("A1:I1").merge().setValue("📋 [원본 템플릿 시트]  절대 삭제하지 마십시오.").setBackground("#555555").setFontColor("#ffffff").setFontStyle("italic");
  
  // [v7.0] 9열 구조: 단가(스냅샷) 열 추가
  const headers = ["날짜", "품목코드", "품목명", "구분", "수량", "단가", "담당자", "비고", "거래ID"];
  sheet.getRange("A2:I2").setValues([headers]);
  _formatHeader(sheet, "A2:I2");
  sheet.setFrozenRows(2);
  
  applyTxInputSheetFormatting(sheet);

  sheet.setColumnWidth(3, 190); sheet.setColumnWidth(6, 100); sheet.setColumnWidth(9, 200);
}


// ═══════════════════════════════════════════════════════════════════
//  🗂️ 품목 마스터 시트
// ═══════════════════════════════════════════════════════════════════

/**
 * [TASK-017] 품목 마스터 회계 3열(V·W·X)의 ARRAYFORMULA.
 *
 * 빌더(buildItemMaster)와 마이그레이션(v17)이 같은 수식을 각자 문자열로 들고 있으면,
 * 다음에 열이 한 번 더 밀릴 때 한쪽만 고쳐 두 경로의 결과가 갈라진다.
 * Task가 "자동 시프트에 의존하지 말고 명시적으로 덮어쓸 것"을 요구하므로 덮어쓰는 주체는 둘인데,
 * 덮어쓸 내용은 하나여야 한다.
 */
function _masterSupplyPriceFormula() {   // V열: 공급단가
  return `=ARRAYFORMULA(IF(A3:A="", "", IF(T3:T="과세", ROUND(U3:U/1.1, 0), IF(T3:T="비과세", U3:U, ""))))`;
}
function _masterTaxAmountFormula() {     // W열: 단위 세액
  return `=ARRAYFORMULA(IF(A3:A="", "", IF(T3:T="과세", U3:U-V3:V, IF(T3:T="비과세", 0, ""))))`;
}
function _masterTotalValueFormula() {    // X열: 재고 합계금액
  return `=ARRAYFORMULA(IF(A3:A="", "", IF(U3:U * H3:H < 0, 0, U3:U * H3:H)))`;
}

function buildItemMaster(ss) {
  const sheet = ss.insertSheet(SHEET_MASTER);
  // [TASK-017] 25열(Y열: 사용유무) 포함 — S열에 거래처코드를 끼워 넣어 24열에서 늘어났다
  sheet.getRange("A1:Y1").merge().setValue("🗂️ 품목 마스터 변수 관리").setBackground(COLORS.grayBg).setFontStyle("italic");
  
  const headers = [
    "품목코드", "품목명", "카테고리", "규격", "단위", "",
    "초기재고", "현재고", "일평균 사용량", "",
    "리드타임", "안전재고일수", "목표유지일수", "안전재고", "발주점", "적정발주량", "재고 상태", "",
    // [TASK-017] 거래처코드가 S열로 들어오면서 과세구분~사용유무가 한 칸씩 밀렸다
    "거래처코드", "과세구분", "매입단가", "공급단가", "단위 세액", "재고 합계금액", "사용유무"
  ];
  sheet.getRange("A2:Y2").setValues([headers]);
  _formatHeader(sheet, "A2:Y2");
  sheet.setFrozenRows(2);

  // 헤더 그룹화 시각적 효과 (Spacer 제외 색상)
  sheet.getRange("A2:E2").setBackground("#34495e"); // 기본정보
  sheet.getRange("F2").setBackground(COLORS.grayBg); // Spacer
  sheet.getRange("G2:I2").setBackground("#2980b9"); // 재고현황
  sheet.getRange("J2").setBackground(COLORS.grayBg); // Spacer
  sheet.getRange("K2:Q2").setBackground("#8e44ad"); // 발주설정
  sheet.getRange("R2").setBackground(COLORS.grayBg); // Spacer
  sheet.getRange("S2").setBackground("#16a085"); // [TASK-017] 거래처 (🤝 거래처관리 참조)
  sheet.getRange("T2:X2").setBackground("#27ae60"); // 회계금액
  sheet.getRange("Y2").setBackground("#7f8c8d"); // [v9.0] 사용유무



  // 안전재고 (N3) — [v7.0] 시즌 배수 참조를 시즌설정 시트로 변경
  sheet.getRange("N3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", ROUNDUP(I3:I * L3:L * '${SHEET_SEASONS}'!$D$2, 0)))`);
  // 발주점 (O3)
  sheet.getRange("O3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", ROUNDUP((I3:I * K3:K) + N3:N, 0)))`);
  // 적정발주량 (P3)
  // [TASK-011] 일평균(I열)이 0 이하이면 발주량을 0으로 고정한다.
  //   현재고가 음수가 되면 `목표수량 - (-5)`가 되어 사용 이력이 없는 품목까지
  //   발주를 권장하던 문제를 막는다.
  sheet.getRange("P3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", IF(I3:I<=0, 0, IF((I3:I * M3:M) - H3:H < 0, 0, ROUNDUP((I3:I * M3:M) - H3:H, 0)))))`);
  // 재고 상태 (Q3)
  sheet.getRange("Q3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", IF(H3:H<=N3:N, "${STATUS_RISK}", IF(H3:H<=O3:O, "${STATUS_ORDER}", "${STATUS_OK}"))))`);
  
  // 회계 (V3, W3) — [v7.0] 합계금액 열은 StockEngine FIFO에서 직접 기록
  // [TASK-017] S열 삽입으로 세 수식이 모두 한 칸씩 이동했다.
  //   과세구분 S→T, 매입단가 T→U, 공급단가 U→V, 단위세액 V→W, 합계금액 W→X.
  //   시트의 자동 참조 시프트에 기대지 않고 마이그레이션(v17)에서도 이 문자열을 그대로 덮어쓴다.
  sheet.getRange("V3").setFormula(_masterSupplyPriceFormula());
  sheet.getRange("W3").setFormula(_masterTaxAmountFormula());
  // X열: 초기값 (FIFO 전에는 단순 계산, StockEngine 실행 후 덮어씀)
  // [TASK-011] 음수 재고에서도 재고자산 평가액은 0원을 하한으로 둔다.
  //   ARRAYFORMULA 안에서는 MAX()가 배열 전체를 집계하므로 IF로 행 단위 절사한다.
  sheet.getRange("X3").setFormula(_masterTotalValueFormula());

  applyItemMasterFormatting(ss, sheet);
  sheet.setColumnWidth(1, 120); sheet.setColumnWidth(2, 220); sheet.setColumnWidth(3, 120); 
  sheet.setColumnWidth(4, 90); sheet.setColumnWidth(5, 90); sheet.setColumnWidth(6, 20); // Spacer
  sheet.setColumnWidth(7, 100); sheet.setColumnWidth(8, 100); sheet.setColumnWidth(9, 130); 
  sheet.setColumnWidth(10, 20); // Spacer
  sheet.setColumnWidth(11, 100); sheet.setColumnWidth(12, 120); sheet.setColumnWidth(13, 120); 
  sheet.setColumnWidth(14, 100); sheet.setColumnWidth(15, 100); sheet.setColumnWidth(16, 120); 
  sheet.setColumnWidth(17, 100); sheet.setColumnWidth(18, 20); // Spacer
  // [TASK-017] 19: 거래처코드(신규) · 20: 과세구분 · 21: 매입단가 · 22: 공급단가 · 23: 단위세액 · 24: 재고합계 · 25: 사용유무
  sheet.setColumnWidth(19, 110); sheet.setColumnWidth(20, 100); sheet.setColumnWidth(21, 120);
  sheet.setColumnWidth(22, 120); sheet.setColumnWidth(23, 120); sheet.setColumnWidth(24, 140);
  sheet.setColumnWidth(25, 90); // [v9.0] 사용유무

  // [TASK-006] 초기재고 열 경고 전용 보호 (마감 후 수동 입력으로 인한 이중 계상 방지)
  applyInitStockProtection(ss);
}


// ═══════════════════════════════════════════════════════════════════
//  📝 통합 입출고 기록장 (9열 구조)
// ═══════════════════════════════════════════════════════════════════

function buildConsolidatedLog(ss) {
  const consolidatedSheet = ss.insertSheet(SHEET_INOUT);
  consolidatedSheet.getRange("A1:I1").merge().setValue("📊 [통합 데이터베이스] 수동 편집 금지").setBackground(COLORS.grayBg).setFontStyle("italic");
  
  // [v7.0] 9열 구조
  const headers = ["날짜", "품목코드", "품목명", "구분", "수량", "단가", "담당자", "비고", "거래ID"];
  consolidatedSheet.getRange("A2:I2").setValues([headers]).setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
  consolidatedSheet.setFrozenRows(2);
  
  applyConsolidatedLogFormatting(consolidatedSheet);
  consolidatedSheet.setColumnWidth(3, 190); consolidatedSheet.setColumnWidth(6, 100); consolidatedSheet.setColumnWidth(9, 200);
  consolidatedSheet.protect().setDescription("통합 DB 보호").setWarningOnly(true);
}


// ═══════════════════════════════════════════════════════════════════
//  📊 대시보드 시트
// ═══════════════════════════════════════════════════════════════════

/**
 * [TASK-017] 대시보드 상단 KPI 4칸의 수식/서식을 적용한다.
 *
 * buildDashboard에서 떼어낸 이유: 이 수식들은 품목 마스터의 열 문자를 직접 참조한다.
 * 지금까지는 대시보드가 "만들 때 한 번" 구워지고 끝이라, 열이 밀리면 이미 만들어진
 * 대시보드는 시트의 자동 참조 시프트에만 기대야 했다. 그 시프트는 수식이 손으로
 * 지워졌거나 고쳐진 시트에서는 일어나지 않으므로 결과가 시트마다 갈린다.
 * 마이그레이션(v17)이 같은 함수를 불러 최종 형태를 못 박는다.
 *
 * 값(수식)을 쓰므로 reapplyAllSheetFormatting에는 넣지 않는다 — 그쪽은 서식 전용이다.
 */
function applyDashboardKpiFormulas(sheet) {
  // KPI 4개가 사용유무 참조를 각자 하드코딩하고 있어 하나만 빠뜨리면 숫자끼리 어긋난다.
  // 참조를 상수에서 한 번만 만들어 4개가 공유한다. ([TASK-017] 사용유무 X → Y)
  const usageCol = _colLetter(MASTER_COLS.USAGE_STATUS + 1);
  const usageRef = `'${SHEET_MASTER}'!${usageCol}3:${usageCol}`;

  const kpis = [
    // [v9.0] COUNTIFS 사용하여 미사용 품목 제외
    { range: "B5:C8", title: "전체 관리 품목", formula: `COUNTIFS('${SHEET_MASTER}'!A3:A,"<>",IFERROR(${usageRef},"사용"),"<>미사용")`, bg: COLORS.headerBg },
    { range: "D5:E8", title: "🚨 위험", formula: `COUNTIFS('${SHEET_MASTER}'!Q3:Q,"${STATUS_RISK}",IFERROR(${usageRef},"사용"),"<>미사용")`, bg: COLORS.riskBg },
    { range: "F5:G8", title: "⚠️ 발주필요", formula: `COUNTIFS('${SHEET_MASTER}'!Q3:Q,"${STATUS_ORDER}",IFERROR(${usageRef},"사용"),"<>미사용")`, bg: COLORS.orderBg },
    { range: "H5:I8", title: "✅ 정상", formula: `COUNTIFS('${SHEET_MASTER}'!Q3:Q,"${STATUS_OK}",IFERROR(${usageRef},"사용"),"<>미사용")`, bg: COLORS.normalBg }
  ];
  kpis.forEach(kpi => {
    const r = sheet.getRange(kpi.range).merge();
    r.setBackground(kpi.bg).setFontColor(COLORS.headerText).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true).setFontSize(14).setFontWeight("bold");
    r.setFormula(`="${kpi.title}" & CHAR(10) & TEXT(${kpi.formula}, "#,##0") & " 개"`);
  });
}

function buildDashboard(ss) {
  const sheet = ss.insertSheet(SHEET_DASHBOARD);
  sheet.getRange("A1:J1").merge().setValue("(주)호텔덕구온천 통합 구매 재고 관리 대시보드").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center");
  sheet.getRange("B2").setValue("기준일:").setFontWeight("bold");
  sheet.getRange("C2").setFormula("=TODAY()").setNumberFormat("yyyy-mm-dd");
  sheet.getRange("B3").setValue("현재 시즌:").setFontWeight("bold");
  // [v7.0] 시즌 참조를 시즌설정 시트로 변경
  sheet.getRange("C3").setFormula(`='${SHEET_SEASONS}'!B2`).setFontColor("blue").setFontWeight("bold"); 

  applyDashboardKpiFormulas(sheet);

  for (let row = 5; row <= 8; row++) sheet.setRowHeight(row, 30);
  sheet.getRange("B10:I10").setValues([["품목코드", "품목명", "규격", "현재고", "안전재고", "발주점(ROP)", "적정발주량", "상태"]]).setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setColumnWidth(1, 20); // Spacer
  sheet.setColumnWidth(2, 130); // 품목코드
  sheet.setColumnWidth(3, 220); sheet.setColumnWidth(8, 120);
}

// ═══════════════════════════════════════════════════════════════════
//  🚨 시스템 에러 로그 시트 (v10.0)
// ═══════════════════════════════════════════════════════════════════

function buildSystemLogsSheet(ss) {
  const sheet = ss.insertSheet(SHEET_SYSTEM_LOGS);
  sheet.getRange("A1:F1").merge().setValue("🚨 시스템 에러 로그")
    .setBackground("#c0392b").setFontColor("#fff").setFontWeight("bold");
  sheet.getRange("A2:F2").setValues([["시각", "함수명", "사용자", "에러 메시지", "스택 트레이스", "심각도"]])
    .setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold");
  
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 300);
  sheet.setColumnWidth(5, 400);
  sheet.setColumnWidth(6, 80);
  
  sheet.setFrozenRows(2);
  sheet.hideSheet(); // 관리자만 볼 수 있도록 숨김
}


/**
 * 헤더 행 서식을 일괄 적용하는 헬퍼
 */
function _formatHeader(sheet, range, bgColor, fontColor) {
  sheet.getRange(range)
    .setBackground(bgColor || COLORS.headerBg)
    .setFontColor(fontColor || COLORS.headerText)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
}

/**
 * 데이터 영역 서식을 일괄 적용하는 헬퍼
 */
function _formatDataArea(sheet, startRow, startCol, numRows, numCols, bgColor) {
  sheet.getRange(startRow, startCol, numRows, numCols)
    .setBackground(bgColor || COLORS.inputBg)
    .setHorizontalAlignment("center");
}


// ═══════════════════════════════════════════════════════════════════
//  [TASK-006] 초기재고(G열) 보호
// ═══════════════════════════════════════════════════════════════════

const INIT_STOCK_PROTECTION_DESC = "초기재고(G열) 이중 계상 방지 보호";

/**
 * 품목 마스터의 초기재고 열에 '경고 전용' 보호를 건다.
 *
 * 왜 필요한가:
 *   현재고 = 초기재고(G열) + Σ입고 − Σ출고 − Σ폐기 이다.
 *   월마감은 남은 재고를 "마감 이월" 입고 행으로 옮겨 적고 G열을 0으로 리셋하는데,
 *   마감 후 누군가 G열에 값을 다시 적어 넣으면 같은 재고가 두 번 계산된다.
 *   (`Archive.gs`의 `detectCarryoverDoubleCount()`가 감지하는 바로 그 상황)
 *
 * 왜 '경고 전용'인가:
 *   G열은 신규 품목 등록 시 "지금 창고에 이미 있는 수량"을 적는 정상 입력 칸이기도 하다.
 *   완전히 잠그면 그 운영 경로가 막히므로, 편집 시 확인 대화상자만 띄워 실수를 거른다.
 *   (`RBAC.gs`의 `_protectSystemSheets()`와 동일한 관례)
 *
 * 멱등(idempotent): 같은 설명의 기존 보호가 있으면 제거 후 현재 행 수에 맞춰 다시 건다.
 *
 * @param {Spreadsheet} [ss] 대상 스프레드시트 (생략 시 활성 스프레드시트)
 * @return {boolean} 보호를 적용했으면 true
 */
function applyInitStockProtection(ss) {
  const spreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = spreadsheet.getSheetByName(SHEET_MASTER);
  if (!masterSheet) return false;

  masterSheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter(p => p.getDescription() === INIT_STOCK_PROTECTION_DESC)
    .forEach(p => p.remove());

  const numRows = Math.max(masterSheet.getMaxRows() - 2, 1);
  masterSheet.getRange(3, MASTER_COLS.INIT_STOCK + 1, numRows, 1)
    .protect()
    .setDescription(INIT_STOCK_PROTECTION_DESC)
    .setWarningOnly(true);

  return true;
}
