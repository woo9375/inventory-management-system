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
            // [TASK-016] 상수를 그대로 행 수로 쓰면 행이 부족한 레거시 시트에서 getRange가 터진다.
            //   _formatRowCount가 선제 확충 후 현재 행 수를 돌려준다.
            const rows = _formatRowCount(sh);
            protection.setUnprotectedRanges([
              sh.getRange(3, 1, rows, 2),
              sh.getRange(3, 4, rows, 1),
              sh.getRange(3, 5, rows, 1),
              sh.getRange(3, 6, rows, 2)
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
      // [v11] PACK→팩, set→세트, 신규 단위 10종 추가 / [v13] CASE 제외 / [v15] 조, 줄 추가
      const units = baseData.units.length > 0 ? baseData.units : ["박스","개","묶음","병","캔","kg","L","포","롤","장","세트","EA","팩","봉","통","말","자루","ml","g","대","망","판","마리","족","타레","벌","켤레","매","평","본","조","줄"];
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
    //
    // ⚠️ [TASK-017] 아래 "X2" · 24는 **v9 당시의** 열 번호다. 현재 코드에서 사용유무는 Y열(25)이지만
    //    여기를 Y/25로 고치면 안 된다. 마이그레이션은 낮은 버전부터 순서대로 도는 탓에,
    //    이 함수가 도는 시점의 시트는 아직 24열 구조이고 S열(거래처코드)은 v17에서야 끼어든다.
    //    지금 값을 최신 열로 바꾸면 레거시 시트(v8 이하)의 업그레이드 경로가 그 자리에서 어긋난다.
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
        // [TASK-016] 행 부족 시 getRange 실패를 막기 위해 선제 확충 후 현재 행 수를 쓴다
        const vRows = _formatRowCount(masterSheet);
        masterSheet.getRange(3, 24, vRows, 1).setDataValidation(
          SpreadsheetApp.newDataValidation()
            .requireValueInList(["사용", "미사용"])
            .setAllowInvalid(false).build()
        );
        
        // 미사용 행 조건부 서식 추가
        const existingRules = masterSheet.getConditionalFormatRules();
        const disabledRule = SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied('=$X3="미사용"')
          .setBackground("#f0f0f0").setFontColor("#999999")
          .setRanges([masterSheet.getRange(3, 1, vRows, 24)])
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

// [TASK-002] v11: 단위 목록 정비 — 신규 10종 추가, PACK→팩/set→세트 명칭 변경, CASE 단위 유지
MIGRATIONS[11] = function migrate_to_v11(ss) {
  console.log("[Migration v11] 단위 목록 정비 시작...");

  const NEW_UNITS = ["망", "판", "마리", "족", "타레", "벌", "켤레", "매", "평", "본"];
  const RENAME_MAP = { "PACK": "팩", "SET": "세트" }; // 대소문자 무관 매칭용 키는 대문자로 통일

  function normalizedRename(value) {
    const s = String(value).trim();
    const key = s.toUpperCase();
    return RENAME_MAP.hasOwnProperty(key) ? RENAME_MAP[key] : null;
  }

  // ── Step 1: 📂 기초데이터 시트 B열(단위 목록) 정비 ──
  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  if (baseSheet) {
    const baseLastRow = Math.max(baseSheet.getLastRow(), 3);
    let unitCol = baseLastRow >= 3 ? baseSheet.getRange(3, 2, baseLastRow - 2, 1).getValues().flat() : [];

    let renamedCount = 0;
    unitCol = unitCol.map(function(v) {
      if (!v) return v;
      const renamed = normalizedRename(v);
      if (renamed) { renamedCount++; return renamed; }
      return v;
    });

    unitCol = unitCol.filter(function(v) { return Boolean(v); });

    const existingTrimmed = unitCol.map(function(v) { return String(v).trim(); });
    const toAdd = NEW_UNITS.filter(function(u) { return existingTrimmed.indexOf(u) === -1; });
    const finalUnits = unitCol.concat(toAdd);

    // 기존 B열 전체를 비우고 정비된 목록으로 재작성 (재실행해도 동일 결과 — 멱등)
    if (baseLastRow >= 3) {
      baseSheet.getRange(3, 2, baseLastRow - 2, 1).clearContent();
    }
    if (finalUnits.length > 0) {
      baseSheet.getRange(3, 2, finalUnits.length, 1).setValues(finalUnits.map(function(v) { return [v]; }))
        .setBackground(COLORS.inputBg).setHorizontalAlignment("center");
    }
    console.log("[Migration v11] 기초데이터 단위 목록 — 명칭변경:" + renamedCount +
      "건, 신규추가:" + toAdd.length + "종(" + toAdd.join(", ") + "), CASE 단위 유지");
  } else {
    console.log("[Migration v11] 기초데이터 시트 없음 — 목록 정비 스킵");
  }

  // ── Step 2: 🗂️ 품목 마스터 E열(단위) 데이터 정비 — PACK/set만 자동 치환, CASE는 값 유지 ──
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  if (masterSheet) {
    const masterLastRow = masterSheet.getLastRow();
    if (masterLastRow >= 3) {
      const unitRange = masterSheet.getRange(3, MASTER_COLS.UNIT + 1, masterLastRow - 2, 1);
      const masterUnits = unitRange.getValues();
      let masterRenamed = 0;
      let masterCaseCount = 0;

      const updated = masterUnits.map(function(row) {
        const renamed = normalizedRename(row[0]);
        if (renamed) { masterRenamed++; return [renamed]; }
        if (String(row[0]).trim().toUpperCase() === "CASE") { masterCaseCount++; }
        return row;
      });
      unitRange.setValues(updated);

      console.log("[Migration v11] 품목마스터 단위 치환 — PACK/set→" + masterRenamed + "건 자동 변경, " +
        "CASE 사용 품목 " + masterCaseCount + "건은 대체 단위 미결정으로 값 유지");
      if (masterCaseCount > 0) {
        console.log("[Migration v11] ⚠️ USER DECISION REQUIRED — CASE 단위 대체값이 결정되면 " +
          "별도 스크립트로 해당 " + masterCaseCount + "건을 일괄 치환해야 합니다.");
      }
    }
  } else {
    console.log("[Migration v11] 품목마스터 시트 없음 — 데이터 정비 스킵");
  }

  console.log("[Migration v11] v11 마이그레이션 완료!");
};

// [TASK-009] v12: 서식·유효성 검사 적용 행 범위 확장 (503행 이후 서식 누락 결함 복구)
//
// VALIDATION_ROWS가 500이던 시절에 만들어진 시트는 3~502행까지만 서식이 구워져 있다.
// 상수를 2000으로 올려도 신규 생성 시트에만 반영되므로, 이미 운영 중인 시트에는
// 이 마이그레이션이 SheetBuilder.gs의 공용 서식 함수를 다시 호출해 범위를 확장한다.
//
// 값(setValues/setFormula)은 일절 건드리지 않고 배경색·정렬·드롭다운·숫자서식·
// 조건부서식만 다시 칠하므로 기존 입력 데이터는 보존된다. 재실행해도 결과가 같다(멱등).
MIGRATIONS[12] = function migrate_to_v12(ss) {
  console.log("[Migration v12] 서식/유효성 검사 범위 확장 시작 (VALIDATION_ROWS=" + VALIDATION_ROWS + ")...");

  const REQUIRED_ROWS = VALIDATION_ROWS + 2; // 헤더 2행 + 데이터 VALIDATION_ROWS행
  let addedRowsTotal = 0;
  let formattedSheets = 0;

  // ── Step 1: 🗂️ 품목 마스터 ──
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  if (masterSheet) {
    addedRowsTotal += _ensureMinRows(masterSheet, REQUIRED_ROWS);
    applyItemMasterFormatting(ss, masterSheet);
    formattedSheets++;
    console.log("[Migration v12] 품목 마스터 서식 확장 완료 (최대 행: " + masterSheet.getMaxRows() + ")");
  } else {
    console.log("[Migration v12] 품목 마스터 시트 없음 — 스킵");
  }

  // ── Step 2: 📝 통합 입출고 기록장 ──
  const consolidatedSheet = ss.getSheetByName(SHEET_INOUT);
  if (consolidatedSheet) {
    addedRowsTotal += _ensureMinRows(consolidatedSheet, REQUIRED_ROWS);
    applyConsolidatedLogFormatting(consolidatedSheet);
    formattedSheets++;
    console.log("[Migration v12] 통합 입출고 기록장 서식 확장 완료 (최대 행: " + consolidatedSheet.getMaxRows() + ")");
  } else {
    console.log("[Migration v12] 통합 입출고 기록장 없음 — 스킵");
  }

  // ── Step 3: 📋 입출고_템플릿 + 활성 업장 시트 ──
  // ⚠️ 업장 시트의 품목코드(B열) 드롭다운은 의도적으로 재적용하지 않는다.
  //    removeItemCodeValidation()(RBAC.gs)이 "품목코드 직접 입력" 구조로 전환한 운영 결정이므로,
  //    여기서 다시 목록 검증을 걸면 그 결정을 되돌리게 된다.
  const txSheetNames = [SHEET_TEMPLATE].concat(_getActiveShopNames());
  txSheetNames.forEach(function(name) {
    const sh = ss.getSheetByName(name);
    if (!sh) {
      console.log("[Migration v12] 시트 없음 — 스킵: " + name);
      return;
    }
    addedRowsTotal += _ensureMinRows(sh, REQUIRED_ROWS);
    applyTxInputSheetFormatting(sh);
    formattedSheets++;

    // 업장 시트는 시트 보호의 편집 허용 범위도 확장해야 503행 이후 입력이 가능하다
    // [TASK-016] 범위 계산을 공용 헬퍼로 위임 — 시트의 현재 행 수 전체가 대상이 된다
    if (name !== SHEET_TEMPLATE) _applyShopUnprotectedRanges(sh);
    console.log("[Migration v12] 서식 확장 완료: " + name + " (최대 행: " + sh.getMaxRows() + ")");
  });

  SpreadsheetApp.flush();
  console.log("[Migration v12] 완료 — 시트 " + formattedSheets + "개 서식 재적용, 총 " +
    addedRowsTotal + "행 확충 (적용 범위: 3행 ~ 각 시트 마지막 행)");
};

// [사용자 결정] v13: 📂 기초데이터 단위 목록에서 "CASE" 삭제
//
// TASK-002 당시 대체 단위가 정해지지 않아 v11에서는 목록 유지로 남겨 두었으나,
// 사용자 결정으로 기초데이터 단위 목록에서 삭제한다.
//
// ⚠️ 품목 마스터 E열에 이미 "CASE"로 입력된 품목의 **값은 바꾸지 않는다**.
//    대체 단위가 정해지지 않은 상태에서 임의 치환은 재고 단위를 왜곡하기 때문이다.
//    해당 품목 수는 아래 로그와 DevTools 진단에서 확인할 수 있으며, 수동 정정 대상이다.
//    (목록에서 빠지면 E열 드롭다운 검증에는 걸리지만 값과 수량은 그대로 유지된다.)
MIGRATIONS[13] = function migrate_to_v13(ss) {
  console.log("[Migration v13] 기초데이터 단위 목록에서 CASE 삭제 시작...");

  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  if (!baseSheet) {
    console.log("[Migration v13] 기초데이터 시트 없음 — 스킵");
    return;
  }

  const baseLastRow = Math.max(baseSheet.getLastRow(), 3);
  if (baseLastRow < 3) {
    console.log("[Migration v13] 단위 목록이 비어 있음 — 스킵");
    return;
  }

  const unitCol = baseSheet.getRange(3, 2, baseLastRow - 2, 1).getValues().flat();
  const kept = unitCol.filter(function(v) {
    return v && String(v).trim().toUpperCase() !== "CASE";
  });
  const removed = unitCol.filter(function(v) { return Boolean(v); }).length - kept.length;

  if (removed === 0) {
    console.log("[Migration v13] 단위 목록에 CASE 없음 — 변경 없음(멱등)");
  } else {
    // 목록 전체를 지우고 CASE만 뺀 결과로 재작성한다 (재실행해도 동일 — 멱등)
    baseSheet.getRange(3, 2, baseLastRow - 2, 1).clearContent();
    if (kept.length > 0) {
      baseSheet.getRange(3, 2, kept.length, 1).setValues(kept.map(function(v) { return [v]; }))
        .setBackground(COLORS.inputBg).setHorizontalAlignment("center");
    }
    console.log("[Migration v13] 기초데이터 단위 목록에서 CASE " + removed + "건 삭제 완료");
  }

  // 품목 마스터에 남아 있는 CASE 사용 품목 수를 알린다 (값은 변경하지 않음)
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  if (masterSheet && masterSheet.getLastRow() >= 3) {
    const masterLastRow = masterSheet.getLastRow();
    const units = masterSheet.getRange(3, MASTER_COLS.UNIT + 1, masterLastRow - 2, 1).getValues();
    const stillUsing = units.filter(function(r) {
      return String(r[0] || "").trim().toUpperCase() === "CASE";
    }).length;
    if (stillUsing > 0) {
      console.log("[Migration v13] ⚠️ 품목 마스터에 단위가 CASE인 품목 " + stillUsing +
        "건이 남아 있습니다. 값은 그대로 두었으므로 대체 단위 확정 후 수동 정정이 필요합니다.");
    } else {
      console.log("[Migration v13] 품목 마스터에 CASE 단위 사용 품목 없음");
    }
  }

  console.log("[Migration v13] 완료");
};

// [TASK-011] v14: 음수 재고 표시 지원 — 기존 시트에 신규 수식/서식 재적용
//
// 음수 재고 허용은 StockEngine.gs(계산)와 SheetBuilder.gs(수식·서식)를 함께 바꾸는데,
// 수식과 조건부 서식은 시트 생성 시점에 한 번 구워지므로 이미 운영 중인 마스터 시트에는
// 반영되지 않는다. 이 마이그레이션이 다음 3가지를 다시 적용한다.
//   1) P3 적정발주량 — 일평균(I열) 0 이하이면 발주량 0 (음수 재고발 허수 발주 차단)
//   2) W3 재고 합계금액 — 행 단위 0원 하한 (마이너스 자산 기록 차단)
//   3) H열 서식 — 음수 강조 조건부 서식 + 숫자 서식
// 마지막으로 재계산을 돌려 그동안 0으로 눌려 있던 결손 수량을 즉시 노출한다.
// 값 자체는 파생 컬럼(H·I·W)만 갱신되므로 재실행해도 결과가 같다(멱등).
MIGRATIONS[14] = function migrate_to_v14(ss) {
  console.log("[Migration v14] 음수 재고 표시 지원 — 수식/서식 재적용 시작...");

  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  if (!masterSheet) {
    console.log("[Migration v14] 품목 마스터 시트 없음 — 스킵");
    return;
  }

  // ── Step 1: 적정발주량(P3) / 재고 합계금액(W3) 수식 갱신 ──
  //
  // ⚠️ [TASK-017] "W3"와 T3:T도 **v14 당시의** 주소다(현재 합계금액은 X열, 매입단가는 U열).
  //    v9와 같은 이유로 최신 열로 올리지 않는다 — 이 함수가 도는 시점의 시트는 아직 24열이고,
  //    열을 미는 일은 v17이 뒤이어 한 번만 한다. 여기서 미리 밀면 두 번 밀린다.
  masterSheet.getRange("P3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", IF(I3:I<=0, 0, IF((I3:I * M3:M) - H3:H < 0, 0, ROUNDUP((I3:I * M3:M) - H3:H, 0)))))`);
  masterSheet.getRange("W3").setFormula(`=ARRAYFORMULA(IF(A3:A="", "", IF(T3:T * H3:H < 0, 0, T3:T * H3:H)))`);
  console.log("[Migration v14] P3(적정발주량) / W3(재고 합계금액) 수식 갱신 완료");

  // ── Step 2: H열 음수 조건부 서식 + 숫자 서식 ──
  //
  // [TASK-017] applyItemMasterFormatting은 공용 헬퍼라 늘 **현재**(25열) 구조를 기준으로 굽는다.
  //   v14가 도는 시점의 레거시 시트는 아직 24열이라 서식이 한 칸씩 어긋나게 발린다.
  //   바로 뒤따라 도는 v17이 reapplyAllSheetFormatting으로 전부 다시 구우므로 최종 상태는 옳고,
  //   여기서 실패하더라도 수식 갱신(Step 1)과 남은 마이그레이션까지 같이 죽어서는 안 된다.
  try {
    applyItemMasterFormatting(ss, masterSheet);
    console.log("[Migration v14] 품목 마스터 서식 재적용 완료 (H열 음수 강조 포함)");
  } catch (e) {
    console.log("[Migration v14] ⚠️ 서식 재적용 실패(수식은 정상 적용됨, v17이 다시 굽는다): " + e.message);
  }

  SpreadsheetApp.flush();

  // ── Step 3: 재계산으로 결손 수량 즉시 반영 ──
  // 재계산 실패가 수식/서식 적용까지 되돌리게 해서는 안 되므로 로그만 남긴다.
  try {
    recalcStockAndUsage(ss);
    console.log("[Migration v14] 재고 재계산 완료 — 음수 재고가 있으면 H열에 노출됩니다");
  } catch (e) {
    console.log("[Migration v14] ⚠️ 재고 재계산 실패(수식/서식은 정상 적용됨): " + e.message);
  }

  console.log("[Migration v14] 완료");
};

// [v15] 📂 기초데이터 단위 목록에 "조", "줄" 추가
MIGRATIONS[15] = function migrate_to_v15(ss) {
  console.log("[Migration v15] 기초데이터 단위 목록에 '조', '줄' 추가 시작...");

  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  if (!baseSheet) {
    console.log("[Migration v15] 기초데이터 시트 없음 — 스킵");
    return;
  }

  const baseLastRow = Math.max(baseSheet.getLastRow(), 3);
  let unitCol = baseLastRow >= 3 ? baseSheet.getRange(3, 2, baseLastRow - 2, 1).getValues().flat() : [];
  unitCol = unitCol.filter(function(v) { return Boolean(v); });

  const existingTrimmed = unitCol.map(function(v) { return String(v).trim(); });
  const NEW_UNITS = ["조", "줄"];
  const toAdd = NEW_UNITS.filter(function(u) { return existingTrimmed.indexOf(u) === -1; });

  if (toAdd.length === 0) {
    console.log("[Migration v15] 단위 목록에 '조', '줄' 이미 존재 — 변경 없음(멱등)");
  } else {
    const finalUnits = unitCol.concat(toAdd);
    if (baseLastRow >= 3) {
      baseSheet.getRange(3, 2, baseLastRow - 2, 1).clearContent();
    }
    baseSheet.getRange(3, 2, finalUnits.length, 1).setValues(finalUnits.map(function(v) { return [v]; }))
      .setBackground(COLORS.inputBg).setHorizontalAlignment("center");
    console.log("[Migration v15] 기초데이터 단위 목록에 신규 추가 완료: " + toAdd.join(", "));
  }

  try {
    if (typeof CacheManager !== "undefined" && CacheManager.invalidateAll) {
      CacheManager.invalidateAll();
    }
  } catch (e) {
    console.log("[Migration v15] 캐시 무효화 스킵/실패: " + e.message);
  }

  SpreadsheetApp.flush();
  console.log("[Migration v15] 완료");
};

// [TASK-016] v16: 서식·유효성 검사 범위를 시트의 실제 행 수까지 동적 확장
//
// v12(TASK-009)는 VALIDATION_ROWS=2000을 고정 상한으로 써서 3~2002행까지만 서식을 구웠다.
// 품목이 2000건을 넘자 2003행부터 같은 결함(흰 배경·좌측정렬·드롭다운 없음)이 재발했다.
// v16은 상수를 5000으로 올리는 동시에, 서식 적용 범위를 고정값이 아니라
// 시트의 현재 행 수(getMaxRows)를 따라가도록 바꾼 코드로 전 시트를 다시 굽는다.
//
// 실제 작업은 SheetBuilder.gs의 reapplyAllSheetFormatting() 한 곳에 있다.
// 관리자 메뉴(repairAllSheetFormatting)와 통합 갱신의 자가 복구도 같은 함수를 호출하므로
// 서식 규칙이 마이그레이션·메뉴·빌더로 갈라질 여지가 없다.
//
// 값(setValues/setFormula)은 일절 호출하지 않으므로 기존 입력 데이터는 보존된다. 멱등.
MIGRATIONS[16] = function migrate_to_v16(ss) {
  console.log("[Migration v16] 서식/검증 범위 동적 확장 시작 (VALIDATION_ROWS=" + VALIDATION_ROWS + " 하한)...");

  const r = reapplyAllSheetFormatting(ss);

  SpreadsheetApp.flush();
  console.log("[Migration v16] 완료 — 시트 " + r.sheets + "개 서식 재적용, 총 " + r.addedRows + "행 확충" +
    (r.missing.length ? " (없는 시트: " + r.missing.join(", ") + ")" : ""));
};

// [TASK-017] v17: 거래처(매입처) 마스터 신설 + 품목 마스터에 거래처코드 열 삽입
//
// 발주·정산이 담당자 기억에 의존하던 문제를 없애기 위해 거래처를 데이터로 만든다.
// 품목 마스터는 거래처코드만 들고(거래처명 복제 금지) 🤝 거래처관리를 참조한다.
//
// 이 마이그레이션이 하는 일은 4가지다.
//   1) 🤝 거래처관리 시트 생성 (빈 폼만 — 초기 59건은 Human이 직접 붙여넣는다)
//   2) 품목 마스터 S열에 거래처코드 열 삽입 → 과세구분~사용유무가 한 칸씩 우측 이동
//   3) 회계 ARRAYFORMULA(V3·W3·X3) 명시적 재작성
//   4) 전 시트 서식 재적용
//
// (3)을 굳이 다시 쓰는 이유: 시트는 열을 끼워 넣을 때 수식 참조를 자동으로 밀어 주지만,
// 그 자동 시프트는 "지금 시트에 들어 있는 수식"에만 걸린다. 수식이 지워졌거나 손으로
// 고쳐진 시트에서는 아무 일도 일어나지 않고, 결과가 시트마다 달라진다.
// 코드가 최종 형태를 직접 못 박아야 어느 시트에서 돌려도 같은 상태로 끝난다.
//
// 멱등: 시트/열이 이미 있으면 만들지 않고, 수식과 서식만 같은 값으로 다시 쓴다.
MIGRATIONS[17] = function migrate_to_v17(ss) {
  console.log("[Migration v17] 거래처 마스터 신설 + 품목 마스터 거래처코드 열 삽입 시작...");

  // ── Step 1: 🤝 거래처관리 시트 ──
  // 존재 여부로 스킵하지 않고 항상 부른다. buildVendors는 멱등이며(있으면 고쳐 쓴다),
  // "시트는 있는데 안이 덜 만들어진" 상태 — 이전 실행이 시트 생성 직후 실패한 경우 — 를
  // 존재 검사만으로는 구별할 수 없기 때문이다. 값은 같은 값으로 다시 쓰므로 데이터는 보존된다.
  const vendorExisted = Boolean(ss.getSheetByName(SHEET_VENDORS));
  buildVendors(ss);
  console.log("[Migration v17] " + SHEET_VENDORS + (vendorExisted
    ? " 시트 이미 존재 — 서식/헤더 재적용(복구)"
    : " 시트 생성 완료 (13열 빈 폼 — 초기 데이터는 수동 입력)"));

  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  if (!masterSheet) {
    console.log("[Migration v17] 품목 마스터 시트 없음 — 열 삽입 스킵");
    return;
  }

  // ── Step 2: 거래처코드 열 삽입 (S열) ──
  const vendorCol = MASTER_COLS.VENDOR_CODE + 1; // 19
  const headerCell = masterSheet.getRange(2, vendorCol);
  if (String(headerCell.getValue()).trim() === "거래처코드") {
    console.log("[Migration v17] 품목 마스터 S열에 거래처코드 이미 존재 — 열 삽입 스킵(멱등)");
  } else {
    masterSheet.insertColumnBefore(vendorCol);
    masterSheet.getRange(2, vendorCol).setValue("거래처코드")
      .setBackground("#16a085").setFontColor(COLORS.headerText).setFontWeight("bold").setHorizontalAlignment("center");

    // 삽입된 열은 **왼쪽 열의 서식/너비를 물려받는다**. 왼쪽은 R열(스페이서, 너비 20)이라
    // 그대로 두면 거래처코드가 20px 폭의 회색 칸으로 태어난다. 명시적으로 되돌린다.
    //   (배경색은 바로 뒤 reapplyAllSheetFormatting이 입력색으로 덮는다)
    masterSheet.setColumnWidth(vendorCol, 110);
    console.log("[Migration v17] 품목 마스터 S열에 거래처코드 열 삽입 완료 (24열 → " + MASTER_COL_COUNT + "열)");
  }

  // 1행 제목 병합 범위도 늘어난 열에 맞춘다. 열 삽입으로 자동 확장되긴 하지만,
  // 병합이 이미 깨져 있던 시트에서는 아무 일도 일어나지 않으므로 여기서 못 박는다.
  masterSheet.getRange(1, 1, 1, MASTER_COL_COUNT).breakApart().merge();

  // ── Step 3: 회계 ARRAYFORMULA 재작성 (V3 공급단가 / W3 단위세액 / X3 재고합계금액) ──
  masterSheet.getRange(3, MASTER_COLS.SUPPLY_PRICE + 1).setFormula(_masterSupplyPriceFormula());
  masterSheet.getRange(3, MASTER_COLS.TAX_AMOUNT + 1).setFormula(_masterTaxAmountFormula());
  masterSheet.getRange(3, MASTER_COLS.TOTAL_VALUE + 1).setFormula(_masterTotalValueFormula());
  console.log("[Migration v17] 회계 수식 V3/W3/X3 재작성 완료");

  // ── Step 4: 대시보드 KPI 수식 재작성 ──
  // KPI 4개는 품목 마스터의 사용유무 열(X → Y)을 참조한다. 시트가 열 삽입 때 참조를
  // 자동으로 밀어 주긴 하지만, 그 시프트는 "지금 들어 있는 수식"에만 걸린다.
  // 대시보드 KPI가 지워졌거나 손으로 고쳐진 시트에서는 아무 일도 일어나지 않으므로 못 박는다.
  const dashSheet = ss.getSheetByName(SHEET_DASHBOARD);
  if (dashSheet) {
    applyDashboardKpiFormulas(dashSheet);
    console.log("[Migration v17] 대시보드 KPI 수식 재작성 완료 (사용유무 참조 → " + _colLetter(MASTER_COLS.USAGE_STATUS + 1) + "열)");
  } else {
    console.log("[Migration v17] 대시보드 시트 없음 — KPI 재작성 스킵");
  }

  // ── Step 5: 서식 재적용 ──
  // 품목 마스터의 거래처 드롭다운, 밀려난 과세/사용유무 드롭다운, 조건부 서식(=$Y3="미사용")이
  // 여기서 새 열 구조에 맞게 다시 구워진다.
  const r = reapplyAllSheetFormatting(ss);
  console.log("[Migration v17] 전 시트 서식 재적용 완료 — 시트 " + r.sheets + "개" +
    (r.missing.length ? " (없는 시트: " + r.missing.join(", ") + ")" : ""));

  SpreadsheetApp.flush();

  // 캐시에는 MASTER_COL_COUNT 기준으로 읽은 품목 배열이 들어 있다. 열 수가 바뀌었으므로 버린다.
  try {
    if (typeof CacheManager !== "undefined" && CacheManager.invalidateAll) CacheManager.invalidateAll();
  } catch (e) {
    console.log("[Migration v17] 캐시 무효화 스킵/실패: " + e.message);
  }

  // 재고 합계금액을 기록하는 열이 W → X로 바뀌었다(StockEngine). 한 번 돌려 새 열에 값을 채운다.
  // 재계산 실패가 구조 변경까지 되돌리게 해서는 안 되므로 로그만 남긴다.
  try {
    recalcStockAndUsage(ss);
    console.log("[Migration v17] 재고 재계산 완료 — 재고 합계금액이 X열에 기록됩니다");
  } catch (e) {
    console.log("[Migration v17] ⚠️ 재고 재계산 실패(구조/수식/서식은 정상 적용됨): " + e.message);
  }

  console.log("[Migration v17] 완료");
};

// ═══════════════════════════════════════════════════════════════════
// [v18] v17 운영 중 드러난 두 가지를 바로잡는다.
//
// ── 1) 품목 마스터 사용유무(Y열)에 숫자가 들어간 시트 복구 ──
//
// 무슨 일이 있었나: TASK-017 코드는 MASTER_COLS(25열 구조)를 믿고 재고 합계금액을
// TOTAL_VALUE + 1 = **24열**에 쓴다. 그런데 코드 배포(clasp push)와 시트 마이그레이션
// (사람이 메뉴에서 누르는 runMigrations)은 동시에 일어나지 않는다. 그 사이 창에서는
// 시트가 아직 24열이고 24열은 사용유무다. 이때 recalcStockAndUsage가 한 번이라도 돌면
// FIFO 평가액이 전 품목의 사용유무를 덮어쓰고, 뒤이어 v17이 그 값을 통째로 Y열로 밀어 놓는다.
// (DEV에서 실제로 일어났다 — 97개 품목의 사용유무가 전부 숫자가 됐다.)
//
// 이 창은 지금 _isMasterSchemaCurrent 가드가 막는다(StockEngine·ItemService).
// 여기서는 이미 망가진 값만 되돌린다. 사용/미사용 중 하나가 아닌 값만 "사용"으로 바꾸므로,
// 멀쩡한 시트(Production)에서 돌면 한 칸도 건드리지 않는다.
//
// ⚠️ 되돌릴 수 없는 정보가 하나 있다: 덮어쓰이기 전 "미사용"이었던 품목은 알 길이 없다.
//    전부 "사용"으로 복구되므로, 미사용 품목이 있었다면 사람이 다시 지정해야 한다.
//
// ── 2) 거래처 드롭다운 소스 열을 O(15) → N(14)로 당긴다 ──
//
// 소스 열은 숨김이지만 M과 그 사이의 N열이 **보이는 빈 열**로 남았다. 서식 복구가
// 열을 확충할 때마다(_ensureMinColumns) 사용자 눈에는 "누르지도 않은 N열이 생겼다"로
// 보여 결함으로 신고됐다. 소스 열을 M 바로 옆으로 당기면 시트가 M에서 끝나는 것처럼 보인다.
//
// ── 3) 거래처코드가 빈 행에 코드 일괄 부여 ──
//
// 초기 거래처는 시트에 직접 붙여넣는 경로를 쓰는데 그 경로에는 채번하는 손이 없다.
// 코드 없는 행은 웹앱 목록에도, 드롭다운 소스에도 나타나지 않는다.
//
// 멱등: 셋 다 "어긋난 것만 고친다". 두 번 돌려도 결과가 같다.
MIGRATIONS[18] = function migrate_to_v18(ss) {
  console.log("[Migration v18] 사용유무 복구 + 거래처 드롭다운 소스 열 정리 시작...");

  // ── Step 1: 품목 마스터 사용유무 복구 ──
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  if (!masterSheet) {
    console.log("[Migration v18] 품목 마스터 시트 없음 — 사용유무 복구 스킵");
  } else if (!_isMasterSchemaCurrent(masterSheet)) {
    // v17이 바로 앞에서 돌았으므로 정상 경로에서는 여기 오지 않는다.
    // 그래도 왔다면 열 위치를 믿을 수 없다는 뜻이라 **쓰지 않는다** — 그게 이 사고의 교훈이다.
    console.error("[Migration v18] 품목 마스터가 v17(25열) 구조가 아니어서 사용유무 복구를 건너뜁니다.");
  } else {
    const repaired = _v18RepairUsageStatus(masterSheet);
    console.log(repaired > 0
      ? "[Migration v18] 사용유무 복구 " + repaired + "건 (사용/미사용이 아닌 값 → \"사용\")"
      : "[Migration v18] 사용유무 이상 없음 — 복구할 값 없음");
  }

  // ── Step 2 · 3: 거래처 시트 ──
  const vendorSheet = ss.getSheetByName(SHEET_VENDORS);
  if (!vendorSheet) {
    console.log("[Migration v18] " + SHEET_VENDORS + " 시트 없음 — 거래처 작업 스킵");
  } else {
    _v18RetireLegacySourceColumn(vendorSheet);
    applyVendorsFormatting(vendorSheet); // 새 소스 열(N)에 FILTER 수식 생성 + 숨김

    const r = _backfillVendorCodes(vendorSheet);
    console.log(r.assigned > 0
      ? "[Migration v18] 거래처코드 " + r.assigned + "건 부여 (" + r.firstCode + " ~ " + r.lastCode + ")"
      : "[Migration v18] 거래처코드가 빈 행 없음 (검사한 행: " + r.total + ")");
  }

  // ── Step 4: 서식 재적용 ──
  // 품목 마스터의 거래처 드롭다운이 O열을 가리키고 있다. 소스가 N으로 옮겨졌으므로
  // 여기서 다시 세우지 않으면 드롭다운이 빈 열을 바라본다.
  const fmt = reapplyAllSheetFormatting(ss);
  console.log("[Migration v18] 전 시트 서식 재적용 완료 — 시트 " + fmt.sheets + "개" +
    (fmt.missing.length ? " (없는 시트: " + fmt.missing.join(", ") + ")" : ""));

  SpreadsheetApp.flush();

  try {
    if (typeof CacheManager !== "undefined" && CacheManager.invalidateAll) CacheManager.invalidateAll();
  } catch (e) {
    console.log("[Migration v18] 캐시 무효화 스킵/실패: " + e.message);
  }

  console.log("[Migration v18] 완료");
};

/**
 * [v18] 품목코드가 있는 행 중 사용유무가 사용/미사용이 아닌 것을 "사용"으로 되돌린다.
 *
 * getLastRow()를 쓰지 않는 이유: 품목 마스터에는 시트 끝까지 흐르는 ARRAYFORMULA가 있어
 * 데이터가 끝난 뒤에도 "내용 있는 행"으로 잡힐 수 있다. 권위 있는 기준은 A열(품목코드)이다.
 *
 * @returns {number} 실제로 고친 셀 수
 */
function _v18RepairUsageStatus(masterSheet) {
  const maxRow = masterSheet.getMaxRows();
  if (maxRow < 3) return 0;

  const codes = masterSheet.getRange(3, MASTER_COLS.CODE + 1, maxRow - 2, 1).getValues();
  let lastRow = 2;
  for (let i = codes.length - 1; i >= 0; i--) {
    if (String(codes[i][0] || "").trim()) { lastRow = i + 3; break; }
  }
  if (lastRow < 3) return 0;

  const count = lastRow - 2;
  const range = masterSheet.getRange(3, MASTER_COLS.USAGE_STATUS + 1, count, 1);
  const current = range.getValues();

  let repaired = 0;
  const out = current.map(function (r, i) {
    const value = String(r[0] === null || r[0] === undefined ? "" : r[0]).trim();
    if (value === "사용" || value === "미사용") return [value];
    if (!String(codes[i][0] || "").trim()) return [value]; // 품목코드 없는 행은 손대지 않는다
    repaired++;
    return ["사용"];
  });

  if (repaired > 0) range.setValues(out);
  return repaired;
}

/**
 * [v18] v17이 쓰던 옛 드롭다운 소스 열(O)을 비운다.
 *
 * 헤더 문구가 우리가 쓴 값일 때만 손댄다 — 사용자가 그 열에 무언가 적어 뒀다면
 * 마이그레이션이 말없이 지우는 일이 있어서는 안 된다.
 * 지운 뒤에도 숨김 상태로 둔다. 빈 열을 다시 보이게 하면 사용자에게는 또 하나의
 * "갑자기 생긴 열"이 되기 때문이다.
 */
function _v18RetireLegacySourceColumn(vendorSheet) {
  const legacy = VENDOR_ACTIVE_CODE_COL_LEGACY;
  if (legacy === VENDOR_ACTIVE_CODE_COL) return;      // 이미 같은 열이면 할 일이 없다
  if (vendorSheet.getMaxColumns() < legacy) return;   // 옛 열 자체가 없다

  const header = String(vendorSheet.getRange(2, legacy).getValue() || "").trim();
  if (header !== VENDOR_ACTIVE_CODE_HEADER) {
    console.log("[Migration v18] 옛 소스 열(" + _colLetter(legacy) + ")이 우리 것이 아님 — 그대로 둠");
    return;
  }

  vendorSheet.getRange(1, legacy, vendorSheet.getMaxRows(), 1).clearContent();
  vendorSheet.hideColumns(legacy);
  console.log("[Migration v18] 옛 드롭다운 소스 열 " + _colLetter(legacy) + " 비움 (소스는 " +
    _colLetter(VENDOR_ACTIVE_CODE_COL) + "열로 이동)");
}

// ═══════════════════════════════════════════════════════════════════
// [TASK-019] 업장 개편 — 기존 업장 시트를 지우고 전체 23개 부서/업장으로 갱신 (일회성 · 수동 실행)
//
// MIGRATIONS 레지스트리에 넣지 않는 이유: 스키마 마이그레이션은 "데이터를 보존하며 구조를 바꾸는"
// 멱등 작업이다. 이것은 업장 시트와 그 안의 입출고 이력을 **영구 삭제**하는 운영 작업이라
// runMigrations()의 버전 진행에 끼워 자동으로 돌아서는 안 된다. Apps Script 편집기에서 사람이
// 이 함수를 직접 골라 실행하고, YES/NO 확인을 거친다. (스프레드시트를 연 상태에서 실행할 것 — 확인창이 거기 뜬다)
//
// 절차
//   0. 확인창 — 지워질 시트 목록과 새 업장 수를 보여 주고 YES를 받는다
//   1. CSV 백업 (통합 기록장 · 품목 마스터)
//   2. 🏢 업장관리의 기존 행을 지우고 새 23개 행을 쓴다 — 실패하면 이전 행을 복원한다 (여기까지는 되돌릴 수 있다)
//   3. 기존 업장 시트를 삭제한다 (GID → 이름 순으로 찾는다. 시스템 시트는 이름이 겹쳐도 절대 지우지 않는다)
//   4. generateNewShops() — 템플릿 복사로 시트 생성 + 생성완료/바로가기/GID 기록
//   5. 캐시 무효화 + 통합 갱신(refreshDashboard) — 통합 기록장에서 사라진 업장의 행을 걷어내고 재고를 재계산
//
// 순서가 중요하다: 되돌릴 수 있는 2단계를 되돌릴 수 없는 3단계보다 먼저 한다.
// 2단계가 검증(분류 드롭다운 등)에 걸려 실패하면 시트는 아직 하나도 지워지지 않은 상태다.
// ═══════════════════════════════════════════════════════════════════

/**
 * 신규 업장 목록 — [분류, 업장명, 거래ID 태그]. 업장명은 사용자가 지정한 23개.
 *
 * 분류는 🏢 업장관리 A열 드롭다운 목록(buildShopsSheet의 9종) 안의 값이어야 한다 —
 *   엄격 검증(setAllowInvalid(false))이라 목록 밖 값은 setValues 자체가 거부된다.
 * 태그는 영어 대문자 2~3자(addShop의 규칙), 서로 달라야 한다(거래ID 접두사).
 *   기존 4개 업장(맛다락·술다락·남탕·여탕)의 태그 TX·AX·MB·WB는 그대로 두어 거래ID 체계가 이어지게 했다.
 * 분류·태그는 명세에 없어 임의 배정한 값이다 — 첫 입출고 기록 전에는 🏢 업장관리에서 바꿀 수 있다.
 */
const TASK019_NEW_SHOPS = [
  ["관리",     "관리팀",      "ADM"],
  ["구매",     "구매팀",      "PUR"],
  ["판촉",     "예약홍보팀",  "MKT"],
  ["호텔",     "호텔프론트",  "HFD"],
  ["호텔",     "호텔객실",    "HRM"],
  ["호텔",     "호텔 세탁실", "HLD"],
  ["식음",     "식음료",      "FNB"],
  ["조리",     "조리팀",      "KIT"],
  ["조리",     "직원식당",    "STF"],
  ["관리",     "기전실",      "ENG"],
  ["관리",     "영선",        "MNT"],
  ["식음",     "로봇커피",    "RBC"],
  ["식음",     "달콤덕구",    "DKD"],
  ["스파월드", "매표소",      "TKT"],
  ["스파월드", "가족실",      "FMB"],
  ["식음",     "카페테리아",  "CAF"],
  ["스파월드", "남탕",        "MB"],
  ["스파월드", "여탕",        "WB"],
  ["콘도",     "콘도프론트",  "CFD"],
  ["콘도",     "콘도객실",    "CRM"],
  ["콘도",     "콘도 세탁실", "CLD"],
  ["식음",     "맛다락",      "TX"],
  ["식음",     "술다락",      "AX"]
];

function migrateShops_TASK019() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  if (!shopSheet) throw new Error("'" + SHEET_SHOPS + "' 시트가 없습니다.");
  if (!ss.getSheetByName(SHEET_TEMPLATE)) throw new Error("'" + SHEET_TEMPLATE + "' 시트가 없어 업장 시트를 만들 수 없습니다.");

  _task019ValidateShopList(TASK019_NEW_SHOPS);

  // 현재 업장관리 행 스냅샷 (A~G: 분류·업장명·태그·상태·바로가기·GID·담당자) — 2단계 실패 시 복원용
  const lastRow = shopSheet.getLastRow();
  const oldRows = lastRow >= 3 ? shopSheet.getRange(3, 1, lastRow - 2, 7).getValues() : [];
  const targets = _task019FindOldShopSheets(ss, oldRows);

  // 0) 확인
  const ui = _task019Ui();
  if (!ui) throw new Error("확인 대화상자를 띄울 수 없는 환경입니다. 스프레드시트를 연 상태에서 편집기에서 실행하세요.");
  const res = ui.alert(
    "⚠️ 업장 개편 (TASK-019)",
    "다음 작업을 수행합니다.\n\n" +
    "1) 기존 업장 시트 " + targets.length + "개를 영구 삭제합니다 — 그 안의 입출고 이력도 함께 사라집니다:\n   " +
    (targets.length ? targets.map(s => s.getName()).join(", ") : "(없음)") + "\n" +
    "2) 🏢 업장관리 목록을 신규 " + TASK019_NEW_SHOPS.length + "개 업장으로 교체하고 시트를 새로 만듭니다.\n" +
    "3) 통합 기록장을 다시 취합하고 재고를 재계산합니다.\n\n" +
    "실행 전 CSV 백업을 자동으로 수행하지만, 시트 자체의 스냅샷(파일 > 사본 만들기)을 먼저 확보하기를 권장합니다.\n\n" +
    "계속하시겠습니까?",
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) { console.log("[TASK-019] 업장 개편 취소"); return; }

  // 1) 백업
  try { backupToCSV(); console.log("[TASK-019] 사전 CSV 백업 완료"); }
  catch (e) { console.error("[TASK-019] CSV 백업 실패 (계속 진행): " + e.message); }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let deleted = 0;
  const failed = [];
  try {
    // 2) 업장관리 행 교체 — 되돌릴 수 있는 단계를 먼저
    try {
      _task019WriteShopRows(shopSheet, oldRows.length, TASK019_NEW_SHOPS);
    } catch (writeErr) {
      if (oldRows.length) shopSheet.getRange(3, 1, oldRows.length, 7).setValues(oldRows);
      throw new Error("업장관리 시트 갱신 실패 — 이전 목록을 복원했고 시트는 하나도 삭제하지 않았습니다: " + writeErr.message);
    }

    // 3) 기존 시트 삭제
    targets.forEach(sh => {
      try { ss.deleteSheet(sh); deleted++; }
      catch (e) { failed.push(sh.getName() + " (" + e.message + ")"); }
    });
    SpreadsheetApp.flush();

    // 4) 시트 생성 — '대기' 행만 만든다. 삭제에 실패해 같은 이름이 남아 있으면 그 시트를 재사용한다(generateNewShops 규칙).
    generateNewShops();
  } finally {
    lock.releaseLock();
  }

  // 5) 캐시 · 통합 갱신 (refreshDashboard는 자체 락을 잡으므로 위 락을 푼 뒤에 부른다)
  try { CacheManager.invalidateAll(); } catch (e) { console.warn("[TASK-019] 캐시 무효화 실패: " + e.message); }
  try { refreshDashboard(true); }
  catch (e) { console.error("[TASK-019] 통합 갱신 실패 — 관리자 도구 > 통합 갱신을 수동 실행하세요: " + e.message); }

  const created = _getActiveShopNames().length;
  const summary =
    "✅ 업장 개편 완료\n\n" +
    "삭제한 시트: " + deleted + "개" + (failed.length ? "\n삭제 실패: " + failed.join(", ") : "") + "\n" +
    "생성완료 업장: " + created + " / " + TASK019_NEW_SHOPS.length + "개\n\n" +
    "• 분류·거래ID 태그는 임의 배정입니다. 첫 입출고 기록 전에는 🏢 업장관리에서 바꿀 수 있습니다.\n" +
    "• 👤 사용자관리의 '배정된 업장'이 옛 업장명을 가리키면 웹앱 '계정 관리'에서 다시 배정하세요.";
  console.log(summary);
  try { ui.alert(summary); } catch (e) { /* UI 없는 환경 */ }
}

/** 목록 자체의 결함(중복 태그 등)은 시트를 건드리기 전에 걸러낸다. */
function _task019ValidateShopList(shops) {
  const names = {};
  const tags = {};
  shops.forEach((s, i) => {
    const category = String(s[0] || "").trim();
    const name = String(s[1] || "").trim();
    const tag = String(s[2] || "").trim();
    if (!category || !name || !tag) throw new Error("업장 목록 " + (i + 1) + "번째 항목에 빈 값이 있습니다: " + JSON.stringify(s));
    if (!/^[A-Z]{2,3}$/.test(tag)) throw new Error("태그 '" + tag + "'는 영어 대문자 2~3자여야 합니다 (" + name + ")");
    if (names[name]) throw new Error("업장명 중복: " + name);
    if (tags[tag]) throw new Error("태그 중복: " + tag + " (" + tags[tag] + ", " + name + ")");
    names[name] = true;
    tags[tag] = name;
  });
}

/** 업장관리에 적힌 업장의 시트를 찾는다 — GID 우선, 없으면 이름. 시스템 시트는 제외한다. */
function _task019FindOldShopSheets(ss, oldRows) {
  const systemNames = [
    SHEET_DASHBOARD, SHEET_INOUT, SHEET_MASTER, SHEET_TEMPLATE, SHEET_SHOPS, SHEET_SEASONS,
    SHEET_USERS, SHEET_BASE_DATA, SHEET_CHANGELOG, SHEET_VENDORS, SHEET_SYSTEM_LOGS
  ];
  const allSheets = ss.getSheets();
  const targets = [];
  oldRows.forEach(r => {
    const name = String(r[1] || "").trim();
    if (!name) return;
    const gid = r[5];
    let sh = (gid !== "" && gid !== null && gid !== undefined)
      ? allSheets.find(s => String(s.getSheetId()) === String(gid))
      : null;
    if (!sh) sh = ss.getSheetByName(name);
    if (!sh) return;
    if (systemNames.indexOf(sh.getName()) >= 0) return;
    if (targets.indexOf(sh) < 0) targets.push(sh);
  });
  return targets;
}

/**
 * 업장관리 3행부터를 비우고 새 목록을 '대기' 상태로 쓴다.
 * '삭제됨' 처리로 회색이 된 행이 있을 수 있어 배경·글자색도 원래 규칙(A~C 입력색, D~F 자동색)으로 되돌린다.
 */
function _task019WriteShopRows(shopSheet, oldCount, shops) {
  const n = shops.length;
  const clearCount = Math.max(oldCount, n);
  if (clearCount > 0) {
    shopSheet.getRange(3, 1, clearCount, 7).clearContent();
    shopSheet.getRange(3, 1, clearCount, 3).setBackground(COLORS.inputBg).setFontColor("#000000").setHorizontalAlignment("center");
    shopSheet.getRange(3, 4, clearCount, 3).setBackground(COLORS.autoBg).setFontColor("#000000").setHorizontalAlignment("center");
  }
  shopSheet.getRange(3, 1, n, 4).setValues(shops.map(s => [s[0], s[1], s[2], "대기"]));
}

function _task019Ui() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}
