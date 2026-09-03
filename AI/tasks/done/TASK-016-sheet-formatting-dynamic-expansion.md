# TASK-016: 품목 마스터 및 시트 서식·유효성 검사 행 범위 동적 확장 (2003행 이후 누락 결함 수정)

## Objective

`🗂️ 품목 마스터` 시트에서 2003행부터 배경색(노란색 입력열, 파란색 자동계산열, 회색 스페이서), 가운데 정렬, 드롭다운 데이터 유효성 검사(카테고리, 단위, 과세구분, 사용유무), 천단위 숫자 서식 및 조건부 서식이 누락되는 결함을 해결한다.  
`Config.gs`의 `VALIDATION_ROWS` 상수를 실무 운영 규모(기본 5,000행 이상)로 상향하고, `SheetBuilder.gs`의 서식 로직이 고정 상수에만 의존하지 않고 시트의 현재 행 수(`sheet.getMaxRows()`)를 고려하여 동적으로 전 영역에 서식을 입히도록 개선한다.  
CSV 업로드(`uploadItemMasterCSV`) 후 자동 서식 보장 및 관리자 도구 메뉴를 통한 수동 서식 복구/통합 갱신 연동을 구현한다.  
v16 마이그레이션 로직(`MIGRATIONS[16]`)을 구현하여 기존 스프레드시트의 2003행 이후 영역에도 누락된 서식과 유효성 검사를 즉시 복구·적용한다.

## Confirmed Facts

1. **사용자 제보 사진 증거**:
   - 1996행~2002행: 노란색 배경(입력열), 파란색 배경(현재고/일평균 등), 회색 스페이서, 드롭다운 화살표(카테고리, 단위, 과세구분 등), 가운데 정렬 정상 적용 확인.
   - 2003행(CHE-262) ~ 2010행(CHE-269) 이상: 흰색 배경(기본 셀), 드롭다운 화살표 없음, 텍스트 좌측 정렬(기본 셀 정렬), 숫자 서식 미적용 상태 확인.
2. **상수 하드코딩** ([`src/Config.gs:89`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Config.gs#L89)):
   ```javascript
   const VALIDATION_ROWS = 2000; // 성능 최적화를 위한 검증/서식 고정 적용 범위
   ```
3. **현재 스키마 버전** ([`src/Config.gs:93`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Config.gs#L93)):
   ```javascript
   const CURRENT_SCHEMA_VERSION = 15;
   ```
4. **시트 서식 적용 로직의 고정 범위 한계** ([`src/SheetBuilder.gs:31-78`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs#L31-L78)):
   - 품목 마스터 헤더는 1~2행이며, 데이터는 3행부터 시작한다.
   - 서식 설정 코드가 모두 `sheet.getRange(3, col, VALIDATION_ROWS, ...)`로 작성되어 있다.
   - 따라서 3행부터 **2002행까지만 (3 + 2000 - 1 = 2002)** 배경색, 가운데 정렬, 드롭다운 유효성 검사, 숫자 서식, 조건부 서식이 적용된다.
   - **2003행부터는 `VALIDATION_ROWS = 2000` 범위를 벗어나므로**, 스프레드시트 기본 상태(흰색 배경, 좌측 정렬, 드롭다운 없음)로 남는다.
5. **타 시트 동일 결함 영향 확인**:
   - `applyTxInputSheetFormatting(sheet)` ([`src/SheetBuilder.gs:82-105`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs#L82-L105)): 템플릿 및 업장 시트도 `VALIDATION_ROWS = 2000`으로 2002행까지만 서식 적용.
   - `applyConsolidatedLogFormatting(sheet)` ([`src/SheetBuilder.gs:108-114`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs#L108-L114)): 통합 입출고 기록장도 동일하게 2000행으로 제한.
   - `_protectTransactionSheet()` ([`src/RBAC.gs:371-376`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/RBAC.gs#L371-L376)): 시트 보호 예외 편집 범위도 `VALIDATION_ROWS`를 기준으로 설정되어 있어, 업장 시트에서 2003행 이상 거래 누적 시 일반 직원의 셀 편집이 시트 보호에 의해 차단될 위험 존재.
6. **진입점 호출 경로 증빙**:
   - **품목 마스터 시트 생성/서식 적용 진입점**:  
     `[진입점 호출 경로 증빙: src/Code.gs:69 (buildItemMaster(ss)) → src/SheetBuilder.gs:295 (buildItemMaster) → src/SheetBuilder.gs:342 (applyItemMasterFormatting)]`
   - **CSV 업로드 진입점**:  
     `[진입점 호출 경로 증빙: src/Code.gs:19 (openCsvUploadModal) → src/UploadCsv.html:93 (processCsvUploadFromSheet) → src/ItemService.gs:487 (processCsvUploadFromSheet) → src/ItemService.gs:523 (uploadItemMasterCSV)]`
   - **관리자 도구 메뉴 진입점**:  
     `[진입점 호출 경로 증빙: src/Code.gs:15 (onOpen() → refreshDashboard) → src/Dashboard.gs:65 (refreshDashboard)]`
   - **마이그레이션 진입점**:  
     `[진입점 호출 경로 증빙: src/Migration.gs:397 (runMigrations) → MIGRATIONS[16]]`
7. **확인된 사장(Dead) 파일**:
   - `src/JS_Master.html`: 사장된 파일임. `Index.html`에 include되지 않고 `tab-master`도 없음. 품목 마스터는 스프레드시트 `🗂️ 품목 마스터` 시트 전용이며 웹앱 UI 화면이 존재하지 않는다. (수정 대상에서 배제)

## Hypotheses

- GAS에서 5,000~10,000행 수준으로 서식 및 데이터 유효성 검사 범위를 확장하더라도 1회성 배치 호출(`getRange` 일괄 처리)이므로 스크립트 실행 시간(1~2초 내외)에 거의 영향이 없으며, 스프레드시트 렌더링 부하도 무시할 수 있는 수준이다.
- 기존 시트에 2,000건 이상의 실제 데이터가 입력된 상태에서 `setBackground`, `setHorizontalAlignment`, `setDataValidation`, `setNumberFormat`, `setConditionalFormatRules`를 재적용해도 셀의 원본 값(`values`)과 계산 수식(`formulas`)은 손상되지 않는다.
- `sheet.getMaxRows()` 기반으로 동적 행 범위를 계산하면 사용자가 행을 추가하거나 CSV를 업로드하더라도 시트 전체 행에 서식이 빈틈없이 유지될 수 있다.

## Business Context

- 호텔에서 관리하는 품목 수가 지속적으로 증가하여 2,000건을 돌파하였음.
- 2003행 이후 신규 품목들에서 카테고리/단위/과세구분 드롭다운이 작동하지 않고 배경색 및 가운데 정렬이 풀려, 현장 관리자의 품목 데이터 수동 기입 오류(오탈자, 비표준 단위 입력 등)가 발생하고 시인성이 심각하게 저하됨.
- 과거 TASK-009에서 `VALIDATION_ROWS`를 500에서 2000으로 올렸으나, 단순히 고정 상수로 처리하여 품목 수가 2000건을 넘자 동일한 문제가 재발하였음.
- 따라서 이번 작업에서는 상수를 5,000행으로 대폭 상향함과 동시에, 시트의 실제 행 수(`getMaxRows()`)를 반영하는 동적 서식 적용 구조로 전면 개선해야 함.

## Current System

- 시스템 초기화([`createAll`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Code.gs#L46)) 및 v12 마이그레이션 시점에 `VALIDATION_ROWS = 2000`을 기준으로 3~2002행까지만 서식과 유효성 검사를 구웠음.
- 2003행 이후 영역은 서식·정렬·드롭다운이 누락된 흰색 기본 셀 상태로 방치되어 있음.
- CSV 업로드(`uploadItemMasterCSV`) 함수는 행을 추가할 뿐, 추가된 영역에 대한 서식/검증 재적용 로직이 없음.
- 스프레드시트 관리자 도구 메뉴에 서식을 원클릭으로 재적용할 수 있는 메뉴가 없음.

## Root Cause / Diagnostic Logic

1. `src/Config.gs`의 `VALIDATION_ROWS` 상수가 `2000`으로 고정되어 있음.
2. `src/SheetBuilder.gs`의 `applyItemMasterFormatting`, `applyTxInputSheetFormatting`, `applyConsolidatedLogFormatting` 함수가 3행부터 고정된 `VALIDATION_ROWS`(2,000개 행)까지만 한정하여 범위(`Range`)를 지정하기 때문 (종료 행 = 3 + 2000 - 1 = 2002행).
3. 시트 행이 2,000행을 초과하거나 CSV 대량 등록을 통해 행이 늘어났을 때 서식을 동적으로 연장하거나 갱신해 주는 메커니즘의 부재.

## Requirements

### Functional

- [x] **상수 상향 및 버전 업데이트**:
  - `src/Config.gs`의 `VALIDATION_ROWS` 상수를 `2000` → `5000`으로 상향한다.
  - `src/Config.gs`의 `CURRENT_SCHEMA_VERSION`을 `15` → `16`으로 상향한다.
- [x] **서식 적용 함수의 동적 행 범위 지원 (`src/SheetBuilder.gs`)**:
  - `applyItemMasterFormatting(ss, sheet)`:
    - 최소 행 수 보장: `_ensureMinRows(sheet, VALIDATION_ROWS + 2);`
    - 동적 적용 행 수 계산: `const targetRows = Math.max(VALIDATION_ROWS, sheet.getMaxRows() - 2);`
    - 카테고리(C열), 단위(E열), 과세구분(S열), 사용유무(X열)의 DataValidation 적용 범위를 `targetRows`로 확장.
    - 금액(#,##0) 및 현재고 숫자 서식 적용 범위를 `targetRows`로 확장.
    - 배경색(노란색 입력열, 파란색 자동열, 회색 스페이서) 적용 범위를 `targetRows`로 확장.
    - 24개 열 전체 가운데 정렬(`setHorizontalAlignment("center")`) 적용 범위를 `targetRows`로 확장.
    - 조건부 서식(상태 색상, 음수 재고 강조, 미사용 회색) 적용 범위를 `targetRows`로 확장.
  - `applyTxInputSheetFormatting(sheet)`:
    - 동일하게 `const targetRows = Math.max(VALIDATION_ROWS, sheet.getMaxRows() - 2);`를 적용하여 날짜/단가 서식, 배경색, 정렬, 입출고/수량 드롭다운, 미등록 품목코드 경고 조건부 서식을 확장.
  - `applyConsolidatedLogFormatting(sheet)`:
    - 동일하게 `const targetRows = Math.max(VALIDATION_ROWS, sheet.getMaxRows() - 2);`를 적용하여 날짜/단가 서식, 파란색 배경, 가운데 정렬을 확장.
- [x] **업장 시트 보호 예외 범위 확장 (`src/RBAC.gs`)**:
  - `_protectTransactionSheet()` 및 `fixSheetProtection()`:
    - `const targetRows = Math.max(VALIDATION_ROWS, targetSheet.getMaxRows() - 2);`를 적용하여 일반 직원의 편집 허용 범위(A~B, D~E, G~H)가 2003행 이후에도 차단되지 않도록 보장.
- [x] **CSV 업로드 시 서식 자동 보장 (`src/ItemService.gs`)**:
  - `uploadItemMasterCSV()`:
    - 신규 품목 행 추가 완료 후, `masterSheet.getMaxRows()`가 확장되었거나 기존 서식 범위를 넘어선 경우 `applyItemMasterFormatting(ss, masterSheet)`을 호출하여 신규 추가된 행에도 즉시 서식·드롭다운이 구워지도록 보장.
- [x] **관리자 도구 서식 복구 메뉴 추가 (`src/Code.gs`)**:
  - `onOpen()` 메뉴에 `"🎨 시트 서식/검증 복구"` 메뉴 항목을 추가하여, 운영 중 언제든지 관리자가 클릭 한 번으로 마스터 및 입출고 시트 전체의 서식/드롭다운을 5,000행+ 범위로 복구·재적용할 수 있도록 함수(`repairAllSheetFormatting`)를 제공한다.
  - `refreshDashboard()`(통합 갱신) 실행 시에도 서식 무결성이 유지되도록 점검 또는 연동.
- [x] **v16 마이그레이션 구현 (`src/Migration.gs`)**:
  - `MIGRATIONS[16] = function migrate_to_v16(ss)` 구현:
    - `🗂️ 품목 마스터`: 최소 5,002행 확충 후 `applyItemMasterFormatting(ss, masterSheet)` 호출.
    - `📝 통합 입출고 기록장`: 최소 5,002행 확충 후 `applyConsolidatedLogFormatting(consolidatedSheet)` 호출.
    - `📋 입출고_템플릿` 및 활성 업장 시트들: 최소 5,002행 확충 후 `applyTxInputSheetFormatting(sh)` 호출 및 업장 시트 보호 예외 편집 범위 갱신.
    - 기존 셀 데이터 및 수식 무손실(멱등성 보장).

### Non-Functional

- [x] 마이그레이션 함수 및 서식 재적용 실행 시간이 GAS 6분 제한에 걸리지 않도록 단일 Range 호출(배치 처리)을 유지한다.
- [x] 단위 테스트(`tests/unit/migration-v16-formatting.test.js`)를 신설하여 5,000행 이상 및 동적 행 확장에 대한 서식/검증 적용을 철저히 검증한다.
- [x] 기존 9개 단위 테스트 스위트가 100% 통과하도록 회귀를 방지한다.

## Constraints

- **데이터 무손실 원칙**: `clear()`를 호출하면 기존 품목 데이터가 소실되므로 절대 사용하지 않고, `setBackground`, `setHorizontalAlignment`, `setDataValidation`, `setNumberFormat`, `setConditionalFormatRules`를 타겟 레인지에 직접 덮어씌워야 한다.
- **사장 파일 배제**: `src/JS_Master.html`은 사장된 코드이므로 수정하거나 참조하지 않는다.
- **행 부족 에러 방어**: `getRange(3, col, targetRows, ...)` 호출 시 시트의 `getMaxRows()`보다 큰 범위를 요청하면 GAS 런타임 에러가 발생하므로, 반드시 `_ensureMinRows(sheet, targetRows + 2)`로 행을 선제 확충한 후 Range를 획득해야 한다.

## Files to Inspect

- [`src/Config.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Config.gs)
- [`src/SheetBuilder.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs)
- [`src/Migration.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Migration.gs)
- [`src/ItemService.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/ItemService.gs)
- [`src/RBAC.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/RBAC.gs)
- [`src/Code.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Code.gs)
- [`tests/unit/migration-v12-formatting.test.js`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/tests/unit/migration-v12-formatting.test.js)

## Files to Modify

- [`src/Config.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Config.gs): `VALIDATION_ROWS` 상향 (`2000` → `5000`), `CURRENT_SCHEMA_VERSION` 상향 (`15` → `16`)
- [`src/SheetBuilder.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs): `applyItemMasterFormatting`, `applyTxInputSheetFormatting`, `applyConsolidatedLogFormatting`에서 `Math.max(VALIDATION_ROWS, sheet.getMaxRows() - 2)` 동적 범위 적용
- [`src/RBAC.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/RBAC.gs): `_protectTransactionSheet` 및 `fixSheetProtection`에서 `Math.max(VALIDATION_ROWS, sheet.getMaxRows() - 2)` 동적 편집 허용 범위 적용
- [`src/ItemService.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/ItemService.gs): `uploadItemMasterCSV()`에서 CSV 등록 후 서식 재적용 호출 보장
- [`src/Code.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Code.gs): `onOpen()` 메뉴에 `🎨 시트 서식/검증 복구` (`repairAllSheetFormatting`) 추가
- [`src/Migration.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Migration.gs): `MIGRATIONS[16]` 신설

## Files to Create

- [`tests/unit/migration-v16-formatting.test.js`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/tests/unit/migration-v16-formatting.test.js): v16 마이그레이션 후 5,000행 이상 및 동적 행 확장에 대한 단위 테스트

## Implementation Plan

1. **상수 변경 (`src/Config.gs`)**:
   - `const VALIDATION_ROWS = 5000;`
   - `const CURRENT_SCHEMA_VERSION = 16;`
2. **동적 서식 헬퍼 개선 (`src/SheetBuilder.gs`)**:
   - `applyItemMasterFormatting(ss, sheet)`:
     ```javascript
     _ensureMinRows(sheet, VALIDATION_ROWS + 2);
     const targetRows = Math.max(VALIDATION_ROWS, sheet.getMaxRows() - 2);
     // 이후 VALIDATION_ROWS 대신 targetRows 사용
     ```
   - `applyTxInputSheetFormatting(sheet)`, `applyConsolidatedLogFormatting(sheet)`:
     - 동일하게 `targetRows = Math.max(VALIDATION_ROWS, sheet.getMaxRows() - 2)` 적용.
3. **시트 보호 범위 동적화 (`src/RBAC.gs`)**:
   - `_protectTransactionSheet` 및 `fixSheetProtection`에서 `targetRows = Math.max(VALIDATION_ROWS, targetSheet.getMaxRows() - 2)` 적용.
4. **CSV 업로드 연동 (`src/ItemService.gs`)**:
   - `uploadItemMasterCSV()` 완료 시점에 `applyItemMasterFormatting(ss, masterSheet)`을 호출하여 신규 행에 즉시 서식 부여.
5. **관리자 복구 메뉴 추가 (`src/Code.gs`)**:
   - `repairAllSheetFormatting()` 작성:
     - `🗂️ 품목 마스터`, `📝 통합 입출고 기록장`, `📋 입출고_템플릿`, 활성 업장 시트들에 서식을 일괄 재적용하고 알림창 표시.
   - `onOpen()` 메뉴에 `.addItem("🎨 시트 서식/검증 복구", "repairAllSheetFormatting")` 등록.
6. **마이그레이션 함수 구현 (`src/Migration.gs`)**:
   - `MIGRATIONS[16]` 구현:
     - `🗂️ 품목 마스터`, `📝 통합 입출고 기록장`, `📋 입출고_템플릿`, 활성 업장 시트들 대상.
     - `_ensureMinRows(sh, VALIDATION_ROWS + 2)` 호출.
     - 공용 서식 함수(`applyItemMasterFormatting` 등) 호출.
     - 업장 시트 보호 범위(`setUnprotectedRanges`) 재설정.
7. **단위 테스트 작성 (`tests/unit/migration-v16-formatting.test.js`)**:
   - `migration-v12-formatting.test.js` 구조를 기반으로:
     - `VALIDATION_ROWS >= 5000` 확인.
     - `CURRENT_SCHEMA_VERSION >= 16` 확인.
     - `MIGRATIONS[16]` 실행 후 5,002행까지 서식/드롭다운/정렬/배경색이 정상 적용되는지 검증.
     - 시트에 6,000행이 있을 때 6,000행까지 동적으로 서식이 확장 적용되는지 검증.
     - `repairAllSheetFormatting` 함수 존재 및 정상 호출 검증.

## Migration Plan

- 본 Task 자체가 Schema v16 마이그레이션을 포함한다.
- 배포 후 DEV 및 Production 스프레드시트에서 관리자 도구 메뉴의 `🎨 시트 서식/검증 복구` 또는 Apps Script 콘솔에서 `runMigrations()`를 1회 실행하여 v16 마이그레이션을 즉시 적용한다.

## Test Plan

### Unit Test

- `npm.cmd run test:unit`
- 신규 작성된 `migration-v16-formatting.test.js` 통과 검증.
- 기존 9종 단위 테스트 스위트 전체 통과 검증.

### E2E Test (Playwright)

- `npm run dev:push`로 DEV 환경 배포.
- DEV 스프레드시트의 `🗂️ 품목 마스터` 2003행~2010행 셀 확인:
  - 노란색/파란색 배경색이 채워져 있는가?
  - 텍스트가 가운데 정렬되어 있는가?
  - C열(카테고리), E열(단위), S열(과세구분), X열(사용유무) 클릭 시 드롭다운 목록이 정상 노출되는가?
  - 숫자 입력 시 천단위 콤마가 자동 서식화되는가?
- 관리자 도구 메뉴에서 `🎨 시트 서식/검증 복구` 클릭 시 성공 알림창이 정상 표시되는가?

## Regression Risk

- `VALIDATION_ROWS`를 5,000행으로 상향함에 따른 파일 용량 및 응답 속도: 5,000행 * 24열 = 120,000셀로 Google Sheets 한도(10,000,000셀)의 1.2%에 불과하여 성능 영향 없음.
- 기존 입력 데이터 덮어쓰기 위험: 서식(`setBackground`, `setHorizontalAlignment`, `setDataValidation`, `setNumberFormat`)만 갱신하고 값(`values`)은 건드리지 않으므로 데이터 유실 위험 없음.

## Acceptance Criteria

- [x] `src/Config.gs`의 `VALIDATION_ROWS`가 `5000` 이상으로 정의되어 있다.
- [x] `src/Config.gs`의 `CURRENT_SCHEMA_VERSION`이 `16`으로 정의되어 있다.
- [x] `🗂️ 품목 마스터`의 2003행부터 5000행 이상까지 배경색, 가운데 정렬, 드롭다운 4종, 숫자 서식이 정상 적용된다.
- [x] 시트 행 수가 5,000행을 초과하더라도 `getMaxRows()` 기반 동적 계산을 통해 전 행에 서식이 적용된다.
- [x] `📋 입출고_템플릿`, `📝 통합 입출고 기록장`, 각 업장 시트의 2003행 이후 서식 및 유효성 검사/보호 범위가 정상 확장된다.
- [x] 스프레드시트 상단 메뉴에 `🎨 시트 서식/검증 복구`가 등록되어 정상 동작한다.
- [x] 단위 테스트 스위트 전체(10종)가 에러 없이 100% 통과한다 (`npm.cmd run test:unit`).

## Human Approval Required

- 없음. (기존 결함 수정 및 서식 범위 동적 확장)

## Deployment Notes

- 배포 후 DEV 및 Production 스프레드시트에서 관리자 도구 메뉴의 `🔄 통합 갱신` 또는 `🎨 시트 서식/검증 복구`, 또는 Apps Script 콘솔에서 `runMigrations()`를 1회 실행하여 v16 마이그레이션을 즉시 적용해야 한다.

## Rollback Plan

- Git 커밋 롤백 및 Apps Script 콘솔에서 `setSchemaVersion(15)` 실행.

## Final Report

### 명세에 대한 피드백 (구현 전 검토)

**1. 명세의 사실 오류 — `_protectTransactionSheet()`는 존재하지 않는다**
Confirmed Facts #5가 `src/RBAC.gs:371-376 _protectTransactionSheet()`를 지목했으나 그 위치는 `generateNewShops()`다.
TASK-009 리포트에서 이미 한 번 정정된 내용이 명세에 재유입됐다. 실제로 보호 예외 범위를 세팅하는 곳은
`generateNewShops()` / `fixSheetProtection()` / `MIGRATIONS[12]` 세 군데이고, `removeItemCodeValidation()`도
`VALIDATION_ROWS`로 범위를 잡는다. 네 곳 모두 처리했다.

**2. `_ensureMinRows(sheet, VALIDATION_ROWS+2)` + `Math.max(VALIDATION_ROWS, getMaxRows()-2)`는 중복이다**
`_ensureMinRows` 직후의 `Math.max`는 항상 `getMaxRows()-2`를 돌려주므로 죽은 코드다. 더 중요한 문제는 이 두 줄을
서식 함수 3개 × 여러 호출처에 복붙하면 **순서를 뒤집는 순간(계산 후 확충) getRange가 시트 밖을 가리켜
GAS 런타임 에러**가 난다는 점이다. 두 동작을 `_formatRowCount(sheet)` 한 호출로 묶어 호출처가 순서를 틀릴 수 없게 했다.

**3. 명세대로 하면 같은 서식 규칙이 세 벌이 된다**
`MIGRATIONS[12]`가 이미 "행 확충 → 공용 서식 함수 재호출 → 보호범위 갱신"을 한다. 여기에 `MIGRATIONS[16]`과
메뉴용 `repairAllSheetFormatting`을 따로 쓰면 세 벌이 되어 이후 컬럼 추가·색상 변경 때 반드시 어긋난다.
`reapplyAllSheetFormatting(ss)` 단일 진입점을 만들고 v16 · 메뉴 · 자가 복구가 모두 이것만 호출하게 했다.

**4. 5,000행 확장의 실제 비용은 셀 개수가 아니라 조건부 서식이다 (명세 누락)**
Regression Risk는 "120,000셀 = 한도의 1.2%"만 따졌지만, 실제 부담은 업장 시트의 이 규칙이다.

```
=AND($B3<>"", ISERROR(MATCH($B3, INDIRECT("'🗂️ 품목 마스터'!$A$3:$A"), 0)))
```

`INDIRECT`는 휘발성이라 편집 때마다 규칙 범위 전체가 재계산되고, `AND()`는 인자를 모두 평가하므로
**빈 행에서도 MATCH가 전부 돈다.** 2000 → 5000행 × 업장 5시트면 휘발성 MATCH가 1만 → 2.5만 회로 늘어난다.
반면 `IF()`는 선택된 가지만 평가하므로 아래로 바꾸면 대부분을 차지하는 빈 행이 MATCH를 건너뛴다.
서식 범위를 시트 끝까지 넓히는 이번 변경의 **전제 조건**으로 함께 수정했다.

```
=IF($B3="", FALSE, ISERROR(MATCH($B3, INDIRECT("..."), 0)))
```

**5. 명세대로만 하면 5003행에서 같은 Task가 또 열린다 (가장 중요)**
TASK-009(500→2000)와 TASK-016(2000→5000)은 같은 결함을 두 번 쫓고 있다. `getMaxRows()` 기반 동적화는
분명한 개선이지만 그것도 **적용 시점의 스냅샷**이다. 사용자가 시트 하단 "행 1000개 추가"를 누르거나
대량 붙여넣기로 행이 늘면 새 행은 다시 맨살이 된다. 명세의 대응은 "관리자가 복구 메뉴를 눌러라"인데,
관리자는 서식이 깨진 걸 눈으로 보기 전에는 누르지 않는다.

그래서 **자가 복구**를 추가했다. `refreshDashboard()`(통합 갱신 + 자정 트리거)가 마지막 행 A열 배경색 **1셀만**
읽어 커버리지 이탈을 판정하고, 이탈했으면 자동으로 전 시트 서식을 다시 굽는다. 정상일 때 비용은 셀 조회 1회이며,
새 트리거 설치나 추가 권한 승인이 필요 없다. 명세의 "refreshDashboard 연동" 요구를 실질적으로 충족하는 형태다.

**6. CSV 업로드에 잠재 버그가 있었다 (명세 누락)**
`ItemService.gs`가 `getRange(masterLastRow+1, 1, newRows.length, 24).setValues(...)`로 바로 썼다.
남은 행보다 CSV가 크면 **서식 이전에 setValues 자체가 시트 밖을 가리켜 업로드가 실패**한다.
서식 재적용만 붙일 게 아니라 쓰기 전에 행 확충이 필요하다. 단위 테스트에 회귀 방지 검증을 넣었다.

### 구현 내용

**1. 상수 (`src/Config.gs`)**
- `VALIDATION_ROWS`: `2000` → `5000`. 의미가 바뀌었다 — **상한이 아니라 하한**이며, "새 시트를 최소 몇 행까지
  미리 구워 둘 것인가"만 결정한다. 실제 적용 범위는 시트의 현재 행 수를 따라간다.
- `CURRENT_SCHEMA_VERSION`: `15` → `16`

**2. 동적 범위 + 단일 진입점 (`src/SheetBuilder.gs`)**

| 추가/변경 함수 | 역할 | 호출처 |
|---|---|---|
| `_formatRowCount(sheet)` | 행 확충 + 현재 행 수 반환 (원자적) | 서식 함수 3종, RBAC, 레거시 마이그레이션 |
| `_applyShopUnprotectedRanges(sheet)` | 업장 편집 허용 범위 3구간 재설정 | `generateNewShops`, `fixSheetProtection`, `MIGRATIONS[12]`, `reapplyAll…` |
| `reapplyAllSheetFormatting(ss)` | 전 시트 서식/검증/보호 재적용 (단일 진입점) | `MIGRATIONS[16]`, 관리자 메뉴, 자가 복구 |
| `_isItemMasterFormattingStale(sheet)` | 셀 1개 조회로 커버리지 이탈 판정 | 자가 복구 |
| `_healSheetFormattingIfStale(ss)` | 이탈 시에만 복구 실행 | `refreshDashboard()` |

`applyItemMasterFormatting` / `applyTxInputSheetFormatting` / `applyConsolidatedLogFormatting`의
모든 `VALIDATION_ROWS`를 `_formatRowCount()` 결과로 교체했다.

**3. 시트 보호 범위 (`src/RBAC.gs`)**
`generateNewShops()` · `removeItemCodeValidation()` · `fixSheetProtection()` 세 곳의 고정 범위를 동적으로 바꾸고,
중복된 보호 범위 코드는 `_applyShopUnprotectedRanges()`로 일원화했다.

**4. CSV 업로드 (`src/ItemService.gs`)**
쓰기 전 `_ensureMinRows(masterSheet, masterLastRow + newRows.length)`로 행을 선제 확충하고,
쓰기 후 `applyItemMasterFormatting()`을 호출해 신규 행에 즉시 서식·드롭다운이 구워지도록 했다.

**5. 관리자 메뉴 (`src/Code.gs`)**
`🎨 시트 서식/검증 복구` 메뉴와 `repairAllSheetFormatting()` 추가. 대상 시트 수·확충 행 수·적용 범위를 알림으로 보고한다.

**6. 자가 복구 연동 (`src/Dashboard.gs`)**
`refreshDashboard()`에 `_healSheetFormattingIfStale(ss)` 호출 추가. 서식은 부가 기능이므로 실패해도
`try/catch`로 동기화 본체를 중단시키지 않는다.

**7. 마이그레이션 (`src/Migration.gs`)**
- `MIGRATIONS[16]` 신설 — `reapplyAllSheetFormatting(ss)` 위임 (자체 서식 코드 없음)
- `MIGRATIONS[12]`의 인라인 보호 범위 코드를 공용 헬퍼로 교체
- **레거시 방어**: `MIGRATIONS[7]`·`MIGRATIONS[9]`가 `getRange(3, c, VALIDATION_ROWS, n)`을 행 확충 없이 호출하고
  있었다. 상수가 5000이 되면 행이 부족한 구버전 시트에서 이 마이그레이션이 터진다(TASK-009 때부터 있던 노출을
  이번 상향이 넓힌다). `_formatRowCount()`로 선제 확충하도록 고쳤다.

### 명세와 다르게 처리한 점

- **`MIGRATIONS[16]`을 v12의 복사본으로 쓰지 않았다.** 위 피드백 #3의 이유로 단일 진입점에 위임한다.
- **`Math.max(VALIDATION_ROWS, getMaxRows()-2)` 표현을 쓰지 않았다.** 위 피드백 #2의 이유로 `_formatRowCount()`로 대체.
- **업장 시트의 품목코드(B열) 드롭다운은 재적용하지 않았다.** `removeItemCodeValidation()`이 "품목코드 직접 입력"
  구조로 전환한 운영 결정을 되돌리게 되기 때문 (TASK-009에서 확정된 방침). 회귀 방지 검증을 테스트에 포함했다.
- **명세에 없던 2건을 함께 고쳤다**: 조건부 서식 단축평가(#4), CSV 업로드 행 부족 실패(#6). 둘 다
  "5,000행 확장"이 안전하게 성립하기 위한 전제라서 분리하지 않았다.
- **`tests/unit/migration-v15.test.js` 1줄 수정**: `CURRENT_SCHEMA_VERSION`을 정확히 `15`로 고정하고 있어
  버전을 올리는 순간 무관한 테스트가 깨졌다. v12/v16 테스트와 같은 하한 비교(`>= 15`)로 바꿨다.

### 테스트 결과

**단위 테스트 — `npm run test:unit` 전체 통과 (10개 파일)**

신규 `tests/unit/migration-v16-formatting.test.js` (47개 검증 전부 통과). v12 테스트와 같이 `src/*.gs`를
vm 컨텍스트에 실제 로드하고 SpreadsheetApp만 모킹했다. 다만 이번 모킹은 **범위가 시트 밖을 가리키면 예외를 던진다** —
GAS 런타임과 같은 실패를 테스트에서 재현하기 위함이다.

주요 검증 항목:
- 상수(`VALIDATION_ROWS >= 5000`, `CURRENT_SCHEMA_VERSION >= 16`), `MIGRATIONS[16]` 등록
- 1000행 시트 → 5002행 확충 및 서식이 정확히 5002행까지 적용 (마스터/통합/템플릿/업장 4종)
- **6002행 시트에서 서식이 6002행까지 확장되고 행은 추가되지 않는다** (동적 확장의 핵심 검증)
- 드롭다운 4종·보호 예외 3구간이 시트 끝까지 적용 / 템플릿 보호 범위 미변경 / B열 드롭다운 미재적용
- `setValues`·`setFormula` 미호출 (데이터 보존), 멱등성, 대상 시트 부재 시 무해 통과
- 조건부 서식이 `IF` 단축평가로 시작하고 `AND`가 아님
- 자가 복구 3단계: 최신이면 무동작 → 행 1000개 추가 후 이탈 감지 → 추가분까지 재적용
- `refreshDashboard`가 자가 복구를 호출 / `repairAllSheetFormatting` 실행 및 완료 알림 / 메뉴 등록
- CSV 업로드: 남은 행보다 큰 CSV도 실패하지 않음(선제 확충) + 신규 행 서식 재적용

기존 9개 스위트 전원 통과 (회귀 없음).

**E2E — DEV 배포 후 전체 통과 (13 passed / 2 skipped / 0 failed, 7.1m)**
`npm run dev:push` 후 `npx playwright test`. 스모크·입출고·FIFO 분할·음수 재고·월마감 UI·실사 Excel 전부 정상.
DEV 품목 수가 **4,292건**으로 확인되어(테스트 로그), 2003행 이후가 실제로 서식 범위 밖이었다는 사실과
5,000행 하한이 현재 운영 규모에 적정하다는 점이 함께 확인됐다.

**DEV 배포 URL**: https://script.google.com/macros/s/AKfycbz-0sbkngtuonF3m9SDu_J1JJF809ISze-Nxvf5La7S/exec (`@HEAD`, `npm run dev:push` 즉시 반영)

### 미완료 — Human QA 필요

**DEV 스프레드시트에 실제로 서식이 칠해진 것은 아직 확인되지 않았다.** 코드 배포만 했고,
`runMigrations()`와 `repairAllSheetFormatting()`은 모두 `SpreadsheetApp.getUi()` 다이얼로그를 거치는
**관리자 수동 실행 경로**라 스크립트에서 대신 실행하지 않았다 (TASK-009 때와 동일한 제약).

Test Plan의 "DEV 스프레드시트 2003~2010행 육안 확인"은 아래 절차를 밟은 뒤 QA에서 확인해야 한다.

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/Config.gs` | `VALIDATION_ROWS` 2000→5000(의미: 상한→하한), `CURRENT_SCHEMA_VERSION` 15→16 |
| `src/SheetBuilder.gs` | `_formatRowCount` · `_applyShopUnprotectedRanges` · `reapplyAllSheetFormatting` · `_isItemMasterFormattingStale` · `_healSheetFormattingIfStale` 신설, 서식 함수 3종 동적화, 조건부 서식 단축평가 |
| `src/RBAC.gs` | 보호/검증 범위 3개 함수 동적화 + 보호 범위 코드 일원화 |
| `src/ItemService.gs` | CSV 업로드 선제 행 확충 + 업로드 후 서식 재적용 |
| `src/Code.gs` | `🎨 시트 서식/검증 복구` 메뉴 + `repairAllSheetFormatting()` |
| `src/Dashboard.gs` | `refreshDashboard()`에 서식 자가 복구 연동 |
| `src/Migration.gs` | `MIGRATIONS[16]` 신설, v12 보호 범위 일원화, v7·v9 레거시 행 부족 방어 |
| `tests/unit/migration-v16-formatting.test.js` | 신규 (47개 검증) |
| `tests/unit/migration-v15.test.js` | 버전 단정을 하한 비교로 완화 (1줄) |

### 배포 후 필수 절차

DEV·Production 각 스프레드시트에서 **아래 중 하나를 1회 실행**해야 기존 시트의 2003행 이후에 서식이 적용된다.

1. Apps Script 콘솔에서 `runMigrations()` 실행 (v15 → v16) — 권장. 사전 CSV 백업이 자동 수행된다.
2. 또는 스프레드시트 메뉴 `🏨 관리자 도구 > 🎨 시트 서식/검증 복구` 클릭 (스키마 버전은 갱신되지 않음)
3. 또는 `🔄 통합 갱신`을 1회 실행 — 자가 복구가 커버리지 이탈을 감지해 자동으로 다시 굽는다

이후로는 통합 갱신(자정 트리거 포함)이 서식 커버리지를 자동 유지하므로 수동 개입이 필요 없다.
