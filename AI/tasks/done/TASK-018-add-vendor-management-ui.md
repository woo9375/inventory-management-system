# TASK-018: 웹앱 거래처 관리 화면 신설

## Objective
스프레드시트에 신설된 "🤝 거래처관리" 시트의 데이터를 웹앱에서 직접 조회하고 편집(CRUD)할 수 있는 전용 화면(탭)과 API를 구축한다.

## Confirmed Facts
- 선행 Task(TASK-017)에서 "🤝 거래처관리" 시트(13열) 및 `SHEET_VENDORS`, `VENDOR_COLS` 상수 생성이 완료되었다.
- 삭제 제약: 품목 마스터(S열)에서 사용 중인 거래처는 물리적으로 삭제할 수 없으며, 논리 삭제(사용여부="미사용" 처리)만 허용된다.
- 화면은 `admin-only` 탭으로 추가되나, 조회 API(`getVendors`)는 다른 모듈(추후 품목 관련 화면 등)에서도 사용할 수 있도록 모든 로그인 유저에게 개방된다.
- `src/JS_Master.html`은 사장된 파일이므로 재사용하지 않고 `src/JS_Vendor.html`을 신규 생성한다.

## Business Context
- 현재 거래처 관리는 스프레드시트에서 수동으로 이뤄지고 있으며, 웹앱에서 이를 통합 관리하여 접근성을 높이고 입력 오류(중복 등록, 사용 중 거래처 삭제 등)를 사전에 방지하고자 한다.
- 거래처코드는 사용자가 임의로 입력하는 것이 아니라 서버에서 `VND-001` 등의 패턴으로 자동 채번하여 무결성을 유지한다.

## Requirements

### Functional
**1. UI/화면**
- [ ] `Index.html`의 사이드바에 '🤝 거래처 관리' 탭(`id="navVendor"`) 추가 (`admin-only` 클래스 부여).
- [ ] `Index.html` 메인 콘텐츠 영역에 표 형태의 CRUD 레이아웃(`id="tab-vendor"`) 컨테이너 추가.
  - 표 컬럼: 거래처코드, 거래처명, 약어명, 사업자번호, 대표자명, 전화, 사용여부, 관리(수정·삭제 버튼).
  - 검색: 거래처명, 약어명, 사업자번호 부분 일치 검색 기능 및 사용여부(전체/사용/미사용) 필터.
- [ ] 신규 등록 / 수정 모달 UI 작성 (나머지 속성인 업태, 업종, 주소, 이메일, 비고 입력란 포함).
  - 신규 등록 모달 진입 시 '거래처코드'는 읽기 전용(서버 자동 채번)으로 처리.
- [ ] 하단 `<?!= include('JS_Vendor') ?>` 추가 및 `JS_Vendor.html` 스크립트 작성.

**2. API (WebApp.gs & VendorService.gs)**
- [ ] `WebApp.gs`에 `getVendors`, `addVendor`, `updateVendor`, `deleteVendor` 공개 래퍼 함수 추가.
- [ ] `VendorService.gs` 신규 생성 및 아래 기능 구현:
  - `getVendors(token)`: 모든 로그인 사용자 호출 가능. `CacheManager` 연동.
  - `addVendor(token, data)`: `admin` 권한 체크. 거래처명 중복 거부. 거래처코드 자동 채번 로직 포함.
  - `updateVendor(token, code, data)`: `admin` 권한 체크. 거래처명 중복 거부(자기 자신 제외).
  - `deleteVendor(token, code)`: `admin` 권한 체크. "🗂️ 품목 마스터" S열(`MASTER_COLS.VENDOR_CODE`) 참조 여부 확인 후, 사용 중일 시 "사용여부를 미사용으로 바꾸세요"라는 에러 메시지와 함께 거절. 미사용 시 물리적 행 삭제 처리.
  - 쓰기(Add/Update/Delete) 성공 시 `CacheManager.invalidateAll()` 호출.

### Non-Functional
- 기존 `BaseDataService`의 토큰 검증 및 에러 처리 패턴을 동일하게 따른다.

## Constraints
- **진입점 필수 준수**: `Index.html`에 사이드바 버튼(`showTab('vendor')`), 컨테이너(`<div id="tab-vendor">`), 스크립트 포함(`include('JS_Vendor')`) 3가지를 반드시 추가해야 화면이 정상 노출된다.
- **사장 파일 활용 금지**: `src/JS_Master.html` 수정 금지.
- 입출고 화면 내 거래처 필터나 품목 마스터 편집 화면 기능은 본 Task의 범위 밖이다.

## Files to Inspect
- `src/Index.html`
- `src/WebApp.gs`
- `src/BaseDataService.gs` (권한 체크 및 캐시 무효화 패턴 참고)
- `src/Config.gs` (`MASTER_COLS.VENDOR_CODE` 확인용)

## Files to Modify
- **`src/Index.html`**
  - [NEW] `<button id="navVendor" class="nav-item admin-only" onclick="showTab('vendor', this)">...` 사이드바 탭 추가.
  - [NEW] `<div id="tab-vendor" class="tab-content">...` 탭 본문 영역 추가.
  - [NEW] `<div id="vendorModal" ...>` 신규 등록 및 수정 모달용 HTML 구조 추가.
  - [NEW] `<?!= include('JS_Vendor') ?>` 추가.

- **`src/WebApp.gs`**
  - [NEW] 외부 접근 함수 추가 (e.g. `getVendors(token)`, `addVendor(token, data)` 등).

## Files to Create
- **`src/VendorService.gs`**
  - 거래처 목록 조회, 추가(자동 채번/중복 검사), 수정, 삭제(품목 참조 검사) 로직 캡슐화.
- **`src/JS_Vendor.html`**
  - 프론트엔드 상태 관리 및 렌더링 스크립트 (`loadVendors()`, 모달 핸들링, 검색/필터 등).

## Test Plan
- **Unit Test**: `VendorService.gs` 삭제 API 호출 시 가짜 품목 마스터(S열 거래처코드 존재) 세팅 후 거부(Reject)되는지 모킹 테스트 확인.
- **E2E Test**:
  - Admin 로그인 후 거래처 관리 탭 노출 확인. Staff 로그인 시 탭 미노출 확인.
  - 신규 거래처 등록 후 "🤝 거래처관리" 시트에 잘 반영되는지 확인(자동 채번 로직).
  - 품목 마스터에서 이미 사용 중인 거래처를 웹앱에서 삭제 시도 시 안내 메시지 팝업 여부 확인.

## Final Report

### 명세에 대한 피드백 (구현 전 검토)

**1. 명세대로 래퍼를 만들면 무한 재귀가 된다 (가장 위험)**
명세는 `WebApp.gs`에 `getVendors`/`addVendor`/`updateVendor`/`deleteVendor`를 만들고
`VendorService.gs`에도 같은 기능을 두라고 적었다. 그런데 GAS는 모든 `.gs`가 **전역 스코프 하나**를 공유한다.
양쪽에 같은 이름의 함수 선언이 있으면 나중에 로드된 쪽이 조용히 이기고,
`function getVendors(t) { return getVendors(t); }` 가 되어 첫 호출에서 스택이 터진다.

이 저장소는 이미 답을 갖고 있다 — 계정 관리가 `createUser` ↔ `createUserAccount`로 이름을 갈라 둔다.
같은 방식으로 구현부를 `getVendorList` / `addVendorRecord` / `updateVendorRecord` / `deleteVendorRecord`로 두고,
공개 이름 4개는 `WebApp.gs`에만 남겼다. (테스트로 실제 호출해 재귀가 없음을 확인한다)

**2. `<div id="vendorModal">`은 이 앱의 구조와 어긋난다**
`Index.html`에는 이미 공용 모달(`#modalOverlay` + `#modalTitle`/`#modalBody`/`#modalFooter`)이 있고,
업장·시즌·계정·월마감이 전부 `openModal(title, body, footer)` 하나로 띄운다.
전용 모달을 새로 만들면 닫기·오버레이·포커스 동작이 두 벌로 갈라진다. 공용 모달을 그대로 썼다.

**3. 진입점이 3개가 아니라 4개다 (명세 누락)**
Constraints는 사이드바 버튼·컨테이너·`include` 3가지를 "반드시"라고 못박았지만,
그것만으로는 **탭이 빈 채로 열린다.** `JS_UI.html`의 `showTab()`이 탭별로 로더를 호출하는 구조라
(`if (tabId === 'basedata') loadBaseData();`) 거래처도 여기 한 줄이 있어야 목록이 뜬다.
`JS_UI.html`은 Files to Modify에 없지만 한 줄 추가했다.

**4. `invalidateAll()`을 부르는 것만으로는 거래처 캐시가 지워지지 않는다 (명세 누락)**
명세는 "쓰기 성공 시 `CacheManager.invalidateAll()` 호출"이라고만 적었다.
그런데 `invalidateAll`은 지울 키를 **손으로 나열**한다(`ITEM_MASTER_DATA`, `CONFIG_DATA`, …).
새 캐시를 만든 쪽이 그 목록에 키를 보태지 않으면, invalidateAll을 아무리 불러도
TTL 60초가 끝날 때까지 낡은 목록이 화면에 남는다. 등록 직후 새 거래처가 안 보이는 증상이 된다.

키를 `CACHE_KEYS`(Config.gs)에 넣고 `invalidateAll`이 그것을 지우게 했다.
`VendorService.gs`에 상수를 두고 `CacheManager.gs`가 그 이름을 부르는 형태는 피했다 —
파일 하나가 빠지는 순간 `invalidateAll`이 통째로 터지는 결합이 생긴다(테스트에서 실제로 재현됐다).

**5. 거래처 시트에서 `getLastRow()`는 신뢰할 수 없다 (명세 누락)**
TASK-017이 13열 폼 밖 **숨김 O열**에 드롭다운 소스 FILTER 수식을 심어 뒀다.
수식 셀도 "내용 있는 행"이라 거래처가 0건이어도 `getLastRow()`가 3을 돌려준다.
그 값으로 추가 위치를 정하면 **첫 거래처가 3행을 건너뛰고 4행에 앉는다.**
권위 있는 기준은 언제나 A열(거래처코드)이므로 `_lastVendorRow()`를 두고 추가·수정·삭제가 모두 그것을 쓴다.

**6. 행 삭제가 드롭다운 소스 수식을 함께 날린다 (명세 누락)**
`deleteRow(3)`은 그 행의 **모든 열**을 지운다 — O3에 있던 FILTER 수식까지.
그러면 품목 마스터의 거래처 드롭다운이 통째로 빈다. 삭제 직후 `applyVendorsFormatting()`을 불러
수식이 없거나 어긋났을 때만 다시 세우게 했다(멱등).

**7. 마이그레이션 전 시트에서는 "사용 중" 판정 자체가 틀린다 (명세 누락)**
삭제 가부는 품목 마스터 S열(`MASTER_COLS.VENDOR_CODE` = 18)을 읽어 정한다.
그런데 v17 이전 구조에서 인덱스 18은 거래처코드가 아니라 **과세구분** 열이다.
그 값을 믿으면 언제나 "참조 없음"이 나오고, 사용 중인 거래처가 그대로 지워진다.
판정 불가를 "참조 없음"으로 뭉개지 않고 **삭제를 거절**하도록 했다(TASK-017의 `_isMasterSchemaCurrent` 재사용).

**8. `escapeHtml()`은 큰따옴표를 이스케이프하지 않는다**
`textContent → innerHTML` 방식이라 `&`, `<`, `>`만 막는다.
기존 코드가 쓰는 자리는 전부 텍스트 위치라 문제가 없었지만, 폼을 `value="..."`로 만들면
거래처명에 `"` 하나만 들어가도 속성이 그 자리에서 닫혀 마크업이 깨진다.
폼은 값 없는 HTML로 만들고 `fillVendorForm()`이 `.value`로 채운다.

### 구현 내용

**`src/VendorService.gs`** (신규)
- `getVendorList(token)` — 전 로그인 사용자. `CACHE_KEYS.VENDOR_LIST` 캐시. 미사용 거래처도 함께 반환
  (화면의 사용여부 필터가 클라이언트에서 걸린다)
- `addVendorRecord(token, data)` — admin. 거래처명 중복 거부(공백·대소문자 정규화), 코드 자동 채번
- `updateVendorRecord(token, code, data)` — admin. 자기 자신 제외 중복 검사. **거래처코드는 고정**
- `deleteVendorRecord(token, code)` — admin. 품목 참조 시 거절(`inUse: true` + 막고 있는 품목 목록), 아니면 물리 삭제
- 쓰기 3종은 `LockService`로 잠근다 — 채번과 중복 검사가 "읽고 나서 쓴다"라 동시 등록 시 같은 번호가 나간다

**채번 규칙**: 기존 코드 중 **최대 번호 + 1**. "행 개수 + 1"이 아니다 —
중간 행이 지워지면 이미 쓰인 번호가 다시 나오고, 코드는 품목 마스터가 붙들고 있는 참조 키라
재사용되면 남의 거래처를 가리키게 된다.

**`src/JS_Vendor.html`** (신규)
- 목록을 한 번 받아 `vendorState.all`에 두고 검색·필터는 클라이언트에서 건다(수백 건 규모)
- 표 렌더링은 `document.createElement` + `textContent` — 기존 `renderConfig`/`renderDashboard`와 같은 방식
- 등록·수정이 같은 폼을 공유하고 `vendorState.editingCode` 유무로 갈린다
- **삭제 거절은 토스트로 흘리지 않는다.** 어떤 품목이 막고 있는지와 다음 행동을 모달에 남기고,
  거기서 곧바로 '미사용으로 변경'(논리 삭제)으로 넘어갈 수 있게 했다

**`src/Index.html`** — 사이드바 탭(`#navVendor`, admin-only), 본문(`#tab-vendor`), `include('JS_Vendor')`
**`src/WebApp.gs`** — 공개 래퍼 4종
**`src/JS_UI.html`** — `showTab`에 거래처 로더 한 줄
**`src/Config.gs` / `src/CacheManager.gs`** — `CACHE_KEYS.VENDOR_LIST` 추가 및 무효화 대상 편입

### 명세와 다르게 처리한 점

1. **구현부 함수명을 공개 이름과 다르게 뒀다** — 피드백 1. 같은 이름이면 무한 재귀다.
2. **`#vendorModal`을 만들지 않고 공용 모달을 썼다** — 피드백 2.
3. **`JS_UI.html`을 수정했다** — Files to Modify에 없지만 없으면 탭이 빈 채로 열린다(피드백 3).
4. **`Config.gs`/`CacheManager.gs`를 수정했다** — 캐시 무효화가 실제로 동작하게 하려면 필요하다(피드백 4).

### 테스트 결과

**단위 테스트 — 전체 통과 (12개 파일)**
`tests/unit/vendor-service.test.js` 신규 (31개 검증). 실제 `src/*.gs`를 vm에 로드해 CRUD를 끝까지 돌린다.

| 축 | 내용 |
|----|------|
| 조회 | 빈 시트 안전, staff 개방, 미인증 거절 |
| 등록·채번 | VND-001부터 증가, 13열 기록, **중간 번호가 비어도 재사용 안 함**, 이름 중복(공백·대소문자 포함) 거부 |
| 권한 | staff·manager는 쓰기 3종 전부 차단 |
| 수정 | 필드 갱신, 자기 이름 중복 오탐 없음, 타 거래처명 거부, **코드 불변**, 미사용 전환 |
| 삭제 | **품목 사용 중이면 거절**(품목코드·대안 안내 포함, 시트 보존), 미사용이면 물리 삭제, **삭제 후 O열 FILTER 수식 생존** |
| 안전장치 | v17 이전 구조에서 판정 불가 → 삭제 거절 |
| 래퍼 | 공개 4종 존재 + 실제 호출로 무한 재귀 없음 확인 |

**모킹 보강**: `tests/unit/lib/gas-sheet-mock.js`에 `deleteRow`와 **실제로 값을 보관하는 CacheService**를 추가했다.
no-op 캐시로는 "캐시에 담겼는가 / 쓰기 후 비워졌는가"를 검증할 수 없어 피드백 4를 놓칠 뻔했다.

**E2E (DEV) — 15 passed / 5 skipped / 0 failed** (전체 스위트)
`tests/e2e/vendor-management.spec.js` 신규 5건 중 2건 통과, 3건 스킵.

- ✅ admin 로그인 시 거래처 탭 노출 + 목록 로드
- ✅ 신규 등록 시 **서버 자동 채번**(`VND-\d{3,}` 확인) — 만든 거래처는 테스트가 지워 DEV를 원상복구한다
- ⏭️ 중복 등록 거절 / 검색·필터 / 삭제 제약 3건은 **DEV 거래처 시트가 비어 있어** 스킵된다
  (TASK-017의 Human 작업인 59건 붙여넣기가 아직이다. 스킵 사유가 리포트에 그대로 찍힌다)

이전에 실패하던 `basedata-excel.spec.js`도 이번엔 통과했다(인증 프로필이 만들어진 것으로 보인다).

**E2E 작성 중 스스로 잡은 문제**: 처음 쓴 삭제 제약 테스트는 "사용 중인 거래처를 찾을 때까지 삭제를 시도"하는
방식이었다. 이러면 **사용 중이 아닌 거래처는 실제로 지워져** DEV의 실 데이터가 사라진다.
`getItemMasterData` 응답의 `vendorCode`(TASK-017에서 추가)를 읽어 사용 중인 코드를 **읽기만으로** 찾도록 다시 썼다.

### 미완료 — Human QA 필요

1. **거래처 59건 입력** (TASK-017에서 이월된 Human 작업). 시트에 직접 붙여넣거나 이제 웹앱 화면에서 등록 가능.
   입력 후 E2E를 다시 돌리면 스킵된 3건이 실제로 검증된다.
2. **staff 계정으로 로그인해 거래처 탭이 안 보이는지 육안 확인** — `admin-only` 클래스는 `JS_Auth.html`이
   일괄 제어하므로 코드상 다른 admin 탭과 동일하나, 계정을 바꿔 가며 도는 E2E는 이번 범위에 없다.
3. 품목이 사용 중인 거래처 삭제 시도 → 안내 모달 및 '미사용으로 변경' 동작 확인.
4. Production 배포 승인.

### 변경 파일

| 파일 | 내용 |
|------|------|
| `src/VendorService.gs` | **신규** — 거래처 CRUD, 채번, 참조 검사 |
| `src/JS_Vendor.html` | **신규** — 목록/검색/필터/모달 프런트엔드 |
| `src/Index.html` | 사이드바 탭 · 본문 · include |
| `src/WebApp.gs` | 공개 래퍼 4종 |
| `src/JS_UI.html` | `showTab` 거래처 로더 |
| `src/Config.gs` | `CACHE_KEYS.VENDOR_LIST` |
| `src/CacheManager.gs` | 무효화 대상에 거래처 캐시 편입 |
| `tests/unit/vendor-service.test.js` | **신규** (31 검증) |
| `tests/unit/lib/gas-sheet-mock.js` | `deleteRow`, 실동작 CacheService 보강 |
| `tests/e2e/vendor-management.spec.js` | **신규** (5건) |

### 배포 후 필수 절차

Production은 **v17 마이그레이션이 끝난 뒤에** 이 화면을 열어야 한다.
거래처관리 시트가 없으면 목록 API가 "마이그레이션을 먼저 실행하세요"를 돌려주고,
삭제는 참조 판정이 불가능하다는 이유로 거절된다(데이터는 안전하지만 기능이 동작하지 않는다).
