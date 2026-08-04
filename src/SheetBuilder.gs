/**
 * 호텔덕구온천 구매 재고 관리 시스템 — 시트 생성 모듈
 * 시스템 초기 구축 시 각 시트를 생성하는 함수들입니다.
 */

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

  // 블록 2: 사용자 계정 관리 (I~M열) — [MODIFIED] 이메일/권한범위 → 아이디/비밀번호/역할 인증 체계
  sheet.getRange("I3:M3").setValues([["아이디 (회사이메일)", "비밀번호 해시", "성함", "부서", "역할"]]).setBackground("#2c3e50").setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");
  
  // 기본 관리자 계정 자동 생성 (SHA-256 해싱)
  const salt = Utilities.getUuid().substring(0, 16);
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + DEFAULT_ADMIN.password);
  const hashHex = rawHash.map(b => ("0" + ((b < 0 ? b + 256 : b)).toString(16)).slice(-2)).join("");
  const storedHash = salt + ":" + hashHex;

  sheet.getRange("I4:M4").setValues([[
    DEFAULT_ADMIN.username, storedHash, DEFAULT_ADMIN.name, DEFAULT_ADMIN.dept, DEFAULT_ADMIN.role
  ]]);
  sheet.getRange("I4:M30").setBackground(COLORS.inputBg).setHorizontalAlignment("center");
  sheet.getRange("J4:J30").setFontSize(7).setFontColor("#999999"); // 해시 컬럼은 작게 표시

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
  sheet.setColumnWidth(9, 160); sheet.setColumnWidth(10, 80);  sheet.setColumnWidth(11, 80); sheet.setColumnWidth(12, 80); sheet.setColumnWidth(13, 80); // [MODIFIED] I~M: 아이디/해시/성함/부서/역할
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

  // 안전재고 (N3)
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

  // Colors — 입력 컬럼 (노란색 톤)
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
