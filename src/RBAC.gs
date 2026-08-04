/**
 * 호텔덕구온천 재고 관리 시스템 v1.0.0 — RBAC 권한 관리 모듈
 * [MODIFIED] 이메일/Sheet Protection 기반 → 아이디/비밀번호 + 세션 토큰 인증
 */

// ═══════════════════════════════════════════════════════════════════
//  [NEW] 비밀번호 해싱 유틸리티
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


// ═══════════════════════════════════════════════════════════════════
//  [NEW] 사용자 데이터 I/O 헬퍼
// ═══════════════════════════════════════════════════════════════════

/** 설정 시트에서 사용자 목록 읽기 (내부 전용) */
function _getAllUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = Math.max(cfg.getLastRow(), 4);
  const data = cfg.getRange(4, USER_COLS.USERNAME, lastRow - 3, 5).getValues(); // I~M열

  const users = [];
  data.forEach((row, idx) => {
    if (row[0]) { // username이 있는 행만
      users.push({
        row: idx + 4, // 실제 시트 행 번호
        username: row[0].toString().trim(),
        passHash: row[1].toString().trim(),
        name: row[2].toString().trim(),
        dept: row[3].toString().trim(),
        role: row[4].toString().trim()
      });
    }
  });
  return users;
}

/** username으로 사용자 찾기 */
function _findUser(username) {
  const users = _getAllUsers();
  return users.find(u => u.username === username.trim()) || null;
}


// ═══════════════════════════════════════════════════════════════════
//  [NEW] 인증 (로그인 / 로그아웃 / 세션)
// ═══════════════════════════════════════════════════════════════════

/**
 * 사용자 인증 (로그인)
 * @param {string} username 다우오피스 회사 이메일 (예: yw_bae@dukgu.com)
 * @param {string} password 평문 비밀번호
 * @returns {{ success: boolean, token?: string, user?: object, message: string }}
 */
function authenticateUser(username, password) {
  if (!username || !password) {
    return { success: false, message: "아이디와 비밀번호를 입력해 주세요." };
  }

  const user = _findUser(username);
  if (!user) {
    return { success: false, message: "등록되지 않은 계정입니다." };
  }

  if (!_verifyPassword(password, user.passHash)) {
    return { success: false, message: "비밀번호가 일치하지 않습니다." };
  }

  // 세션 토큰 생성 및 저장
  const token = Utilities.getUuid();
  const sessionData = JSON.stringify({
    username: user.username,
    name: user.name,
    dept: user.dept,
    role: user.role,
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

/**
 * 세션 토큰 검증
 * @param {string} token
 * @returns {object|null} 유효하면 사용자 정보, 아니면 null
 */
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

/**
 * 세션 토큰이 유효한 admin인지 확인
 * @param {string} token
 * @returns {object|null}
 */
function _requireAdmin(token) {
  const session = validateSession(token);
  if (!session) return null;
  if (session.role !== ROLES.ADMIN) return null;
  return session;
}

/**
 * 로그아웃
 * @param {string} token
 */
function logoutUser(token) {
  if (token) {
    CacheService.getScriptCache().remove(SESSION_PREFIX + token);
  }
  return { success: true, message: "로그아웃 되었습니다." };
}


// ═══════════════════════════════════════════════════════════════════
//  [NEW] 사용자 계정 관리 (CRUD) — admin 전용
// ═══════════════════════════════════════════════════════════════════

/**
 * 새 사용자 계정 생성
 * @param {string} adminToken admin 세션 토큰
 * @param {object} userData { username, name, dept, password, role }
 */
function createUserAccount(adminToken, userData) {
  if (!_requireAdmin(adminToken)) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  if (!userData.username || !userData.password || !userData.name || !userData.role) {
    return { success: false, message: "아이디, 비밀번호, 성함, 역할은 필수입니다." };
  }
  if (![ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF].includes(userData.role)) {
    return { success: false, message: "유효하지 않은 역할입니다. (admin/manager/staff)" };
  }

  // 중복 체크
  if (_findUser(userData.username)) {
    return { success: false, message: "이미 존재하는 아이디입니다." };
  }

  const hashResult = _hashPassword(userData.password);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = cfg.getLastRow();
  const newRow = Math.max(lastRow + 1, 4);

  cfg.getRange(newRow, USER_COLS.USERNAME, 1, 5).setValues([[
    userData.username.trim(),
    hashResult.stored,
    userData.name.trim(),
    (userData.dept || "").trim(),
    userData.role
  ]]);
  cfg.getRange(newRow, USER_COLS.USERNAME, 1, 5).setBackground(COLORS.inputBg).setHorizontalAlignment("center");
  cfg.getRange(newRow, USER_COLS.PASSHASH).setFontSize(7).setFontColor("#999999");

  return { success: true, message: `✅ 계정 '${userData.username}' 생성 완료` };
}

/**
 * 사용자 정보 수정 (비밀번호 제외)
 */
function updateUserAccount(adminToken, username, updates) {
  if (!_requireAdmin(adminToken)) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  const user = _findUser(username);
  if (!user) return { success: false, message: "사용자를 찾을 수 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);

  if (updates.name) cfg.getRange(user.row, USER_COLS.NAME).setValue(updates.name.trim());
  if (updates.dept) cfg.getRange(user.row, USER_COLS.DEPT).setValue(updates.dept.trim());
  if (updates.role && [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF].includes(updates.role)) {
    cfg.getRange(user.row, USER_COLS.ROLE).setValue(updates.role);
  }

  return { success: true, message: `✅ '${username}' 정보 수정 완료` };
}

/**
 * 사용자 삭제
 */
function deleteUserAccount(adminToken, username) {
  if (!_requireAdmin(adminToken)) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  if (username === DEFAULT_ADMIN.username) {
    return { success: false, message: "기본 관리자 계정은 삭제할 수 없습니다." };
  }
  const user = _findUser(username);
  if (!user) return { success: false, message: "사용자를 찾을 수 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  cfg.getRange(user.row, USER_COLS.USERNAME, 1, 5).clearContent();

  return { success: true, message: `✅ '${username}' 계정 삭제 완료` };
}

/**
 * 비밀번호 초기화 (admin이 직원 비밀번호 재설정)
 */
function resetUserPassword(adminToken, username, newPassword) {
  if (!_requireAdmin(adminToken)) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  if (!newPassword || newPassword.length < 4) {
    return { success: false, message: "비밀번호는 4자 이상이어야 합니다." };
  }
  const user = _findUser(username);
  if (!user) return { success: false, message: "사용자를 찾을 수 없습니다." };

  const hashResult = _hashPassword(newPassword);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  cfg.getRange(user.row, USER_COLS.PASSHASH).setValue(hashResult.stored);

  return { success: true, message: `✅ '${username}' 비밀번호 초기화 완료` };
}

/**
 * 본인 비밀번호 변경
 */
function changeMyPassword(token, oldPassword, newPassword) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "세션이 만료되었습니다. 다시 로그인하세요." };
  if (!newPassword || newPassword.length < 4) {
    return { success: false, message: "새 비밀번호는 4자 이상이어야 합니다." };
  }

  const user = _findUser(session.username);
  if (!user) return { success: false, message: "사용자를 찾을 수 없습니다." };
  if (!_verifyPassword(oldPassword, user.passHash)) {
    return { success: false, message: "현재 비밀번호가 일치하지 않습니다." };
  }

  const hashResult = _hashPassword(newPassword);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  cfg.getRange(user.row, USER_COLS.PASSHASH).setValue(hashResult.stored);

  return { success: true, message: "✅ 비밀번호가 변경되었습니다." };
}

/**
 * 전체 사용자 목록 조회 (비밀번호 해시 제외)
 */
function getUserList(adminToken) {
  if (!_requireAdmin(adminToken)) {
    return { success: false, message: "관리자 권한이 필요합니다.", users: [] };
  }
  const users = _getAllUsers().map(u => ({
    username: u.username,
    name: u.name,
    dept: u.dept,
    role: u.role
  }));
  return { success: true, users: users };
}


// ═══════════════════════════════════════════════════════════════════
//  [LEGACY] 하위 호환 — Sheet Protection 기반 (Sheet 직접 사용자용)
// ═══════════════════════════════════════════════════════════════════

/** [DEPRECATED] Z열 동적 드롭다운 — 웹앱에서는 불필요하나 Sheet 호환 유지 */
function _refreshPermissionDropdown(ss) {
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  const lastRow = cfg.getLastRow();
  const shopList = ["admin"];
  
  if (lastRow >= 4) {
    const configData = cfg.getRange(4, 2, lastRow - 3, 6).getValues();
    configData.forEach(row => {
      if (row[1] && row[3] === "생성완료") {
        shopList.push(row[1]);
      }
    });
  }

  cfg.getRange("Z4:Z").clearContent();
  if (shopList.length > 0) {
    cfg.getRange(4, 26, shopList.length, 1).setValues(shopList.map(s => [s]));
  }
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
        
        targetSheet.getRange(3, 4, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["입고", "출고", "폐기"]).setAllowInvalid(false).build());
        targetSheet.getRange(3, 5, VALIDATION_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build());

        // [MODIFIED] Sheet Protection — 하위 호환으로 유지하되, 웹앱 인증이 주 접근제어
        const protection = targetSheet.protect().setDescription(`${shopName} 권한`);

        // 노란색 구역 개방
        protection.setUnprotectedRanges([
          targetSheet.getRange(3, 1, VALIDATION_ROWS, 2),
          targetSheet.getRange(3, 4, VALIDATION_ROWS, 1),
          targetSheet.getRange(3, 5, VALIDATION_ROWS, 1),
          targetSheet.getRange(3, 6, VALIDATION_ROWS, 2)
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
  _refreshPermissionDropdown(ss);
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

/** [DEPRECATED] 이메일 기반 Sheet Protection 동기화 — 레거시 호환용 */
function syncPermissions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _refreshPermissionDropdown(ss);
  _protectSystemSheets(ss);
  SpreadsheetApp.getUi().alert("✅ 권한 동기화가 완료되었습니다. (웹앱 인증은 별도 관리됩니다)");
}

function _protectSystemSheets(ss) {
  const SYSTEM_SHEETS = [SHEET_CONFIG, SHEET_MASTER, SHEET_INOUT, SHEET_DASHBOARD, SHEET_TEMPLATE];
  
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
