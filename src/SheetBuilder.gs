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
  const rows = _formatRowCount(sheet);

  // Validation — [v7.0] 기초데이터 시트 참조
  const baseDataSheet = ss.getSheetByName(SHEET_BASE_DATA);
  if (baseDataSheet) {
    sheet.getRange(3, 3, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(baseDataSheet.getRange("C3:C50")).setAllowInvalid(false).build());
    sheet.getRange(3, 5, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(baseDataSheet.getRange("B3:B50")).setAllowInvalid(false).build());
  }

  sheet.getRange(3, 19, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["과세", "비과세"]).setAllowInvalid(false).build());
  // [v9.0] 사용유무 드롭다운 (X열 = 24번째 열)
  sheet.getRange(3, 24, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["사용", "미사용"]).setAllowInvalid(false).build());

  // Number format
  sheet.getRange(3, 20, rows, 4).setNumberFormat("#,##0");
  // [TASK-011] 현재고(H열) — 음수 재고를 -5 형태로 명확히 노출
  sheet.getRange(3, 8, rows, 1).setNumberFormat("#,##0");

  // Colors — 입력 컬럼 (노란색 톤)
  sheet.getRange(3, 1, rows, 5).setBackground(COLORS.inputBg); // 기본
  sheet.getRange(3, 7, rows, 1).setBackground(COLORS.inputBg); // 초기재고
  sheet.getRange(3, 11, rows, 3).setBackground(COLORS.inputBg); // 발주설정
  sheet.getRange(3, 19, rows, 2).setBackground(COLORS.inputBg); // 과세, 매입단가
  sheet.getRange(3, 24, rows, 1).setBackground(COLORS.inputBg); // [v9.0] 사용유무

  // 자동 컬럼 (파란색 톤)
  sheet.getRange(3, 8, rows, 2).setBackground(COLORS.autoBg); // 현재고, 일평균
  sheet.getRange(3, 14, rows, 4).setBackground(COLORS.autoBg); // 발주자동수식
  sheet.getRange(3, 21, rows, 3).setBackground(COLORS.autoBg); // 회계자동수식

  // Spacer 처리
  sheet.getRange(2, 6, rows + 1, 1).setBackground(COLORS.grayBg);
  sheet.getRange(2, 10, rows + 1, 1).setBackground(COLORS.grayBg);
  sheet.getRange(2, 18, rows + 1, 1).setBackground(COLORS.grayBg);

  sheet.getRange(3, 1, rows, 24).setHorizontalAlignment("center");

  const cfRules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_RISK).setBackground(COLORS.riskBg).setFontColor("#fff").setRanges([sheet.getRange(3, 17, rows, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_ORDER).setBackground(COLORS.orderBg).setFontColor("#fff").setRanges([sheet.getRange(3, 17, rows, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_OK).setBackground(COLORS.normalBg).setFontColor("#fff").setRanges([sheet.getRange(3, 17, rows, 1)]).build(),
    // [TASK-011] 현재고 음수(초과출고/실사 결손) 강조 — 미사용 행 회색 규칙보다 앞서야 우선 적용된다
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setBackground("#fce8e6").setFontColor("#c53929").setBold(true).setRanges([sheet.getRange(3, 8, rows, 1)]).build(),
    // [v9.0] 미사용 행 전체를 회색 처리
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$X3="미사용"').setBackground("#f0f0f0").setFontColor("#999999").setRanges([sheet.getRange(3, 1, rows, 24)]).build()
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
  const result = { sheets: 0, addedRows: 0, missing: [] };

  const track = function (name, sheet, apply) {
    if (!sheet) { result.missing.push(name); return; }
    const rowsBefore = sheet.getMaxRows();
    apply(sheet);
    result.addedRows += sheet.getMaxRows() - rowsBefore;
    result.sheets++;
  };

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

function buildItemMaster(ss) {
  const sheet = ss.insertSheet(SHEET_MASTER);
  // [v9.0] 24열(X열: 사용유무) 포함
  sheet.getRange("A1:X1").merge().setValue("🗂️ 품목 마스터 변수 관리").setBackground(COLORS.grayBg).setFontStyle("italic");
  
  const headers = [
    "품목코드", "품목명", "카테고리", "규격", "단위", "",
    "초기재고", "현재고", "일평균 사용량", "",
    "리드타임", "안전재고일수", "목표유지일수", "안전재고", "발주점", "적정발주량", "재고 상태", "",
    "과세구분", "매입단가", "공급단가", "단위 세액", "재고 합계금액", "사용유무"
  ];
  sheet.getRange("A2:X2").setValues([headers]);
  _formatHeader(sheet, "A2:X2");
  sheet.setFrozenRows(2);

  // 헤더 그룹화 시각적 효과 (Spacer 제외 색상)
  sheet.getRange("A2:E2").setBackground("#34495e"); // 기본정보
  sheet.getRange("F2").setBackground(COLORS.grayBg); // Spacer
  sheet.getRange("G2:I2").setBackground("#2980b9"); // 재고현황
  sheet.getRange("J2").setBackground(COLORS.grayBg); // Spacer
  sheet.getRange("K2:Q2").setBackground("#8e44ad"); // 발주설정
  sheet.getRange("R2").setBackground(COLORS.grayBg); // Spacer
  sheet.getRange("S2:W2").setBackground("#27ae60"); // 회계금액
  sheet.getRange("X2").setBackground("#7f8c8d"); // [v9.0] 사용유무



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
  
  // 회계 (U3, V3) — [v7.0] W열(합계금액)은 StockEngine FIFO에서 직접 기록
  sheet.getRange("U3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", IF(S3:S="과세", ROUND(T3:T/1.1, 0), IF(S3:S="비과세", T3:T, ""))))`);
  sheet.getRange("V3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", IF(S3:S="과세", T3:T-U3:U, IF(S3:S="비과세", 0, ""))))`);
  // W열: 초기값 (FIFO 전에는 단순 계산, StockEngine 실행 후 덮어씀)
  // [TASK-011] 음수 재고에서도 재고자산 평가액은 0원을 하한으로 둔다.
  //   ARRAYFORMULA 안에서는 MAX()가 배열 전체를 집계하므로 IF로 행 단위 절사한다.
  sheet.getRange("W3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", IF(T3:T * H3:H < 0, 0, T3:T * H3:H)))`);

  applyItemMasterFormatting(ss, sheet);
  sheet.setColumnWidth(1, 120); sheet.setColumnWidth(2, 220); sheet.setColumnWidth(3, 120); 
  sheet.setColumnWidth(4, 90); sheet.setColumnWidth(5, 90); sheet.setColumnWidth(6, 20); // Spacer
  sheet.setColumnWidth(7, 100); sheet.setColumnWidth(8, 100); sheet.setColumnWidth(9, 130); 
  sheet.setColumnWidth(10, 20); // Spacer
  sheet.setColumnWidth(11, 100); sheet.setColumnWidth(12, 120); sheet.setColumnWidth(13, 120); 
  sheet.setColumnWidth(14, 100); sheet.setColumnWidth(15, 100); sheet.setColumnWidth(16, 120); 
  sheet.setColumnWidth(17, 100); sheet.setColumnWidth(18, 20); // Spacer
  sheet.setColumnWidth(19, 100); sheet.setColumnWidth(20, 120); sheet.setColumnWidth(21, 120); 
  sheet.setColumnWidth(22, 120); sheet.setColumnWidth(23, 140);
  sheet.setColumnWidth(24, 90); // [v9.0] 사용유무

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

function buildDashboard(ss) {
  const sheet = ss.insertSheet(SHEET_DASHBOARD);
  sheet.getRange("A1:J1").merge().setValue("(주)호텔덕구온천 통합 구매 재고 관리 대시보드").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center");
  sheet.getRange("B2").setValue("기준일:").setFontWeight("bold");
  sheet.getRange("C2").setFormula("=TODAY()").setNumberFormat("yyyy-mm-dd");
  sheet.getRange("B3").setValue("현재 시즌:").setFontWeight("bold");
  // [v7.0] 시즌 참조를 시즌설정 시트로 변경
  sheet.getRange("C3").setFormula(`='${SHEET_SEASONS}'!B2`).setFontColor("blue").setFontWeight("bold"); 

  const kpis = [
    // [v9.0] COUNTIFS 사용하여 미사용 품목 제외
    { range: "B5:C8", title: "전체 관리 품목", formula: `COUNTIFS('${SHEET_MASTER}'!A3:A,"<>",IFERROR('${SHEET_MASTER}'!X3:X,"사용"),"<>미사용")`, bg: COLORS.headerBg },
    { range: "D5:E8", title: "🚨 위험", formula: `COUNTIFS('${SHEET_MASTER}'!Q3:Q,"${STATUS_RISK}",IFERROR('${SHEET_MASTER}'!X3:X,"사용"),"<>미사용")`, bg: COLORS.riskBg },
    { range: "F5:G8", title: "⚠️ 발주필요", formula: `COUNTIFS('${SHEET_MASTER}'!Q3:Q,"${STATUS_ORDER}",IFERROR('${SHEET_MASTER}'!X3:X,"사용"),"<>미사용")`, bg: COLORS.orderBg },
    { range: "H5:I8", title: "✅ 정상", formula: `COUNTIFS('${SHEET_MASTER}'!Q3:Q,"${STATUS_OK}",IFERROR('${SHEET_MASTER}'!X3:X,"사용"),"<>미사용")`, bg: COLORS.normalBg }
  ];
  kpis.forEach(kpi => {
    const r = sheet.getRange(kpi.range).merge();
    r.setBackground(kpi.bg).setFontColor(COLORS.headerText).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true).setFontSize(14).setFontWeight("bold");
    r.setFormula(`="${kpi.title}" & CHAR(10) & TEXT(${kpi.formula}, "#,##0") & " 개"`);
  });

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
