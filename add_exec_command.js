const fs = require('fs');
let code = fs.readFileSync('src/JS_Config.html', 'utf8');

const execLogic = `
// ═══════════════════════════════════════════════════════════════
//  [NEW] 시스템 명령 실행기
// ═══════════════════════════════════════════════════════════════
function execCommand(command) {
  if (currentUser && currentUser.role !== 'admin') {
    return showToast('최고 관리자만 실행할 수 있습니다.', 'error');
  }

  var cmdConfig = {
    'refreshDashboard': {
      title: '🔄 대시보드 및 재고 갱신',
      desc: '현재 전체 재고 상태와 대시보드 통계를 즉시 재계산합니다.',
      btn: 'btn-primary',
      btnText: '갱신'
    },
    'syncPermissions': {
      title: '🔐 권한 재동기화',
      desc: '사용자 시트의 직급에 맞게 시트 보호 및 권한 설정을 초기화하고 재동기화합니다.',
      btn: 'btn-gold',
      btnText: '동기화'
    },
    'validateSeason': {
      title: '✅ 시즌 설정 검증',
      desc: '시즌 날짜에 중복이나 역전 오류가 없는지 전체 검사합니다.',
      btn: 'btn-primary',
      btnText: '검증'
    },
    'backupCSV': {
      title: '💾 시스템 데이터 백업',
      desc: '입출고 내역 및 품목 마스터 데이터를 시스템_데이터_백업 폴더에 강제 백업합니다.',
      btn: 'btn-gold',
      btnText: '백업 시작'
    },
    'incrementalSync': {
      title: '⚡ 누락 데이터 수동 취합',
      desc: '각 업장 시트의 데이터 중 메인 시트에 통합되지 않고 누락된 내역을 찾아 강제로 취합합니다.',
      btn: 'btn-primary',
      btnText: '수동 취합'
    },
    'generateShops': {
      title: '🆕 대기 업장 시트 생성',
      desc: '업장 관리 탭에서 "대기" 상태인 업장의 전용 입출고 시트를 일괄 생성합니다.',
      btn: 'btn-gold',
      btnText: '생성 시작'
    }
  };

  var conf = cmdConfig[command];
  if (!conf) return showToast('알 수 없는 명령어입니다.', 'error');

  var body = '<p style="text-align:center; margin-bottom:15px; font-size:1.05rem;"><strong>' + conf.title + '</strong> 작업을 실행하시겠습니까?</p>' +
             '<p style="text-align:center; color:var(--text-secondary);">' + conf.desc + '</p>';
  var footer = '<button class="btn btn-outline" onclick="closeModal()">취소</button>' +
               '<button class="btn ' + conf.btn + '" onclick="submitSystemCommand(\\'' + command + '\\')">' + conf.btnText + '</button>';
               
  openModal(conf.title, body, footer);
}

function submitSystemCommand(command) {
  closeModal();
  showLoading();
  showToast('작업 실행 중...', 'info');
  
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoading();
      if (res.success) {
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'warning');
      }
    })
    .withFailureHandler(function(err) {
      hideLoading();
      showToast('명령 실행 중 오류 발생: ' + err.message, 'error');
    })
    .runSystemCommand(getToken(), command);
}
</script>`;

code = code.replace('</script>', execLogic);
fs.writeFileSync('src/JS_Config.html', code);
console.log('execCommand logic appended.');
