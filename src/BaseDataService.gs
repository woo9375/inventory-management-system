


// ═══════════════════════════════════════════════════════════════════
//  [v7.0] API: 기초데이터 관리 (CRUD) — admin 전용
// ═══════════════════════════════════════════════════════════════════

function getBaseData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, message: "인증이 필요합니다." };

  const CACHE_KEY = `BASE_DATA_${session.role}`;
  let cached = CacheManager.get(CACHE_KEY);
  if (cached) return cached;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  const lastRow = Math.max(baseSheet.getLastRow(), 3);

  const mainCategories = baseSheet.getRange("A3:A" + lastRow).getValues().flat().filter(v => v);
  const units = baseSheet.getRange("B3:B" + lastRow).getValues().flat().filter(v => v);
  const itemCategories = baseSheet.getRange("C3:C" + lastRow).getValues().flat().filter(v => v);

  const result = { success: true, mainCategories, units, itemCategories, userRole: session.role };
  CacheManager.set(CACHE_KEY, result);
  return result;
}



function addBaseDataItem(token, type, value) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }
  if (!value || !value.trim()) return { success: false, message: "값을 입력해주세요." };

  const colMap = { mainCategory: 1, unit: 2, itemCategory: 3 };
  const col = colMap[type];
  if (!col) return { success: false, message: "잘못된 타입입니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  const lastRow = Math.max(baseSheet.getLastRow(), 3);

  // 기존 데이터 읽기
  const existing = baseSheet.getRange(3, col, lastRow - 2, 1).getValues().flat().filter(v => v);
  if (existing.includes(value.trim())) {
    return { success: false, message: "이미 존재하는 항목입니다." };
  }

  // 빈 행 찾기
  const colData = baseSheet.getRange(3, col, lastRow + 5 - 2, 1).getValues().flat();
  let emptyRow = -1;
  for (let i = 0; i < colData.length; i++) {
    if (!colData[i]) { emptyRow = i + 3; break; }
  }
  if (emptyRow === -1) emptyRow = lastRow + 1;

  baseSheet.getRange(emptyRow, col).setValue(value.trim())
    .setBackground(COLORS.inputBg).setHorizontalAlignment("center");

  CacheManager.invalidateAll();
  return { success: true, message: `✅ '${value.trim()}' 추가 완료` };
}



function deleteBaseDataItem(token, type, value) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, message: "관리자 권한이 필요합니다." };
  }

  const colMap = { mainCategory: 1, unit: 2, itemCategory: 3 };
  const col = colMap[type];
  if (!col) return { success: false, message: "잘못된 타입입니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseSheet = ss.getSheetByName(SHEET_BASE_DATA);
  const lastRow = Math.max(baseSheet.getLastRow(), 3);

  const data = baseSheet.getRange(3, col, lastRow - 2, 1).getValues();
  let targetRow = -1;
  data.forEach((row, idx) => {
    if (String(row[0]).trim() === String(value).trim()) targetRow = idx + 3;
  });

  if (targetRow === -1) return { success: false, message: "항목을 찾을 수 없습니다." };

  baseSheet.getRange(targetRow, col).clearContent();

  // 빈 행 정리: 데이터를 위로 당기기
  const remaining = data.map(r => r[0]).filter(v => v && String(v).trim() !== String(value).trim());
  baseSheet.getRange(3, col, data.length, 1).clearContent();
  if (remaining.length > 0) {
    baseSheet.getRange(3, col, remaining.length, 1).setValues(remaining.map(v => [v]))
      .setBackground(COLORS.inputBg).setHorizontalAlignment("center");
  }

  CacheManager.invalidateAll();
  return { success: true, message: `✅ '${value}' 삭제 완료` };
}

