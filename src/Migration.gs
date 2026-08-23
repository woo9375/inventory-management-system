/**
 * 호텔덕구온천 구매 재고 관리 시스템 v7.0 — 마이그레이션 프레임워크
 * [v7.0] v8 마이그레이션: 통합 설정 시트 분리 + 9열 입출고 구조
 */

function getSchemaVersion() {
  const props = PropertiesService.getScriptProperties();
  return parseInt(props.getProperty("SCHEMA_VERSION") || "0");
}

function setSchemaVersion(version) {
  PropertiesService.getScriptProperties().setProperty("SCHEMA_VERSION", String(version));
}

/**
 * 마이그레이션 레지스트리
 * 규칙:
 *   1. 멱등성(Idempotency): 같은 마이그레이션을 두 번 실행해도 안전해야 함
 *   2. 후방 호환성: 마이그레이션 후에도 기존 데이터/수식 정상 동작
 *   3. 원자성: 각 마이그레이션은 독립적으로 실행/롤백 가능
 */
const MIGRATIONS = {
  // v0 → v7: 초기 스키마 등록
  7: function migrate_to_v7(ss) {
    console.log("[Migration v7] 초기 스키마 등록 — 기존 시스템 편입");
    
    const shopSheet = ss.getSheetByName(SHEET_SHOPS) || ss.getSheetByName("⚙️ 통합 설정");
    if (!shopSheet) return;
    
    // v7이면 이미 새 구조일 수도 있음 — 안전 체크
    const name = shopSheet.getName();
    if (name === SHEET_SHOPS) {
      console.log("[Migration v7] 이미 새 구조 — 스킵");
      return;
    }
    
    // 레거시: 통합설정 시트에서 업장 보호 범위 최적화
    const cfgLastRow = shopSheet.getLastRow();
    if (cfgLastRow < 4) return;
    
    const configRows = shopSheet.getRange(4, 2, cfgLastRow - 3, 6).getValues();
    configRows.forEach(row => {
      if (row[3] === "생성완료" && row[1]) {
        const sh = ss.getSheetByName(row[1]);
        if (sh) {
          const protection = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
          if (protection) {
            protection.setUnprotectedRanges([
              sh.getRange(3, 1, VALIDATION_ROWS, 2),
              sh.getRange(3, 4, VALIDATION_ROWS, 1),
              sh.getRange(3, 5, VALIDATION_ROWS, 1),
              sh.getRange(3, 6, VALIDATION_ROWS, 2)
            ]);
          }
        }
      }
    });
    
    console.log("[Migration v7] 완료");
  },

  // [v7.0] v7 → v8: 통합 설정 시트 분리 + 9열 입출고 구조 + 변경이력 시트
  8: function migrate_to_v8(ss) {
    console.log("[Migration v8] 통합 설정 시트 분리 시작...");
    
    const oldConfigSheet = ss.getSheetByName("⚙️ 통합 설정");
    
    // ── Step 1: 기존 통합 설정 데이터 읽기 ──
    let shopData = [], userData = [], seasonData = [], baseData = { cats: [], units: [], itemCats: [] };
    
    if (oldConfigSheet) {
      const lastRow = Math.max(oldConfigSheet.getLastRow(), 4);
      
      // 업장 데이터 (B~G열, 4행부터)
      const shopRaw = oldConfigSheet.getRange(4, 2, lastRow - 3, 6).getValues();
      shopRaw.forEach(row => {
        if (row[0] || row[1]) { // 분류 또는 업장명이 있으면
          shopData.push(row);
        }
      });
      
      // 사용자 데이터 (I~M열, 4행부터)
      const userRaw = oldConfigSheet.getRange(4, 9, lastRow - 3, 5).getValues();
      userRaw.forEach(row => {
        if (row[0]) { // username이 있으면
          userData.push(row);
        }
      });
      
      // 시즌 데이터 (N~Q열, 4행부터)
      const seasonRaw = oldConfigSheet.getRange(4, 14, lastRow - 3, 4).getValues();
      seasonRaw.forEach(row => {
        if (row[0]) { // 시즌명이 있으면
          seasonData.push(row);
        }
      });
      
      // 기초데이터 (S~U열, 4행부터)
      const baseRaw = oldConfigSheet.getRange(4, 19, lastRow - 3, 3).getValues();
      baseRaw.forEach(row => {
        if (row[0]) baseData.cats.push(row[0]);
        if (row[1]) baseData.units.push(row[1]);
        if (row[2]) baseData.itemCats.push(row[2]);
      });
      
      console.log(`[Migration v8] 읽기 완료 — 업장: ${shopData.length}, 사용자: ${userData.length}, 시즌: ${seasonData.length}`);
    }
    
    // ── Step 2: 새 개별 시트 생성 (이미 있으면 스킵 — 멱등성) ──
    
    // 🏢 업장관리
    if (!ss.getSheetByName(SHEET_SHOPS)) {
      const shopSheet = ss.insertSheet(SHEET_SHOPS);
      shopSheet.getRange("A1:F1").merge().setValue("🏢 업장 관리").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
      shopSheet.getRange("A2:F2").setValues([["분류 (드롭다운)", "업장명 (고유)", "거래 ID 태그", "시트 생성 상태", "바로가기", "Sheet ID (GID)"]])
               .setBackground("#1b3a4b").setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");
      shopSheet.setFrozenRows(2);
      
      if (shopData.length > 0) {
        // 기존 데이터 매핑: [분류(B), 업장명(C), 태그(D), 상태(E), 바로가기(F), GID(G)]
        // 새 구조: [분류(A), 업장명(B), 태그(C), 상태(D), 바로가기(E), GID(F)]
        shopSheet.getRange(3, 1, shopData.length, 6).setValues(shopData)
          .setHorizontalAlignment("center");
        shopSheet.getRange(3, 1, shopData.length, 3).setBackground(COLORS.inputBg);
        shopSheet.getRange(3, 4, shopData.length, 3).setBackground(COLORS.autoBg);
      }
      
      shopSheet.setColumnWidth(1, 110); shopSheet.setColumnWidth(2, 130); shopSheet.setColumnWidth(3, 100);
      shopSheet.setColumnWidth(4, 120); shopSheet.setColumnWidth(5, 140); shopSheet.setColumnWidth(6, 120);
      console.log("[Migration v8] 🏢 업장관리 시트 생성 완료");
    }
    
    // 📅 시즌설정
    if (!ss.getSheetByName(SHEET_SEASONS)) {
      const seasonSheet = ss.insertSheet(SHEET_SEASONS);
      seasonSheet.getRange("A1:D1").merge().setValue("📅 시즌 설정").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
      seasonSheet.getRange("A2:B2").setValues([["현재 적용 시즌 ➔", `=IFERROR(INDEX(FILTER(A5:A, B5:B<=TODAY(), C5:C>=TODAY()), 1), "비수기")`]]);
      seasonSheet.getRange("A2").setFontWeight("bold").setHorizontalAlignment("right");
      seasonSheet.getRange("B2").setFontWeight("bold").setFontColor("blue").setHorizontalAlignment("center");
      seasonSheet.getRange("C2:D2").setValues([["현재 안전재고 배수 ➔", `=IFERROR(INDEX(FILTER(D5:D, B5:B<=TODAY(), C5:C>=TODAY()), 1), 1.0)`]]);
      seasonSheet.getRange("C2").setFontWeight("bold").setHorizontalAlignment("right");
      seasonSheet.getRange("D2").setFontWeight("bold").setFontColor("red").setHorizontalAlignment("center");
      seasonSheet.getRange("A4:D4").setValues([["시즌명", "시작일", "종료일", "안전재고배수"]]).setBackground("#8e44ad").setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");
      seasonSheet.setFrozenRows(4);
      
      if (seasonData.length > 0) {
        seasonSheet.getRange(5, 1, seasonData.length, 4).setValues(seasonData)
          .setBackground(COLORS.inputBg).setHorizontalAlignment("center");
        seasonSheet.getRange(5, 2, seasonData.length, 2).setNumberFormat("yyyy-mm-dd");
      }
      
      seasonSheet.setColumnWidth(1, 120); seasonSheet.setColumnWidth(2, 120); seasonSheet.setColumnWidth(3, 120); seasonSheet.setColumnWidth(4, 120);
      console.log("[Migration v8] 📅 시즌설정 시트 생성 완료");
    }
    
    // 👤 사용자관리
    if (!ss.getSheetByName(SHEET_USERS)) {
      const userSheet = ss.insertSheet(SHEET_USERS);
      userSheet.getRange("A1:E1").merge().setValue("👤 사용자 계정 관리").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
      userSheet.getRange("A2:E2").setValues([["아이디 (회사이메일)", "비밀번호 해시", "성함", "부서", "역할"]]).setBackground("#2c3e50").setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");
      userSheet.setFrozenRows(2);
      
      if (userData.length > 0) {
        userSheet.getRange(3, 1, userData.length, 5).setValues(userData)
          .setBackground(COLORS.inputBg).setHorizontalAlignment("center");
        userSheet.getRange(3, 2, userData.length, 1).setFontSize(7).setFontColor("#999999");
      }
      
      userSheet.setColumnWidth(1, 180); userSheet.setColumnWidth(2, 100); userSheet.setColumnWidth(3, 80); userSheet.setColumnWidth(4, 100); userSheet.setColumnWidth(5, 80);
      console.log("[Migration v8] 👤 사용자관리 시트 생성 완료");
    }
    
    // 📂 기초데이터
    if (!ss.getSheetByName(SHEET_BASE_DATA)) {
      const baseSheet = ss.insertSheet(SHEET_BASE_DATA);
      baseSheet.getRange("A1:C1").merge().setValue("📂 기초 데이터 (드롭다운 목록)").setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
      baseSheet.getRange("A2").setValue("대분류 목록").setFontWeight("bold").setHorizontalAlignment("center").setBackground(COLORS.grayBg);
      baseSheet.getRange("B2").setValue("단위 목록").setFontWeight("bold").setHorizontalAlignment("center").setBackground(COLORS.grayBg);
      baseSheet.getRange("C2").setValue("품목 카테고리").setFontWeight("bold").setHorizontalAlignment("center").setBackground(COLORS.grayBg);
      baseSheet.setFrozenRows(2);
      
      // 기존 데이터 또는 기본값
      const cats = baseData.cats.length > 0 ? baseData.cats : ["호텔","콘도","빌리지","스파월드","식음","조리","관리","구매","판촉"];
      const units = baseData.units.length > 0 ? baseData.units : ["박스","개","묶음","병","캔","kg","L","포","롤","장","세트","EA","PACK","CASE","봉","통","말","자루","ml","g","대"];
      const itemCats = baseData.itemCats.length > 0 ? baseData.itemCats : ["원재료","어메니티","세제류","소모품","식재료","음료","청소용품","린넨류","위생용품","사무용품","시설자재","기타"];
      
      baseSheet.getRange(3, 1, cats.length, 1).setValues(cats.map(v => [v])).setBackground(COLORS.inputBg).setHorizontalAlignment("center");
      baseSheet.getRange(3, 2, units.length, 1).setValues(units.map(v => [v])).setBackground(COLORS.inputBg).setHorizontalAlignment("center");
      baseSheet.getRange(3, 3, itemCats.length, 1).setValues(itemCats.map(v => [v])).setBackground(COLORS.inputBg).setHorizontalAlignment("center");
      
      baseSheet.setColumnWidth(1, 120); baseSheet.setColumnWidth(2, 100); baseSheet.setColumnWidth(3, 120);
      console.log("[Migration v8] 📂 기초데이터 시트 생성 완료");
    }
    
    // 📋 변경이력
    if (!ss.getSheetByName(SHEET_CHANGELOG)) {
      const clSheet = ss.insertSheet(SHEET_CHANGELOG);
      clSheet.getRange("A1:G1").merge().setValue("📋 품목 마스터 변경 이력").setBackground(COLORS.grayBg).setFontStyle("italic");
      clSheet.getRange("A2:G2").setValues([["변경일시", "변경자", "품목코드", "품목명", "변경필드", "변경 전", "변경 후"]])
             .setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
      clSheet.setFrozenRows(2);
      clSheet.setColumnWidth(1, 160); clSheet.setColumnWidth(2, 100); clSheet.setColumnWidth(3, 100);
      clSheet.setColumnWidth(4, 150); clSheet.setColumnWidth(5, 120); clSheet.setColumnWidth(6, 150); clSheet.setColumnWidth(7, 150);
      clSheet.protect().setDescription("변경이력 보호").setWarningOnly(true);
      console.log("[Migration v8] 📋 변경이력 시트 생성 완료");
    }
    
    // ── Step 3: 기존 통합 설정 시트 삭제 ──
    if (oldConfigSheet) {
      try {
        ss.deleteSheet(oldConfigSheet);
        console.log("[Migration v8] 기존 통합 설정 시트 삭제 완료");
      } catch(e) {
        console.error("[Migration v8] 통합 설정 시트 삭제 실패 (수동 삭제 필요): " + e.message);
      }
    }
    
    // ── Step 4: 입출고 시트 8열 → 9열 변환 (단가 스냅샷 열 삽입) ──
    const masterSheet = ss.getSheetByName(SHEET_MASTER);
    const masterLastRow = Math.max(masterSheet ? masterSheet.getLastRow() : 3, 3);
    const priceMap = {};
    if (masterSheet && masterLastRow >= 3) {
      const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 20).getValues();
      masterData.forEach(r => { if(r[0]) priceMap[r[0]] = r[19] || 0; });
    }
    
    // 통합 입출고 기록장 변환
    const inoutSheet = ss.getSheetByName(SHEET_INOUT);
    if (inoutSheet) {
      _migrateSheetTo9Cols(inoutSheet, priceMap, true);
    }
    
    // 업장 시트들도 변환
    const newShopSheet = ss.getSheetByName(SHEET_SHOPS);
    if (newShopSheet && newShopSheet.getLastRow() >= 3) {
      const shops = newShopSheet.getRange(3, 1, newShopSheet.getLastRow() - 2, 6).getValues();
      shops.forEach(row => {
        if (row[1] && row[3] === "생성완료" && row[5]) {
          const sh = ss.getSheets().find(s => s.getSheetId() == row[5]);
          if (sh) {
            _migrateSheetTo9Cols(sh, priceMap, false);
          }
        }
      });
    }
    
    // ── Step 5: 마스터 시트 수식 업데이트 (시즌 참조 변경) ──
    if (masterSheet) {
      // 안전재고 수식 — 시즌설정 시트 참조
      masterSheet.getRange("N3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", ROUNDUP(I3:I * L3:L * '${SHEET_SEASONS}'!$D$2, 0)))`);
    }
    
    console.log("[Migration v8] v8 마이그레이션 완료!");
  },

  // [v9.0] v8 → v9: 사용유무 컬럼 추가 + 단위 6종 추가
  9: function migrate_to_v9(ss) {
    console.log("[Migration v9] 사용유무 컬럼 + 단위 추가 시작...");
    
    // ── Step 1: 품목 마스터 시트에 X열(24번째) '사용유무' 헤더 추가 ──
    const masterSheet = ss.getSheetByName(SHEET_MASTER);
    if (masterSheet) {
      // 현재 X2 헤더 확인 — 이미 있으면 스킵
      const currentX2 = masterSheet.getRange("X2").getValue();
      if (!currentX2 || currentX2 !== "사용유무") {
        masterSheet.getRange("X2").setValue("사용유무")
          .setBackground("#7f8c8d").setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");
        console.log("[Migration v9] X열 헤더 '사용유무' 추가 완료");
      }
      
      // 기존 품목에 '사용' 기본값 설정 (비어있는 경우만)
      const lastRow = masterSheet.getLastRow();
      if (lastRow >= 3) {
        const xData = masterSheet.getRange(3, 24, lastRow - 2, 1).getValues();
        const updates = xData.map(function(row) {
          return [row[0] || "사용"]; // 비어있으면 '사용', 이미 값이 있으면 유지
        });
        masterSheet.getRange(3, 24, updates.length, 1).setValues(updates)
          .setBackground(COLORS.inputBg).setHorizontalAlignment("center");
        
        // 사용유무 드롭다운 검증 추가
        masterSheet.getRange(3, 24, VALIDATION_ROWS, 1).setDataValidation(
          SpreadsheetApp.newDataValidation()
            .requireValueInList(["사용", "미사용"])
            .setAllowInvalid(false).build()
        );
        
        // 미사용 행 조건부 서식 추가
        const existingRules = masterSheet.getConditionalFormatRules();
        const disabledRule = SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied('=$X3="미사용"')
          .setBackground("#f0f0f0").setFontColor("#999999")
          .setRanges([masterSheet.getRange(3, 1, VALIDATION_ROWS, 24)])
          .build();
        existingRules.push(disabledRule);
        masterSheet.setConditionalFormatRules(existingRules);
        
        masterSheet.setColumnWidth(24, 90);
        console.log("[Migration v9] 기존 " + (lastRow - 2) + "개 품목에 '사용' 상태 설정 완료");
      }
      
      // A1 머지 범위 확장 (W → X)
      masterSheet.getRange("A1:X1").merge().setValue("🗂️ 품목 마스터 변수 관리")
        .setBackground(COLORS.grayBg).setFontStyle("italic");
    }
    
    // ── Step 2: 기초데이터 시트에 단위 6종 추가 ──
    const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
    if (baseSheet) {
      const baseLastRow = Math.max(baseSheet.getLastRow(), 3);
      const existingUnits = baseSheet.getRange(3, 2, baseLastRow - 2, 1).getValues().flat().filter(function(v) { return v; });
      const newUnits = ["미터", "포대", "봉지", "르베", "권", "갑"];
      const toAdd = newUnits.filter(function(u) { return !existingUnits.includes(u); });
      
      if (toAdd.length > 0) {
        // 기존 단위 목록 끝에 추가
        const unitCol = baseSheet.getRange(3, 2, baseLastRow + 10 - 2, 1).getValues().flat();
        let insertRow = -1;
        for (let i = 0; i < unitCol.length; i++) {
          if (!unitCol[i]) { insertRow = i + 3; break; }
        }
        if (insertRow === -1) insertRow = baseLastRow + 1;
        
        const addData = toAdd.map(function(u) { return [u]; });
        baseSheet.getRange(insertRow, 2, addData.length, 1).setValues(addData)
          .setBackground(COLORS.inputBg).setHorizontalAlignment("center");
        console.log("[Migration v9] 단위 " + toAdd.length + "종 추가: " + toAdd.join(", "));
      } else {
        console.log("[Migration v9] 추가할 단위 없음 (이미 존재)");
      }
    }
    
    console.log("[Migration v9] v9 마이그레이션 완료!");
  },
};

/**
 * [v7.0] 입출고 시트를 8열 → 9열로 변환하는 헬퍼
 * @param {Sheet} sheet 대상 시트
 * @param {Object} priceMap 품목코드 → 매입단가 맵
 * @param {boolean} isConsolidated 통합 시트 여부 (헤더 행 차이)
 */
function _migrateSheetTo9Cols(sheet, priceMap, isConsolidated) {
  const headerRow = isConsolidated ? 2 : 2;
  const dataStartRow = isConsolidated ? 3 : 3;
  
  // 현재 헤더 확인 — 이미 9열이면 스킵
  const currentHeaders = sheet.getRange(headerRow, 1, 1, 9).getValues()[0];
  if (currentHeaders[5] === "단가" || currentHeaders[5] === "단가(자동)" || currentHeaders[5] === "단가(스냅샷)") {
    console.log(`[Migration v8] ${sheet.getName()} — 이미 9열 구조, 스킵`);
    return;
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow < dataStartRow) {
    // 데이터 없는 경우 헤더만 업데이트
    const headers = ["날짜", "품목코드", "품목명", "구분", "수량", "단가", "담당자", "비고", "거래ID"];
    sheet.getRange(headerRow, 1, 1, 9).setValues([headers]);
    return;
  }
  
  // 기존 8열 데이터 읽기
  const oldData = sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, 8).getValues();
  
  // 9열로 변환: 6번째에 단가 스냅샷 삽입
  const newData = oldData.map(row => {
    const code = row[1];
    const price = priceMap[code] || 0;
    // 기존: [날짜, 코드, 이름, 구분, 수량, 담당자, 비고, 거래ID]
    // 신규: [날짜, 코드, 이름, 구분, 수량, 단가, 담당자, 비고, 거래ID]
    return [row[0], row[1], row[2], row[3], row[4], price, row[5], row[6], row[7]];
  });
  
  // 기존 데이터 클리어
  sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, 8).clearContent();
  
  // 헤더 업데이트
  const headers = ["날짜", "품목코드", "품목명", "구분", "수량", "단가", "담당자", "비고", "거래ID"];
  sheet.getRange(headerRow, 1, 1, 9).setValues([headers])
    .setBackground(COLORS.headerBg).setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");
  
  // 9열 데이터 쓰기
  if (newData.length > 0 && newData.some(r => r[1])) {
    sheet.getRange(dataStartRow, 1, newData.length, 9).setValues(newData)
      .setHorizontalAlignment("center").setBackground(COLORS.autoBg);
    sheet.getRange(dataStartRow, 6, newData.length, 1).setNumberFormat("#,##0");
  }
  
  console.log(`[Migration v8] ${sheet.getName()} — ${newData.length}행 9열 변환 완료`);
}


/**
 * 안전한 스키마 마이그레이션 실행기
 */
function runMigrations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const currentVersion = getSchemaVersion();
  
  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    ui.alert(`✅ 이미 최신 스키마 버전(v${currentVersion})입니다.\n마이그레이션이 필요하지 않습니다.`);
    return;
  }
  
  const pendingCount = CURRENT_SCHEMA_VERSION - currentVersion;
  const response = ui.alert(
    "📋 스키마 마이그레이션",
    `현재 버전: v${currentVersion}\n목표 버전: v${CURRENT_SCHEMA_VERSION}\n\n` +
    `${pendingCount}개의 마이그레이션을 실행합니다.\n\n⚠️ 실행 전 데이터 백업이 자동으로 수행됩니다.\n계속하시겠습니까?`,
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;
  
  // 마이그레이션 전 CSV 백업
  try {
    backupToCSV();
    console.log("[Migration] 사전 CSV 백업 완료");
  } catch(backupErr) {
    console.error("[Migration] CSV 백업 실패 (계속 진행): " + backupErr.message);
  }
  
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch(e) {
    ui.alert("⏳ 다른 프로세스 실행 중입니다. 잠시 후 재시도해 주세요.");
    return;
  }
  
  try {
    for (let v = currentVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      if (MIGRATIONS[v]) {
        console.log(`[Migration] v${v} 실행 시작...`);
        MIGRATIONS[v](ss);
        setSchemaVersion(v);
        SpreadsheetApp.flush();
        console.log(`[Migration] v${v} 실행 완료, 스키마 버전 업데이트됨`);
      } else {
        setSchemaVersion(v);
        console.log(`[Migration] v${v} — 변경사항 없음 (버전만 업데이트)`);
      }
    }
    
    ui.alert(`✅ 마이그레이션 완료!\nv${currentVersion} → v${CURRENT_SCHEMA_VERSION}`);
  } catch(err) {
    const failedVersion = getSchemaVersion() + 1;
    console.error(`[Migration Error] v${failedVersion}: ${err.message}\n${err.stack}`);
    ui.alert(
      `❌ 마이그레이션 v${failedVersion} 실행 중 오류:\n${err.message}\n\n` +
      `v${getSchemaVersion()}까지는 정상 적용되었습니다.`
    );
  } finally {
    lock.releaseLock();
  }
}

function testMigrationOnCopy() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    "🧪 마이그레이션 테스트",
    "현재 스프레드시트의 복사본을 만들어 마이그레이션을 테스트합니다.\n원본 데이터에는 영향이 없습니다.\n\n계속하시겠습니까?",
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmm");
  const copy = ss.copy(`[TEST] ${ss.getName()} - 마이그레이션 테스트 ${timestamp}`);
  
  ui.alert(
    "✅ 테스트 복사본 생성 완료",
    `복사본에서 마이그레이션을 테스트하세요.\n\nURL: ${copy.getUrl()}`
  );
}


// [v10] 시스템 에러 로그 시트 추가
MIGRATIONS[10] = function(ss) {
  console.log("[Migration v10] 에러 로그 시트 추가 시작...");
  if (!ss.getSheetByName("🚨 System_Logs")) {
    if (typeof buildSystemLogsSheet === "function") {
      buildSystemLogsSheet(ss);
    } else {
      const sheet = ss.insertSheet("🚨 System_Logs");
      sheet.getRange("A1:F1").merge().setValue("🚨 시스템 에러 로그")
        .setBackground("#c0392b").setFontColor("#fff").setFontWeight("bold");
      sheet.getRange("A2:F2").setValues([["시각", "함수명", "사용자", "에러 메시지", "스택 트레이스", "심각도"]])
        .setBackground("#e0e0e0").setFontColor("#000").setFontWeight("bold");
      sheet.setFrozenRows(2);
      sheet.hideSheet();
    }
    console.log("[Migration v10] System_Logs 시트 추가 완료");
  } else {
    console.log("[Migration v10] 이미 System_Logs 시트가 존재합니다.");
  }
};
