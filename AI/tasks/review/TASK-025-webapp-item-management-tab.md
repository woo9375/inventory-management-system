# TASK-025: 웹앱 '품목 관리' 탭 신설

## Objective
스프레드시트에서 직접 수정하던 품목 마스터 관리 경로를 웹앱 `품목 관리` 탭(`tab-items`)으로 일원화한다. 구매팀(manager) 및 관리자(admin)가 브라우저에서 품목 목록을 검색·조회하고, 신규 품목 등록, 품목 수정(저장 전 diff 미리보기 및 변경사유 필수), 사용유무 전환(미사용/재사용), 9열 변경이력 조회, CSV 일괄 업로드(사전 파싱·미리보기·백업 연동)를 수행할 수 있도록 UI와 클라이언트 로직을 구축한다.

---

## Confirmed Facts
실제 코드를 읽어 확인된 사실과 라인 번호는 다음과 같다:

1. **사이드바 내비게이션 및 진입점 현황 (`src/Index.html`)**:
   - 94~108행: 사이드바의 관리 탭들(`navShop`, `navSeason`, `navUser`, `navBaseData`, `navVendor`)은 전부 `.admin-only` 클래스가 부여되어 있어 admin에게만 노출되고 manager에게는 숨겨짐.
   - 479~529행: `거래처 관리` 탭(`#tab-vendor`)이 신규 탭의 UI 템플릿 구조를 제공함 (카드, 필터 바, 데이터 테이블, 페이징).
   - 608~614행: 하단 스크립트 include 목록(`JS_Auth`, `JS_UI`, `JS_Tx`, `JS_Config`, `JS_BaseData`, `JS_Vendor`).
   - 현재 품목 관리를 위한 웹앱 탭(`tab-items`)과 스크립트(`JS_Items`)는 존재하지 않음.

2. **역할 권한 제어 (`src/JS_Auth.html`)**:
   - 132~147행: `applyRolePermissions()`에서 `isAdmin = currentUser.role === 'admin'`, `isManager = currentUser.role === 'manager'`를 정의하고, `document.querySelectorAll('.admin-only').forEach(function(el) { el.hidden = !isAdmin; })`로 관리 탭을 숨김.
   - 143~146행: `if (currentUser.role === 'staff') { var masterActions = document.getElementById('masterActions'); if (masterActions) masterActions.hidden = true; }` — 사장된 구 품목 화면(`JS_Master.html`)의 잔재 코드가 남아 있음.

3. **내비게이션 및 탭 전환 (`src/JS_UI.html`)**:
   - 5~24행: `showTab(tabId, navEl)` 함수가 탭 활성화 클래스를 교체함.
   - 11행: `if (tabId === 'master') loadItemMaster();` — 사장된 `master` 탭 호출 잔재가 남아 있음.
   - 21행: `if (tabId === 'vendor') loadVendors();` — 거래처 탭 전환 시 데이터 로드 패턴.

4. **아이콘 스프라이트 (`src/Icons.html`)**:
   - 10~19행: 사이드바 및 페이지 제목용 Lucide 아이콘 스프라이트 정의.
   - 현재 품목 관리에 적합한 `package` 아이콘(`i-package`)은 정의되어 있지 않아 신규 추가 필요.

5. **거래처 UI 참조 패턴 (`src/JS_Vendor.html`)**:
   - 9~10행: 25건 점진 페이징 (`VENDOR_PAGE_SIZE = 25`, `visibleCount`).
   - 31~43행: 클라이언트 검색어 및 상태 필터링 (`filteredVendors`).
   - 62~75행: "더 보기" 버튼 렌더링 (`renderVendorMore`).
   - 148~278행: 모달 폼 HTML 생성, 값 주입, 저장 (`openAddVendorModal`, `openEditVendorModal`, `submitVendor`).
   - 284~346행: 확인 모달을 통한 논리 삭제 및 상태 변경 (`confirmDeleteVendor`, `markVendorUnused`).

6. **파일 업로드 파싱 패턴 (`src/JS_Tx.html`)**:
   - 463~484행: `readBulkFile(file, cb)` — `FileReader`를 통한 ArrayBuffer 읽기 및 SheetJS(`XLSX.read`) 파싱.
   - 486~493행: `decodeBulkCsv(buf)` — UTF-8 디코딩 실패 시 EUC-KR(CP949)로 자동 전환 디코딩.
   - 506~518행: 헤더 매핑 및 행별 검증 패턴.

7. **시스템 작업 정의 및 테스트 (`src/Config.gs`, `tests/unit/system-commands-config.test.js`)**:
   - `src/Config.gs:260-273`: `SYSTEM_ACTIONS.uploadItemCsv`의 `scope`가 `"sheet"`로 설정되어 있음. 웹앱에서 안내 문구를 재사용하기 위해 `"both"`로 변경 필요.
   - `tests/unit/system-commands-config.test.js:24-27`: `EXPECTED_SCOPE.uploadItemCsv`가 `'sheet'`로 단언되어 있어 갱신 필요.
   - `src/WebApp.gs:124-128`: `runSystemCommand`는 admin 전용이므로, manager가 사용하는 품목 CSV 업로드는 `google.script.run.uploadItemMasterCSV(token, dataRows)`를 직접 호출해야 함.

8. **Step 2.5 진입점 역추적 게이트 (신규 진입점 생성 증빙)**:
   - 본 Task는 웹앱 화면의 **신규 진입점을 생성**하는 작업이다.
   - 진입점 신설 3개 지점:
     1) `src/Index.html`: 사이드바 `<nav class="sidebar-nav">` 내 `#navItems` 버튼 추가
        `[신규 진입점 증빙: src/Index.html:108 다음 라인 (<button id="navItems" class="nav-item admin-manager-only" onclick="showTab('items', this)">)]`
     2) `src/Index.html`: 메인 콘텐츠 내 `#tab-items` 컨테이너 추가
        `[신규 진입점 증빙: src/Index.html:529 다음 라인 (<div id="tab-items" class="tab-content">)]`
     3) `src/Index.html`: 하단 스크립트 include 추가
        `[신규 진입점 증빙: src/Index.html:614 다음 라인 (<?!= include('JS_Items') ?>)]`

9. **선행 조건**:
   - TASK-024(품목 API 정비, 변경이력 헬퍼, 유효성 검증, 스키마 v19)가 선행 완료되어 있어야 본 UI가 호출할 백엔드 API가 준비됨.

---

## Hypotheses
- 품목 마스터의 전체 품목 수는 일반적으로 수백~1,000건 미만이므로, `getItemMasterData(token, { includeDisabled: true })`로 최초 1회 전체 데이터를 가져와 클라이언트(`itemState.all`)에 보관하고 검색·필터링·페이징(25건)을 처리하면 서버 왕복 없이 빠르고 반응성 높은 UI를 제공할 수 있다.
- 모달 내 드롭다운(카테고리, 단위, 거래처)은 기초데이터 및 거래처 목록 API(`getVendors`)를 재사용하여 모달 오픈 시 동적으로 옵션을 구성할 수 있다.

---

## Business Context
- 구글 스프레드시트의 직접 편집으로 인한 데이터 오염(수식 손상, 셀 오타, 중복 코드, 서식 깨짐)을 원천 차단하기 위해, 구매팀 실무자는 시트 뷰어로만 접근하고 모든 마스터 관리는 웹앱 `품목 관리` 탭에서 수행한다.
- 실무자(manager) 및 관리자(admin)만 접근 가능해야 하며, 일반 업장 직원(staff)에게는 메뉴 자체가 노출되지 않아야 한다.
- 품목코드는 입출고 원장의 고유 식별자이므로 **절대 수정 불가**하며, 삭제 또한 허용되지 않고 **'미사용' 전환(논리 삭제)**만 가능하다.
- 품목 정보 수정 시 사용자의 실수를 막기 위해 변경 전/후 diff를 미리 보여주고 변경사유를 필수로 입력받아야 한다.

---

## Current System
- 웹앱에 품목 관리 화면이 전혀 없다. (과거 `src/JS_Master.html`이 있었으나 include되지 않고 버려진 사장 파일임).
- 구매팀 담당자는 스프레드시트 `🗂️ 품목 마스터` 시트에 직접 입력·수정하고 있어 입력 검증이 시트 데이터 확인 드롭다운에만 의존하며, 실수로 수식 열이나 다른 셀을 건드릴 위험이 상존한다.
- CSV 일괄 등록 또한 스프레드시트 커스텀 메뉴("📤 품목마스터 CSV 업로드")를 통해서만 가능하여 시트 편집 권한이 요구된다.

---

## Root Cause / Diagnostic Logic
- 해당 없음 (신규 웹앱 화면 구축).

---

## Requirements

### Functional
- [ ] **사이드바 메뉴 및 권한 게이팅 (`src/Index.html`, `src/JS_Auth.html`, `src/Icons.html`)**:
  - `src/Icons.html`에 Lucide `package` 아이콘 심볼(`<symbol id="i-package" ...>`) 추가.
  - `src/Index.html` 사이드바 내 `거래처 관리`(`navVendor`) 다음 위치에 `품목 관리`(`navItems`) 버튼 추가:
    - 아이콘: `#i-package`, 텍스트: "품목 관리".
    - 권한 클래스: `.admin-manager-only` (또는 동등 클래스).
  - `src/JS_Auth.html` `applyRolePermissions()` 수정:
    - `.admin-manager-only` 요소를 찾아 `!(isAdmin || isManager)`인 경우 `hidden = true` 처리 (staff 차단, admin 및 manager 허용).
    - 구 사장 코드(`masterActions` 참조) 정리.
  - `src/JS_UI.html` `showTab()` 수정:
    - `if (tabId === 'items') loadItems();` 추가.
    - 레거시 잔재인 11행 `if (tabId === 'master') loadItemMaster();` 제거.

- [ ] **메인 콘텐츠 컨테이너 (`src/Index.html`)**:
  - `tab-vendor` 컨테이너 하단에 `<div id="tab-items" class="tab-content">` 추가.
  - 헤더: 타이틀(`<h2><svg class="ico"><use href="#i-package"/></svg>품목 관리</h2>`), 총 건수 뱃지 (`#itemCount`).
  - 액션 버튼 영역:
    - [CSV 업로드] (`.btn-outline btn-sm`, 클릭 시 CSV 업로드 모달 오픈)
    - [신규 품목 등록] (`.btn-primary btn-sm`, 클릭 시 추가 모달 오픈)
  - 필터 바 카드:
    - 검색창 (`#itemSearch`, 품목명 · 품목코드 부분일치 실시간 검색).
    - 카테고리 필터 (`#itemCategoryFilter`, '전체' + 기초데이터 카테고리 목록).
    - 사용유무 필터 (`#itemUsageFilter`, 기본값 `'사용'`, 옵션: `'전체'`, `'사용'`, `'미사용'`).
  - 데이터 테이블:
    - 컬럼: 품목코드(`.mono`), 품목명, 카테고리, 규격, 단위, 거래처(`.mono`), 과세구분(`.ctr`), 매입단가(`.num`), 사용유무(`.ctr`), 관리(`.ctr`).
    - 엠프티 스테이트: 검색 결과 없을 시 `i-inbox` 아이콘 + 안내 문구.
  - 25건 점진 페이징 ("더 보기" 버튼, `ITEM_PAGE_SIZE = 25`).

- [ ] **신규 클라이언트 모듈 (`src/JS_Items.html`)**:
  - **상태 관리**:
    - `var itemState = { all: [], editingCode: null, visibleCount: 25, categories: [], units: [], vendors: [] };`
  - **데이터 로드 (`loadItems()`)**:
    - `google.script.run.getItemMasterData(getToken(), { includeDisabled: true })` 호출 (TASK-024 확장 API).
    - 기초데이터(`getBaseData`) 및 거래처(`getVendors`)를 함께 로드하거나 캐시하여 필터 드롭다운 및 모달에 바인딩.
  - **목록 렌더링 및 필터링 (`renderItems()`, `filteredItems()`)**:
    - 검색어, 카테고리, 사용유무 필터 결합 필터링.
    - 정렬: 사용 품목 우선, 동일 상태 내 코드 순.
    - 상태 뱃지: 사용(`.status-badge.normal`), 미사용(`.status-badge.muted`).
    - 행별 액션 버튼:
      - [수정] (`i-pencil` 아이콘, 클릭 시 수정 모달 오픈)
      - [이력] (`i-clock` 아이콘, 클릭 시 9열 이력 모달 오픈)
      - 상태 전환: 현재 '사용'이면 [미사용](`.text-danger`), '미사용'이면 [재사용](`.text-primary`).

- [ ] **품목 등록 모달 (`openAddItemModal()`)**:
  - `openModal('품목 등록', ...)` 호출.
  - 입력 폼:
    - 품목코드 (`#itemCode`, 필수, 영문/숫자/기호, 중복 불가 안내)
    - 품목명 (`#itemName`, 필수)
    - 카테고리 (`#itemCategory`, 드롭다운, 필수)
    - 규격 (`#itemGrade`, 텍스트, 선택)
    - 단위 (`#itemUnit`, 드롭다운, 필수)
    - 거래처 (`#itemVendorCode`, 드롭다운, 사용 중인 거래처 목록, 선택)
    - 과세구분 (`#itemTaxType`, 드롭다운: '과세' / '비과세', 기본값: '과세')
    - 초기재고 (`#itemInitStock`, 숫자, 기본값: 0)
    - 매입단가 (`#itemUnitPrice`, 숫자, 기본값: 0)
    - 리드타임 / 안전재고일수 / 목표유지일수 (각각 기본값 3 / 5 / 30 플레이스홀더 표시)
    - 사유 (`#itemAddReason`, 텍스트, 선택 입력, 기본 "신규 등록")
  - 유효성 검사: 코드/품목명 공백 차단, 카테고리/단위 미선택 차단.
  - [등록] 클릭 시 `google.script.run.addNewItem(token, itemData)` 호출 → 완료 시 목록 재로드 및 토스트.

- [ ] **품목 수정 및 Diff 미리보기 모달 (`openEditItemModal(code)`)**:
  - 품목 데이터 로드 후 폼에 바인딩.
  - **품목코드는 읽기 전용(`readonly`)** 처리.
  - [저장] 클릭 시 즉시 쓰지 않고 **"변경 내용 확인" 2단계 diff 모달** 표시:
    - 원본 데이터와 입력 데이터 비교하여 실제 변경된 필드 추출.
    - 변경된 필드가 없으면 "변경된 내용이 없습니다" 토스트 알림 후 모달 유지.
    - 변경된 필드가 있는 경우:
      - 표: `필드명 | 변경 전 | 변경 후` 테이블 렌더링.
      - **변경사유 필수 입력 필드 (`#itemEditReason`)**: 사유가 비어 있으면 [최종 저장] 버튼 비활성화 또는 경고.
    - [최종 저장] 클릭 시 `google.script.run.updateItem(token, code, updates)` 호출 (updates에 `reason` 포함).

- [ ] **사용유무 전환 (미사용 / 재사용)**:
  - **미사용 전환**:
    - [미사용] 클릭 시 확인 모달 표시.
    - **변경사유 필수 입력** (`#disableReason`).
    - [미사용 처리] 클릭 시 `google.script.run.disableItemMaster(token, code, reason)` 호출.
  - **재사용 전환**:
    - [재사용] 클릭 시 확인 모달 표시.
    - **변경사유 필수 입력** (`#enableReason`).
    - [재사용 처리] 클릭 시 `google.script.run.updateItem(token, code, { usageStatus: '사용', reason: reason })` 호출.

- [ ] **변경이력 모달 (`openItemChangelogModal(code)`)**:
  - `google.script.run.getItemChangelog(token, code)` 호출.
  - 모달 테이블: 변경일시, 변경자, 변경필드, 변경 전, 변경 후, **변경사유(H열)**, **경로(I열: 웹앱/CSV/시트편집)**.
  - 최신순 정렬 표시. 이력이 없으면 빈 상태 안내.

- [ ] **CSV 일괄 업로드 카드/모달 (`openItemCsvUploadModal()`)**:
  - 안내 문구: `SYSTEM_ACTIONS.uploadItemCsv`의 SSOT 문구(desc, bullets) 바인딩.
  - 파일 선택: `.csv`, `.xlsx`, `.xls` 파일 수용 (`JS_Tx.html`의 `readBulkFile` / `decodeBulkCsv` 파서 패턴 재사용).
  - 클라이언트 사전 검증 및 파싱:
    - 필수 컬럼(품목코드, 품목명) 검사.
    - 기존 마스터에 존재하는 품목코드 판별 (중복 건너뜀 대상).
    - 신규 등록 대상 건수, 건너뜀 건수, 오류(카테고리 미등록 등) 건수 집계.
    - 미리보기 화면 렌더링:
      - 요약 칩: 신규 N건, 건너뜀 M건, 오류 K건.
      - 오류가 있으면 오류 상세 목록 노출 및 업로드 진행 차단.
  - [업로드 실행] 클릭 시:
    - `runSystemCommand`를 타지 않고 `google.script.run.uploadItemMasterCSV(token, dataRows)`를 직접 호출 (manager 권한 호환).
    - 성공 시 결과 메시지 표시 및 목록 재로드.
  - `src/Config.gs`: `SYSTEM_ACTIONS.uploadItemCsv.scope`를 `"sheet"`에서 `"both"`로 변경.
  - `tests/unit/system-commands-config.test.js`: `uploadItemCsv` scope 기대값 갱신.

- [ ] **문서 동기화 (`Docs/Architecture.md`, `Docs/UIGuidelines.md`)**:
  - `Docs/Architecture.md` 갱신:
    - 사이드바 탭 목록에 `items` 추가.
    - include 목록에 `JS_Items` 추가.
    - "품목 마스터는 웹앱 화면이 없다"는 과거 기술 내용을 "웹앱 품목 관리 탭에서 전담"으로 개정.

### Non-Functional
- [ ] **Docs/UIGuidelines.md 엄격 준수**:
  - 인라인 `style=` 속성 절대 금지.
  - 이모지 사용 금지, `Icons.html`의 Lucide SVG 스프라이트만 사용.
  - 버튼 높이 40px, 소형 32px 통일. 한 화면/카드당 솔리드 블루(`.btn-primary`) 버튼 1개 원칙.
  - 1280~1440px PC 최적화 및 1024/768px 반응형 깨짐 방지.
- [ ] **대량 품목 클라이언트 성능**:
  - 25건 점진 페이징을 통해 DOM 노드 과다 생성을 방지하고 빠른 초기 렌더링 보장.
- [ ] **XSS 방어**:
  - 사용자 입력 텍스트 바인딩 시 `.textContent` 또는 `escapeHtml()`을 철저히 적용하여 마크업 깨짐 및 주입 방어.

---

## Constraints
- **기존 역할 권한 체계 유지**:
  - `.admin-only`의 의미를 임의로 약화시키지 말고, admin과 manager가 공용 접근하는 요소는 `.admin-manager-only` 클래스를 신설하여 통제할 것.
- **CLAUDE.md 및 코딩 규칙**:
  - 프론트엔드 ES6+ 지원 브라우저 기준 바닐라 JS 작성 (불필요한 외부 라이브러리 추가 금지, 기존 SheetJS/XLSX 활용).
  - Production 직접 배포 금지 (DEV 환경 테스트 후 QA).
- **사장 파일 `src/JS_Master.html` 복원 금지**:
  - 사장 파일인 `src/JS_Master.html`을 되살리지 말고, 깨끗한 새 파일 `src/JS_Items.html`을 생성할 것.

---

## Files to Inspect
- `src/Index.html`: 사이드바, 탭 컨테이너, 스크립트 include 구조.
- `src/JS_Vendor.html`: 목록 렌더링, 필터, 페이징, 모달 폼, 논리 삭제 패턴.
- `src/JS_Auth.html`: `applyRolePermissions` 역할별 표시/숨김 제어.
- `src/JS_UI.html`: `showTab`, 모달 유틸리티(`openModal`, `closeModal`).
- `src/JS_Tx.html`: `readBulkFile`, `decodeBulkCsv` 파일 파서 로직.
- `src/Icons.html`: Lucide 스프라이트 아이콘 정의.
- `src/Config.gs`: `SYSTEM_ACTIONS.uploadItemCsv` 정의.
- `Docs/UIGuidelines.md`: UI 디자인 시스템 SSOT.
- `Docs/Architecture.md`: 시스템 아키텍처 및 탭 구조.
- `tests/e2e/vendor-management.spec.js`: E2E 테스트 참조 패턴.

---

## Files to Modify
- `src/Index.html`:
  - 사이드바 내 `navItems` 버튼 추가.
  - `#tab-items` 탭 컨테이너 추가.
  - 하단 `<?!= include('JS_Items') ?>` 추가.
- `src/Icons.html`: Lucide `i-package` 심볼 추가.
- `src/JS_Auth.html`: `.admin-manager-only` 권한 제어 로직 추가 및 레거시 코드 정리.
- `src/JS_UI.html`: `showTab` 내 `tabId === 'items'` 분기 추가 및 구 `master` 분기 삭제.
- `src/Config.gs`: `SYSTEM_ACTIONS.uploadItemCsv.scope`를 `"both"`로 변경.
- `tests/unit/system-commands-config.test.js`: `uploadItemCsv` scope `"both"` 테스트 단언 갱신.
- `Docs/Architecture.md`: 탭 목록 및 프론트엔드 구성 갱신.

---

## Files to Create
- `src/JS_Items.html`: 품목 관리 탭의 전체 프론트엔드 UI/UX 및 클라이언트 스크립트.
- `tests/unit/items-client-logic.test.js`: 품목 필터링, diff 계산, 클라이언트 유효성 검사 등 순수 로직 단위 테스트.
- `tests/e2e/items-management.spec.js`: 품목 관리 탭 E2E 테스트 (Playwright).

---

## Implementation Plan
1. **아이콘 및 인덱스 뼈대 구축 (`src/Icons.html`, `src/Index.html`)**:
   - `Icons.html`에 `i-package` 스프라이트 추가.
   - `Index.html` 사이드바에 `#navItems` 버튼 추가 (`.admin-manager-only`).
   - `Index.html`에 `#tab-items` 마크업 작성 (헤더, 건수 뱃지, 액션 버튼, 필터 바, 데이터 테이블).
   - `Index.html` 하단에 `<?!= include('JS_Items') ?>` 추가.
2. **역할 권한 및 라우팅 정비 (`src/JS_Auth.html`, `src/JS_UI.html`)**:
   - `JS_Auth.html`의 `applyRolePermissions`에 `.admin-manager-only` 처리 추가 (`!(isAdmin || isManager)` 시 `hidden = true`).
   - `JS_UI.html`의 `showTab`에 `items` 탭 로딩 연동 및 구 `master` 코드 제거.
3. **시스템 액션 설정 갱신 (`src/Config.gs`, 단위 테스트)**:
   - `SYSTEM_ACTIONS.uploadItemCsv.scope`를 `"both"`로 변경.
   - `tests/unit/system-commands-config.test.js`의 단언을 `"both"`에 맞게 갱신.
4. **품목 클라이언트 로직 구현 (`src/JS_Items.html`)**:
   - 상태 객체 정의 및 `loadItems()` 구현 (기초데이터/거래처/품목 API 병렬 또는 순차 호출).
   - `renderItems()`, `filteredItems()`, `showMoreItems()` 구현 (25건 페이징, 카테고리/사용유무 필터, 검색).
   - 품목 등록 모달: 폼 렌더링, 유효성 검증, `addNewItem` 호출.
   - 품목 수정 모달: 1단계 폼 수정 → 2단계 diff 미리보기 모달(사유 필수) → `updateItem` 호출.
   - 사용유무 전환: 미사용 전환(사유 필수) / 재사용 전환(사유 필수).
   - 이력 모달: `getItemChangelog` 호출 후 9열 테이블(변경사유, 경로 포함) 렌더링.
   - CSV 업로드 카드/모달: `readBulkFile` 기반 파일 읽기 → 헤더/행 사전 검증 → 미리보기(신규/건너뜀/오류) → `uploadItemMasterCSV` 직접 호출.
5. **테스트 작성 및 검증**:
   - `tests/unit/items-client-logic.test.js` 작성 및 통과 확인.
   - `tests/unit/system-commands-config.test.js` 통과 확인.
   - DEV 배포(`npm run dev:push`) 후 Playwright E2E(`tests/e2e/items-management.spec.js`) 수행.

---

## Migration Plan
- 시트 구조 변경 없음 ("해당 없음").
- 기존 데이터 손상 위험 없음.

---

## Test Plan

### Unit Test
- `tests/unit/system-commands-config.test.js`:
  - `SYSTEM_ACTIONS.uploadItemCsv`의 scope가 `"both"`인지 검증.
- `tests/unit/items-client-logic.test.js` (신규):
  - **diff 계산 로직**: 변경되지 않은 객체와 변경된 객체 간의 정확한 diff 목록 추출 검증.
  - **클라이언트 필터링**: 검색어(코드/품목명 부분일치), 카테고리 일치, 사용유무 일치 필터링 함수 검증.
  - **CSV 파싱 및 사전 분류**: 신규 코드와 기존 코드 집합 간의 신규/건너뜀 분류 로직 검증.

### E2E Test (Playwright)
- `tests/e2e/items-management.spec.js` (신규):
  1. **권한별 탭 노출 검증**:
     - `manager` 계정 로그인 시 사이드바에 '품목 관리' 탭 표시 확인.
     - `staff` 계정 로그인 시 사이드바에 '품목 관리' 탭 미표시(`hidden`) 확인.
  2. **조회 및 필터링**:
     - 품목 관리 탭 진입 시 기본 25건 렌더링 및 건수 뱃지 확인.
     - 검색창에 특정 품목명 입력 시 실시간 필터링 확인.
     - 사용유무 필터('전체', '사용', '미사용') 전환 동작 확인.
  3. **신규 품목 등록**:
     - [신규 등록] 모달 열기 → 기초데이터 카테고리/단위 드롭다운 바인딩 확인.
     - 필수 항목 입력 후 등록 → 목록에 즉시 추가 노출 확인.
  4. **품목 수정 (Diff 및 사유 필수)**:
     - 등록된 품목의 [수정] 클릭 → 값 변경 후 [저장] 클릭.
     - diff 미리보기 모달 표시 확인 (변경된 필드, 이전값, 새값).
     - 사유 미입력 시 저장 불가 확인 → 사유 입력 후 최종 저장 → 반영 확인.
  5. **변경이력 조회**:
     - 해당 품목의 [이력] 클릭 → 모달에 등록 이력 및 수정 이력(변경사유, 경로 '웹앱') 노출 확인.
  6. **사용유무 전환**:
     - [미사용] 클릭 → 사유 입력 → 미사용 상태 변경 확인 (기본 목록에서 사라짐).
     - 사용유무 필터를 '미사용'으로 변경 → [재사용] 클릭 → 사유 입력 → 정상 복구 확인.
  7. **CSV 일괄 업로드**:
     - CSV 업로드 모달 열기 → 테스트 CSV 파일 선택.
     - 신규/건너뜀 건수 미리보기 확인 → 실행 → 완료 메시지 및 목록 갱신 확인.
  8. **기존 E2E 회귀 테스트**:
     - `npm run test:e2e` 실행하여 기존 시나리오 깨짐 없음 확인.

---

## Regression Risk
- `SYSTEM_ACTIONS.uploadItemCsv`의 scope 변경("sheet" → "both"):
  - 시트 관리자 메뉴 대화상자(`AdminActionDialog.html`)는 scope가 "sheet" 또는 "both"인 액션을 표시하므로 기존 시트 메뉴 동작에 영향 없음.
- `showTab` 내 구 코드 정리:
  - 11행 `tabId === 'master'`는 사장된 코드였으므로 제거해도 기존 탭에 영향 없음.
- `.admin-manager-only` 신설:
  - 기존 `.admin-only` 요소들의 동작을 변경하지 않고 신규 클래스로만 manager를 추가 수용하므로 기존 관리자 탭 보안에 영향 없음.

---

## Acceptance Criteria
- [x] 사이드바에 '품목 관리' 탭이 추가되고, admin과 manager에게 노출되며 staff에게는 숨겨짐.
- [x] 품목 목록이 25건씩 점진 렌더링되며, 검색·카테고리·사용유무 필터가 정상 동작함.
- [x] 신규 품목 등록이 성공하고 필수값 및 도메인 검증이 수행됨.
- [x] 품목 수정 시 품목코드는 수정 불가이며, 변경 전 diff 미리보기와 변경사유 입력 후 저장됨.
- [x] 품목 미사용 및 재사용 전환이 사유 입력과 함께 정상 동작함.
- [x] 변경이력 모달에서 변경사유(H열)와 유입경로(I열)가 포함된 9열 이력이 최신순으로 표시됨.
- [x] CSV 업로드 시 클라이언트 사전 검증, 미리보기(신규/건너뜀/오류) 확인 후 실행됨.
- [x] `Docs/UIGuidelines.md`의 UI 규칙(이모지 금지, 인라인 스타일 금지, 색상/버튼 위계)을 준수함.
- [x] `tests/unit/items-client-logic.test.js` 및 `tests/e2e/items-management.spec.js`가 100% 통과함.
- [x] DEV 실측 스크린샷(1440px / 768px)이 검증됨.

---

## Human Approval Required
- **DEV 환경 구매팀(manager) 역할 계정 QA 승인**:
  - 구매팀 실제 시나리오(신규 품목 등록, 단가/거래처 수정, CSV 업로드, 이력 확인)에 대한 사용자 확인.
- **Production 배포 전 계정 생성 안내**:
  - 프로덕션 배포 전, 관리자가 웹앱 '계정 관리' 탭에서 구매팀 담당자의 manager 계정을 먼저 생성해야 함.

---

## Deployment Notes
- 선행 작업인 TASK-024가 배포 및 마이그레이션 완료된 상태여야 함.
- 프론트엔드 및 시스템 액션 변경 사항을 DEV에 푸시(`npm run dev:push`) 후 E2E 테스트 및 Human QA 진행.

---

## Rollback Plan
- Git 커밋 되돌리기 (`git revert`) 및 clasp dev push.
- `Index.html`의 신규 탭 마크업 및 `JS_Items.html` 파일 제거.

---

## Final Report
*(Claude Code · 2026-09-14 · DEV 배포 `npm run dev:push` 완료, 로컬 커밋 · Production 미배포)*

### 0. 명세와 다른 설계 결정 — 서버 페이징 (Human 승인 2026-09-14)

명세의 Hypotheses("수백~1,000건 미만이므로 전체를 클라이언트에 보관")는 DEV 실측과 맞지 않았다 — 마스터는 **4,296행**이고
`getItemMasterData(includeDisabled)`는 콜드 1.8~5.3초 + 약 2MB 전송(2.6초)이다(TASK-027 벤치마크). 사용자 질의("4,300건이 웹앱에
올라가는 구조인가")에 따라 **서버 페이징**으로 바꿨고 사용자가 승인했다.

| 명세 | 구현 |
|---|---|
| `getItemMasterData(token,{includeDisabled:true})`로 전체 로드 → `itemState.all` 클라이언트 필터 | `queryItems(token,{q,category,usage,page,pageSize:25,withCatalog})` → `{total,totalAll,page,items,catalog?}`. 검색·필터·정렬은 서버(인덱스 캐시 `ITEM_INDEX`) |
| 25건 점진 렌더("더 보기") | 같은 UX — "더 보기"가 다음 page를 받아 뒤에 붙인다 |
| CSV 클라이언트 사전 분류(기존 코드 판별) | 클라이언트는 형식만 검사, **서버 dryRun**(`uploadItemMasterCSV(rows,{dryRun:true})`)이 신규/건너뜀/오류를 판정 — 전체 코드 목록을 내려받지 않는다 |
| `loadItems()`가 `getBaseData`+`getVendors`도 호출 | 탭 진입 **왕복 1회** — `withCatalog:true`면 카테고리·단위·사용 중 거래처를 같이 싣는다 |

### 1. 구현 요약

| 요구사항 | 구현 | 근거 |
|---|---|---|
| 사이드바·권한 | `#navItems`(`.admin-manager-only`) — admin·manager 노출, staff 숨김. `.admin-only` 의미 불변. `applyRolePermissions`의 사장 `masterActions` 코드 제거 | `src/Index.html`, `src/JS_Auth.html`, `src/Stylesheet.html` `.admin-manager-only[hidden]` |
| 아이콘 | Lucide `package` 심볼 추가 | `src/Icons.html` |
| 라우팅 | `showTab('items')` → `loadItems()`, 사장 `master` 분기 삭제 | `src/JS_UI.html` |
| 탭 마크업 | 헤더(제목·건수 뱃지 `#itemCount`·[CSV 업로드] outline) · 카드(캡션 `#itemQueryState`·[신규 품목 등록] primary 1개) · 필터 바(검색 wide, 카테고리, 사용유무 기본 '사용') · 10열 테이블 · 엠프티 스테이트 | `src/Index.html` `#tab-items` |
| 목록 | `queryItemsPage(page)` — 검색 350ms 디바운스, `reqSeq`로 늦은 응답 폐기, 캡션에 "검색 중…"/현재 필터 표시, 뱃지 "N건"/"N / M건", `#itemMoreWrap` 더 보기. 행: 코드·거래처 mono, 단가 num, 과세/사용유무/관리 ctr, 사용/미사용 pill, [수정][이력][미사용/재사용] | `src/JS_Items.html` |
| 등록 모달 | 폼 12필드 + 사유(선택). 카테고리·단위·거래처는 카탈로그 드롭다운, 숫자는 기본값 플레이스홀더(ITEM_UI). 클라이언트 필수값·숫자 검증 → `addNewItem` → 응답 `item`을 목록 맨 위에 끼움(재조회 없음) | `openAddItemModal`, `submitAddItem`, `applyItemPatch` |
| 수정 + diff | 코드 readonly. [저장] → `computeItemDiff`(숫자 3=="3", 빈 숫자=기본값) → 없으면 토스트·모달 유지 / 있으면 **변경 내용 확인** 모달(필드·변경 전(취소선)·변경 후·사유 필수, `#btnItemSaveConfirm` 사유 전까지 disabled, [뒤로]는 입력값 유지) → `updateItem(code, updates+reason)` → 응답 `item`으로 행 교체 | `submitEditItem`, `openItemDiffModal`, `submitItemUpdate` |
| 사용유무 전환 | [미사용] → 사유 필수 모달(`#disableReason`, `btn-danger`) → `disableItemMaster(code, reason)`; [재사용] → `#enableReason` → `updateItem({usageStatus:'사용', reason})`. 필터에 안 맞게 되면 목록에서 뺀다 | `openItemUsageModal`, `submitItemUsage` |
| 변경이력 | `getItemChangelog` 9열 → 변경일시·변경자·변경필드·전·후·**변경사유**·**경로**(웹앱 primary / CSV order / 시트편집 muted pill), 최신순, 빈 상태 | `openItemChangelogModal` |
| CSV 업로드 | 안내(SYSTEM_ACTIONS.uploadItemCsv SSOT 문구 + 열 규칙 표) → [양식 다운로드](XLSX) → 파일 선택(`#itemCsvFile`, JS_Tx `readBulkFile` 재사용, 제목 행 별칭 매핑/고정 순서) → 형식 검사(코드·품목명·숫자·과세) → 서버 dryRun → 미리보기(칩 신규/건너뜀/오류, 상위 20건, 건너뜀 코드) → `uploadItemMasterCSV(rows)` → 완료 모달 → `loadItems(true)`. 상한 `ITEM_CSV_MAX_ROWS`(1,000) | `openItemCsvUploadModal` ~ `runItemCsvUpload` |
| Config | `SYSTEM_ACTIONS.uploadItemCsv` scope `both`·`requiresAdmin:false`·주의사항 문구를 실제 동작(사전 검증·자동 백업)에 맞게 개정. 상수 `ITEM_QUERY_PAGE_SIZE`·`ITEM_QUERY_MAX_PAGE_SIZE`·`ITEM_CSV_MAX_ROWS`, `CACHE_KEYS.ITEM_INDEX`(+`CACHE_INVALIDATE_KEYS`), `getItemUiConfigJson()`(Index.html이 `ITEM_UI`로 주입 — 필드 라벨·기본값·과세/사용유무·페이지 크기·CSV 상한) | `src/Config.gs` |
| 서버 API | `queryItems`(staff 거부, 인자 정규화, 필터·정렬·slice), `getItemCatalog`, `_getItemIndex`(캐시 미스 시 마스터 1회 스캔, **필드 순서 고정 배열로 압축 저장** — 청크 10→4개), `_refreshItemIndexAfterWrite`(등록: 이전 인덱스에 끼움 / 수정: 읽어 둔 마스터로 재구성), `addNewItem`·`updateItem`·`disableItemMaster` 응답에 `item`, `uploadItemMasterCSV(token, rows, {dryRun})` + `_classifyCsvRows` 공유 + 행 수 상한 | `src/ItemService.gs` |
| 문서 | Architecture(사장 파일 표·진입점 9탭/7스크립트·품목 관리 흐름·캐시 키), UIGuidelines(아이콘 매핑 `package`, 서버 문구 이모지 제거 규칙), CodingRules §10(서버 페이징·쓰기 후 인덱스 재구성), tests/e2e/README | `Docs/*.md` |

### 2. 검증

- `npm test` — **21개 파일 전체 통과**. 신규 `tests/unit/item-query.test.js` **24건**(상수 3 · 조회 10 · 인덱스 캐시 6 · CSV dryRun 5), `tests/unit/items-client-logic.test.js` **13건**(JS_Items.html `<script>`를 vm에서 그대로 실행 — 조회 인자·diff·폼 검증·CSV 헤더/행 정규화·폴백 상수 일치). `system-commands-config.test.js` 기대값 갱신(uploadItemCsv both / requiresAdmin false).
- Playwright `tests/e2e/items-management.spec.js` **5/5 통과**(DEV, 9/14): ① admin 탭 노출·25건·더 보기 50건·검색·사용+미사용=전체 ② 생애주기 등록(필수값 차단 포함) → 변경 없음 거절 → 단가 diff(1,000→2,500)·사유 전 disabled·[뒤로] 값 유지 → 저장 → 이력 2건(매입단가·사유·웹앱 pill, 신규 등록) → 미사용(사유) → 미사용 필터에서 재사용 → 사용 확인 ③ CSV 형식 오류 거절 → 신규 2·건너뜀 1 미리보기 → 등록 완료 "2건 신규 등록, 1건 무시" → 검색 반영·비과세 ④ 임시 manager: 탭 노출·admin 전용 숨김·목록 열림 / 임시 staff: 탭 숨김 + `queryItems` API 거부 ⑤ 768px 세로 가로 오버플로우 0.
- 전체 E2E 회귀 — `npx playwright test` **27 passed / 6 skipped**(월마감 게이트 2·perf 2·거래처 삭제 제약 1 = 기존 skip, + 품목 목록 테스트 1건이 이 실행에서 첫 조회 결과가 비어 skip — 단독 재실행은 통과. 조회 실패를 skip으로 삼키지 않도록 테스트를 고쳐(토스트에 실패/오류가 있으면 fail) 다시 확인함). 기존 스펙 회귀 없음.
- 벤치마크(`E2E_PERF=1`, 9/14 오후 — 이날 플랫폼이 오전보다 느려 왕복 바닥 1,244ms): 

| API | cold(ms) | warm 중앙값(ms) | 비고 |
|---|---|---|---|
| getSessionUser (왕복 바닥) | - | 1,060~1,244 | 이날 플랫폼 기준선 |
| **queryItems page 1 + catalog** | 5,414~7,832 | **1,305~1,660** | 웜 = 왕복 바닥 + 인덱스 getAll(4청크) + 응답 ≈10KB |
| **queryItems 검색** | 4,940~6,055 | **1,193~1,400** | 검색어당 1회(디바운스) |
| getItemMasterData (명세 방식, 전체 4,296건) | 5,319~5,814 | 2,343~2,843 | 응답 ≈2MB — 탭 진입마다 이 비용이었을 것 |
| getItemCodes / searchItemCodes (기존) | 3,457~4,888 / 2,846~3,453 | 1,374~1,447 / 984~1,153 | 참고 |

콜드는 마스터 1회 스캔(다른 콜드 경로와 같은 비용)이고, 등록·수정 직후에는 서버가 인덱스를 다시 채워 두므로 목록 갱신이 콜드로 떨어지지 않는다(단위 테스트 [2]절). 인덱스를 배열로 압축 저장해 캐시 청크를 10 → 4개로 줄였다(콜드 put 6회 절감).

### 3. DEV 실측 스크린샷 (UIGuidelines §7) — `AI/audits/UI-AUDIT-001/after/TASK-025/`

| 폭 | 캡처 |
|---|---|
| 1440 | `D01-items-1440`(목록 25건·필터·뱃지 4292/4293) `D02-items-add-modal-1440` `D03-items-diff-modal-1440`(취소선 전값·사유·[최종 저장]) `D04-items-history-modal-1440`(9열·경로 pill) `D05-items-csv-guide-1440` `D06-items-csv-preview-1440`(칩·미리보기·건너뜀) |
| 768 세로 | `D07-items-768`(필터 1열, 표는 wrapper 안 가로 스크롤, 본문 오버플로우 0) |

인라인 `style=` 0건, 이모지 0건(서버 문구의 ✅·❌는 `itemMsg`로 제거), 솔리드 블루 화면당 1개([신규 품목 등록]; 모달은 각 1개).

### 4. 명세와 다른 점 / 판단

- **서버 페이징**(0절). `itemState.all`이 없으므로 명세의 `filteredItems()`·`renderItems()` 클라이언트 필터 대신 `queryItemsPage()`가 서버를 부른다. 단위 테스트 명세의 "클라이언트 필터링 검증"은 서버 `queryItems` 테스트로 옮겼다.
- `SYSTEM_ACTIONS.uploadItemCsv.requiresAdmin`을 `true → false`로 바꿨다(명세는 scope만). 웹앱에서 manager가 실행하므로 값이 사실과 맞아야 한다. `doSystemCommand`는 이 작업을 부르지 않으므로 동작 영향 없음. 주의사항 문구 2·3번도 TASK-024 이후의 실제 동작(사전 검증·자동 백업)으로 고쳤다 — 시트 대화상자(UploadCsv.html)에도 같은 문구가 보인다.
- `uploadItemMasterCSV`에 행 수 상한(`ITEM_CSV_MAX_ROWS`=1,000)을 새로 두었다 — 시트 메뉴 경로에도 적용된다.
- 목록 행의 거래처는 코드(mono)만 보이고 거래처명은 `title`(툴팁)로 둔다. 수정 모달·diff에서는 "코드 · 이름"으로 보인다.
- 수정 모달에서 현재 값이 드롭다운 목록에 없으면(미사용 거래처 등) "(현재 값)" 옵션으로 남겨 저장이 값을 몰래 바꾸지 않게 했다.
- CSV 미리보기 표·이력의 날짜/변경자/필드 열은 `nowrap`(모달 폭에서 두 줄로 꺾이지 않게).
- 등록/수정 후 목록을 다시 받지 않고 서버 응답 `item`으로 행만 고친다. 정렬 위치는 다음 조회(탭 재진입·필터 변경)에서 맞춰진다.

### 5. 남은 일 / 관찰

- **미사용 전환은 여전히 마스터 4천 행 정렬 되쓰기**(`_sortMasterByUsageStatus`)를 돌린다(E2E에서 전환 1회 ≈ 20~40초). 웹앱 목록이 사용/미사용 필터를 제공하므로 정렬 폐지는 TASK-024 §6에서 올린 Human 결정 사항 그대로다.
- CSV 미리보기 표에서 긴 코드는 가로 스크롤로 본다.
- DEV 마스터에 E2E가 만든 `ITEM-TEST-E2E-…` 품목(미사용 1건 + CSV 등록 2건/실행마다)이 남는다 — `resetDevEnvironment()`가 지운다.

### 6. Human QA 체크리스트 (DEV, 구매팀 시나리오)

| 항목 | 확인할 것 |
|---|---|
| manager 계정 | 계정 관리에서 구매팀 manager 계정 생성 → 로그인 시 사이드바에 「품목 관리」만 추가로 보이고 업장/시즌/계정/기초데이터/거래처는 숨김 |
| 목록·검색 | 탭 진입 1~2초 안에 25건, 검색어 입력 뒤 약 1.5초 안에 결과, 카테고리/사용유무 필터, 더 보기 |
| 등록 | 실제 코드 체계로 1건 등록 → 목록 맨 위 → 시트 `🗂️ 품목 마스터` 맨 아래 행 + `📋 변경이력` "신규 등록"(경로 웹앱) |
| 수정 | 단가·거래처 수정 → 변경 내용 확인 표 → 사유 없이는 [최종 저장] 비활성 → 저장 → 시트 값·이력(사유 H열) |
| 미사용/재사용 | 사유 입력 → 시트에서 해당 행이 맨 아래(미사용 블록)로 이동, 입출고 품목 검색에서 사라짐 → 재사용 시 복귀 |
| CSV | 양식 다운로드 → 2~3건 작성(기존 코드 1건 포함) → 미리보기 건너뜀 1 → 등록 → Drive `시스템_데이터_백업`에 "품목마스터_업로드전_…" 스냅샷 |
| 시트 직접 편집 | (비교용) 시트에서 값을 고치면 이력 경로가 "시트편집"으로 남는지 |

### 7. 배포 메모

- 시트 구조 변경 없음(마이그레이션 없음). TASK-024(v19)와 함께 배포한다 — v19 미적용 상태에서도 `_appendChangelog`가 열을 확보하므로 동작한다.
- Production 배포 전 관리자가 웹앱 「계정 관리」에서 구매팀 manager 계정을 만들어야 한다(Human Approval Required).
- Human QA 전이라 **push하지 않았다**(로컬 커밋만).
