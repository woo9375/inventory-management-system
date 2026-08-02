/**
 * 호텔덕구온천 구매 재고 관리 시스템 — RBAC 권한 관리 모듈
 * 역할 기반 접근 제어 (Role-Based Access Control)
 */

// [요구사항 2-2] 권한 범위(L열) 동적 드롭다운 엔진
function _refreshPermissionDropdown(ss) {
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = cfg.getLastRow();
  const shopList = ["admin"]; // 기본 admin 고정
  
  if (lastRow >= 4) {
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

  _refreshPermissionDropdown(ss);
  SpreadsheetApp.getUi().alert(missingCount > 0 ? `⚠️ ${missingCount}개의 삭제된 시트가 '대기' 상태로 초기화되었습니다.` : "✅ 모든 시트가 정상 존재합니다.");
}

// [요구사항 2-3] 권한 재동기화 전면 개편 (RBAC 적용)
function syncPermissions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _refreshPermissionDropdown(ss);
  
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = cfg.getLastRow();
  if (lastRow < 4) return;
  
  _protectSystemSheets(ss);
  
  const roles = _getUsersByRole(ss);
  const ownerEmail = ss.getOwner() ? ss.getOwner().getEmail() : "";
  // [v6.8 FIX] B열(col 2)부터 읽기 — 다른 함수들과 통일
  const data = cfg.getRange(4, 2, lastRow - 3, 6).getValues();
  let syncCount = 0;

  data.forEach(row => {
    const shopName = row[1], status = row[3], gid = row[5];
    if (status === "생성완료" && gid !== "") {
      const targetSheet = ss.getSheets().find(s => s.getSheetId() == gid);
      if (targetSheet) {
        const protection = targetSheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
        if (protection) {
          const currentEditors = protection.getEditors().map(e => e.getEmail());
          const desiredEditors = new Set([...roles.admins]);
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
