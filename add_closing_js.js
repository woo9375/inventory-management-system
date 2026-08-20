const fs = require('fs');
let str = fs.readFileSync('src/JS_Config.html', 'utf8');

const closingLogic = `
// ═══════════════════════════════════════════════════════════════
//  [NEW] 수동 월마감 기능
// ═══════════════════════════════════════════════════════════════
function openMonthlyClosingModal() {
  if (currentUser && currentUser.role !== 'admin') {
    return showToast('최고 관리자만 실행할 수 있습니다.', 'error');
  }

  var d = new Date();
  var currYear = d.getFullYear();
  var currMonth = d.getMonth() + 1;
  
  var yrOptions = '';
  for(var y = currYear - 1; y <= currYear; y++) {
    yrOptions += '<option value="' + y + '"' + (y===currYear ? ' selected' : '') + '>' + y + '년</option>';
  }
  
  var mthOptions = '';
  for(var m = 1; m <= 12; m++) {
    mthOptions += '<option value="' + m + '"' + (m===currMonth ? ' selected' : '') + '>' + m + '월</option>';
  }

  var body = '<div class="form-grid">' +
    '<div class="form-group" style="grid-column: span 2;">' +
    '<p style="color:var(--risk); font-weight:bold; margin-bottom:10px;">⚠️ 경고: 월마감을 실행하면 선택한 연/월 이전의 모든 과거 데이터가 별도의 드라이브 시트로 분리되며, 현재 메인 시트에서 삭제됩니다. 남은 재고는 새롭게 선입선출 이월 기록으로 생성됩니다.</p>' +
    '</div>' +
    '<div class="form-group"><label>마감 기준 연도</label><select id="closingYear">' + yrOptions + '</select></div>' +
    '<div class="form-group"><label>마감 기준 월</label><select id="closingMonth">' + mthOptions + '</select></div>' +
    '</div>';
    
  var footer = '<button class="btn btn-outline" onclick="closeModal()">취소</button><button class="btn btn-danger" onclick="confirmMonthlyClosing()">실행</button>';
  openModal('🗓️ 월마감 및 재고 이월 실행', body, footer);
}

function confirmMonthlyClosing() {
  var year = document.getElementById('closingYear').value;
  var month = document.getElementById('closingMonth').value;
  
  var body = '<h3 style="text-align:center; margin-bottom:15px; color:var(--risk);">정말 ' + year + '년 ' + month + '월 마감을 실행하시겠습니까?</h3>' + 
             '<p style="text-align:center;">이 작업은 되돌릴 수 없습니다.<br>계속하시려면 <strong>동의</strong>라고 입력해주세요.</p>' +
             '<input type="text" id="closingConfirmText" class="form-control" style="margin-top:10px; text-align:center;" placeholder="동의">';
  var footer = '<button class="btn btn-outline" onclick="closeModal()">취소</button><button class="btn btn-danger" onclick="submitMonthlyClosing(' + year + ', ' + month + ')">최종 마감 실행</button>';
  openModal('🚨 월마감 최종 확인', body, footer);
}

function submitMonthlyClosing(year, month) {
  var txt = document.getElementById('closingConfirmText').value;
  if (txt !== '동의') {
    return showToast('"동의"라고 입력하셔야 실행됩니다.', 'warning');
  }
  
  showLoading();
  // 시간이 오래 걸리는 작업이므로 토스트 띄우기
  showToast('마감 및 이월 데이터 생성 중... 시간이 다소 소요될 수 있습니다.', 'info');
  
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoading();
      if (res.success) {
        showToast(res.message, 'success');
        closeModal();
      } else {
        showToast('마감 실패: ' + res.message, 'error');
      }
    })
    .withFailureHandler(function(err) {
      hideLoading();
      showToast('네트워크/서버 오류: ' + err.message, 'error');
    })
    .executeMonthlyClosing(getToken(), year, month);
}
</script>`;

str = str.replace('</script>', closingLogic);
fs.writeFileSync('src/JS_Config.html', str);
console.log('Closing logic appended to JS_Config.html');
