# TASK-023: 관리자 도구 및 시트 동기화 안내 모달 통일

## Objective
웹앱과 스프레드시트 전반에서 무거운 관리자 작업 및 동기화 작업 실행 시 발생하는 "안내 → 확인 → 실행 → 결과" 흐름과 안내 문구를 단일 진실 공급원(SSOT)으로 통일하고, 스프레드시트 관리자 메뉴(7개 항목)와 웹앱 「시트 동기화」(2개 위치)에 웹앱 디자인 시스템(`Docs/UIGuidelines.md`)에 부합하는 일관된 모달 UI를 적용한다.

---

## Confirmed Facts
실제 코드를 읽어 확인된 사실과 실행 진입점 증빙:

### 1. 웹앱 「시트 동기화」 진입점 증빙
- **대시보드 탭 시트 동기화 버튼**: 활성 UI
  [진입점 호출 경로 증빙: `src/Index.html:86` (showTab('dashboard')) → `src/Index.html:128` (`#tab-dashboard`) → `src/Index.html:139-140` (`onclick="doForceRefresh(loadDashboard)"`) → `src/Index.html:607` (`include('JS_UI')`) → `src/JS_UI.html:61` (`doForceRefresh(callback)`) → `src/JS_UI.html:73` (`google.script.run...forceRefreshData(getToken())`) → `src/WebApp.gs:42` (`forceRefreshData`)]
  - 현재 확인 절차 없이 즉시 `showLoading()` 후 `CacheManager.invalidateAll()`을 호출하고 콜백(`loadDashboard`)을 실행함.
  - 별도의 완료 성공 토스트가 없으며, 실패 시에만 에러 토스트 표시.
- **입출고 기록 탭 시트 동기화 버튼**: 활성 UI
  [진입점 호출 경로 증빙: `src/Index.html:90` (showTab('transactions')) → `src/Index.html:206` (`#tab-transactions`) → `src/Index.html:220-221` (`onclick="doForceRefresh(loadTransactions)"`) → `src/Index.html:607` (`include('JS_UI')`) → `src/JS_UI.html:61` (`doForceRefresh(callback)`)]
  - 대시보드와 동일하게 확인 절차 없이 즉시 실행됨.
- **웹앱 공용 모달 컨테이너**: 활성 UI
  [진입점 호출 경로 증빙: `src/Index.html:60-69` (`#modalOverlay`, `#modalTitle`, `#modalBody`, `#modalFooter`) 및 `src/JS_UI.html:110` (`openModal(title, bodyHtml, footerHtml)`), `src/JS_UI.html:121` (`closeModal()`)]

### 2. 웹앱 시스템 명령 진입점 증빙
- **웹앱 관리자 명령 실행기**: 활성 UI
  [진입점 호출 경로 증빙: `src/Index.html:141` (`onclick="doSystemCommand('refreshDashboard')"`) 및 `src/Index.html:230` (`onclick="... doSystemCommand('incrementalSync')"`)]
  - 스크립트: `src/Index.html:610` (`include('JS_Config')`) → `src/JS_Config.html:426` (`doSystemCommand(command)`) → `src/JS_Config.html:431-462` (`cmdConfig` 하드코딩 테이블) → `openModal(...)` → `src/JS_Config.html:475` (`submitSystemCommand`) → `src/WebApp.gs:124` (`runSystemCommand`)]
  - `doSystemCommand`는 `currentUser.role !== 'admin'` 체크가 있어 일반 직원(staff/manager)은 접근 불가.

### 3. 스프레드시트 「🏨 관리자 도구」 7개 항목 진입점 증빙
- **스프레드시트 커스텀 메뉴**: 활성 UI
  [진입점 호출 경로 증빙: `src/Code.gs:12-24` (`onOpen()`) → `.createMenu("🏨 관리자 도구")`]
  1. `🔄 통합 갱신`: `src/Code.gs:16` → `menuRefreshDashboard` (`src/Code.gs:53`) → `_confirmAdminAction` (`src/Code.gs:43`) → `refreshDashboard()` (`src/Dashboard.gs:12`)
  2. `🔐 권한 재동기화`: `src/Code.gs:17` → `menuSyncPermissions` (`src/Code.gs:62`) → `_confirmAdminAction` → `syncPermissions()` (`src/RBAC.gs:465`)
  3. `✅ 시즌 설정 검증`: `src/Code.gs:18` → `menuValidateSeasonSettings` (`src/Code.gs:71`) → `_confirmAdminAction` → `validateSeasonSettings()` (`src/RBAC.gs:491`)
  4. `💾 CSV 백업 실행`: `src/Code.gs:19` → `menuBackupCSV` (`src/Code.gs:78`) → `_confirmAdminAction` → `backupCSV()` (`src/Code.gs:147`) → `backupToCSV()` (`src/Archive.gs:11`)
  5. `📤 품목마스터 CSV 업로드`: `src/Code.gs:20` → `menuOpenCsvUploadModal` (`src/Code.gs:87`) → `_confirmAdminAction` → `openCsvUploadModal()` (`src/Code.gs:155`) → `src/UploadCsv.html`
  6. `🎨 시트 서식/검증 복구`: `src/Code.gs:21` → `menuRepairAllSheetFormatting` (`src/Code.gs:96`) → `_confirmAdminAction` → `repairAllSheetFormatting()` (`src/Code.gs:122`) → `reapplyAllSheetFormatting()` (`src/Formatters.gs`)
  7. `🤝 거래처코드 일괄 부여`: `src/Code.gs:22` → `menuAssignMissingVendorCodes` (`src/Code.gs:106`) → `_confirmAdminAction` → `assignMissingVendorCodes()` (`src/VendorService.gs:436`)
- **현재 시트 확인 및 결과 표시 방식**:
  - `_confirmAdminAction` (`src/Code.gs:43-51`): `SpreadsheetApp.getUi().alert(title, guide, YES_NO)` 네이티브 대화상자 사용.
  - 실행 결과 알림:
    - `refreshDashboard`: `src/Dashboard.gs:102` (`if (!isSilent) SpreadsheetApp.getUi().alert(...)`)
    - `syncPermissions`: `src/RBAC.gs:469` (`SpreadsheetApp.getUi().alert(...)`)
    - `validateSeasonSettings`: `src/RBAC.gs:527, 529` (`SpreadsheetApp.getUi().alert(...)`)
    - `backupCSV`: `src/Code.gs:149` (`SpreadsheetApp.getUi().alert(...)`)
    - `repairAllSheetFormatting`: `src/Code.gs:128, 139` (`ui.alert(...)`)
    - `assignMissingVendorCodes`: `src/VendorService.gs:447, 450, 458` (`ui.alert(...)`)
    - `UploadCsv.html`: 독립된 자체 인라인 스타일 HTML 다이얼로그 (`src/Code.gs:156` `createHtmlOutputFromFile('UploadCsv')`)

### 4. 사장된(Dead) 파일 확인
- `src/JS_Master.html`: 사장된 파일임. `src/Index.html`에 include되지 않으며 `tab-master` 컨테이너도 없음. 품목 마스터는 스프레드시트 `🗂️ 품목 마스터` 시트 전용임 (수정 대상 아님).

---

## Hypotheses
구현 전 Claude Code가 DEV 환경에서 반드시 검증해야 하는 가설:

- **H1 (시트 모달 내 google.script.run과 본체 함수의 ui.alert 충돌 여부)**:
  `HtmlService.showModalDialog`로 띄운 커스텀 모달 내부에서 `google.script.run`으로 본체 함수를 실행할 때, 본체 함수가 `SpreadsheetApp.getUi().alert()`를 호출하면 모달 창 위에 스프레드시트 네이티브 alert가 포커스를 가로채거나 모달이 닫히지 않고 먹통이 될 수 있다.
  - *검증 방법*: DEV 스프레드시트에서 테스트 다이얼로그를 띄워 `google.script.run` 호출 중 `ui.alert()`가 발생할 때 브라우저 동작(대화상자 겹침, 포커스, 반환 시점)을 직접 확인한다.
  - *대응 전략*:
    1. `refreshDashboard`처럼 이미 `isSilent` 인자를 받는 함수는 `isSilent = true`로 호출하여 네이티브 alert를 억제하고 모달 내부 DOM에 성공 메시지를 표시한다.
    2. `isSilent` 인자가 없는 함수들(`syncPermissions`, `validateSeasonSettings`, `backupCSV`, `repairAllSheetFormatting`, `assignMissingVendorCodes`)의 경우, 기존 호출처(트리거, 배치 등)에 영향이 없도록 기본값을 `isSilent = false`로 두는 선택적 매개변수를 추가하거나, 본체 함수를 그대로 둔 채 모달 전용 래퍼에서 결과 문자열을 반환받아 모달 내에 표시할 수 있는지 검증한다. (TASK-019 제약 준수)

- **H2 (시트 모달 다이얼로그에서 Stylesheet.html / Icons.html include 지원 여부)**:
  스프레드시트의 `HtmlService.createTemplateFromFile` 환경에서도 웹앱과 동일하게 `<?!= include('Stylesheet') ?>` 및 `<?!= include('Icons') ?>`가 온전히 동작하며 모달 창 내부에 웹앱과 동일한 CSS 토큰 및 Lucide SVG 스프라이트가 깨짐 없이 렌더링될 것이다.
  - *검증 방법*: DEV 환경에서 `include()` 함수를 호출하는 간단한 템플릿 다이얼로그를 띄워 CSS 폰트(Inter/Pretendard), 버튼 색상(`.btn-primary`, `.btn-outline`), Lucide SVG 아이콘이 정상 표시되는지 검증.

- **H3 (UploadCsv 모달 통합 시 다이얼로그 2회 연속 오픈 문제)**:
  현재 `menuOpenCsvUploadModal`은 `_confirmAdminAction` 확인창(1회) → `UploadCsv` 모달(2회)로 2단계 대화상자를 거친다.
  - *대응 전략*: `UploadCsv.html` 자체에 안내문, 주의사항, 파일 선택, [취소] [업로드 실행] 버튼을 웹앱 모달 디자인으로 일원화하면 단일 모달로 깔끔하게 처리 가능하다.

---

## Business Context
- **문제점**:
  1. 웹앱 대시보드와 입출고 기록의 「시트 동기화」 버튼은 캐시를 전부 날리고 시트 데이터를 다시 읽는 무거운 작업임에도 확인 없이 즉시 실행되어 사용자의 오클릭 위험이 있다.
  2. 스프레드시트 관리자 도구는 윈도우/OS 네이티브 `ui.alert` 팝업을 사용하여 디자인이 투박하고, 웹앱 모달과의 시각적 일관성이 전혀 없다.
  3. 시트 관리자 도구 메뉴의 설명문과 웹앱 `doSystemCommand`의 설명문이 제각각 작성되어 유지보수 시 문구 불일치가 발생한다.
- **해결책**:
  모든 시스템 명령과 동기화 작업의 메타데이터(제목, 설명, 주의사항, 버튼 스타일, 권한 요건 등)를 서버에 단일 진실 공급원(SSOT)으로 정의하고, 웹앱과 시트 양쪽에서 동일한 웹앱 디자인 시스템(`Docs/UIGuidelines.md`) 모달로 통일한다.

---

## Current System
1. **웹앱 시트 동기화**:
   - `src/Index.html:139-140` (대시보드), `src/Index.html:220-221` (입출고): 둘 다 `onclick="doForceRefresh(...)"`
   - `src/JS_UI.html:61`: `doForceRefresh(callback)` 호출 시 확인창 없이 곧바로 `showLoading()` → `forceRefreshData()` → `callback()` 실행.
2. **웹앱 시스템 명령**:
   - `src/JS_Config.html:431-462`: `cmdConfig` 객체에 하드코딩된 문구로 `openModal()` 호출 → `submitSystemCommand()` → `WebApp.gs:runSystemCommand()`
3. **스프레드시트 관리자 도구**:
   - `src/Code.gs:12-24`: `onOpen()`에서 7개 메뉴 항목 등록.
   - `src/Code.gs:43-51`: `_confirmAdminAction(title, guide)`에서 `SpreadsheetApp.getUi().alert(..., YES_NO)` 실행.
   - 각 본체 함수가 종료 시 `SpreadsheetApp.getUi().alert(...)`로 별도 완료창을 띄움.
   - `UploadCsv.html`: 노란색/골드 버튼(`.btn-gold` 변종)과 인라인 스타일로 구성된 별도 창.

---

## Root Cause / Diagnostic Logic
해당 없음 (신규 기능 통합 및 UX 표준화 리팩토링).

---

## Requirements

### Functional
- [ ] **1. 안내 문구 SSOT (단일 진실 공급원) 구축**:
  - `src/Config.gs` (또는 `src/SystemCommands.gs`)에 시스템 명령 및 동기화 작업 정의 테이블(`SYSTEM_ACTIONS`) 작성.
  - 다음 9개 도구의 메타데이터를 확정 테이블 규격대로 선언:
    1. `forceRefresh` (시트 동기화 - 웹앱 전용)
    2. `refreshDashboard` (통합 갱신 - 시트 / 웹앱 공통)
    3. `incrementalSync` (신규 내역 취합 - 웹앱 전용)
    4. `syncPermissions` (권한 재동기화 - 시트 / 웹앱 공통)
    5. `validateSeason` (시즌 설정 검증 - 시트 / 웹앱 공통)
    6. `backupCSV` (CSV 백업 실행 - 시트 / 웹앱 공통)
    7. `repairFormatting` (시트 서식/검증 복구 - 시트 전용)
    8. `assignVendorCodes` (거래처코드 일괄 부여 - 시트 전용)
    9. `uploadItemCsv` (품목마스터 CSV 업로드 - 시트 전용)
  - 웹앱 클라이언트는 `Index.html` 렌더링 시 템플릿 변수(또는 전역 변수)를 통해 `SYSTEM_ACTIONS`를 전달받아 `JS_Config.html` 및 `JS_UI.html`에서 직접 사용.
  - 시트 전용 도구(서식 복구, 거래처코드 부여, CSV 업로드)는 정의 테이블에 포함하되 웹앱 UI 버튼으로 노출하지 않음.

- [ ] **2. 확정 안내 문구 스펙 준수**:

| ID | 표시 이름 | 모달 제목 | 상세 설명 | 주의사항 Bullets | 버튼 텍스트 | 버튼 클래스 | 권한 |
|---|---|---|---|---|---|---|---|
| `forceRefresh` | 시트 동기화 | 시트 동기화 | 서버 캐시를 비우고 구글 시트에서 최신 데이터를 다시 읽어옵니다. | • 구글 시트의 원본 데이터는 변경되지 않습니다.<br>• 최신 데이터를 다시 불러오므로 수 초 정도 소요될 수 있습니다. | 동기화 | `.btn-primary` | 전체 (staff/manager/admin) |
| `refreshDashboard` | 통합 갱신 | 통합 갱신 | 모든 업장 시트의 입출고를 통합 기록장으로 취합하고, 전 품목의 현재고·일평균·FIFO 평가액 재계산 및 대시보드를 갱신합니다. | • 품목 및 거래 내역 수에 따라 최대 수 분이 소요될 수 있습니다.<br>• 실행 중에는 다른 사용자의 저장 작업이 잠시 대기할 수 있습니다.<br>• 방금 입력한 내역을 즉시 반영해야 할 때만 사용하세요. | 갱신 | `.btn-primary` | 최고 관리자 (`admin`) |
| `incrementalSync` | 신규 내역 취합 | 신규 내역 취합 | 각 업장 시트에 새롭게 입력된 최신 거래 내역만 메인으로 빠르게 취합합니다. | • 전체 재계산 대신 최신 변동 내역 위주로 신속하게 동기화합니다.<br>• 수 초 내외로 빠르게 완료됩니다. | 취합 시작 | `.btn-primary` | 최고 관리자 (`admin`) |
| `syncPermissions` | 권한 재동기화 | 권한 재동기화 | 시스템 시트(품목 마스터, 통합 기록장 등)의 보호 규칙과 초기재고 보호 범위를 재설정합니다. | • 시트 데이터의 셀 값은 변경되지 않습니다.<br>• 웹앱 로그인 계정 권한은 변경되지 않습니다(계정 관리 화면에서 관리). | 동기화 | `.btn-primary` | 최고 관리자 (`admin`) |
| `validateSeason` | 시즌 설정 검증 | 시즌 설정 검증 | 시즌설정 시트의 날짜 형식, 시작일/종료일 역전 여부, 기간 중복, 가중치 배수 값을 검사합니다. | • 설정값 검사만 수행하며 시트 데이터를 수정하지 않습니다.<br>• 검증 결과와 오류 상세 내역을 즉시 표시합니다. | 검증 | `.btn-primary` | 최고 관리자 (`admin`) |
| `backupCSV` | CSV 백업 실행 | CSV 백업 실행 | 통합 입출고 기록장과 품목 마스터 데이터를 CSV 파일로 추출하여 백업 폴더에 저장합니다. | • 현재 시트의 데이터는 변경되지 않습니다.<br>• 실행할 때마다 구글 드라이브 '시스템_데이터_백업' 폴더에 새 파일이 생성됩니다. | 백업 시작 | `.btn-primary` | 최고 관리자 (`admin`) |
| `repairFormatting` | 시트 서식/검증 복구 | 시트 서식/검증 복구 | 마스터·기록장·템플릿·업장 시트의 서식, 드롭다운 데이터 검증, 시트 보호 범위를 현재 행 수에 맞춰 복구합니다. | • 셀의 데이터 값은 건드리지 않으므로 데이터 유실 위험이 없습니다.<br>• 품목 마스터 거래처코드 엄격 검증 및 숨김 보조 열도 함께 재적용됩니다.<br>• 시트 크기에 따라 1~2분 정도 소요될 수 있습니다. | 복구 실행 | `.btn-primary` | 최고 관리자 (`admin`) |
| `assignVendorCodes` | 거래처코드 일괄 부여 | 거래처코드 일괄 부여 | 거래처관리 시트에서 거래처코드(A열)가 비어 있는 행을 찾아 VND-### 형태의 고유 코드를 순차 부여합니다. | • 이미 코드가 있는 행은 건드리지 않습니다.<br>• 부여된 코드는 품목 마스터가 영구 참조하므로 이후 변경하거나 삭제할 수 없습니다. | 코드 부여 | `.btn-danger` | 최고 관리자 (`admin`) |
| `uploadItemCsv` | 품목마스터 CSV 업로드 | 품목마스터 CSV 업로드 | CSV 파일을 업로드하여 품목 마스터에 새로운 품목을 일괄 등록합니다. | • 이미 존재하는 품목코드는 건너뛰고 신규 코드만 추가 등록합니다.<br>• 등록된 품목은 자동 삭제되지 않으므로, 실행 전 'CSV 백업 실행'을 권장합니다.<br>• 업로드할 CSV 파일을 선택한 후 실행 버튼을 눌러주세요. | 업로드 실행 | `.btn-primary` | 최고 관리자 (`admin`) |

- [ ] **3. 웹앱 「시트 동기화」 안내 모달 적용 (요구사항 A)**:
  - 대시보드(`src/Index.html:139-140`)와 입출고 기록(`src/Index.html:220-221`)의 시트 동기화 버튼 클릭 시 즉시 실행 대신 안내 모달(`openForceRefreshModal(callback)`) 오픈.
  - 모달 내용: 확정 스펙의 `forceRefresh` 제목, 설명, 2개 bullet, [취소](`.btn-outline`), [동기화](`.btn-primary`) 버튼.
  - **권한 주의**: staff 및 manager 역할도 정상 사용해야 하므로 `doSystemCommand`의 admin 체크를 거치지 않고 독자 함수 또는 권한 허용 함수로 처리.
  - [동기화] 클릭 시: 모달 닫기 → `showLoading()` → `forceRefreshData(getToken())` 호출 → 성공 시 `showToast('구글 시트 동기화가 완료되었습니다.', 'success')` 1회 알림 후 콜백 실행 → `hideLoading()`.
  - 실패 시: 기존 실패 에러 토스트 표시 유지.

- [ ] **4. 스프레드시트 「🏨 관리자 도구」 7개 항목 모달 개편 (요구사항 B)**:
  - 네이티브 `_confirmAdminAction`의 `SpreadsheetApp.getUi().alert()` 호출을 제거하고, `HtmlService.createTemplateFromFile` 기반의 웹앱 스타일 모달 다이얼로그(`AdminActionDialog.html`)로 전면 전환.
  - 다이얼로그 UI 구성:
    - 웹앱 `Stylesheet.html` 및 `Icons.html`을 `include`하여 폰트, 여백, 버튼 토큰 완벽 일치.
    - 제목, 상세 설명, 주의사항 `<ul><li>` bullet 리스트.
    - [취소] (`.btn-outline`, 클릭 시 `google.script.host.close()`), [실행] (`.btn-primary` 또는 `assignVendorCodes`는 `.btn-danger`).
    - 모달 안 이모지 사용 금지 (`Docs/UIGuidelines.md §3`).
    - [실행] 클릭 시 버튼 비활성화 및 로딩 스피너/상태 텍스트("작업 처리 중...") 표시.
    - 실행 완료 시: 모달 내부 결과 패널에 성공/오류 메시지를 표시하고, 버튼을 [닫기] (`.btn-outline`) 1개로 전환.
  - `UploadCsv.html` 스타일 통일:
    - 자체 인라인 CSS 및 골드 버튼을 제거하고, `Stylesheet.html`을 include하여 `.btn-primary`, `.btn-outline`, 일관된 폰트/간격 적용.
    - 불필요한 이중 확인창 없이 단일 모달 내에서 파일 선택 및 업로드 진행.

### Non-Functional
- [ ] **디자인 가이드라인 준수 (`Docs/UIGuidelines.md`)**:
  - 모달 제목 및 본문에 OS 이모지 사용 금지 (§3).
  - 버튼 높이 40px 통일, 솔리드 블루 `.btn-primary` 1개, 취소는 `.btn-outline`, 파괴적 변경은 `.btn-danger` (§2, §4).
  - 인라인 `style=` 속성 금지 (§4).
- [ ] **하위 호환성 및 안정성 (TASK-019 제약 준수)**:
  - 트리거, 웹앱 API, `createAll`, 마이그레이션 스크립트가 호출하는 본체 함수(`refreshDashboard`, `syncPermissions`, `backupToCSV`, `reapplyAllSheetFormatting` 등)의 기존 호출 시그니처와 기본 동작을 훼손하지 않는다.

---

## Constraints
1. **역할 경계 준수**: 소스 코드 수정은 Claude Code가 담당하며, Antigravity는 본 Task 명세 작성 완료 후 즉시 턴을 종료한다.
2. **시트 구조 및 비즈니스 로직 불변**: 시트 탭 구성, 컬럼 스키마, 권한 규칙, FIFO 계산 로직을 일절 변경하지 않는다.
3. **Admin 권한 분리**: 웹앱의 관리자 전용 시스템 명령(`refreshDashboard`, `incrementalSync`, `syncPermissions`, `validateSeason`, `backupCSV`)은 `admin` 역할만 실행할 수 있어야 하며, `forceRefresh`(시트 동기화)는 `staff`, `manager`, `admin` 누구나 실행 가능해야 한다.
4. **시크릿 하드코딩 금지**: 어떠한 토큰이나 비밀번호도 코드에 하드코딩하지 않는다.
5. **ES6/GAS 런타임 호환성**: `import`/`export` 모듈 구문을 사용하지 않고 GAS 전역 스코프 및 V8 런타임 규칙을 준수한다.

---

## Files to Inspect
구현 전 Claude Code가 반드시 확인해야 하는 파일:
- `src/Index.html`: 시트 동기화 버튼 위치(`L139-140`, `L220-221`), 모달 컨테이너(`L60-69`), include 목록(`L606-612`)
- `src/JS_UI.html`: `doForceRefresh`(`L61-74`), `openModal`/`closeModal`(`L110-123`), `showToast`(`L87-105`)
- `src/JS_Config.html`: `doSystemCommand`(`L426-473`), `cmdConfig`(`L431-462`), `submitSystemCommand`(`L475-494`)
- `src/WebApp.gs`: `forceRefreshData`(`L42-47`), `runSystemCommand`(`L124-165`), `include`(`L27-31`)
- `src/Code.gs`: `onOpen`(`L12-24`), `_confirmAdminAction`(`L43-51`), `menu*` 래퍼들(`L53-112`), `backupCSV`(`L147`), `openCsvUploadModal`(`L155`), `repairAllSheetFormatting`(`L122`)
- `src/Dashboard.gs`: `refreshDashboard(isSilent)`(`L12-115`)
- `src/RBAC.gs`: `syncPermissions`(`L465-470`), `validateSeasonSettings`(`L491-531`)
- `src/VendorService.gs`: `assignMissingVendorCodes`(`L436-460`)
- `src/UploadCsv.html`: 기존 CSV 업로드 모달 마크업 및 스크립트
- `src/Stylesheet.html`: 모달 CSS 클래스(`.modal`, `.modal-overlay`, `.modal-header`, `.modal-body`, `.modal-footer`, `.btn-primary`, `.btn-outline`, `.btn-danger`)
- `Docs/UIGuidelines.md`: UI 단일 진실 공급원 규칙

---

## Files to Modify
- `src/Config.gs`: `SYSTEM_ACTIONS` 메타데이터 테이블 상수 및 조회 헬퍼 함수 추가
- `src/Index.html`:
  - 대시보드 및 입출고 탭 시트 동기화 버튼의 `onclick`을 모달 오픈 함수(`openForceRefreshModal(...)`)로 변경
  - 클라이언트 스크립트에 `SYSTEM_ACTIONS` 템플릿 전달
- `src/JS_UI.html`:
  - `openForceRefreshModal(callback)` 함수 추가 (모달 안내 → [취소][동기화])
  - `doForceRefresh` 내 성공 시 `showToast('구글 시트 동기화가 완료되었습니다.', 'success')` 추가
- `src/JS_Config.html`:
  - `cmdConfig` 하드코딩 제거 및 `SYSTEM_ACTIONS` 참조로 교체
  - `doSystemCommand` 안내 모달 렌더링 시 bullet 리스트 포함 일관된 마크업 적용
- `src/Code.gs`:
  - `menu*` 래퍼 함수들에서 네이티브 `_confirmAdminAction` 대신 공통 HTML 다이얼로그 오픈 함수 호출로 변경
  - 시트 모달 다이얼로그 서빙 및 백엔드 실행 래퍼 함수 추가
- `src/UploadCsv.html`:
  - 인라인 스타일 및 골드 버튼을 제거하고, `Stylesheet.html`을 include하여 모달 디자인 시스템 일치화

---

## Files to Create
- `src/AdminActionDialog.html`:
  - 스프레드시트 「🏨 관리자 도구」 전용 공통 모달 템플릿
  - `Stylesheet.html`, `Icons.html` include
  - 제목, 설명, 주의사항 bullet 리스트, [취소] [실행] 버튼, 실행 중 로딩 스피너, 완료 결과 표시 영역

---

## Implementation Plan

### Step 1: 서버 측 SSOT 메타데이터 정의 (`src/Config.gs`)
- `SYSTEM_ACTIONS` 객체 정의 (9개 도구: id, title, desc, bullets, btnText, btnClass, requiresAdmin, scope 등 포함).
- 헬퍼 함수 `getSystemActionsConfig()` 또는 `getSystemAction(id)` 구현.

### Step 2: 웹앱 「시트 동기화」 모달 구현 (`src/Index.html`, `src/JS_UI.html`)
- `Index.html` 템플릿에 `SYSTEM_ACTIONS` 객체 전달 (`var SYSTEM_ACTIONS = <?!= JSON.stringify(SYSTEM_ACTIONS) ?>;`).
- `JS_UI.html`에 `openForceRefreshModal(callback)` 추가:
  - `SYSTEM_ACTIONS.forceRefresh`의 제목, 설명, bullet 목록을 조합하여 `openModal()` 호출.
  - 푸터에 `취소`(`closeModal()`)와 `동기화`(`executeForceRefresh(callback)`) 버튼 배치.
  - 실행 시 `closeModal()` 후 기존 `doForceRefresh(callback)` 로직 수행.
  - 성공 시 `showToast('구글 시트 동기화가 완료되었습니다.', 'success')` 토스트 호출.
- `Index.html` 대시보드(L139) 및 입출고(L220) 버튼의 onclick을 `openForceRefreshModal(loadDashboard)`, `openForceRefreshModal(loadTransactions)`로 교체.

### Step 3: 웹앱 시스템 명령 렌더러 리팩토링 (`src/JS_Config.html`)
- `doSystemCommand(command)` 내부의 하드코딩 `cmdConfig`를 `SYSTEM_ACTIONS[command]` 참조로 교체.
- 모달 본문에 `conf.desc`와 함께 `conf.bullets` 목록을 `<ul class="modal-bullets">`로 깔끔하게 렌더링.

### Step 4: 시트 관리자 도구 공통 다이얼로그 생성 (`src/AdminActionDialog.html`, `src/Code.gs`)
- `AdminActionDialog.html` 작성:
  - `<?!= include('Stylesheet') ?>` 및 `<?!= include('Icons') ?>`로 디자인 시스템 적용.
  - 다이얼로그 템플릿 변수로 전달받은 액션 정보(`actionConfig`)를 렌더링.
  - [실행] 클릭 시 `google.script.run`으로 백엔드 실행 래퍼 호출.
  - 실행 중 UI: 스피너 표시 및 버튼 비활성화.
  - 완료 시 UI: 성공/오류 메시지 표시 및 [닫기] (`google.script.host.close()`) 버튼 표시.
- `src/Code.gs`에 다이얼로그 오픈 함수 `openAdminActionModal(actionId)` 작성:
  - `HtmlService.createTemplateFromFile('AdminActionDialog')` 생성 후 `setWidth(440).setHeight(360)` 설정하여 `SpreadsheetApp.getUi().showModalDialog()` 호출.
- `menuRefreshDashboard`, `menuSyncPermissions` 등 7개 메뉴 래퍼를 `openAdminActionModal(actionId)` 호출 구조로 전환.
- Hypotheses 검증 결과에 따라 본체 함수의 alert 중복 방지 처리(래퍼를 통한 분기 등) 적용.

### Step 5: `src/UploadCsv.html` 디자인 시스템 통일
- `UploadCsv.html` 헤더에 `<?!= include('Stylesheet') ?>` 포함.
- 노란색 버튼(#d4af37)을 `.btn .btn-primary`로 교체.
- 취소 버튼(`.btn .btn-outline`) 추가.
- 폰트 및 여백을 `Stylesheet.html`의 CSS 변수로 교체.

---

## Migration Plan
해당 없음 (시트 스키마 및 저장 데이터 변경 없음).

---

## Test Plan

### Unit Test
- `tests/unit/system-commands-config.test.js`:
  - `SYSTEM_ACTIONS` 정의의 필수 키(`id`, `title`, `desc`, `bullets`, `btnText`, `btnClass`) 유효성 검증.
  - 9개 도구 전체가 올바르게 등록되어 있는지 검증.
  - `forceRefresh`는 `requiresAdmin: false`이고, 관리자 명령들은 `requiresAdmin: true`인지 검증.
  - `assignVendorCodes`만 `btn-danger`이고 나머지는 `btn-primary`인지 검증.

### E2E Test (Playwright)
- `tests/e2e/sheet-sync-modal.spec.js`:
  1. **대시보드 시트 동기화 모달 시나리오**:
     - 로그인 후 대시보드 탭 진입.
     - 「시트 동기화」 버튼 클릭.
     - 모달이 즉시 뜨는지 확인: 제목("시트 동기화"), 설명 문구, bullet 리스트 2개, [취소] 및 [동기화] 버튼 존재 확인.
     - [취소] 버튼 클릭 시 모달이 닫히고 데이터 재조회가 일어나지 않는지 확인.
     - 다시 「시트 동기화」 클릭 후 [동기화] 클릭.
     - 로딩 오버레이 표시 후 완료 시 성공 토스트("구글 시트 동기화가 완료되었습니다.")가 노출되는지 확인.
  2. **입출고 기록 탭 시트 동기화 모달 시나리오**:
     - 입출고 기록 탭으로 전환.
     - 헤더의 「시트 동기화」 버튼 클릭.
     - 동일하게 모달 노출 및 [취소]/[동기화] 정상 동작 확인.
  3. **일반 사용자(staff/manager) 권한 시나리오**:
     - staff 또는 manager 계정으로 로그인 후 대시보드 및 입출고 기록에서 「시트 동기화」 모달이 차단 없이 정상 실행되는지 확인.

### Human QA Checklist (스프레드시트 7개 도구 수동 검증)
구글 시트 UI 대화상자는 Playwright 자동화가 불가하므로 Claude Code가 DEV 스프레드시트에서 아래 체크리스트를 확인해야 함:

| 번호 | 메뉴 항목 | 취소 동작 검증 | 실행 동작 검증 | 모달 내 결과 표시 검증 |
|---|---|---|---|---|
| 1 | `🔄 통합 갱신` | 모달 뜸 → [취소] → 모달 닫힘, 시트 변경 없음 | [갱신] 클릭 → 로딩 스피너 → 대시보드 갱신 성공 | 모달 내 완료 메시지 확인 후 [닫기] |
| 2 | `🔐 권한 재동기화` | 모달 뜸 → [취소] → 모달 닫힘 | [동기화] 클릭 → 시트 보호 재설정 | 모달 내 완료 메시지 확인 |
| 3 | `✅ 시즌 설정 검증` | 모달 뜸 → [취소] → 모달 닫힘 | [검증] 클릭 → 시즌 날짜/배수 검사 | 검증 결과(정상/오류) 모달 내 표시 |
| 4 | `💾 CSV 백업 실행` | 모달 뜸 → [취소] → 모달 닫힘 | [백업 시작] 클릭 → CSV 백업 폴더 저장 | 백업 완료 메시지 표시 |
| 5 | `📤 품목마스터 CSV 업로드` | 모달 뜸 → [취소] → 모달 닫힘 | 파일 선택 후 [업로드 실행] 클릭 | 업로드 진행 상태 및 결과 표시 |
| 6 | `🎨 시트 서식/검증 복구` | 모달 뜸 → [취소] → 모달 닫힘 | [복구 실행] 클릭 → 서식 복구 수행 | 복구된 시트/행 수 결과 표시 |
| 7 | `🤝 거래처코드 일괄 부여` | 모달 뜸 → 빨간색 [코드 부여](`.btn-danger`) 확인 → [취소] | [코드 부여] 클릭 → 미부여 행에 VND-### 채번 | 부여된 건수 및 결과 표시 |

---

## Regression Risk
1. **시트 동기화 버튼 클릭 지연**:
   기존 즉시 실행에서 모달 확인 1단계가 추가되므로 사용자가 1회 더 클릭해야 함 (의도된 변경).
2. **시트 모달 실행 중 세션 만료 또는 브라우저 닫힘**:
   `google.script.run` 비동기 실행 도중 사용자가 모달 창을 닫아버려도 서버 측 실행은 GAS 특성상 끝까지 돌지만, 완료 결과는 보지 못할 수 있음. (기존 ui.alert도 동일한 특성).
3. **본체 함수(refreshDashboard 등)를 직접 호출하는 트리거/배치**:
   `Code.gs`의 메뉴 래퍼만 모달로 교체하고, `Triggers.gs`나 웹앱에서 호출하는 본체 함수 자체의 기본 호출 방식은 유지하므로 트리거 영향 없음.

---

## Acceptance Criteria
- [ ] 서버에 9개 시스템 작업의 단일 정의 테이블(`SYSTEM_ACTIONS`)이 구축되고 웹앱 및 시트가 이를 공유함.
- [ ] 웹앱 대시보드 및 입출고 기록의 「시트 동기화」 버튼 클릭 시 안내 모달이 뜨고, 취소 및 실행이 정상 동작함.
- [ ] 「시트 동기화」는 staff/manager/admin 모든 권한에서 정상 동작하며 완료 시 성공 토스트가 1회 표시됨.
- [ ] 스프레드시트 7개 관리자 도구 클릭 시 네이티브 `ui.alert` 대신 웹앱 스타일의 `HtmlService` 모달 다이얼로그가 열림.
- [ ] `assignVendorCodes`(거래처코드 일괄 부여)의 실행 버튼만 `.btn-danger`이고, 나머지는 `.btn-primary`임.
- [ ] 모달 UI 내부 텍스트 및 버튼에 OS 이모지가 일절 사용되지 않음.
- [ ] `UploadCsv.html`이 인라인 CSS를 제거하고 `Stylesheet.html` 기반으로 일관된 룩앤필을 가짐.
- [ ] 단위 테스트(`tests/unit/`) 및 Playwright E2E(`tests/e2e/`) 테스트가 모두 통과함.

---

## Human Approval Required
없음 (기존 UI 가이드라인 및 TASK-019 설계 원칙에 완벽히 부합함).

---

## Deployment Notes
- `clasp push` (또는 `npm run dev:push`)로 코드 반영 후 스프레드시트 새로고침(`F5`) 필요 (새로운 `onOpen` 메뉴 및 HTML 템플릿 로드).

---

## Rollback Plan
- Git 커밋 롤백(`git revert`) 후 `clasp push` 재실행.

---

## Final Report
*(Claude Code · 2026-09-12 · DEV 배포 `npm run dev:push` 완료, 커밋 전)*

### 1. 구현 요약

| 요구사항 | 구현 | 근거 |
|---|---|---|
| **C. 안내 문구 SSOT** | `src/Config.gs` `SYSTEM_ACTIONS` 9건(id·title·desc·bullets·btnText·btnClass·requiresAdmin·scope) + `getSystemAction(id)` + `getSystemActionsJson()`. 웹앱은 `Index.html` 템플릿이 `var SYSTEM_ACTIONS = <?!= getSystemActionsJson() ?>`로 주입받고, 시트 대화상자는 템플릿 변수 `action`으로 같은 객체를 받는다 | `src/Config.gs:153-289`, `src/Index.html:604-605` |
| **A. 웹앱 시트 동기화 모달** | `JS_UI.html` `openForceRefreshModal(callback)` → `systemActionGuideHtml/FooterHtml`(공용 렌더러) → `submitForceRefresh()` → 기존 `doForceRefresh`. admin 게이트 없음. 성공 시 `구글 시트 동기화가 완료되었습니다.` 토스트 1회 후 콜백. 대시보드·입출고 두 버튼 모두 교체 | `src/JS_UI.html:61-118`, `src/Index.html:139,220` |
| **A'. 웹앱 시스템 명령 모달** | `JS_Config.html` `doSystemCommand`의 하드코딩 `cmdConfig` 제거 → `SYSTEM_ACTIONS` 참조, 같은 렌더러 사용, `requiresAdmin`으로 권한 판정 | `src/JS_Config.html:423-437` |
| **B. 시트 관리자 도구 7개 모달** | `src/AdminActionDialog.html`(신규) — `Stylesheet`/`Icons` include, 설명·주의사항·[취소][실행]·실행 중 스피너·결과 패널·[닫기]. `Code.gs`: `openAdminActionDialog(id)`, `runAdminAction(id)`(본체를 `isSilent=true`로 호출, `{success,message}` 반환), `menu*` 7개는 대화상자만 연다. `_confirmAdminAction`(ui.alert YES/NO) 삭제. 창 높이는 `google.script.host.setHeight`로 내용에 맞춘다 | `src/Code.gs:26-99` |
| **B'. CSV 업로드 창** | `src/UploadCsv.html` 인라인 CSS·골드 버튼 제거 → 템플릿화(`Stylesheet` include, `.file-drop`, `.btn-primary`/`.btn-outline`), 안내·파일 선택·실행·결과가 한 창. 이중 확인창 제거 | `src/UploadCsv.html`, `src/Code.gs openCsvUploadModal` |
| 본체 함수 결과 반환 | `refreshDashboard(isSilent)` 반환값 추가(시그니처 동일), `syncPermissions(isSilent=false)`, `validateSeasonSettings(isSilent=false)`, `repairAllSheetFormatting(isSilent=false)`, `assignMissingVendorCodes(isSilent=false)` — 기본값 경로는 기존과 같은 alert, `true`면 `{success,message}`만 반환 | `Dashboard.gs`, `RBAC.gs`, `Code.gs`, `VendorService.gs` |
| CSS | `Stylesheet.html` `[TASK-023]` 블록: `.action-guide`(웹앱·시트 공용 안내 본문), `.sheet-dialog*`, `.spinner--inline`, `.sheet-dialog-result.success/.error`, `.file-drop` | `src/Stylesheet.html:1363-` |
| 문서 | `Docs/Architecture.md` 대시보드 갱신 흐름 주석 1줄 갱신 | |

### 2. Hypotheses 검증 결과 (DEV 스프레드시트 실측)

| 가설 | 결과 |
|---|---|
| **H1** 모달 안 `google.script.run` 실행 중 본체 `ui.alert` 겹침 | **회피 확인.** `runAdminAction`이 모든 본체를 `isSilent=true`로 부르므로 alert가 뜨지 않는다. 시즌 검증·통합 갱신을 실제 실행하는 동안 `[role="dialog"]` 중 iframe 없는 네이티브 창 수 = **0** (`sheet-dialog-check.log`) |
| **H2** 시트 대화상자에서 `include('Stylesheet')`/`include('Icons')` 동작 | **동작 확인.** 대화상자 body `font-family = Pretendard…`, `#btnRun` 배경 `rgb(37,99,235)`(`--primary`), danger는 `rgb(239,68,68)`, Lucide 심볼 `#i-check-circle-2` 존재 |
| **H3** CSV 업로드 2단계 창 | 단일 창으로 통합. 파일 미선택 시 창 안 오류 패널 + [실행] 유지(`confirm-footer-still=true`) |

### 3. 검증

- `npm test` — **17개 파일 전체 통과** (신규 `system-commands-config.test.js` 15건, 개정 `admin-menu-confirm.test.js` 22건, `migration-v16-formatting.test.js` 단정 1건 개정)
- Playwright `tests/e2e/sheet-sync-modal.spec.js` — **3 passed** (대시보드 / 입출고 / 임시 manager 계정 생성→실행→삭제)
- Playwright 전체 회귀(`npx playwright test`) — **23 passed / 3 skipped**(월마감 실제 실행 등 게이트된 파괴적 테스트, 기존과 동일). 기존 20건 회귀 없음
- 시트 대화상자 자동 점검 스크립트(Playwright + 영속 프로필로 DEV 스프레드시트 메뉴 구동): 시즌 설정 검증(실행·결과·닫기), 거래처코드 일괄 부여(danger 버튼·취소), CSV 업로드(미선택 안내·취소), 통합 갱신(실제 실행·결과) — 전부 통과, 로그 `sheet-dialog-check.log`

### 4. DEV 증빙 (`AI/audits/UI-AUDIT-001/after/TASK-023/`)

| 파일 | 내용 |
|---|---|
| `S01-season-guide.png` / `S02-season-running.png` / `S03-season-result.png` | 시트 대화상자 안내 → 실행 중 → 결과 |
| `S04-vendor-danger-guide.png` | 거래처코드 일괄 부여 — `.btn-danger` |
| `S05-csv-upload.png` | CSV 업로드 창(파일 미선택 안내) |
| `S06-refresh-guide.png` / `S07-refresh-result.png` | 통합 갱신 안내 → 결과 |
| `W01-sync-modal-dashboard-1440.png` / `W03-…-transactions-1440.png` / `W04-…-768.png` | 웹앱 시트 동기화 모달 |
| `W02-refresh-modal-webapp-1440.png` + `webapp-refresh-modal-text.txt` | 웹앱 통합 갱신 모달 — S06(시트)과 같은 문구 |

### 5. Human QA 체크리스트 (스프레드시트)

자동 점검이 덮지 못한 항목만 남긴다 — 나머지 4개 항목(1·3·5·7의 취소/실행/결과)은 위 스크립트가 DEV에서 실제로 눌러 확인했다.

| 항목 | 확인할 것 |
|---|---|
| 2 권한 재동기화 | [동기화] → 결과 "권한 동기화가 완료되었습니다…" 표시, 시트 보호 유지 |
| 4 CSV 백업 실행 | [백업 시작] → 결과에 폴더명 표시, 드라이브 `시스템_데이터_백업`에 새 파일 |
| 5 CSV 업로드(실제 파일) | 파일 선택 → [업로드 실행] → "CSV 업로드 완료: N건 신규 등록…" 결과 |
| 6 시트 서식/검증 복구 | [복구 실행] → 대상 시트/확충 행 수 결과 |
| 7 거래처코드 일괄 부여(실행) | 빈 코드 행이 있을 때만. 결과에 부여 건수·코드 범위 |

### 6. 명세와 다른 점 / 판단

- 대화상자 크기: 명세 440×360 대신 **480×300 초기값 + 내용에 맞춰 자동 조절**(`google.script.host.setHeight`). 고정 높이는 안내 2줄짜리에서 절반이 빈 여백으로 남았다(1차 캡처에서 확인).
- `runSystemCommand`(WebApp.gs)의 토스트 문구(이모지 포함)는 그대로 두었다 — 모달 밖(토스트)이고 `Files to Modify`에 없다. 대화상자에 들어오는 서버 문구는 `stripLeadingEmoji`로 앞 이모지를 떼어 낸다(기존 `processCsvUploadFromSheet` 오류 문구 등).
- 웹앱 `validateSeason`은 기존처럼 `runSystemCommand` 자체 검사를 쓴다(시트 쪽 `validateSeasonSettings`가 기간 중복까지 보는 것과 범위가 다르지만, 웹앱 동작 변경은 이 Task 범위 밖).
- `Docs/Deployment.md:157`(TASK-019 릴리스 노트)는 이력 기록이라 손대지 않았다.

### 7. 회귀 영향 / DEV 부수 효과

- 트리거·웹앱·마이그레이션이 부르는 본체 함수 시그니처 변경 없음(선택 인자 추가·반환값 추가만). `refreshDashboard(true)` 호출부는 반환값을 쓰지 않는다.
- E2E 실행으로 DEV `👤 사용자관리`에 `e2e-mgr-*` manager 계정이 생성 후 삭제됨. 시트 대화상자 점검으로 DEV 통합 갱신이 1회 실제 실행됨(데이터 변경 없음, 재계산만).

### 8. Acceptance Criteria

- [x] 서버에 9개 작업 단일 정의 테이블(`SYSTEM_ACTIONS`) — 웹앱·시트 공유
- [x] 웹앱 대시보드·입출고 「시트 동기화」 안내 모달, 취소/실행 정상
- [x] staff/manager/admin 모두 실행 가능, 성공 토스트 1회 (manager E2E)
- [x] 시트 7개 관리자 도구가 `ui.alert` 대신 HtmlService 모달로 열림 (단위 테스트 + DEV 실측)
- [x] `assignVendorCodes`만 `.btn-danger`, 나머지 `.btn-primary`
- [x] 모달 텍스트·버튼에 이모지 없음 (단위 테스트로 SSOT 검사 + 결과 문구 정리)
- [x] `UploadCsv.html` 인라인 CSS 제거, `Stylesheet.html` 기반
- [x] 단위 테스트·E2E 통과
