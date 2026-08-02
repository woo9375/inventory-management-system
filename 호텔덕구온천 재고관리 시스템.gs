/**
 * 호텔덕구온천 구매 재고 관리 시스템 v6.8 (Enterprise RBAC & SCM Extension)
 * v6.8 변경사항: RBAC 오프셋 버그 수정, onEdit 안전성 강화, 시즌 모수 왜곡 방지
 */

const MIN_ANALYSIS_DAYS = 7; // 시즌 초기 일평균 산출 시 최소 분석 일수

const SHEET_DASHBOARD = "📊 대시보드";
const SHEET_INOUT     = "📝 통합 입출고 기록장"; 
const SHEET_MASTER    = "🗂️ 품목 마스터";
const SHEET_CONFIG    = "⚙️ 통합 설정";
const SHEET_TEMPLATE  = "📋 입출고_템플릿";

const STATUS_RISK  = "🚨 위험";
const STATUS_ORDER = "⚠️ 발주필요";
const STATUS_OK    = "✅ 정상";

const COLORS = {
  headerBg: "#0d2240", headerText: "#ffffff",
  riskBg: "#c0392b", orderBg: "#e67e22", normalBg: "#27ae60",
  inputBg: "#fffde7", autoBg: "#e8f0fb", grayBg: "#f3f3f3"
};

const ALERT_EMAIL = "[EMAIL_ADDRESS]";
const SEND_EMAIL_ALERT = false; 
const VALIDATION_ROWS = 500; // 성능 최적화를 위한 검증/서식 고정 적용 범위

// ═══════════════════════════════════════════════════════════════════
//  시스템 관리 메뉴
// ═══════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🏨 시스템 관리")
    .addItem("🆕 신규 업장 시트 생성",            "generateNewShops")
    .addItem("🔍 시트 상태 새로고침",              "refreshSheetStatus")
    .addItem("🔄 대시보드 및 재고 갱신",          "refreshDashboard")
    .addItem("🔐 권한 재동기화",                 "syncPermissions")
    .addItem("✅ 시즌 설정 검증",                 "validateSeasonSettings")
    .addSeparator()
    .addItem("🗑️ 품목코드 드롭다운 일괄 제거",     "removeItemCodeValidation")
    .addItem("🔧 업장 시트 보호범위 복구",         "fixSheetProtection")
    .addSeparator()
    .addItem("🔔 재고 알림 즉시 확인",            "checkAlerts")
    .addItem("⏰ 자동 동기화 설정 (자정)",         "setupDailyTrigger")
    .addToUi();
}

// ═══════════════════════════════════════════════════════════════════
//  시스템 초기 구축
// ═══════════════════════════════════════════════════════════════════

function createAll() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert("⚠️ 시스템 초기화 경고", "모든 시트가 삭제되고 시스템이 초기화됩니다.\n계속하시겠습니까?", ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const oldSheets  = ss.getSheets();
  const tempSheet  = ss.insertSheet("Temp_Reset_Sheet");
  oldSheets.forEach(s => { try { ss.deleteSheet(s); } catch (e) {} });

  buildConfigSheet(ss);  
  buildTemplateSheet(ss);
  buildItemMaster(ss);   
  buildConsolidatedLog(ss); 
  buildDashboard(ss);    

  ss.deleteSheet(tempSheet);
  SpreadsheetApp.flush();
  
  refreshDashboard(true);
  _refreshPermissionDropdown(ss); // 권한 드롭다운 초기화
  _protectSystemSheets(ss); // 시스템 시트 보호 적용
  ui.alert("✅ 시스템 초기화가 완료되었습니다. 통합 설정 시트를 작성해 주세요.");
}

function buildConfigSheet(ss) {
  const sheet = ss.insertSheet(SHEET_CONFIG);
  sheet.getRange("A1:Z1").merge().setValue("⚙️ 통합 설정 및 시스템 권한 라우터").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");

  // 블록 1: 업장 관리 (B~G열)
  sheet.getRange("B3:G3").setValues([["분류 (드롭다운)", "업장명 (고유)", "거래 ID 태그", "시트 생성 상태", "바로가기", "Sheet ID (GID)"]])
       .setBackground("#1b3a4b").setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");
  
  sheet.getRange("B4:D7").setValues([
    ["식음", "맛다락", "TX"],
    ["식음", "술다락", "AX"],
    ["온천", "남탕", "MB"],
    ["온천", "여탕", "WB"]
  ]);
  sheet.getRange("E4:E7").setValues([["대기"], ["대기"], ["대기"], ["대기"]]);
  sheet.getRange("B4:G30").setHorizontalAlignment("center");
  sheet.getRange("B4:D30").setBackground(COLORS.inputBg);
  sheet.getRange("E4:G30").setBackground(COLORS.autoBg);

  // 블록 2: 사용자 권한 관리 (I~L열)
  sheet.getRange("I3:L3").setValues([["성함", "부서", "이메일", "권한범위"]]).setBackground("#2c3e50").setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange("I4:L6").setValues([
    ["홍길동", "구매팀", "admin1@test.com", "admin"],
    ["이순신", "관리팀", "admin2@test.com", "admin"],
    ["박영희", "식음팀", "park@test.com", "맛다락"]
  ]);
  sheet.getRange("I4:L30").setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  // Z열: 동적 드롭다운 소스 영역 (시각적 경고)
  sheet.getRange("Z3").setValue("권한 범위 목록 (수동편집 금지)").setFontWeight("bold").setHorizontalAlignment("center").setBackground("#ffcccc").setFontColor("#c0392b");
  sheet.getRange("Z4").setValue("admin");
  sheet.getRange("Z4:Z50").setBackground(COLORS.grayBg).setFontColor("#7f8c8d");

  // 블록 4: 기초 데이터 드롭다운 (S, T, U열)
  sheet.getRange("S3").setValue("대분류 목록").setFontWeight("bold").setHorizontalAlignment("center").setBackground(COLORS.grayBg);
  const categories = [["호텔"], ["콘도"], ["빌리지"], ["스파월드"], ["식음"], ["조리"], ["관리"], ["구매"], ["판촉"]];
  sheet.getRange(4, 19, categories.length, 1).setValues(categories).setBackground(COLORS.inputBg).setHorizontalAlignment("center");
  sheet.getRange("B4:B30").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(sheet.getRange("S4:S20")).setAllowInvalid(false).build());

  sheet.getRange("T3").setValue("단위 목록").setFontWeight("bold").setHorizontalAlignment("center").setBackground(COLORS.grayBg);
  const units = [["박스"], ["개"], ["묶음"], ["병"], ["캔"], ["kg"], ["L"], ["포"], ["롤"], ["장"], ["세트"], ["EA"], ["PACK"], ["CASE"], ["봉"], ["통"], ["말"], ["자루"], ["ml"], ["g"], ["대"]];
  sheet.getRange(4, 20, units.length, 1).setValues(units).setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  sheet.getRange("U3").setValue("품목 카테고리").setFontWeight("bold").setHorizontalAlignment("center").setBackground(COLORS.grayBg);
  const itemCategories = [
    ["원재료"], ["어메니티"], ["세제류"], ["소모품"],
    ["식재료"], ["음료"], ["청소용품"], ["린넨류"],
    ["위생용품"], ["사무용품"], ["시설자재"], ["기타"]
  ];
  sheet.getRange(4, 21, itemCategories.length, 1).setValues(itemCategories).setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  // 블록 3: 시즌 설정 (N~Q열)
  sheet.getRange("N1:O1").setValues([["현재 적용 시즌 ➔", `=IFERROR(INDEX(FILTER(N4:N, O4:O<=TODAY(), P4:P>=TODAY()), 1), "비수기")`]]);
  sheet.getRange("N1").setFontWeight("bold").setHorizontalAlignment("right");
  sheet.getRange("O1").setFontWeight("bold").setFontColor("blue").setHorizontalAlignment("center");
  
  sheet.getRange("N2:O2").setValues([["현재 안전재고 배수 ➔", `=IFERROR(INDEX(FILTER(Q4:Q, O4:O<=TODAY(), P4:P>=TODAY()), 1), 1.0)`]]);
  sheet.getRange("N2").setFontWeight("bold").setHorizontalAlignment("right");
  sheet.getRange("O2").setFontWeight("bold").setFontColor("red").setHorizontalAlignment("center");

  sheet.getRange("N3:Q3").setValues([["시즌명", "시작일", "종료일", "안전재고배수"]]).setBackground("#8e44ad").setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange("N4:Q7").setValues([
    ["비수기", new Date(2026, 0, 1), new Date(2026, 5, 30), 1.0],
    ["여름성수기", new Date(2026, 6, 1), new Date(2026, 7, 31), 1.2],
    ["가을", new Date(2026, 8, 1), new Date(2026, 10, 30), 1.0],
    ["겨울성수기", new Date(2026, 11, 1), new Date(2027, 1, 28), 1.5]
  ]);
  sheet.getRange("O4:P15").setNumberFormat("yyyy-mm-dd");
  sheet.getRange("N4:Q15").setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  // 열 너비 조정 (Spacer 포함)
  sheet.setColumnWidth(1, 20); // A (Spacer)
  sheet.setColumnWidth(2, 110); sheet.setColumnWidth(3, 130); sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 120); sheet.setColumnWidth(6, 140); sheet.setColumnWidth(7, 120);
  sheet.setColumnWidth(8, 20); // H (Spacer)
  sheet.setColumnWidth(9, 80);  sheet.setColumnWidth(10, 80);  sheet.setColumnWidth(11, 200); sheet.setColumnWidth(12, 120);
  sheet.setColumnWidth(13, 20); // M (Spacer)
  sheet.setColumnWidth(14, 100); sheet.setColumnWidth(15, 100); sheet.setColumnWidth(16, 100); sheet.setColumnWidth(17, 100);
  sheet.setColumnWidth(18, 20); // R (Spacer)
  sheet.setColumnWidth(19, 100); sheet.setColumnWidth(20, 100); sheet.setColumnWidth(21, 110);
  sheet.setColumnWidth(22, 20); sheet.setColumnWidth(23, 20); sheet.setColumnWidth(24, 20); sheet.setColumnWidth(25, 20); // V~Y (Spacer)
  sheet.setColumnWidth(26, 150); // Z
}

function buildTemplateSheet(ss) {
  const sheet = ss.insertSheet(SHEET_TEMPLATE);
  sheet.getRange("A1:H1").merge().setValue("📋 [원본 템플릿 시트]  절대 삭제하지 마십시오.").setBackground("#555555").setFontColor("#ffffff").setFontStyle("italic");
  const headers = ["날짜", "품목코드(직접입력)", "품목명(자동)", "구분", "수량", "담당자", "비고", "거래ID(자동)"];
  sheet.getRange("A2:H2").setValues([headers]).setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setFrozenRows(2);
  
  sheet.getRange(3, 1, VALIDATION_ROWS, 1).setNumberFormat("yyyy-mm-dd");
  sheet.getRange(3, 1, VALIDATION_ROWS, 2).setBackground(COLORS.inputBg); 
  sheet.getRange(3, 4, VALIDATION_ROWS, 4).setBackground(COLORS.inputBg); 
  sheet.getRange(3, 3, VALIDATION_ROWS, 1).setBackground(COLORS.autoBg); 
  sheet.getRange(3, 8, VALIDATION_ROWS, 1).setBackground(COLORS.autoBg); 
  sheet.getRange(3, 1, VALIDATION_ROWS, 8).setHorizontalAlignment("center");

  // [요구사항 1-1] 템플릿 시트 D열 "폐기" 확장
  sheet.getRange(3, 4, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["입고", "출고", "폐기"]).setAllowInvalid(false).build());
  sheet.getRange(3, 5, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build());

  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($B3<>"", ISERROR(MATCH($B3, INDIRECT("'${SHEET_MASTER}'!$A$3:$A"), 0)))`)
    .setBackground("#fce8e6").setFontColor("#c53929")
    .setRanges([sheet.getRange(3, 2, VALIDATION_ROWS, 1)])
    .build();
  sheet.setConditionalFormatRules([rule]);

  sheet.setColumnWidth(3, 190); sheet.setColumnWidth(8, 200);
}

function buildItemMaster(ss) {
  const sheet = ss.insertSheet(SHEET_MASTER);
  sheet.getRange("A1:W1").merge().setValue("🗂️ 품목 마스터 변수 관리 (🟡 입력 컬럼 / 🔵 자동 계산 컬럼)").setBackground(COLORS.grayBg).setFontStyle("italic");
  
  const headers = [
    "품목코드", "품목명", "카테고리", "ABC 등급", "단위", "", 
    "초기재고(입력)", "현재고(자동)", "일평균 사용량(자동)", "",
    "리드타임(입력)", "안전재고일수(입력)", "목표유지일수(입력)", "안전재고(동적수식)", "발주점(자동)", "적정발주량(자동)", "재고 상태(자동)", "",
    "과세구분(입력)", "매입단가(입력)", "공급단가(자동)", "단위 세액(자동)", "재고 합계금액(자동)"
  ];
  sheet.getRange("A2:W2").setValues([headers]).setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setFrozenRows(2);

  // 헤더 그룹화 시각적 효과 (Spacer 제외 색상)
  sheet.getRange("A2:E2").setBackground("#34495e"); // 기본정보
  sheet.getRange("F2").setBackground(COLORS.grayBg); // Spacer
  sheet.getRange("G2:I2").setBackground("#2980b9"); // 재고현황
  sheet.getRange("J2").setBackground(COLORS.grayBg); // Spacer
  sheet.getRange("K2:Q2").setBackground("#8e44ad"); // 발주설정
  sheet.getRange("R2").setBackground(COLORS.grayBg); // Spacer
  sheet.getRange("S2:W2").setBackground("#27ae60"); // 회계금액

  const rawData = [
    ["ITM-001", "세탁 세제 (10kg)", "세제류", "A", "박스", "", 20, 20, 0, "", 3, 5, 30, "", "", "", "", "", "과세", 15000, "", "", ""],
    ["ITM-002", "샴푸 (30ml)", "어메니티", "A", "박스", "", 50, 50, 0, "", 3, 5, 30, "", "", "", "", "", "과세", 25000, "", "", ""]
  ];
  sheet.getRange(3, 1, rawData.length, 23).setValues(rawData);

  // M3 -> N3 안전재고
  sheet.getRange("N3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", ROUNDUP(I3:I * L3:L * '${SHEET_CONFIG}'!$O$2, 0)))`);
  // 발주점 (O3)
  sheet.getRange("O3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", ROUNDUP((I3:I * K3:K) + N3:N, 0)))`);
  // 적정발주량 (P3)
  sheet.getRange("P3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", IF((I3:I * M3:M) - H3:H < 0, 0, ROUNDUP((I3:I * M3:M) - H3:H, 0))))`);
  // 재고 상태 (Q3)
  sheet.getRange("Q3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", IF(H3:H<=N3:N, "${STATUS_RISK}", IF(H3:H<=O3:O, "${STATUS_ORDER}", "${STATUS_OK}"))))`);
  
  // 회계 (U3, V3, W3)
  sheet.getRange("U3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", IF(S3:S="과세", ROUND(T3:T/1.1, 0), IF(S3:S="비과세", T3:T, ""))))`);
  sheet.getRange("V3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", IF(S3:S="과세", T3:T-U3:U, IF(S3:S="비과세", 0, ""))))`);
  sheet.getRange("W3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", T3:T * H3:H))`);

  // Validation
  sheet.getRange(3, 3, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(ss.getSheetByName(SHEET_CONFIG).getRange("U4:U30")).setAllowInvalid(false).build());
  sheet.getRange(3, 4, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["A", "B", "C"]).setAllowInvalid(false).build());
  sheet.getRange(3, 5, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(ss.getSheetByName(SHEET_CONFIG).getRange("T4:T50")).setAllowInvalid(false).build());
  sheet.getRange(3, 19, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["과세", "비과세"]).setAllowInvalid(false).build());

  // Number format
  sheet.getRange(3, 20, VALIDATION_ROWS, 4).setNumberFormat("#,##0");

  // Colors
  // 입력 컬럼 (노란색 톤)
  sheet.getRange(3, 1, VALIDATION_ROWS, 5).setBackground(COLORS.inputBg); // 기본
  sheet.getRange(3, 7, VALIDATION_ROWS, 1).setBackground(COLORS.inputBg); // 초기재고
  sheet.getRange(3, 11, VALIDATION_ROWS, 3).setBackground(COLORS.inputBg); // 발주설정
  sheet.getRange(3, 19, VALIDATION_ROWS, 2).setBackground(COLORS.inputBg); // 과세, 매입단가

  // 자동 컬럼 (파란색 톤)
  sheet.getRange(3, 8, VALIDATION_ROWS, 2).setBackground(COLORS.autoBg); // 현재고, 일평균
  sheet.getRange(3, 14, VALIDATION_ROWS, 4).setBackground(COLORS.autoBg); // 발주자동수식
  sheet.getRange(3, 21, VALIDATION_ROWS, 3).setBackground(COLORS.autoBg); // 회계자동수식

  // Spacer 처리
  sheet.getRange(2, 6, VALIDATION_ROWS+1, 1).setBackground(COLORS.grayBg);
  sheet.getRange(2, 10, VALIDATION_ROWS+1, 1).setBackground(COLORS.grayBg);
  sheet.getRange(2, 18, VALIDATION_ROWS+1, 1).setBackground(COLORS.grayBg);

  sheet.getRange(3, 1, VALIDATION_ROWS, 23).setHorizontalAlignment("center");

  const cfRules = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_RISK).setBackground(COLORS.riskBg).setFontColor("#fff").setRanges([sheet.getRange(3, 17, VALIDATION_ROWS, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_ORDER).setBackground(COLORS.orderBg).setFontColor("#fff").setRanges([sheet.getRange(3, 17, VALIDATION_ROWS, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_OK).setBackground(COLORS.normalBg).setFontColor("#fff").setRanges([sheet.getRange(3, 17, VALIDATION_ROWS, 1)]).build()
  ];
  sheet.setConditionalFormatRules(cfRules);
  sheet.autoResizeColumns(1, 23);
  sheet.setColumnWidth(6, 20); // Spacer
  sheet.setColumnWidth(10, 20); // Spacer
  sheet.setColumnWidth(18, 20); // Spacer
}

function buildConsolidatedLog(ss) {
  const consolidatedSheet = ss.insertSheet(SHEET_INOUT);
  consolidatedSheet.getRange("A1:H1").merge().setValue("📊 [통합 데이터베이스] 수동 편집 금지").setBackground(COLORS.grayBg).setFontStyle("italic");
  const headers = ["날짜", "품목코드", "품목명", "구분", "수량", "담당자", "비고", "거래ID"];
  consolidatedSheet.getRange("A2:H2").setValues([headers]).setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
  consolidatedSheet.setFrozenRows(2);
  
  consolidatedSheet.getRange(3, 1, VALIDATION_ROWS, 1).setNumberFormat("yyyy-mm-dd");
  consolidatedSheet.getRange(3, 1, VALIDATION_ROWS, 8).setBackground(COLORS.autoBg).setHorizontalAlignment("center");
  consolidatedSheet.setColumnWidth(3, 190); consolidatedSheet.setColumnWidth(8, 200);
  consolidatedSheet.protect().setDescription("통합 DB 보호").setWarningOnly(true);
}

function buildDashboard(ss) {
  const sheet = ss.insertSheet(SHEET_DASHBOARD);
  sheet.getRange("A1:J1").merge().setValue("(주)호텔덕구온천 통합 구매 재고 관리 대시보드").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center");
  sheet.getRange("B2").setValue("기준일:").setFontWeight("bold");
  sheet.getRange("C2").setFormula("=TODAY()").setNumberFormat("yyyy-mm-dd");
  sheet.getRange("B3").setValue("현재 시즌:").setFontWeight("bold");
  sheet.getRange("C3").setFormula(`='${SHEET_CONFIG}'!O1`).setFontColor("blue").setFontWeight("bold"); 

  const kpis = [
    { range: "B5:C8", title: "전체 관리 품목", formula: `COUNTA('${SHEET_MASTER}'!A3:A)`, bg: COLORS.headerBg },
    { range: "D5:E8", title: "🚨 위험", formula: `COUNTIF('${SHEET_MASTER}'!Q3:Q,"${STATUS_RISK}")`, bg: COLORS.riskBg },
    { range: "F5:G8", title: "⚠️ 발주필요", formula: `COUNTIF('${SHEET_MASTER}'!Q3:Q,"${STATUS_ORDER}")`, bg: COLORS.orderBg },
    { range: "H5:I8", title: "✅ 정상", formula: `COUNTIF('${SHEET_MASTER}'!Q3:Q,"${STATUS_OK}")`, bg: COLORS.normalBg }
  ];
  kpis.forEach(kpi => {
    const r = sheet.getRange(kpi.range).merge();
    r.setBackground(kpi.bg).setFontColor(COLORS.headerText).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true).setFontSize(14).setFontWeight("bold");
    r.setFormula(`="${kpi.title}" & CHAR(10) & TEXT(${kpi.formula}, "#,##0") & " 개"`);
  });

  for (let row = 5; row <= 8; row++) sheet.setRowHeight(row, 30);
  sheet.getRange("B10:I10").setValues([["품목코드", "품목명", "ABC", "현재고", "안전재고", "발주점(ROP)", "적정발주량", "상태"]]).setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setColumnWidth(1, 20); // Spacer
  sheet.setColumnWidth(3, 220); sheet.setColumnWidth(8, 120);
}


// ═══════════════════════════════════════════════════════════════════
//  핵심 비즈니스 로직 1: 관리 및 검증 모듈 (RBAC 도입)
// ═══════════════════════════════════════════════════════════════════

// [요구사항 2-2] 권한 범위(L열) 동적 드롭다운 엔진
function _refreshPermissionDropdown(ss) {
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = cfg.getLastRow();
  const shopList = ["admin"]; // 기본 admin 고정
  
  if (lastRow >= 4) {
    // 변경된 컬럼 인덱스: B=1, C=2, D=3, E=4 (0-based: 분류, 업장명, 태그, 상태)
    const configData = cfg.getRange(4, 2, lastRow - 3, 6).getValues();
    configData.forEach(row => {
      if (row[1] && row[3] === "생성완료") {
        shopList.push(row[1]);
      }
    });
  }
  
  // Z열(Z4부터) 데이터 작성 및 초기화
  cfg.getRange("Z4:Z").clearContent();
  cfg.getRange(4, 26, shopList.length, 1).setValues(shopList.map(s => [s]));
  
  // I4:L50 영역의 L열에 동적 드롭다운 갱신
  const rule = SpreadsheetApp.newDataValidation().requireValueInRange(cfg.getRange(`Z4:Z${3 + shopList.length}`)).setAllowInvalid(false).build();
  cfg.getRange("L4:L50").setDataValidation(rule);
}

// [요구사항 2-3] RBAC 기반 권한 객체 생성 헬퍼
function _getUsersByRole(ss) {
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = Math.max(cfg.getLastRow(), 15);
  // I~L열: 성함, 부서, 이메일, 권한범위
  const userData = cfg.getRange(4, 9, lastRow - 3, 4).getValues();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  const roles = {
    admins: [],
    shopEditors: {}
  };

  userData.forEach(row => {
    const email = row[2] ? row[2].toString().trim() : "";
    const role = row[3] ? row[3].toString().trim() : "";
    
    if (emailRegex.test(email) && role) {
      if (role === "admin") {
        roles.admins.push(email);
      } else {
        if (!roles.shopEditors[role]) roles.shopEditors[role] = [];
        roles.shopEditors[role].push(email);
      }
    }
  });
  
  return roles;
}

function generateNewShops() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const template = ss.getSheetByName(SHEET_TEMPLATE);
  
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const codeListRange = masterSheet.getRange(3, 1, Math.max(masterSheet.getLastRow() - 2, 1), 1);
  
  const lastRow = cfg.getLastRow();
  if (lastRow < 4) return SpreadsheetApp.getUi().alert("설정할 업장 명단이 없습니다.");

  // [요구사항 2-1] D열 제거에 따른 컬럼 시프트 반영 -> Spacer에 따른 B~G 읽기
  const configData = cfg.getRange(4, 2, lastRow - 3, 6).getValues();
  const roles = _getUsersByRole(ss);
  let createdCount = 0;

  configData.forEach((row, index) => {
    const [, shopName, tag, status, , ] = row;
    const currentRowNum = index + 4;

    if (shopName && status === "대기") {
      let targetSheet = ss.getSheetByName(shopName);
      if (!targetSheet) {
        targetSheet = template.copyTo(ss).setName(shopName);
        targetSheet.getRange("A1").setValue(`✏️ [${shopName} 입력창]  품목코드: 직접 입력  |  거래ID: 날짜+코드 입력 시 자동 생성 (형식: ${tag}-YYYYMMDD-UUID8)`);
        
        targetSheet.getRange(3, 2, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(codeListRange).setAllowInvalid(false).build());
        
        // [요구사항 1-1] "폐기" 확장 적용
        targetSheet.getRange(3, 4, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["입고", "출고", "폐기"]).setAllowInvalid(false).build());
        targetSheet.getRange(3, 5, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build());

        // [요구사항 2-3] 역할 기반 보호 매커니즘 전환
        const protection = targetSheet.protect().setDescription(`${shopName} 권한`);
        protection.removeEditors(protection.getEditors()); // 전원 편집 금지 (Owner 제외)
        
        const desiredEditors = new Set([...roles.admins]);
        if (roles.shopEditors[shopName]) {
          roles.shopEditors[shopName].forEach(email => desiredEditors.add(email));
        }
        
        desiredEditors.forEach(email => {
          try { protection.addEditor(email); } catch(e) {
            Logger.log(`[RBAC] ${shopName} 에디터 추가 실패: ${email} — ${e.message}`);
          }
        });

        // 노란색 구역 개방 (C열/H열 자동계산 컬럼은 보호 유지)
        protection.setUnprotectedRanges([
          targetSheet.getRange(3, 1, VALIDATION_ROWS, 2),  // A~B: 날짜, 품목코드
          targetSheet.getRange(3, 4, VALIDATION_ROWS, 1),  // D: 구분
          targetSheet.getRange(3, 5, VALIDATION_ROWS, 1),  // E: 수량
          targetSheet.getRange(3, 6, VALIDATION_ROWS, 2)   // F~G: 담당자, 비고
        ]);
      }

      cfg.getRange(currentRowNum, 5).setValue("생성완료");
      const sheetId = targetSheet.getSheetId();
      cfg.getRange(currentRowNum, 6).setFormula(`=HYPERLINK("#gid=${sheetId}", "🔗 ${shopName}")`);
      cfg.getRange(currentRowNum, 7).setValue(sheetId); 
      createdCount++;
    }
  });

  SpreadsheetApp.flush();
  _refreshPermissionDropdown(ss); // [요구사항 2-2] 드롭다운 갱신
  SpreadsheetApp.getUi().alert(createdCount > 0 ? `🎉 총 ${createdCount}개 업장 시트 생성 완료.` : "대기 중인 업장이 없습니다.");
}

function removeItemCodeValidation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  if (cfg.getLastRow() < 4) return;
  // 변경된 컬럼 인덱스 반영
  const configRows = cfg.getRange(4, 2, cfg.getLastRow() - 3, 6).getValues();
  let count = 0;

  configRows.forEach(row => {
    if (row[3] === "생성완료" && row[1]) {
      const sh = ss.getSheetByName(row[1]);
      if (sh) {
        sh.getRange(3, 2, VALIDATION_ROWS, 1).clearDataValidations();
        // [요구사항 1-1] 기존 업장 소급 적용
        sh.getRange(3, 4, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["입고", "출고", "폐기"]).setAllowInvalid(false).build());
        sh.getRange("A1").setValue(`✏️ [${row[1]} 입력창]  품목코드: 직접 입력  |  거래ID: 날짜+코드 입력 시 자동 생성`);
        count++;
      }
    }
  });
  SpreadsheetApp.getUi().alert(`✅ 총 ${count}개 업장의 품목코드 검증 구조 전환 및 입출고(폐기) 목록 확장이 완료되었습니다.`);
}

function fixSheetProtection() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  if (cfg.getLastRow() < 4) return;
  const configRows = cfg.getRange(4, 2, cfg.getLastRow() - 3, 6).getValues();
  let count = 0;

  configRows.forEach(row => {
    if (row[3] === "생성완료" && row[1]) {
      const sh = ss.getSheetByName(row[1]);
      if (sh) {
        const protection = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
        if (protection) {
          protection.setUnprotectedRanges([
            sh.getRange(3, 1, VALIDATION_ROWS, 2),
            sh.getRange(3, 4, VALIDATION_ROWS, 4)
          ]);
          count++;
        }
      }
    }
  });
  SpreadsheetApp.getUi().alert(`🔧 총 ${count}개 업장의 잠금 해제 구역이 최적화 범위로 정상 복구되었습니다.`);
}

function refreshSheetStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = cfg.getLastRow();
  if (lastRow < 4) return;

  // [요구사항 2-1] 컬럼 시프트 반영 (B~G열 읽기)
  const data = cfg.getRange(4, 2, lastRow - 3, 6).getValues();
  let missingCount = 0;

  data.forEach((row, idx) => {
    const status = row[3];
    const gid = row[5];
    const rowNum = idx + 4;

    if (status === "생성완료" && gid !== "") {
      const target = ss.getSheets().find(s => s.getSheetId() == gid);
      if (!target) {
        cfg.getRange(rowNum, 5).setValue("대기");
        cfg.getRange(rowNum, 6).setValue("삭제됨");
        cfg.getRange(rowNum, 7).clearContent();
        missingCount++;
      }
    }
  });

  _refreshPermissionDropdown(ss); // [요구사항 2-2] 드롭다운 갱신
  SpreadsheetApp.getUi().alert(missingCount > 0 ? `⚠️ ${missingCount}개의 삭제된 시트가 '대기' 상태로 초기화되었습니다.` : "✅ 모든 시트가 정상 존재합니다.");
}

// [요구사항 2-3] 권한 재동기화 전면 개편 (RBAC 적용)
function syncPermissions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _refreshPermissionDropdown(ss); // 시작 시 갱신 보장
  
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = cfg.getLastRow();
  if (lastRow < 4) return;
  
  _protectSystemSheets(ss); // [요구사항 1-5] 시스템 시트 보호 적용
  
  const roles = _getUsersByRole(ss);
  const ownerEmail = ss.getOwner() ? ss.getOwner().getEmail() : "";
  // [v6.8 FIX] B열(col 2)부터 읽기 — 다른 함수들과 통일 (기존: col 1 → RBAC 매핑 오류)
  const data = cfg.getRange(4, 2, lastRow - 3, 6).getValues();
  let syncCount = 0;

  data.forEach(row => {
    // row[0]=분류, row[1]=업장명, row[2]=태그, row[3]=상태, row[4]=바로가기, row[5]=GID
    const shopName = row[1], status = row[3], gid = row[5];
    if (status === "생성완료" && gid !== "") {
      const targetSheet = ss.getSheets().find(s => s.getSheetId() == gid);
      if (targetSheet) {
        const protection = targetSheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
        if (protection) {
          const currentEditors = protection.getEditors().map(e => e.getEmail());
          const desiredEditors = new Set([...roles.admins]); // admin 및 업장 담당자
          if (roles.shopEditors[shopName]) {
            roles.shopEditors[shopName].forEach(email => desiredEditors.add(email));
          }

          desiredEditors.forEach(email => {
            if (!currentEditors.includes(email)) {
              try { protection.addEditor(email); } catch(e) {
                Logger.log(`[RBAC Sync] ${shopName} 에디터 추가 실패: ${email} — ${e.message}`);
              }
            }
          });
          currentEditors.forEach(email => {
            if (!desiredEditors.has(email) && email !== ownerEmail) { protection.removeEditor(email); }
          });
          syncCount++;
        }
      }
    }
  });
  SpreadsheetApp.getUi().alert(`✅ 총 ${syncCount}개 업장의 권한 구조(RBAC) 동기화가 완료되었습니다.`);
}

function _protectSystemSheets(ss) {
  const SYSTEM_SHEETS = [SHEET_CONFIG, SHEET_MASTER, SHEET_INOUT, SHEET_DASHBOARD, SHEET_TEMPLATE];
  const roles = _getUsersByRole(ss);
  const ownerEmail = ss.getOwner() ? ss.getOwner().getEmail() : "";
  const adminSet = new Set([...roles.admins]);
  
  SYSTEM_SHEETS.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      let protection = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
      if (!protection) {
        protection = sheet.protect().setDescription(`${sheetName} 시스템 보호`);
      }
      const currentEditors = protection.getEditors().map(e => e.getEmail());
      
      adminSet.forEach(email => {
        if (!currentEditors.includes(email)) {
          try { protection.addEditor(email); } catch(e) {
            Logger.log(`[System Protect] ${sheetName} 에디터 추가 실패: ${email} — ${e.message}`);
          }
        }
      });
      currentEditors.forEach(email => {
        if (!adminSet.has(email) && email !== ownerEmail) { protection.removeEditor(email); }
      });
    }
  });
}

function validateSeasonSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = Math.max(cfg.getLastRow(), 4);
  const data = cfg.getRange("N4:Q" + lastRow).getValues();
  
  let errors = [];
  let validSeasons = [];

  data.forEach((row) => {
    if (!row[0]) return;
    const start = toLocalDate(row[1]);
    const end = toLocalDate(row[2]);
    const multi = Number(row[3]);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      errors.push(`[${row[0]}] 날짜 형식이 올바르지 않습니다.`);
    } else if (start > end) {
      errors.push(`[${row[0]}] 시작일이 종료일보다 늦습니다.`);
    } else {
      validSeasons.push({ name: row[0], start: start, end: end });
    }
    if (isNaN(multi) || multi <= 0) {
      errors.push(`[${row[0]}] 배수가 올바르지 않습니다.`);
    }
  });

  validSeasons.sort((a, b) => a.start - b.start);
  for (let i = 1; i < validSeasons.length; i++) {
    if (validSeasons[i].start <= validSeasons[i-1].end) {
      errors.push(`[기간 중복] '${validSeasons[i-1].name}'와 '${validSeasons[i].name}' 충돌.`);
    }
  }

  if (errors.length > 0) {
    SpreadsheetApp.getUi().alert("⚠️ 시즌 설정 오류 발견:\n\n" + errors.join("\n"));
  } else {
    SpreadsheetApp.getUi().alert("✅ 시즌 테이블 규격 완벽 검증 완료.");
  }
}


// ═══════════════════════════════════════════════════════════════════
//  핵심 비즈니스 로직 2: DB 엔진 및 대시보드
// ═══════════════════════════════════════════════════════════════════

function consolidateAllSheets(ss) {
  const consolidated = ss.getSheetByName(SHEET_INOUT);
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = consolidated.getLastRow();
  if (lastRow >= 3) consolidated.getRange(3, 1, lastRow - 2, 8).clearContent();

  const cfgLastRow = cfg.getLastRow();
  if (cfgLastRow < 4) return;
  const configRows = cfg.getRange(4, 2, cfgLastRow - 3, 6).getValues();

  let allDataRows = [];
  configRows.forEach((row) => {
    const shopName = row[1], status = row[3], gid = row[5];
    if (!shopName || status !== "생성완료" || !gid) return;

    const sh = ss.getSheets().find(s => s.getSheetId() == gid);
    if (!sh) return; 

    const last = sh.getLastRow();
    if (last < 3) return;

    const rows = sh.getRange(3, 1, last - 2, 8).getValues();
    rows.forEach(r => { if (r[1]) allDataRows.push(r); });
  });

  if (allDataRows.length === 0) return;
  
  allDataRows.sort((a, b) => {
    const da = toLocalDate(a[0]);
    const db = toLocalDate(b[0]);
    return da - db;
  });

  consolidated.getRange(3, 1, allDataRows.length, 8).setValues(allDataRows).setHorizontalAlignment("center").setBackground(COLORS.autoBg);
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
    SpreadsheetApp.flush();   // 통합 데이터 확정 (recalc 의존성)
    
    recalcStockAndUsage(ss);
    // [v6.8] 2차 flush 제거 — runDashboardSync는 GAS 내부 캐시에서 직전 setValues를 읽을 수 있음
    
    runDashboardSync(ss);
    
    if (!isSilent) SpreadsheetApp.getUi().alert("🔄 [동기화 완료] 정적 재고 집계 및 최신화가 완료되었습니다.");
    
  } catch (err) {
    const msg = `[대시보드 동기화 실패]\n${err.message}\n${err.stack}`;
    Logger.log(msg);
    if (!isSilent) SpreadsheetApp.getUi().alert("❌ 동기화 중 오류 발생:\n" + err.message);
    if (SEND_EMAIL_ALERT) {
      try {
        MailApp.sendEmail({ to: ALERT_EMAIL, subject: "[호텔덕구온천] 동기화 오류", body: msg });
      } catch(mailErr) { Logger.log("이메일 발송 실패: " + mailErr); }
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
  
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 17).getValues();
  const outputList = [];
  masterData.forEach(row => {
    if (row[16] === STATUS_RISK || row[16] === STATUS_ORDER) {
      outputList.push([row[0], row[1], row[3], row[7], row[13], row[14], row[15], row[16]]);
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

// [v6.8] 타임존 안전 패치: Date 객체의 시각 부분을 제거하여 로컬 자정으로 정규화
function toLocalDate(val) {
  if (val instanceof Date) {
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }
  if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = val.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(val);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function recalcStockAndUsage(ss) {
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const logSheet = ss.getSheetByName(SHEET_INOUT);
  const configSheet = ss.getSheetByName(SHEET_CONFIG);
  
  const seasonData = configSheet.getRange("N4:P" + Math.max(configSheet.getLastRow(), 4)).getValues();
  const logLastRow = Math.max(logSheet.getLastRow(), 3);
  const logData = logSheet.getRange(3, 1, logLastRow - 2, 5).getValues();
  
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 8).getValues(); 

  const today = new Date();
  const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  
  let targetSeason = null;
  for (let r of seasonData) {
    if (!r[0] || !r[1] || !r[2]) continue;
    const sStart = toLocalDate(r[1]).getTime();
    const sEnd = toLocalDate(r[2]).getTime();
    if (todayTime >= sStart && todayTime <= sEnd) {
      targetSeason = { name: r[0], start: sStart, end: sEnd };
      break;
    }
  }

  // [v6.8] 시즌 초기 모수 왜곡 방지: MIN_ANALYSIS_DAYS 미만이면 30일 평균으로 fallback
  let targetDays = 30;
  let limitDateStart; // 일평균 집계 시작일 (밀리초)
  
  if (targetSeason && targetSeason.name !== "비수기") {
    const effectiveEnd = Math.min(todayTime, targetSeason.end);
    const rawDays = (effectiveEnd - targetSeason.start) / (1000 * 60 * 60 * 24) + 1;
    
    if (rawDays < MIN_ANALYSIS_DAYS) {
      // 시즌 시작 직후: 데이터 부족으로 일평균이 왜곡될 수 있으므로 30일 평균 사용
      targetDays = 30;
      const fallbackDate = new Date(today);
      fallbackDate.setDate(fallbackDate.getDate() - 30);
      limitDateStart = fallbackDate.getTime();
      Logger.log(`[Season] ${targetSeason.name} 시작 ${rawDays}일차 — 30일 평균으로 fallback`);
    } else {
      targetDays = rawDays;
      limitDateStart = targetSeason.start;
    }
  } else {
    // 비수기 또는 시즌 미매칭: 최근 30일
    const fallbackDate = new Date(today);
    fallbackDate.setDate(fallbackDate.getDate() - 30);
    limitDateStart = fallbackDate.getTime();
  }

  const usageMap = {};
  const stockMap = {};
  const disposeMap = {}; // 리포트용 확장 보장

  logData.forEach(row => {
    const dateVal = toLocalDate(row[0]).getTime();
    const code = row[1];
    const type = row[3];
    const qty = Number(row[4]) || 0;

    if (!code || isNaN(dateVal)) return;

    // [요구사항 1-2] 재고 집계식 보정 (폐기 처리)
    if (!stockMap[code]) stockMap[code] = 0;
    if (type === "입고") stockMap[code] += qty;
    if (type === "출고") stockMap[code] -= qty;
    if (type === "폐기") { 
      stockMap[code] -= qty;
      disposeMap[code] = (disposeMap[code] || 0) + qty;
    }

    // [v6.8] 통일된 범위 기반 일평균 집계 (출고만)
    if (type === "출고" && dateVal >= limitDateStart && dateVal <= todayTime) {
      usageMap[code] = (usageMap[code] || 0) + qty;
    }
  });

  const updates = masterData.map(row => {
    const code = row[0];
    const initStock = Number(row[6]) || 0;
    if (!code) return ["", ""];
    
    const currentStock = Math.max(0, initStock + (stockMap[code] || 0));
    const usage = usageMap[code] || 0;
    // [v6.8] targetDays가 0이 되는 엣지케이스 방어
    const safeDays = Math.max(targetDays, 1);
    const dailyUsage = usage > 0 ? Number((usage / safeDays).toFixed(2)) : 0.0;
    
    return [currentStock, dailyUsage];
  });

  if (updates.length > 0) {
    masterSheet.getRange(3, 8, updates.length, 2).setValues(updates);
  }
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

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === "refreshDashboard") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("refreshDashboard").timeBased().everyDays(1).atHour(0).create();
  SpreadsheetApp.getUi().alert("⏰ 자정 동기화 배치 트리거가 가동되었습니다.");
}

// ═══════════════════════════════════════════════════════════════════
//  가드레일 및 자동 거래ID 분출
// ═══════════════════════════════════════════════════════════════════

// [v6.8] onEdit 전면 개편: toast 전환, 다중셀 방어, 자동컬럼 보호, 거래확정 D열 차단
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const row = e.range.getRow();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // === 설정 시트 가드레일 ===
  if (sheetName === SHEET_CONFIG && row >= 4 && row <= 30) {
    const col = e.range.getColumn();
    if (col >= 2 && col <= 4) {
      if (sheet.getRange(row, 5).getValue() === "생성완료") {
        // [v6.8] simple trigger에서는 toast 사용 (alert 대신)
        ss.toast("🚨 이미 생성 완료된 업장명/태그는 변경할 수 없습니다.", "변경 차단", 5);
        // [v6.8] 다중 셀 편집 대응
        if (e.oldValue !== undefined && e.oldValue !== null) {
          e.range.setValue(e.oldValue);
        } else {
          e.range.clearContent();
          Logger.log(`[RBAC Guard] 다중 셀 편집 롤백: ${sheetName} R${row}C${col}`);
        }
        return;
      }
    }
  }

  const SYSTEM_SHEETS = [SHEET_DASHBOARD, SHEET_INOUT, SHEET_MASTER, SHEET_CONFIG, SHEET_TEMPLATE];
  if (SYSTEM_SHEETS.includes(sheetName)) return;

  const startCol = e.range.getColumn();
  const endCol = startCol + e.range.getNumColumns() - 1;
  const numRows = e.range.getNumRows();

  // [v6.8] 자동 계산 컬럼(C=3, H=8) 직접 편집 감지 및 차단
  if (row >= 3) {
    const editedCOnly = (startCol === 3 && endCol === 3);
    const editedHOnly = (startCol === 8 && endCol === 8);
    if (editedCOnly || editedHOnly) {
      ss.toast("⛔ 자동 계산 컬럼(품목명/거래ID)은 직접 편집할 수 없습니다.", "편집 차단", 5);
      if (e.oldValue !== undefined) {
        e.range.setValue(e.oldValue);
      } else {
        e.range.clearContent();
      }
      return;
    }
  }

  const isTargetEdited = (startCol <= 2 && endCol >= 2) || (startCol <= 5 && endCol >= 5);

  const cfg = ss.getSheetByName(SHEET_CONFIG);
  if (cfg.getLastRow() < 4) return;
  
  const shopConfigData = cfg.getRange(4, 2, cfg.getLastRow() - 3, 6).getValues();
  const currentPrefix = (shopConfigData.find(r => r[1] === sheetName && r[3] === "생성완료") || [])[2];
  
  if (!currentPrefix || row < 3 || !isTargetEdited) return; 

  // [v6.8] 거래 확정(거래ID 발급 완료) 후 구분(D열) 변경 차단
  if (startCol <= 4 && endCol >= 4) {
    for (let i = 0; i < numRows; i++) {
      const txId = sheet.getRange(row + i, 8).getValue();
      if (txId && txId.toString().trim() !== "") {
        ss.toast("⛔ 이미 확정된 거래의 구분은 변경할 수 없습니다. 행 삭제 후 재입력하세요.", "변경 차단", 5);
        if (e.oldValue !== undefined) e.range.setValue(e.oldValue);
        return;
      }
    }
  }

  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 2).getValues();
  const itemMap = {};
  masterData.forEach(r => { if(r[0]) itemMap[r[0]] = r[1]; });

  const aDateValues = sheet.getRange(row, 1, numRows, 1).getValues();
  const codeValues = sheet.getRange(row, 2, numRows, 1).getValues();
  const cExisting = sheet.getRange(row, 3, numRows, 1).getValues();
  const hExisting = sheet.getRange(row, 8, numRows, 1).getValues();
  const hBgExisting = sheet.getRange(row, 8, numRows, 1).getBackgrounds();

  const cUpdates = [];
  const hUpdates = [];
  const hBgUpdates = [];
  let hasUpdates = false;
  const tz = Session.getScriptTimeZone();

  for (let i = 0; i < numRows; i++) {
    const code = codeValues[i][0];
    const existingId = hExisting[i][0];
    
    if (code) {
      cUpdates.push([itemMap[code] || "미등록 품목"]); 
      
      const aDateVal = aDateValues[i][0];
      const hasValidDate = aDateVal instanceof Date && !isNaN(aDateVal.getTime());

      if (!existingId && hasValidDate) {
        const dateStr = Utilities.formatDate(aDateVal, tz, "yyyyMMdd");
        const uniqueSuffix = Utilities.getUuid().replace(/-/g,"").substring(0,8).toUpperCase();
        hUpdates.push([`${currentPrefix}-${dateStr}-${uniqueSuffix}`]);
      } else {
        hUpdates.push([existingId || ""]);
      }
      hBgUpdates.push([COLORS.autoBg]);
      hasUpdates = true;
    } else {
      cUpdates.push([cExisting[i][0]]);
      hUpdates.push([existingId]);
      hBgUpdates.push([hBgExisting[i][0]]);
    }
  }

  if (hasUpdates) {
    sheet.getRange(row, 3, numRows, 1).setValues(cUpdates).setBackgrounds(hBgUpdates.map(()=>[COLORS.autoBg]));
    sheet.getRange(row, 8, numRows, 1).setValues(hUpdates).setBackgrounds(hBgUpdates).setHorizontalAlignment("center");
  }
}