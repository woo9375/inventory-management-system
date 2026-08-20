const fs = require('fs');
let masterStr = fs.readFileSync('src/JS_Master.html', 'utf8');

const csvLogic = `
function openCsvUploadModal() {
  var body = '<div class="form-grid">' +
    '<div class="form-group" style="grid-column: span 2;">' +
    '<label>CSV 파일 선택</label>' +
    '<input type="file" id="csvFileInput" accept=".csv" class="form-control" style="padding: 10px; border: 1px dashed var(--border); width: 100%; border-radius: var(--radius-sm);">' +
    '<p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 5px;">* 품목코드, 품목명, 카테고리, 단위 순서 권장. (기존 품목코드 존재 시 무시됨)</p>' +
    '</div></div>';
  var footer = '<button class="btn btn-outline" onclick="closeModal()">취소</button><button class="btn btn-gold" onclick="processCsvUpload()">업로드</button>';
  openModal('📤 품목 마스터 CSV 대량 업로드', body, footer);
}

function processCsvUpload() {
  var fileInput = document.getElementById('csvFileInput');
  if (!fileInput.files || fileInput.files.length === 0) {
    return showToast('CSV 파일을 선택해주세요.', 'warning');
  }
  
  var file = fileInput.files[0];
  var reader = new FileReader();
  
  reader.onload = function(e) {
    var text = e.target.result;
    var lines = text.split('\\n');
    var dataRows = [];
    
    // 단순 파싱 (큰따옴표 무시, 쉼표 기준 분리) - 실제 환경에서는 CSV 파서 필요할 수 있음
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      // 첫 행(헤더) 무시 방지 조건이 필요하다면 여기에 추가 (예: i===0 이면 continue 등)
      // 여기서는 백엔드에서 1차적으로 검증한다고 가정
      var cols = line.split(',');
      if (cols.length >= 2) {
        dataRows.push(cols.map(function(c) { return c.replace(/^"|"$/g, '').trim(); }));
      }
    }
    
    if (dataRows.length === 0) {
      return showToast('유효한 데이터가 없습니다.', 'error');
    }
    
    showLoading();
    google.script.run
      .withSuccessHandler(function(res) {
        hideLoading();
        if (res.success) {
          showToast(res.message, 'success');
          closeModal();
          loadItemMaster();
        } else {
          showToast(res.message, 'error');
        }
      })
      .withFailureHandler(function(err) {
        hideLoading();
        showToast('업로드 중 오류 발생: ' + err.message, 'error');
      })
      .uploadItemMasterCSV(getToken(), dataRows);
  };
  
  reader.onerror = function() {
    showToast('파일을 읽는 중 오류가 발생했습니다.', 'error');
  };
  
  reader.readAsText(file, 'UTF-8'); // 만약 한글 깨짐 시 'EUC-KR' 고려
}
</script>`;

masterStr = masterStr.replace('</script>', csvLogic);
fs.writeFileSync('src/JS_Master.html', masterStr);
console.log('CSV logic appended to JS_Master.html');
