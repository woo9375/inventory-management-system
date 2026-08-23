/**
 * 호텔덕구온천 재고 관리 시스템 v7.0 — RBAC 권한 관리 모듈
 * [v7.0] 시트 참조: SHEET_CONFIG → SHEET_USERS / SHEET_SHOPS 개별 시트
 */

// ═══════════════════════════════════════════════════════════════════
//  비밀번호 해싱 유틸리티
// ═══════════════════════════════════════════════════════════════════

/** SHA-256 + salt 해싱 */
function _hashPassword(password, salt) {
  if (!salt) salt = Utilities.getUuid().substring(0, 16);
  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + password
  );
  const hashHex = rawHash
    .map(b => ("0" + ((b < 0 ? b + 256 : b)).toString(16)).slice(-2))
    .join("");
  return { salt: salt, hash: hashHex, stored: salt + ":" + hashHex };
}

/** 저장된 해시와 입력 비밀번호 비교 */
function _verifyPassword(password, storedHash) {
  if (!storedHash || storedHash.indexOf(":") === -1) return false;
  const parts = storedHash.split(":");
  const salt = parts[0];
  const expected = parts[1];
  const result = _hashPassword(password, salt);
  return result.hash === expected;
}

function _normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function _getInitialAdminConfiguration() {
  const properties = PropertiesService.getScriptProperties();
  const username = _normalizeUsername(properties.getProperty(INITIAL_ADMIN_PROPERTY_KEYS.USERNAME));
  const password = properties.getProperty(INITIAL_ADMIN_PROPERTY_KEYS.PASSWORD) || "";
  const name = String(properties.getProperty(INITIAL_ADMIN_PROPERTY_KEYS.NAME) || "").trim();
  const dept = String(properties.getProperty(INITIAL_ADMIN_PROPERTY_KEYS.DEPT) || "").trim();

  if (!username || !password || !name || !dept) {
    throw new Error("Script Properties에 INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_PASSWORD, INITIAL_ADMIN_NAME, INITIAL_ADMIN_DEPT를 모두 설정한 뒤 다시 실행하세요.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`INITIAL_ADMIN_PASSWORD는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
  }
  return { username, password, name, dept };
}

function _getActiveShopNames() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SHOPS);
  if (!sheet || sheet.getLastRow() < 3) return [];
  return sheet.getRange(3, 1, sheet.getLastRow() - 2, 4).getValues()
    .filter(row => row[1] && row[3] === "생성완료")
    .map(row => String(row[1]).trim());
}

function _canAccessShop(session, shopName) {
  if (!session || !shopName) return false;
  if (session.role === ROLES.ADMIN || session.role === ROLES.MANAGER) return _getActiveShopNames().includes(shopName);
  return (session.assignedShops || []).includes(shopName) && _getActiveShopNames().includes(shopName);
}


// ═══════════════════════════════════════════════════════════════════
//  사용자 데이터 I/O 헬퍼
// ═══════════════════════════════════════════════════════════════════

/** [v7.0] 사용자관리 시트에서 사용자 목록 읽기 (내부 전용) */
function _getAllUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_USERS);
  const lastRow = Math.max(userSheet.getLastRow(), 3);
  const data = userSheet.getRange(3, USER_COLS.USERNAME, lastRow - 2, 6).getValues(); // A~F열

  const users = [];
  data.forEach((row, idx) => {
    if (row[0]) { // username이 있는 행만
      users.push({
        row: idx + 3, // [v7.0] 헤더가 2행이므로 데이터는 3행부터
        username: _normalizeUsername(row[0]),
        passHash: row[1].toString().trim(),
        name: row[2].toString().trim(),
        dept: row[3].toString().trim(),
        role: row[4].toString().trim(),
        assignedShops: row[5] ? row[5].toString().split(',').map(s => s.trim()).filter(Boolean) : []
      });
    }
  });
  return users;
}

/** username으로 사용자 찾기 */
function _findUser(username) {
  const users = _getAllUsers();
  return users.find(u => u.username === _normalizeUsername(username)) || null;
}


// ═══════════════════════════════════════════════════════════════════
//  인증 (로그인 / 로그아웃 / 세션)
// ═══════════════════════════════════════════════════════════════════

function authenticateUser(username, password) {
  const normalizedUsername = _normalizeUsername(username);
  if (!normalizedUsername || !password) {
    return { success: false, message: "아이디와 비밀번호를 입력해 주세요." };
  }

  const cache = CacheService.getScriptCache();
  const attemptKey = LOGIN_ATTEMPT_PREFIX + _hashPassword(normalizedUsername, "login").hash;
  const attempts = Number(cache.get(attemptKey) || 0);
  if (attempts >= LOGIN_MAX_ATTEMPTS) {
    return { success: false, message: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요." };
  }

  const user = _findUser(normalizedUsername);
  if (!user) {
    cache.put(attemptKey, String(attempts + 1), LOGIN_ATTEMPT_WINDOW_SECONDS);
    return { success: false, message: "아이디 또는 비밀번호가 일치하지 않습니다." };
  }

  if (!_verifyPassword(password, user.passHash)) {
    cache.put(attemptKey, String(attempts + 1), LOGIN_ATTEMPT_WINDOW_SECONDS);
    return { success: false, message: "아이디 또는 비밀번호가 일치하지 않습니다." };
  }

  cache.remove(attemptKey);

  const token = Utilities.getUuid();

  const sessionData = JSON.stringify({
    username: user.username,
    name: user.name,
    dept: user.dept,
    role: user.role,
    assignedShops: user.assignedShops || [], // [v7.0] 여러 업장 지원
    loginTime: new Date().toISOString()
  });

  CacheService.getScriptCache().put(
    SESSION_PREFIX + token,
    sessionData,
    SESSION_TIMEOUT_SECONDS
  );

  return {
    success: true,
    token: token,
    user: {
      username: user.username,
      name: user.name,
      dept: user.dept,
      role: user.role
    },
    message: `${user.name}님 환영합니다.`
  };
}

function validateSession(token) {
  if (!token) return null;
  const cached = CacheService.getScriptCache().get(SESSION_PREFIX + token);
  if (!cached) return null;

  try {
    return JSON.parse(cached);
  } catch (e) {
    return null;
  }
}

function _requireAdmin(token) {
  const session = validateSession(token);
  if (!session) return null;
  if (session.role !== ROLES.ADMIN) return null;
  return session;
}

function logoutUser(token) {
  if (token) {
    CacheService.getScriptCache().remove(SESSION_PREFIX + token);
  }
  return { success: true, message: "로그아웃 되었습니다." };
}


// ═══════════════════════════════════════════════════════════════════
//  사용자 계정 관리 (CRUD) — admin 전용
// ═══════════════════════════════════════════════════════════════════

function createUserAccount(adminToken, userData) {
  if (!_requireAdmin(adminToken)) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  if (!userData || !userData.username || !userData.password || !userData.name || !userData.role) {
    return { success: false, message: "아이디, 비밀번호, 성함, 역할은 필수입니다." };
  }
  if (![ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF].includes(userData.role)) {
    return { success: false, message: "유효하지 않은 역할입니다. (admin/manager/staff)" };
  }
  if (String(userData.password).length < MIN_PASSWORD_LENGTH) {
    return { success: false, message: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` };
  }

  if (_findUser(userData.username)) {
    return { success: false, message: "이미 존재하는 아이디입니다." };
  }

  const hashResult = _hashPassword(userData.password);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_USERS);
  const lastRow = userSheet.getLastRow();
  const newRow = Math.max(lastRow + 1, 3);

  userSheet.getRange(newRow, USER_COLS.USERNAME, 1, 5).setValues([[
    _normalizeUsername(userData.username),
    hashResult.stored,
    userData.name.trim(),
    (userData.dept || "").trim(),
    userData.role
  ]]);
  userSheet.getRange(newRow, USER_COLS.USERNAME, 1, 5).setBackground(COLORS.inputBg).setHorizontalAlignment("center");
  userSheet.getRange(newRow, USER_COLS.PASSHASH).setFontSize(7).setFontColor("#999999");

  return { success: true, message: `✅ 계정 '${userData.username}' 생성 완료` };
}

function updateUserAccount(adminToken, username, updates) {
  if (!_requireAdmin(adminToken)) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  const user = _findUser(username);
  if (!user) return { success: false, message: "사용자를 찾을 수 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_USERS);

  if (updates.name) userSheet.getRange(user.row, USER_COLS.NAME).setValue(updates.name.trim());
  if (updates.dept) userSheet.getRange(user.row, USER_COLS.DEPT).setValue(updates.dept.trim());
  if (updates.role && [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF].includes(updates.role)) {
    userSheet.getRange(user.row, USER_COLS.ROLE).setValue(updates.role);
  }
  if (updates.assignedShops !== undefined) {
    userSheet.getRange(user.row, USER_COLS.SHOPS).setValue(
      Array.isArray(updates.assignedShops) ? updates.assignedShops.join(', ') : updates.assignedShops
    );
  }

  SpreadsheetApp.flush();
  CacheManager.invalidateAll(); // 변경사항 즉시 반영
  
  return { success: true, message: `✅ '${username}' 정보 수정 완료` };
}

function deleteUserAccount(adminToken, username) {
  if (!_requireAdmin(adminToken)) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  const user = _findUser(username);
  if (!user) return { success: false, message: "사용자를 찾을 수 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_USERS);
  userSheet.getRange(user.row, USER_COLS.USERNAME, 1, 6).clearContent();
  CacheManager.invalidateAll();

  return { success: true, message: `✅ '${username}' 계정 삭제 완료` };
}

function resetUserPassword(adminToken, username, newPassword) {
  if (!_requireAdmin(adminToken)) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return { success: false, message: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` };
  }
  const user = _findUser(username);
  if (!user) return { success: false, message: "사용자를 찾을 수 없습니다." };

  const hashResult = _hashPassword(newPassword);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_USERS);
  userSheet.getRange(user.row, USER_COLS.PASSHASH).setValue(hashResult.stored);

  return { success: true, message: `✅ '${username}' 비밀번호 초기화 완료` };
}

function changeMyPassword(token, oldPassword, newPassword) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "세션이 만료되었습니다. 다시 로그인하세요." };
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return { success: false, message: `새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` };
  }

  const user = _findUser(session.username);
  if (!user) return { success: false, message: "사용자를 찾을 수 없습니다." };
  if (!_verifyPassword(oldPassword, user.passHash)) {
    return { success: false, message: "현재 비밀번호가 일치하지 않습니다." };
  }

  const hashResult = _hashPassword(newPassword);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEET_USERS);
  userSheet.getRange(user.row, USER_COLS.PASSHASH).setValue(hashResult.stored);

  return { success: true, message: "✅ 비밀번호가 변경되었습니다." };
}

function getUserList(adminToken) {
  if (!_requireAdmin(adminToken)) {
    return { success: false, message: "관리자 권한이 필요합니다.", users: [] };
  }
  const users = _getAllUsers().map(u => ({
    username: u.username,
    name: u.name,
    dept: u.dept,
    role: u.role,
    assignedShops: u.assignedShops
  }));
  return { success: true, users: users };
}


// ═══════════════════════════════════════════════════════════════════
//  Sheet Protection 기반 유틸리티
// ═══════════════════════════════════════════════════════════════════

/** [v7.0] 업장관리 시트에서 권한 드롭다운 갱신 */
function _refreshPermissionDropdown(ss) {
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  if (!shopSheet) return;
  // 권한 드롭다운은 레거시 호환용으로 유지하되, 별도 Z열은 사용하지 않음
  // 웹앱 인증이 주 접근제어
}

function generateNewShops() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  const template = ss.getSheetByName(SHEET_TEMPLATE);
  
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const codeListRange = masterSheet.getRange(3, 1, Math.max(masterSheet.getLastRow() - 2, 1), 1);
  
  const lastRow = shopSheet.getLastRow();
  if (lastRow < 3) return SpreadsheetApp.getUi().alert("설정할 업장 명단이 없습니다.");

  const configData = shopSheet.getRange(3, 1, lastRow - 2, 6).getValues();
  let createdCount = 0;

  configData.forEach((row, index) => {
    const [, shopName, tag, status, , ] = row;
    const currentRowNum = index + 3;

    if (shopName && status === "대기") {
      let targetSheet = ss.getSheetByName(shopName);
      if (!targetSheet) {
        targetSheet = template.copyTo(ss).setName(shopName);
        targetSheet.getRange("A1").setValue(`✏️ [${shopName} 입력창]  품목코드: 직접 입력  |  거래ID: 날짜+코드 입력 시 자동 생성 (형식: ${tag}-YYYYMMDD-UUID8)`);
        
        targetSheet.getRange(3, 2, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(codeListRange).setAllowInvalid(false).build());
        
        targetSheet.getRange(3, 4, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["입고", "출고", "폐기"]).setAllowInvalid(false).build());
        targetSheet.getRange(3, 5, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build());

        const protection = targetSheet.protect().setDescription(`${shopName} 권한`);

        // [v7.0] 9열 구조: 보호 범위 업데이트
        protection.setUnprotectedRanges([
          targetSheet.getRange(3, 1, VALIDATION_ROWS, 2),  // A~B (날짜, 품목코드)
          targetSheet.getRange(3, 4, VALIDATION_ROWS, 2),  // D~E (구분, 수량)
          targetSheet.getRange(3, 7, VALIDATION_ROWS, 2)   // G~H (담당자, 비고)
        ]);
      }

      shopSheet.getRange(currentRowNum, 4).setValue("생성완료");
      const sheetId = targetSheet.getSheetId();
      shopSheet.getRange(currentRowNum, 5).setFormula(`=HYPERLINK("#gid=${sheetId}", "🔗 ${shopName}")`);
      shopSheet.getRange(currentRowNum, 6).setValue(sheetId); 
      createdCount++;
    }
  });

  SpreadsheetApp.flush();
  _refreshPermissionDropdown(ss);
  try {
    SpreadsheetApp.getUi().alert(createdCount > 0 ? `🎉 총 ${createdCount}개 업장 시트 생성 완료.` : "대기 중인 업장이 없습니다.");
  } catch (e) {
    // WebApp 등 UI가 없는 환경에서는 에러 무시
  }
}

function removeItemCodeValidation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  if (shopSheet.getLastRow() < 3) return;
  const configRows = shopSheet.getRange(3, 1, shopSheet.getLastRow() - 2, 6).getValues();
  let count = 0;

  configRows.forEach(row => {
    if (row[3] === "생성완료" && row[1]) {
      const sh = ss.getSheetByName(row[1]);
      if (sh) {
        sh.getRange(3, 2, VALIDATION_ROWS, 1).clearDataValidations();
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
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  if (shopSheet.getLastRow() < 3) return;
  const configRows = shopSheet.getRange(3, 1, shopSheet.getLastRow() - 2, 6).getValues();
  let count = 0;

  configRows.forEach(row => {
    if (row[3] === "생성완료" && row[1]) {
      const sh = ss.getSheetByName(row[1]);
      if (sh) {
        const protection = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
        if (protection) {
          // [v7.0] 9열 구조
          protection.setUnprotectedRanges([
            sh.getRange(3, 1, VALIDATION_ROWS, 2),  // A~B
            sh.getRange(3, 4, VALIDATION_ROWS, 2),  // D~E
            sh.getRange(3, 7, VALIDATION_ROWS, 2)   // G~H
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
  const shopSheet = ss.getSheetByName(SHEET_SHOPS);
  const lastRow = shopSheet.getLastRow();
  if (lastRow < 3) return;

  const data = shopSheet.getRange(3, 1, lastRow - 2, 6).getValues();
  let missingCount = 0;

  data.forEach((row, idx) => {
    const status = row[3];
    const gid = row[5];
    const rowNum = idx + 3;

    if (status === "생성완료" && gid !== "") {
      const target = ss.getSheets().find(s => s.getSheetId() == gid);
      if (!target) {
        shopSheet.getRange(rowNum, 4).setValue("대기");
        shopSheet.getRange(rowNum, 5).setValue("삭제됨");
        shopSheet.getRange(rowNum, 6).clearContent();
        missingCount++;
      }
    }
  });

  _refreshPermissionDropdown(ss);
  SpreadsheetApp.getUi().alert(missingCount > 0 ? `⚠️ ${missingCount}개의 삭제된 시트가 '대기' 상태로 초기화되었습니다.` : "✅ 모든 시트가 정상 존재합니다.");
}

function syncPermissions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _refreshPermissionDropdown(ss);
  _protectSystemSheets(ss);
  SpreadsheetApp.getUi().alert("✅ 권한 동기화가 완료되었습니다. (웹앱 인증은 별도 관리됩니다)");
}

function _protectSystemSheets(ss) {
  // [v7.0] 보호 대상 시트 목록 업데이트
  const SYSTEM_SHEETS = [SHEET_MASTER, SHEET_INOUT, SHEET_DASHBOARD, SHEET_TEMPLATE, SHEET_SHOPS, SHEET_SEASONS, SHEET_USERS, SHEET_BASE_DATA, SHEET_CHANGELOG];
  
  SYSTEM_SHEETS.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      let protection = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
      if (!protection) {
        protection = sheet.protect().setDescription(`${sheetName} 시스템 보호`);
        protection.setWarningOnly(true);
      }
    }
  });
}

function validateSeasonSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);
  const lastRow = Math.max(seasonSheet.getLastRow(), 5);
  // [v7.0] 시즌 데이터는 A5:D 부터 (헤더가 4행)
  const data = seasonSheet.getRange("A5:D" + lastRow).getValues();
  
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
