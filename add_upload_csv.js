const fs = require('fs');
let lines = fs.readFileSync('src/WebApp.gs', 'utf8').split('\n');

const uploadCsvLogic = `
function uploadItemMasterCSV(token, dataRows) {
  const session = validateSession(token);
  if (!session || session.role === 'staff') return { success: false, message: "권한이 없습니다." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  
  // 기존 코드 가져오기 (O(1) 조회를 위해 Set 사용)
  const existingCodes = new Set();
  if (masterLastRow >= 3) {
    const codeValues = masterSheet.getRange(3, 1, masterLastRow - 2, 1).getValues();
    codeValues.forEach(row => { if (row[0]) existingCodes.add(row[0].toString()); });
  }
  
  const newRows = [];
  let ignoredCount = 0;
  
  // CSV 데이터(dataRows) 포맷: [품목코드, 품목명, 카테고리, ABC등급, 단위, ... ]
  // 최소 품목코드(0)와 품목명(1)이 있어야 함
  dataRows.forEach(row => {
    if (!row || row.length < 2) return;
    const code = row[0].toString().trim();
    if (!code) return;
    
    if (existingCodes.has(code)) {
      ignoredCount++;
    } else {
      // 신규 등록 데이터 구성 (최소 20열 구조)
      const newRow = new Array(20).fill("");
      newRow[0] = code; // 품목코드
      newRow[1] = row[1] || ""; // 품목명
      newRow[2] = row[2] || ""; // 카테고리
      newRow[3] = row[3] || "C"; // ABC 등급
      newRow[4] = row[4] || ""; // 단위
      newRow[6] = Number(row[5]) || 0; // 초기재고 (CSV 6번째 열에 있다고 가정, 없으면 0)
      newRow[11] = Number(row[6]) || 3; // 리드타임
      newRow[13] = Number(row[7]) || 5; // 안전재고일수
      newRow[14] = Number(row[8]) || 30; // 목표유지일수
      newRow[18] = row[9] || "과세"; // 과세구분
      newRow[19] = Number(row[10]) || 0; // 매입단가
      
      newRows.push(newRow);
      existingCodes.add(code); // 같은 CSV 내 중복 방지
    }
  });
  
  if (newRows.length > 0) {
    masterSheet.getRange(masterLastRow + 1, 1, newRows.length, 20).setValues(newRows);
    SpreadsheetApp.flush();
    recalcStockAndUsage(ss); // 재고 다시 계산
  }
  
  return { 
    success: true, 
    message: "CSV 업로드 완료: " + newRows.length + "건 신규 등록, " + ignoredCount + "건 무시(중복)"
  };
}
`;

// Find where to insert (after addNewItem finishes)
let insertIdx = -1;
for (let i = 136; i < lines.length; i++) {
  if (lines[i].startsWith('function updateItem(') || lines[i].startsWith('function deleteItem(')) {
    insertIdx = i;
    break;
  }
}

if (insertIdx !== -1) {
  lines.splice(insertIdx, 0, uploadCsvLogic);
  fs.writeFileSync('src/WebApp.gs', lines.join('\n'));
  console.log('Inserted uploadItemMasterCSV successfully.');
} else {
  console.log('Could not find insert index.');
}
