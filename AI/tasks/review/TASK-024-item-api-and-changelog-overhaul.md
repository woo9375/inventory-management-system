# TASK-024: 품목 API 정비 — 변경이력 헬퍼 통합 · 검증 보강 · 이력 스키마 확장

## Objective
`🗂️ 품목 마스터` 쓰기 API(`addNewItem`, `updateItem`, `disableItemMaster`, `uploadItemMasterCSV`)의 서버 검증 규칙을 강화하고, 분산·누락되어 있던 변경이력 기록을 9열 스키마 기반 전용 헬퍼(`_appendChangelog`)로 일원화한다. `disableItemMaster`의 이력 누락 버그를 수정하고, 신규 등록·CSV 업로드 경로에도 이력 기록 및 사전 백업을 의무화하며, 마스터 쓰기와 이력 기록 간의 원자성을 보장한다.

---

## Confirmed Facts
실제 코드를 읽어 확인된 사실과 라인 번호는 다음과 같다:

1. **품목 마스터 백엔드 API 현황 (`src/ItemService.gs`)**:
   - `getItemMasterData(token)` (8~47행): `USAGE_STATUS === '미사용'`인 품목을 제외하고 반환(27행). 캐시 키 `ITEM_MASTER_DATA` 사용(13~14, 45행).
   - `getItemCodes(token)` (51~69행) 및 `searchItemCodes(token, query)` (74~102행): `USAGE_STATUS !== '미사용'` 조건으로 활성 품목만 필터링(65, 92행)하며, `searchItemCodes`는 상위 15건 반환(99행).
   - `addNewItem(token, itemData)` (106~159행): Staff 권한 차단(109행), LockService 적용(112~117행), 품목코드 중복 검증(127행). 그러나 카테고리·단위·거래처·과세구분·숫자 필드 검증이 전무하며, **변경이력을 기록하지 않음**.
   - `uploadItemMasterCSV(token, dataRows)` (165~273행): 신규 품목만 추가하고 기존 품목은 건너뜀(210~212행). 카테고리만 검증(214행)하며 단위·과세구분·거래처코드·숫자 검증 부재. **실행 전 스냅샷 백업 및 변경이력 기록이 누락**되어 있음. manager 호출 가능(168행: `session.role === 'staff'`만 거부).
   - `updateItem(token, itemCode, updates)` (277~377행): Staff 차단(280행), LockService 적용(283~288행). `colMap`(309~316행)과 `fieldNameMap`(319~323행)에 `usageStatus`가 누락되어 있음. `updates.reason` 필드를 받지 않으며, 365~370행에서 7열 인라인으로 `SHEET_CHANGELOG`에 기록.
   - `getItemChangelog(token, itemCode)` (382~411행): `SHEET_CHANGELOG` 3행 이하에서 7열만 고정 읽기(391행), 반환 객체에 `reason` 및 `route` 필드가 없음(397~405행).
   - `disableItemMaster(token, code)` (417~451행): Y열을 '미사용'으로 변경(437행), `_sortMasterByUsageStatus`(448행) 호출. 그러나 443행에서 `if (typeof logChange === "function")` 가드를 두고 있으나 `logChange` 함수는 `src/` 전체 어디에도 정의되어 있지 않아 **이력 기록이 항상 스킵되는 버그** 존재.
   - `processCsvUploadFromSheet(csvString)` (511~556행): 시트 모달에서 호출되며 `"SHEET_UI"` 토큰으로 `uploadItemMasterCSV` 호출(547행).

2. **시트 가드레일 및 onEdit 이력 (`src/Code.gs`)**:
   - `onOpen()` (12~24행): 20행에서 `addItem("📤 품목마스터 CSV 업로드", "menuOpenCsvUploadModal")` 등록.
   - `runAdminAction(actionId)` (62~90행): 83행에 `uploadItemCsv는 UploadCsv.html이 processCsvUploadFromSheet를 직접 부른다` 예외 분기.
   - `openCsvUploadModal()` (150~155행): `UploadCsv` 모달 표시.
   - `onEdit(e)` (210~322행): 235~322행에서 `SHEET_MASTER` 3행 이상 수정 시 변경이력을 7열 고정으로 기록(308~310행).

3. **시스템 설정 및 상수 (`src/Config.gs`)**:
   - 72행: `const SHEET_CHANGELOG = "📋 변경이력";`
   - 97행: `const CURRENT_SCHEMA_VERSION = 18;` (신규 마이그레이션은 v19부터 시작).
   - 260~273행: `SYSTEM_ACTIONS.uploadItemCsv` 정의 (`scope: "sheet"`, `requiresAdmin: true`).
   - 303~330행: `MASTER_COLS` (CODE: 0 ~ USAGE_STATUS: 24).
   - 331행: `const MASTER_COL_COUNT = 25;`

4. **시트 빌더 및 서식 검증 (`src/SheetBuilder.gs`)**:
   - 138~171행: `applyItemMasterFormatting`: 카테고리(`C3:C50`, 147행), 단위(`B3:B50`, 148행), 거래처(`_vendorActiveCodeRange`, 165행), 과세구분(`["과세", "비과세"]`, 168행), 사용유무(`["사용", "미사용"]`, 170행) 검증.
   - 622~637행: `buildChangelogSheet(ss)`: 7열 고정(A~G) 헤더 및 서식 생성.

5. **개발자 도구 및 백업 (`src/DevTools.gs`, `src/Archive.gs`)**:
   - `src/DevTools.gs`: 316~329행 `resetDevEnvironment`에서 `SHEET_CHANGELOG` 7열 고정 조회/정리(319, 325행).
   - `src/Archive.gs`: 53~61행 `backupToCSV()` 내 품목 마스터 백업 로직 존재 (`품목마스터_백업_${timestamp}.csv`).

6. **문서 현황 (`Docs/SheetSchema.md`, `Docs/BusinessRules.md`)**:
   - `Docs/SheetSchema.md`: 192~206행 `📋 변경이력 (SHEET_CHANGELOG)` 7열 스키마 (A: 변경일시, B: 변경자, C: 품목코드, D: 품목명, E: 변경필드, F: 변경 전, G: 변경 후).
   - `Docs/BusinessRules.md`: 221행(품목 마스터 수정: Admin/Manager만 가능, 변경이력 자동 기록), 232행(품목 삭제: 물리 삭제 없음, "미사용" 처리), 243행(품목 변경이력: SHEET_CHANGELOG 자동 기록).

7. **진입점 호출 경로 증빙 (Step 2.5 게이트)**:
   - `uploadItemMasterCSV` 진입점:
     `[진입점 호출 경로 증빙: src/Code.gs:20 (onOpen menuOpenCsvUploadModal) → src/Code.gs:150 (openCsvUploadModal) → src/UploadCsv.html:93 (processCsvUploadFromSheet) → src/ItemService.gs:511 (processCsvUploadFromSheet) → src/ItemService.gs:547 (uploadItemMasterCSV)]`
   - `onEdit` 마스터 편집 감지 진입점:
     `[진입점 호출 경로 증빙: src/Code.gs:210 (onEdit) → src/Code.gs:235 (sheetName === SHEET_MASTER && row >= 3)]`
   - `searchItemCodes` 활성 진입점:
     `[진입점 호출 경로 증빙: src/Index.html:84 (showTab('transactions')) → src/Index.html:528 (include('JS_Tx')) → src/JS_Tx.html:217 (searchItemCodes)]`
   - `getItemMasterData` 활성 진입점:
     `[진입점 호출 경로 증빙: src/Index.html:98 (showTab('basedata')) → src/Index.html:524 (include('JS_BaseData')) → src/JS_BaseData.html:233, 315 (getItemMasterData)]`
   - 사장 파일 확인: `src/JS_Master.html`은 `Index.html`에 include되지 않고 `tab-master`도 없는 사장 파일이다. `addNewItem`, `updateItem`, `disableItemMaster`, `getItemChangelog`는 현재 웹앱 진입점이 없으며, 본 Task(TASK-024)에서 백엔드를 정비한 후 차기 TASK-025에서 신규 웹앱 진입점을 개설한다.

8. **선행 조건**:
   - 현재 작업 트리에 TASK-023 관련 미커밋 변경사항이 review 단계에 머물러 있다. 본 Task는 **TASK-023이 커밋 및 병합 완료된 후** 착수한다.

---

## Hypotheses
- `getItemMasterData`를 웹앱 관리 화면에서 재사용할 때, 기존 호출부(`JS_BaseData.html` 등)의 동작(미사용 제외)을 깨지 않기 위해 옵션 객체 `{ includeDisabled: false }`를 두 번째 인자로 지원하거나, 전용 함수 `getAllItemMasterData(token)`를 신설하는 방안 중 기존 하위 호환성을 완벽히 보장하는 방식을 채택한다.
- GAS 환경에는 다중 시트 원자적 트랜잭션 rollback이 없으므로, ScriptLock 내에서 이력 쓰기를 먼저 수행하고 실패 시 마스터 쓰기를 중단하거나, 마스터 쓰기 전 이전 행 데이터를 백업하여 롤백하는 방식을 적용한다.

---

## Business Context
- `🗂️ 품목 마스터`는 재고 관리 시스템의 핵심 원장이다.
- 구매팀 담당자는 스프레드시트에 뷰어로만 접근하며, 모든 품목 등록·수정·비활성화·CSV 업로드는 웹앱 `manager` 계정으로 수행하게 된다.
- 시트 쓰기 경로는 "웹앱 API"와 "소유자 유지보수 편집" 둘뿐이므로, 웹앱 API 경로에서 입력 검증이 완벽해야 하며, 어떤 경로로든 발생한 변경은 누락 없이 감사 이력(`📋 변경이력`)에 남아야 한다.
- 상세 업무 규칙: `Docs/BusinessRules.md` 15. 데이터 수정, 16. 데이터 삭제, 17. 감사 이력.

---

## Current System
- 품목 등록(`addNewItem`)과 CSV 업로드(`uploadItemMasterCSV`)는 변경이력을 전혀 기록하지 않는다.
- 품목 비활성화(`disableItemMaster`)는 존재하지 않는 `logChange` 함수를 호출하려다 가드에 걸려 이력 기록이 완전히 누락된다.
- 품목 수정(`updateItem`)은 `SHEET_CHANGELOG`에 인라인으로 7열만 기록하며, 사유(`reason`)나 유입 경로(`route`)를 남기지 않는다. 또한 `usageStatus` 필드를 지원하지 않아 비활성화된 품목을 다시 '사용'으로 복구할 수 없다.
- 시트 `onEdit` 핸들러 역시 7열로만 기록한다.
- 서버 API는 카테고리 외에는 단위, 과세구분, 거래처코드, 수치 범위에 대한 유효성 검사를 수행하지 않아 잘못된 데이터가 시트에 저장될 위험이 있다.

---

## Root Cause / Diagnostic Logic
1. **비활성화 이력 누락 (`disableItemMaster`)**:
   `src/ItemService.gs:443`에서 `if (typeof logChange === "function")`으로 가드하고 있으나, 시스템 전체에서 `logChange`가 정의된 파일이 없음. 그 결과 `disableItemMaster` 호출 시 이력이 전혀 남지 않음.
2. **신규 등록 및 CSV 업로드 이력 누락**:
   초기 설계 당시 단일 셀 수정 위주(`updateItem`, `onEdit`)로만 이력을 작성하여 `addNewItem`과 `uploadItemMasterCSV`에는 이력 작성 코드가 구현되지 않았음.
3. **서버 측 도메인 유효성 검증 부재**:
   스프레드시트 내 데이터 유효성 검사 드롭다운(`applyItemMasterFormatting`)에만 의존하여, 웹앱 API를 통한 데이터 유입 시 검증이 누락됨.

---

## Requirements

### Functional
- [ ] **변경이력 공통 헬퍼 `_appendChangelog(records, options)` 신설**:
  - `records`: `[{ itemCode, itemName, fieldName, oldValue, newValue }]` 형태의 배열.
  - `options`: `{ reason, route, actor }` (`route` 값은 `'웹앱'` | `'CSV'` | `'시트편집'`).
  - 9열 스키마에 맞춰 한 번에 기록:
    - A열: 변경일시 (Date 또는 `yyyy-MM-dd HH:mm:ss`)
    - B열: 변경자 (`actor` 또는 세션 사용자명)
    - C열: 품목코드
    - D열: 품목명
    - E열: 변경필드
    - F열: 변경 전
    - G열: 변경 후
    - H열: 변경사유 (`reason`)
    - I열: 경로 (`route`)
  - `LockService.getScriptLock()`을 사용하여 동시 기록 충돌 방지 (대기 5~10초).
  - 3행 이후 append: `Math.max(changelogSheet.getLastRow() + 1, 3)`.
  - 서식: `COLORS.autoBg`, 가로 중앙정렬, A열 날짜 서식 적용.
- [ ] **기존 이력 기록부 교체**:
  - `updateItem`: 인라인 7열 기록부를 `_appendChangelog` 호출로 교체 (경로: `'웹앱'`).
  - `src/Code.gs` `onEdit`: 마스터 편집 블록(235~322행)의 인라인 기록부를 `_appendChangelog` 호출로 교체 (경로: `'시트편집'`, 사유: 단일셀 편집 시 `"(시트 직접편집)"`, 다중셀 시 `"(시트 붙여넣기/일괄편집)"`).
  - `disableItemMaster`: 사장된 `logChange` 가드를 제거하고 `_appendChangelog` 호출로 교체 (필드: `'사용유무'`, 구값: `'사용'`, 신값: `'미사용'`, 경로: `'웹앱'`, 사유: 전달받은 `reason` 또는 `"(품목 비활성화)"`).
- [ ] **API 유효성 검증 공통 헬퍼 `_validateItemFields(fields, options)` 신설**:
  - `options`: `{ partial: boolean }` (`updateItem` 시 일부 필드만 전달 가능).
  - 검증 규칙 (추가·수정·CSV 공통):
    - 품목코드: 공백 금지 (`!code || !code.trim()`), `partial=false` 시 중복 금지.
    - 품목명: 공백 금지 (`!name || !name.trim()`).
    - 카테고리: `📂 기초데이터` C열 목록에 존재해야 함 (`CacheManager` 또는 메모리 캐시 활용, 빈 값 불가).
    - 단위: `📂 기초데이터` B열 목록에 존재해야 함 (캐시 활용, 빈 값 불가).
    - 거래처코드: 빈 값 허용. 입력된 경우 `🤝 거래처관리` 사용 중(`USAGE_STATUS === '사용'`)인 코드여야 함.
    - 과세구분: `'과세'` 또는 `'비과세'` 중 하나.
    - 수치 필드 (`initStock`, `unitPrice`, `leadTime`, `safetyDays`, `targetDays`): 0 이상의 숫자여야 함 (음수 불가, 숫자로 변환 불가 시 오류). 빈 값일 경우 기본값 적용 (`initStock: 0`, `unitPrice: 0`, `leadTime: 3`, `safetyDays: 5`, `targetDays: 30`).
    - 사용유무 (`usageStatus`): `'사용'` 또는 `'미사용'` 중 하나 (기본값: `'사용'`).
  - 유효하지 않은 경우 `{ valid: false, message: "..." }` 반환.
- [ ] **마스터 행 추가 공통 로직 추출 `_appendMasterRow`**:
  - `addNewItem`과 `uploadItemMasterCSV`에서 공유.
  - 행 조립(`MASTER_COLS` 매핑), 중복 검사, 서식 행 확충 검사, 캐시 무효화 일원화.
- [ ] **`addNewItem` 보강**:
  - `_validateItemFields` 적용.
  - 성공 시 `_appendChangelog` 호출: 필드명 `'신규 등록'`, 구값 `'-'`, 신값 `itemData.name`, 경로 `'웹앱'`, 사유 `itemData.reason || '신규 등록'`.
- [ ] **`uploadItemMasterCSV` 보강**:
  - 실행 전 마스터 스냅샷 CSV를 Drive `시스템_데이터_백업` 폴더에 자동 백업 (`Archive.gs` 재사용, 파일명: `품목마스터_업로드전_<timestamp>.csv`).
  - 추가된 품목마다 `_appendChangelog`에 `'신규 등록'` 기록 (경로: `'CSV'`, 사유: `'CSV 일괄 등록'`).
  - 행별 `_validateItemFields` 적용하여 오류 행 발생 시 명확한 에러 목록 반환.
- [ ] **`updateItem` 보강**:
  - `updates.reason` 필수 검증 (사유가 없거나 공백이면 수정 거부).
  - 품목코드 변경 시도 차단 (`updates.code`가 기존 코드와 다르면 거부).
  - `usageStatus` 필드 매핑 추가: `'미사용'` ↔ `'사용'` 전환 지원 및 `_sortMasterByUsageStatus` 호출.
  - 실제 변경된 필드만 diff 감지하여 `_appendChangelog` 기록.
- [ ] **품목 목록 조회 확장 (`getItemMasterData`)**:
  - 기존 `getItemMasterData(token)` 호출부(미사용 제외)의 하위 호환성을 유지하면서, 관리 화면을 위해 미사용 품목을 포함할 수 있는 옵션(`getItemMasterData(token, { includeDisabled: true })`) 또는 별도 함수(`getAllItemMasterData(token)`) 제공.
- [ ] **`getItemChangelog` 9열 지원**:
  - `SHEET_CHANGELOG`에서 9열(A~I)을 읽어 반환 객체에 `reason`(H열), `route`(I열)를 포함.
  - `src/DevTools.gs:319, 325`의 7열 하드코딩을 9열로 갱신.
- [ ] **마스터 쓰기 - 이력 쓰기 간 원자성 보장**:
  - 동일한 `ScriptLock` 안에서 실행하며, 이력 기록 실패 시 마스터 쓰기 작업이 중단되거나 롤백되도록 보장.
- [ ] **마이그레이션 v19 (`src/Migration.gs`, `src/Config.gs`)**:
  - `CURRENT_SCHEMA_VERSION = 19` 상향.
  - `MIGRATIONS[19]`:
    - `📋 변경이력` 시트의 1행 타이틀 병합을 A1:I1으로 확장.
    - 2행 헤더 H2에 `"변경사유"`, I2에 `"경로"` 추가 및 헤더 서식 적용.
    - 기존 데이터 행의 H열, I열은 빈 값으로 처리.
    - 열 너비 설정 (H열: 160, I열: 100) 및 중앙 정렬 서식 적용.
  - `src/SheetBuilder.gs`: `buildChangelogSheet(ss)`를 9열 구조로 갱신.
  - `Docs/SheetSchema.md`: 9열 스키마 반영.

### Non-Functional
- [ ] GAS 6분 타임아웃 방지를 위한 Batch I/O (`getValues`, `setValues`) 원칙 준수.
- [ ] 데이터 수정 발생 시 `CacheManager.invalidateAll()` 누락 방지.
- [ ] CLAUDE.md 개발 규약 준수 (ES6, import/export 금지, camelCase 함수명).

---

## Constraints
- **기존 API 시그니처 유지**:
  - `addNewItem(token, itemData)`
  - `updateItem(token, itemCode, updates)`
  - `disableItemMaster(token, code)`
  - `getItemChangelog(token, itemCode)`
  - `uploadItemMasterCSV(token, dataRows)`
  - 기존 호출부의 동작을 깨뜨리지 않는 범위 내에서 확장할 것.
- **CLAUDE.md 절대 금지 수칙 준수**:
  - 프로덕션 배포/쓰기 금지 (DEV 환경에서만 검증).
  - import/export 구문 사용 금지.
  - 하드코딩 금지 (`Config.gs` 상수 활용).
- **시트 구조 변경 규칙**:
  - 시트 스키마 변경 시 반드시 `Migration.gs`에 멱등한 마이그레이션 함수를 작성하고 `Docs/SheetSchema.md`를 갱신할 것.

---

## Files to Inspect
- `src/ItemService.gs`: 품목 CRUD, CSV 업로드, 변경이력 조회 함수들.
- `src/Code.gs`: `onEdit` 내 품목 마스터 감사 로그 블록(235~322행).
- `src/Config.gs`: 스키마 버전, `MASTER_COLS`, `SYSTEM_ACTIONS`.
- `src/SheetBuilder.gs`: `applyItemMasterFormatting`, `buildChangelogSheet`.
- `src/Archive.gs`: CSV 백업 및 폴더 생성 로직.
- `src/Migration.gs`: 기존 마이그레이션(v17, v18) 패턴.
- `src/DevTools.gs`: `resetDevEnvironment` 내 변경이력 정리 로직.
- `tests/unit/onedit-changelog.test.js`: onEdit 테스트 구조.
- `tests/unit/vendor-service.test.js`: `gas-sheet-mock` 기반 서비스 단위 테스트 패턴.

---

## Files to Modify
- `src/Config.gs`: `CURRENT_SCHEMA_VERSION = 19` 상향.
- `src/ItemService.gs`:
  - `_appendChangelog`, `_validateItemFields`, `_appendMasterRow` 신설.
  - `addNewItem`, `uploadItemMasterCSV`, `updateItem`, `disableItemMaster`, `getItemChangelog`, `getItemMasterData` 수정.
- `src/Code.gs`: `onEdit` 내 마스터 변경이력 기록부를 `_appendChangelog`로 교체.
- `src/SheetBuilder.gs`: `buildChangelogSheet`를 9열 구조로 갱신.
- `src/Migration.gs`: `MIGRATIONS[19]` 구현.
- `src/DevTools.gs`: `resetDevEnvironment` 9열 반영.
- `Docs/SheetSchema.md`: `📋 변경이력` 스키마 H열(변경사유), I열(경로) 추가.
- `tests/unit/onedit-changelog.test.js`: 9열 구조 변경 반영.

---

## Files to Create
- `tests/unit/item-service.test.js`: 품목 API 검증, 신규 등록·수정·비활성화·CSV 업로드 이력 기록 및 9열 스키마 동작 단위 테스트.

---

## Implementation Plan
1. **스키마 정의 및 마이그레이션 v19 작성**:
   - `src/Config.gs`의 `CURRENT_SCHEMA_VERSION`을 19로 설정.
   - `src/Migration.gs`에 `MIGRATIONS[19]` 구현 (`📋 변경이력` H, I열 추가, 헤더 및 서식 재적용).
   - `src/SheetBuilder.gs`의 `buildChangelogSheet`를 9열(A~I)로 갱신.
   - `Docs/SheetSchema.md`에 H, I열 정의 추가.
2. **공통 헬퍼 구현 (`src/ItemService.gs`)**:
   - `_appendChangelog(records, options)`: ScriptLock 획득 → `SHEET_CHANGELOG` 마지막 행 탐색 → 9열 데이터 조립 → `setValues` 및 서식 적용.
   - `_validateItemFields(fields, options)`: 필수값, 카테고리/단위/거래처/과세/수치 도메인 규칙 검증.
   - `_appendMasterRow(itemData, actor, route)`: 단일 행 추가 공통 로직.
3. **API 함수 리팩토링 및 결함 수정 (`src/ItemService.gs`)**:
   - `disableItemMaster`: 사장된 `logChange` 가드 제거 → `_appendChangelog` 연동.
   - `addNewItem`: `_validateItemFields` 적용 → `_appendMasterRow` 호출 → `_appendChangelog` 연동.
   - `uploadItemMasterCSV`: 스냅샷 CSV 백업 → 행별 검증 → 일괄 추가 → 품목별 `_appendChangelog` 연동.
   - `updateItem`: `updates.reason` 필수 검증 → `usageStatus` 매핑 지원 → diff 계산 → `_appendChangelog` 연동.
   - `getItemChangelog`: 9열 읽기 및 객체 반환 필드 확장 (`reason`, `route`).
   - `getItemMasterData`: 미사용 포함 조회 옵션 또는 함수 확장.
4. **`onEdit` 및 `DevTools` 9열 정합성 갱신**:
   - `src/Code.gs`의 `onEdit` 품목 감사 블록에서 `_appendChangelog` 호출.
   - `src/DevTools.gs`의 `resetDevEnvironment`에서 7열을 9열로 갱신.
5. **단위 테스트 작성 및 실행**:
   - `tests/unit/onedit-changelog.test.js` 갱신.
   - `tests/unit/item-service.test.js` 신설 (`gas-sheet-mock` 활용하여 유효성 검증, 이력 기록, diff 계산 등 검증).

---

## Migration Plan
1. **대상**: `📋 변경이력` (`SHEET_CHANGELOG`) 시트.
2. **절차 (`MIGRATIONS[19]`)**:
   - 시트의 1행 타이틀 병합 범위를 `A1:I1`로 확장.
   - 2행 헤더에 H2: `"변경사유"`, I2: `"경로"` 추가.
   - 헤더 배경색(`COLORS.headerBg`), 글자색(`COLORS.headerText`), 굵게, 중앙 정렬 적용.
   - 열 너비 설정 (H열: 160, I열: 100).
   - 기존 3행 이상 데이터의 H열, I열은 빈 값 유지.
3. **멱등성**:
   - 이미 H2가 "변경사유"인 경우 헤더 추가를 건너뛰거나 안전하게 덮어씀.
4. **롤백**:
   - H, I열 삭제 후 `CURRENT_SCHEMA_VERSION`을 18로 복원.

---

## Test Plan

### Unit Test
- `tests/unit/onedit-changelog.test.js`:
  - 9열 스키마 생성 확인.
  - 단일 셀 편집 및 다중 셀 편집 시 `reason`과 `route`(`시트편집`)가 정상 포함되는지 검증.
- `tests/unit/item-service.test.js` (신규):
  - **`_validateItemFields`**: 카테고리/단위 미등록 값 거부, 거래처코드 유효성 검사, 과세구분 검사, 수치 범위(음수 차단) 검사, 품목코드 중복 검사.
  - **`addNewItem`**: 신규 등록 성공 시 마스터에 행 추가 및 변경이력에 `[신규 등록, -, 품목명, reason, '웹앱']` 기록 확인.
  - **`updateItem`**: `reason` 누락 시 거부, 품목코드 변경 시 거부, 실제 변경된 필드만 diff 이력 기록 확인, `usageStatus` '사용'↔'미사용' 변경 및 정렬 호출 확인.
  - **`disableItemMaster`**: 비활성화 시 이력에 `[사용유무, 사용, 미사용, reason, '웹앱']` 기록 확인 (`logChange` 결함 수정 검증).
  - **`uploadItemMasterCSV`**: 중복 품목 스킵, 신규 품목 추가 및 이력 기록 확인, 미등록 카테고리/단위 거부 확인.
  - **`getItemChangelog`**: 9열 데이터 정상 파싱 및 `reason`, `route` 반환 확인.

### E2E Test (Playwright)
- 본 Task는 백엔드 전용 API 작업이므로 신규 E2E 테스트는 작성하지 않는다. (차기 TASK-025에서 웹앱 UI와 함께 `tests/e2e/items-management.spec.js` 작성 예정).
- 기존 E2E 회귀 테스트 실행:
  - `npx playwright test tests/e2e/vendor-management.spec.js`
  - `npx playwright test tests/e2e/basedata-excel.spec.js`
  - `npx playwright test tests/e2e/negative-stock.spec.js`

---

## Regression Risk
- `getItemMasterData` 시그니처 변경 위험:
  - `JS_BaseData.html` 등 기존 화면이 `getItemMasterData(getToken())`를 호출하고 있으므로 기본 동작(미사용 제외)이 절대 변경되어서는 안 됨.
- `updateItem` 호출부의 `reason` 파라미터 요구:
  - 기존에는 `reason` 없이 호출되었을 수 있으나, 현재 활성 UI 진입점이 없으므로 차기 TASK-025 신규 화면 및 테스트에서 `reason`을 필수로 전달하도록 보장.
- `SHEET_CHANGELOG` 열 확장(7열 → 9열):
  - 기존 7열을 기대하고 읽는 코드가 있을 수 있으므로 `DevTools.gs`, `ItemService.gs` 전체를 점검하여 9열로 동기화.

---

## Acceptance Criteria
- [ ] `MIGRATIONS[19]`가 성공적으로 정의되고 `SHEET_CHANGELOG`가 9열(H: 변경사유, I: 경로)로 확장됨.
- [ ] `_validateItemFields`가 카테고리, 단위, 거래처, 과세구분, 수치 제약을 엄격히 검증함.
- [ ] `addNewItem` 실행 시 마스터 등록과 함께 `'웹앱'` 경로의 신규 등록 이력이 완결됨.
- [ ] `updateItem` 실행 시 `reason`이 필수이며, diff 필드만 `'웹앱'` 경로로 이력이 기록되고, `usageStatus` 변경이 지원됨.
- [ ] `disableItemMaster`의 `logChange` 미정의 버그가 수정되어 비활성화 이력이 정상 기록됨.
- [ ] `uploadItemMasterCSV` 실행 전 스냅샷 CSV 백업이 생성되고, 추가된 품목마다 `'CSV'` 경로 이력이 기록됨.
- [ ] `src/Code.gs`의 `onEdit` 마스터 블록이 `_appendChangelog`를 호출하여 `'시트편집'` 경로 이력을 남김.
- [ ] `tests/unit/item-service.test.js` 및 `tests/unit/onedit-changelog.test.js`가 100% 통과함.
- [ ] 기존 단위 테스트 및 E2E 테스트에서 회귀가 발생하지 않음.

---

## Human Approval Required
- 없음 (순수 백엔드 API 및 스키마 정비 작업).

---

## Deployment Notes
- 본 Task는 TASK-023이 리뷰 통과 후 메인 브랜치에 커밋된 뒤 진행한다.
- DEV 배포(`npm run dev:push`) 후 스프레드시트 메뉴에서 관리자 권한으로 마이그레이션(v19)을 실행하여 `📋 변경이력` 시트의 헤더를 9열로 확장한다.

---

## Rollback Plan
- 코드 롤백: Git 커밋 되돌리기 및 clasp push.
- 시트 롤백: `📋 변경이력` 시트의 H열과 I열 삭제, `ScriptProperties`의 `SCHEMA_VERSION`을 18로 복원.

---

## Final Report
*(Claude Code · 2026-09-14 · DEV 배포 `npm run dev:push` 완료, 로컬 커밋 · Production 미배포)*

### 1. 구현 요약

| 요구사항 | 구현 | 근거 |
|---|---|---|
| `_appendChangelog(records, {actor, route, reason, when})` | 9열 기록 한 곳. `updateItem`·`addNewItem`·`uploadItemMasterCSV`·`disableItemMaster`·`onEdit`이 전부 경유. 락은 잡지 않고 호출자의 ScriptLock 안에서 돈다(재진입에 기대지 않음). 변경이력 시트가 없으면 throw | `src/ItemService.gs` `_appendChangelog`, `src/Code.gs` onEdit 마스터 블록 |
| `logChange` 미정의 버그 | `disableItemMaster`를 `updateItem({usageStatus:"미사용", reason})` 위임으로 재작성 — 검증·이력·정렬이 같은 경로. 세 번째 인자 `reason` 선택(기본 "(품목 비활성화)"), 시그니처 `(token, code)` 호환 | `disableItemMaster` |
| `_validateItemFields(fields, {partial, catalog, existingCodes})` | 코드 공백/중복, 품목명, 카테고리(기초데이터 C열)·단위(B열) 필수+목록 검증, 거래처 빈 값 허용/사용중 코드만, 과세 `ITEM_TAX_TYPES`, 숫자 0 이상(빈 값 → `ITEM_NUMERIC_DEFAULTS`), 사용유무. 목록은 `_loadItemCatalog`가 호출마다 시트에서 읽는다(캐시 없음 — 기초데이터·거래처 수정 직후 낡은 목록으로 거절하는 결함 방지) | `_validateItemFields`, `_loadItemCatalog` |
| `_appendMasterRow` 추출 | `_buildMasterRow`(정규화 값 → 25열) + `_appendMasterRows`(A열 기준 마지막 행 탐색·행 확충·블록 쓰기). 중복 검사는 `_validateItemFields`의 `existingCodes`로 통일 | `_buildMasterRow`, `_findMasterLastRow`, `_existingMasterCodes`, `_appendMasterRows` |
| `addNewItem` | 검증 → 추가 → `신규 등록` 이력(경로 `웹앱`, 사유 `itemData.reason || "신규 등록"`) → 실패 시 행 되돌림. 응답에 `code` 추가 | `addNewItem` |
| `uploadItemMasterCSV` | 행별 검증(한 행이라도 실패 시 전체 중단, `errors[]` 반환) → **쓰기 전 `backupMasterSnapshot("업로드전")`**(실패 시 중단) → 추가 → 품목마다 `신규 등록` 이력(경로 `CSV`, 사유 "CSV 일괄 등록") → 실패 시 되돌림 → 서식·재계산. 응답에 `added`·`ignored`·`backupFile` 추가. 추가할 것이 없으면 백업도 하지 않는다 | `uploadItemMasterCSV`, `src/Archive.gs` `backupMasterSnapshot`·`_getBackupFolder`·`_toCsvString` |
| `updateItem` | `reason` 필수, `code` 변경 거부, `MASTER_FIELD_COLS` 키만 검증(partial), 실제 달라진 필드만 쓰고 이력. 변경 없음 → `{success:false, noChanges:true}`. `usageStatus` 지원 + 정렬, 초기재고 변경 또는 행 이동 시 `recalcStockAndUsage`. 응답에 `changes[]` | `updateItem` |
| `getItemMasterData(token, options)` | `options.includeDisabled`로 미사용 포함(캐시 키 `ITEM_MASTER_DATA_ALL`, `CacheManager.invalidateAll`에 등록). 응답에 `usageStatus` 추가. 기존 1-인자 호출은 동작 불변 | `getItemMasterData`, `src/CacheManager.gs` |
| `getItemChangelog` 9열 | `reason`·`route` 포함, v19 이전 7열 시트도 있는 열만 읽음. `DevTools.resetDevEnvironment`는 `CHANGELOG_COL_COUNT`(시트 열 수와 min) | `getItemChangelog`, `src/DevTools.gs` |
| 원자성 | 마스터 쓰기 → 이력 → 이력 실패 시 마스터 되돌림(등록: 데이터 블록 clear, 수정: 이전 행 되쓰기, CSV: 추가 행 clear). 정렬·재계산은 이력 이후라 실패해도 "수정 실패"로 보고하지 않고 메시지에 덧붙인다 | 각 함수 `catch (clErr)` |
| 마이그레이션 v19 | `CURRENT_SCHEMA_VERSION = 19`. `MIGRATIONS[19]`는 `applyChangelogFormatting(sheet)`(빌더와 공유) — 열 확충, A1:I1 병합(옛 병합 breakApart), H2/I2 헤더, 너비, 서식. 데이터 행 무손실, 멱등, 시트 없으면 빌더로 생성 | `src/Migration.gs`, `src/SheetBuilder.gs` `buildChangelogSheet`·`applyChangelogFormatting` |
| 상수 SSOT | `Config.gs`: `MASTER_FIELD_COLS`·`MASTER_FIELD_LABELS`(onEdit 추적 열 = updateItem 필드), `ITEM_TAX_TYPES`·`ITEM_USAGE_STATUSES`(시트 드롭다운도 사용)·`ITEM_NUMERIC_DEFAULTS`·`CHANGELOG_NEW_ITEM_FIELD`, `CHANGELOG_COLS`·`CHANGELOG_COL_COUNT`·`CHANGELOG_HEADERS`·`CHANGELOG_ROUTES` | `src/Config.gs` |
| 문서 | `Docs/SheetSchema.md` 변경이력 9열 표·기록 규칙·**마스터 쓰기 규칙**, `Docs/DataModel.md` Changelog 속성 | |

### 2. 명세에 없던 결함 — DEV 검증 중 발견, 함께 수정

`disableItemMaster`를 DEV에서 실호출하자 기존 `_sortMasterByUsageStatus`(v9.0)가 터졌다. 두 결함 모두 **기존 코드**에 있었고 UI가 사장돼 있어 한 번도 실행된 적이 없었을 뿐이다.

1. **`clearContent()` 후 25열 `setValues` 되쓰기** — Sheets는 큰 setValues를 약 3000행씩 나눠 적용하고, API 쓰기에도 `setAllowInvalid(false)` 데이터 검증을 강제한다. E3003의 낡은 단위 값 하나에 뒤 덩어리가 거절되어 **앞 3000행만 남고 1291행이 지워진 채** 끝났다 (DEV 4292 → 3001행). 사용자가 스프레드시트 버전 기록으로 복원(9/14).
2. **25열 통째 쓰기가 3행의 ARRAYFORMULA(N~Q·V~X)를 지움** — 정렬뿐 아니라 옛 `addNewItem`·`updateItem`도 같은 구조였다(3행을 쓰는 경우).

수정: 마스터에 쓰는 모든 코드가 `MASTER_DATA_BLOCKS`(A:E·G:M·S:U·Y)만 `_writeMasterRows()`로 쓴다(`_clearMasterRows`도 같은 블록). 정렬은 `clearDataValidations()` → 블록 쓰기 → `applyItemMasterFormatting`(검증 복원) 순서, `clearContent` 없음, 실패 시 원본 되쓰기, 이미 정렬돼 있으면 무쓰기, 행이 움직이면 `recalcStockAndUsage`(X열은 StockEngine이 행별 값으로 쓰는 열). 규칙은 `Docs/SheetSchema.md` "마스터 쓰기 규칙"에 남겼다.

### 3. Hypotheses 검증

| 가설 | 결과 |
|---|---|
| `getItemMasterData` 확장 방식 | 옵션 인자 `{includeDisabled}` 채택. 기존 호출부(`JS_BaseData.html` 등) 1-인자 호출 불변, 캐시 키 분리 |
| 원자성 방식 | "마스터 먼저 → 이력 → 실패 시 되돌리기" 채택. 이력을 먼저 쓰면 마스터 실패 시 없는 변경이 이력에 남기 때문 |

### 4. 검증

- `npm test` — **18개 파일 전체 통과**. 신규 `tests/unit/item-service.test.js` **60건**(검증 규칙 13 · 등록 8 · 수정 11 · 비활성화 4 · CSV 8 · 조회 4 · v19 5 · 정렬 4 · 준비 3), `tests/unit/onedit-changelog.test.js` **13건**은 복사본 로직 대신 실제 `Code.gs onEdit`를 목으로 구동하도록 재작성(옛 복사본은 24열 시절 인덱스인 채 통과하고 있었다). `migration-v16`·`v17` 테스트는 새 검증·상수 구조에 맞춰 갱신. `gas-sheet-mock`에 `Range.getSheet`·`clearDataValidations`·Drive 폴더/파일·`MimeType` 추가.
- DEV 런타임(웹앱 `google.script.run` 직접 호출, 9/14): 잘못된 카테고리 등록 거절 → 등록 → 사유 없는 수정 거절 → 매입단가 수정 → 비활성화(정렬 실제 실행) → `getItemChangelog` 3건 모두 `route: 웹앱`·`reason` 정확. 정렬 후 마스터 4293행(유실 없음), 미사용 품목 맨 아래, V·W 수식 값 정상. 검증 품목 `ITEM-TEST-024`(DEV 시드 접두어, 미사용)는 남겨 둠 — `resetDevEnvironment`가 정리한다.
- Playwright 전체 회귀 — **23 passed / 3 skipped**(월마감 등 게이트 테스트, TASK-023 기준선과 동일).

### 5. DEV 관찰 (이번 변경과 무관, 참고)

- DEV 마스터의 O열(발주점)·Q열(재고 상태) 수식이 전 품목 빈 값이다 — 9/12 회귀 로그(대시보드 KPI risk/order/normal 전부 0)에서도 같았으므로 사고 이전부터의 상태. 마스터 수식을 다시 세우는 도구가 없다(`repairAllSheetFormatting`은 값·수식을 건드리지 않는다). 별도 정비 후보.
- DEV `📋 변경이력`은 v19 마이그레이션 전이라 H·I 헤더가 아직 없다. `_appendChangelog`는 `_ensureMinColumns`로 열만 확보하고 9열을 쓰므로 동작에는 지장이 없다.

### 6. 명세와 다른 점 / 판단

- **CSV 업로드에서 카테고리·단위가 필수가 됐다** (옛 코드는 빈 카테고리를 허용). 명세의 "빈 값 불가" 규칙을 추가·수정·CSV에 동일 적용. 기존 파일 중 카테고리/단위가 빈 행은 거절되므로 Human QA 항목으로 올린다.
- `disableItemMaster`의 staff 거부 문구가 "삭제 권한이 없습니다" → "품목 수정 권한이 없습니다"(위임 경로)로 바뀌었다. 이미 미사용인 품목은 `{success:false, message:"이미 미사용 상태인 품목입니다."}`.
- `uploadItemMasterCSV`가 이제 `ScriptLock`을 잡는다(옛 코드는 없었음).
- `Archive.gs`는 Files to Modify에 없었지만 "Archive.gs 재사용" 요구를 위해 `backupToCSV`의 폴더 탐색·CSV 변환을 `_getBackupFolder`·`_toCsvString`으로 추출했다. `backupToCSV`의 동작은 같다.
- 정렬 유지 여부는 재고 필요: 사용유무 토글로 순서가 바뀌면 마스터 전체(4천 행)를 블록으로 되쓴다. 안전장치를 넣었지만 "미사용을 아래로 모으는" 편의 대비 쓰기 규모가 크다. 구매팀이 시트를 뷰어로만 보고 웹앱 목록(TASK-025)이 필터를 제공하면 정렬을 폐지하는 것도 선택지 — Human 결정.

### 7. Human QA 체크리스트 (DEV)

| 항목 | 확인할 것 |
|---|---|
| v19 마이그레이션 | DEV 스프레드시트 Apps Script 편집기에서 `runMigrations()` → `📋 변경이력` 2행에 H "변경사유"·I "경로" 헤더, 기존 행 보존, A1:I1 병합 |
| CSV 업로드(시트 메뉴) | 카테고리/단위가 있는 CSV → "N건 신규 등록 … 업로드 전 백업: 품목마스터_업로드전_….csv", Drive `시스템_데이터_백업`에 파일. 카테고리 빈 행이 있는 CSV → 행 번호와 사유가 담긴 거절 메시지 |
| 시트 직접 편집 이력 | 마스터 B열 값을 바꾸면 변경이력에 9열(사유 "(시트 직접편집)", 경로 "시트편집") |

### 8. 배포 메모

- Production 배포 시 **v19 마이그레이션을 곧바로 실행**할 것(TASK-017 절차와 동일). 실행 전까지도 `_appendChangelog`는 열을 확보해 9열을 쓰므로 이력 누락은 없다.
- Production CI는 별도 커밋 `9cfba98`(clasp 3.4.1 고정)으로 복구되어 run #51부터 정상. 이 Task 코드는 Human QA 전이라 **push하지 않았다**(로컬 커밋만).
