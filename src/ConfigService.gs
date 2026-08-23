


// ═══════════════════════════════════════════════════════════════════
//  API: 설정 데이터
// ═══════════════════════════════════════════════════════════════════

function getConfigData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };

  const CACHE_KEY = `CONFIG_DATA_${session.role}`;
  let cachedData = CacheManager.get(CACHE_KEY);
  if (cachedData) return cachedData;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();

  // [v7.0] 업장 목록 — 업장관리 시트
  const shops = [];
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  if (shopSheet.getLastRow() >= 3) {
    const shopData = shopSheet.getRange(3, 1, shopSheet.getLastRow() - 2, 7).getValues();
    shopData.forEach(row => {
      if (row[1]) {
        shops.push({ 
          category: row[0], 
          name: row[1], 
          tag: row[2], 
          status: row[3],
          assignees: row[6] ? row[6].toString().split(',').map(s=>s.trim()).filter(Boolean) : []
        });
      }
    });
  }

  // [v7.0] 시즌 설정 — 시즌설정 시트
  const seasons = [];
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);
  const seasonData = seasonSheet.getRange("A5:D" + Math.max(seasonSheet.getLastRow(), 8)).getValues();
  seasonData.forEach(row => {
    if (row[0]) {
      seasons.push({
        name: row[0],
        start: row[1] instanceof Date ? Utilities.formatDate(row[1], tz, "yyyy-MM-dd") : row[1],
        end: row[2] instanceof Date ? Utilities.formatDate(row[2], tz, "yyyy-MM-dd") : row[2],
        multiplier: row[3]
      });
    }
  });

  // 사용자 목록
  const users = [];
  if (session.role === ROLES.ADMIN) {
    const result = getUserList(token);
    if (result.success) {
      result.users.forEach(u => users.push(u));
    }
  }

  // [v7.0] 기초데이터 시트에서 카테고리/단위 목록 조회
  const baseDataSheet = ss.getSheetByName(SHEET_BASE_DATA);
  const categories = baseDataSheet.getRange("C3:C50").getValues().flat().filter(v => v);
  const units = baseDataSheet.getRange("B3:B50").getValues().flat().filter(v => v);

  const finalData = { success: true, shops, seasons, users, categories, units, userRole: session.role };
  CacheManager.set(CACHE_KEY, finalData);
  return finalData;
}




// ═══════════════════════════════════════════════════════════════════
//  API: 업장 관리 (CRUD) — admin 전용
// ═══════════════════════════════════════════════════════════════════

function addShop(token, shopData) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  if (!shopData.category || !shopData.name || !shopData.tag) {
    return { success: false, message: "분류, 업장명, 태그는 필수입니다." };
  }

  // [v9.0] 태그 ID 유효성 검사: 영어 대문자 2~3자만 허용
  const tagPattern = /^[A-Z]{2,3}$/;
  if (!tagPattern.test(shopData.tag)) {
    return { success: false, message: "❌ 태그 ID는 영어 대문자 2~3자로만 입력해야 합니다. (예: TX, MB, AXC)" };
  }

  // [v10.0] LockService 도입: 업장 추가 동시 충돌 방지
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "⏳ 다른 사용자가 작업 중입니다. 잠시 후 다시 시도해주세요." };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shopSheet = ss.getSheetByName(SHEET_SHOPS);

    // [v9.0] 중복 체크 강화: 태그 + (분류+업장명) 복합 중복
    const lastRow = shopSheet.getLastRow();
    if (lastRow >= 3) {
      const existingData = shopSheet.getRange(3, 1, lastRow - 2, 3).getValues(); // [분류, 업장명, 태그]
      for (let i = 0; i < existingData.length; i++) {
        const row = existingData[i];
        if (!row[1]) continue; // 빈 행 스킵
        // 태그 중복 검사
        if (row[2] === shopData.tag) {
          return { success: false, message: `❌ 태그 '${shopData.tag}'는 이미 업장 '${row[1]}'에서 사용 중입니다.` };
        }
        // 업장명 중복 검사
        if (row[1] === shopData.name) {
          return { success: false, message: "❌ 이미 존재하는 업장명입니다." };
        }
        // (분류+업장명) 복합 중복 검사
        if (row[0] === shopData.category && row[1] === shopData.name) {
          return { success: false, message: `❌ '${shopData.category}' 분류에 '${shopData.name}' 업장이 이미 존재합니다.` };
        }
      }
    }

    const newRow = Math.max(lastRow + 1, 3);
    shopSheet.getRange(newRow, 1, 1, 4).setValues([[
      shopData.category, shopData.name, shopData.tag, "대기"
    ]]);

    shopSheet.getRange(newRow, 1, 1, 3).setBackground(COLORS.inputBg).setHorizontalAlignment("center");
    shopSheet.getRange(newRow, 4, 1, 3).setBackground(COLORS.autoBg).setHorizontalAlignment("center");
    shopSheet.getRange(newRow, 7).setBackground(COLORS.inputBg).setHorizontalAlignment("center");

    SpreadsheetApp.flush();
    generateNewShops();

    CacheManager.invalidateAll();
    return { success: true, message: `✅ 업장 '${shopData.name}' 추가 및 시트 생성 완료` };
  } finally {
    lock.releaseLock();
  }
}



function deleteShop(token, shopName) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  // [v10.0] LockService 도입: 업장 삭제 동시 충돌 방지
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: "⏳ 다른 사용자가 작업 중입니다. 잠시 후 다시 시도해주세요." };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shopSheet = ss.getSheetByName(SHEET_SHOPS);
    const lastRow = shopSheet.getLastRow();
    if (lastRow < 3) return { success: false, message: "업장이 없습니다." };

    const data = shopSheet.getRange(3, 1, lastRow - 2, 6).getValues();
    let targetRowIdx = -1;
    data.forEach((row, idx) => {
      if (row[1] === shopName) targetRowIdx = idx;
    });

    if (targetRowIdx === -1) return { success: false, message: "업장을 찾을 수 없습니다." };

    // [v9.0] 소프트 삭제: 시트를 숨김 처리하고 상태를 '삭제됨'으로 변경 (데이터 보존)
    const targetSheet = ss.getSheetByName(shopName);
    if (targetSheet) {
      try {
        targetSheet.hideSheet(); // 시트 숨김 (물리적 삭제 대신)
      } catch(e) {
        return { success: false, message: "시트 숨김 처리 실패: " + e.message };
      }
    }

    // 업장관리 시트에서 상태를 '삭제됨'으로 변경
    const rowNum = targetRowIdx + 3;
    shopSheet.getRange(rowNum, 4).setValue("삭제됨");
    shopSheet.getRange(rowNum, 1, 1, 3).setBackground("#f0f0f0").setFontColor("#999999"); // 시각적 비활성화
    shopSheet.getRange(rowNum, 4, 1, 3).setBackground("#f0f0f0").setFontColor("#999999");

    _refreshPermissionDropdown(ss);
    CacheManager.invalidateAll();
    return { success: true, message: `✅ 업장 '${shopName}' 비활성화 완료 (데이터 보존됨)` };
  } finally {
    lock.releaseLock();
  }
}




// ═══════════════════════════════════════════════════════════════════
//  API: 시즌 관리 (CRUD) — admin 전용
// ═══════════════════════════════════════════════════════════════════

function addSeason(token, seasonData) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  if (!seasonData.name || !seasonData.start || !seasonData.end || !seasonData.multiplier) {
    return { success: false, message: "시즌명, 시작일, 종료일, 배수는 필수입니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);

  // [v7.0] 데이터 시작 행: 5행
  const lastRow = Math.max(seasonSheet.getLastRow(), 5);
  const seasonCol = seasonSheet.getRange("A5:A" + (lastRow + 5)).getValues().flat();
  let emptyRow = -1;
  for (let i = 0; i < seasonCol.length; i++) {
    if (!seasonCol[i]) { emptyRow = i + 5; break; }
  }
  if (emptyRow === -1) emptyRow = lastRow + 1;

  seasonSheet.getRange(emptyRow, 1, 1, 4).setValues([[
    seasonData.name,
    new Date(seasonData.start),
    new Date(seasonData.end),
    Number(seasonData.multiplier)
  ]]);
  seasonSheet.getRange(emptyRow, 2, 1, 2).setNumberFormat("yyyy-mm-dd");
  seasonSheet.getRange(emptyRow, 1, 1, 4).setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  CacheManager.invalidateAll();
  return { success: true, message: `✅ 시즌 '${seasonData.name}' 추가 완료` };
}



function updateSeason(token, seasonName, updates) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);
  const lastRow = Math.max(seasonSheet.getLastRow(), 8);
  const seasonData = seasonSheet.getRange("A5:D" + lastRow).getValues();

  let targetRow = -1;
  seasonData.forEach((row, idx) => {
    if (row[0] === seasonName) targetRow = idx + 5;
  });
  if (targetRow === -1) return { success: false, message: "시즌을 찾을 수 없습니다." };

  if (updates.name) seasonSheet.getRange(targetRow, 1).setValue(updates.name);
  if (updates.start) { seasonSheet.getRange(targetRow, 2).setValue(new Date(updates.start)).setNumberFormat("yyyy-mm-dd"); }
  if (updates.end) { seasonSheet.getRange(targetRow, 3).setValue(new Date(updates.end)).setNumberFormat("yyyy-mm-dd"); }
  if (updates.multiplier) seasonSheet.getRange(targetRow, 4).setValue(Number(updates.multiplier));

  CacheManager.invalidateAll();
  return { success: true, message: `✅ 시즌 '${seasonName}' 수정 완료` };
}



function deleteSeason(token, seasonName) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);
  const lastRow = Math.max(seasonSheet.getLastRow(), 8);
  const seasonData = seasonSheet.getRange("A5:D" + lastRow).getValues();

  let targetRow = -1;
  seasonData.forEach((row, idx) => {
    if (row[0] === seasonName) targetRow = idx + 5;
  });
  if (targetRow === -1) return { success: false, message: "시즌을 찾을 수 없습니다." };

  seasonSheet.getRange(targetRow, 1, 1, 4).clearContent();
  CacheManager.invalidateAll();
  return { success: true, message: `✅ 시즌 '${seasonName}' 삭제 완료` };
}

