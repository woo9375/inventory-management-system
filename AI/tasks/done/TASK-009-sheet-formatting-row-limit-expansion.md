# TASK-009: 시트 서식 및 유효성 검사 적용 행 범위 확장 (503행 이후 누락 결함 수정)

## Objective

`🗂️ 품목 마스터` 및 `📝 통합 입출고 기록장`, 각 업장별 시트에서 503행부터 배경색(노란색/파란색), 가운데 정렬, 드롭다운 유효성 검사, 천단위 숫자 서식 및 조건부 서식이 사라지는 결함을 해결한다.
`Config.gs`의 `VALIDATION_ROWS` 상수를 실무 운영 규모(최소 2,000행 이상)로 상향하고, 기존에 배포된 시트들의 503행 이후 영역에도 누락된 서식과 검증 규칙을 즉시 복구·적용하는 v12 마이그레이션 로직을 구현한다.

## Confirmed Facts

1. **상수 하드코딩** ([`src/Config.gs:87`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Config.gs#L87)):
   ```javascript
   const VALIDATION_ROWS = 500; // 성능 최적화를 위한 검증/서식 고정 적용 범위
   ```
2. **시트 생성 시 서식 적용 범위** ([`src/SheetBuilder.gs:259-282`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs#L259-L282)):
   - 품목 마스터 헤더는 1~2행이며, 데이터는 3행부터 시작한다.
   - 서식 설정 코드가 모두 `sheet.getRange(3, col, VALIDATION_ROWS, ...)`로 작성되어 있다.
   - 즉, 3행부터 **502행까지만 (3 + 500 - 1 = 502)** 배경색(노랑 `#fffde7`, 파랑 `#e8f0fb`, 회색 `#f3f3f3`), 가운데 정렬(`setHorizontalAlignment("center")`), 데이터 유효성 검사(드롭다운), 숫자 서식(`setNumberFormat("#,##0")`), 조건부 서식이 적용된다.
   - **503행부터는 `VALIDATION_ROWS = 500`의 범위를 벗어나므로**, 스프레드시트 기본 상태(흰색 배경, 텍스트 좌측/숫자 우측 정렬, 드롭다운 없음)로 남는다.
3. **타 시트 동일 결함 영향 확인**:
   - `buildTemplateSheet(ss)` ([`src/SheetBuilder.gs:173-191`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs#L173-L191)): 템플릿 및 업장 시트도 `VALIDATION_ROWS = 500`으로 502행까지만 서식 적용.
   - `buildConsolidatedLog(ss)` ([`src/SheetBuilder.gs:314-316`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs#L314-L316)): 통합 입출고 기록장도 동일하게 500행으로 제한.
   - `_protectTransactionSheet()` ([`src/RBAC.gs:364-375`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/RBAC.gs#L364-L375)): 시트 보호 예외 편집 범위도 `VALIDATION_ROWS`를 기준으로 설정되어 있어, 503행 이상에서 일반 직원의 셀 편집이 시트 보호에 의해 차단될 위험 존재.
4. **현재 스키마 버전** ([`src/Config.gs:91`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Config.gs#L91)): `CURRENT_SCHEMA_VERSION = 11` (TASK-002에서 v11로 상향됨).

## Hypotheses

- GAS에서 2,000~3,000행 수준으로 서식 및 데이터 유효성 검사 범위를 확장하더라도 1회성 적용이므로 스크립트 실행 시간(Execution Time) 6분 한도에 여유가 충분하며, 렌더링 성능 저하는 무시할 수 있는 수준이다.
- 기존 시트에 데이터가 채워져 있는 상태에서 `setBackground`, `setHorizontalAlignment`, `setDataValidation`, `setNumberFormat`을 재적용해도 기존 셀의 텍스트/숫자 데이터 값(`values`)은 손상되지 않는다.

## Business Context

- 호텔에서 관리하는 품목 수가 500건을 넘어서면서 신규 품목 등록 및 CSV 대량 등록을 통해 503행 이상의 데이터가 유입되고 있다.
- 503행부터 시트 배경색 및 가운데 정렬이 풀리고, 단위·과세구분 등의 드롭다운이 작동하지 않아 현장 관리자의 시각적 혼란과 수동 기입 실수가 발생하고 있다.
- 품목 마스터뿐만 아니라 연중 거래가 누적되는 입출고 시트도 500행을 빠르게 초과하므로 충분한 행 범위 확장이 필수적이다.

## Current System

- 시스템 초기화([`createAll`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Code.gs#L46)) 시점에만 `VALIDATION_ROWS = 500`을 기준으로 502행까지만 서식과 유효성 검사를 굽는다.
- 이미 데이터가 입력되어 운영 중인 스프레드시트에는 503행 이후로 서식을 자동 연장해 주는 메커니즘이 존재하지 않는다.

## Root Cause / Diagnostic Logic

`src/Config.gs`의 `VALIDATION_ROWS` 상수가 `500`으로 고정되어 있고, `src/SheetBuilder.gs`의 모든 서식·검증 적용 메서드가 시작 행 3번부터 `VALIDATION_ROWS`(500개 행)까지만 한정하여 범위(`Range`)를 지정하기 때문이다 (종료 행 = 3 + 500 - 1 = 502행).

## Requirements

### Functional
- [ ] `src/Config.gs`의 `VALIDATION_ROWS` 상수를 기본 `2000` (필요시 최대 `3000`)으로 상향한다.
- [ ] `src/SheetBuilder.gs`의 품목 마스터(`buildItemMaster`), 입출고 템플릿(`buildTemplateSheet`), 통합 입출고 기록장(`buildConsolidatedLog`) 서식/검증 로직이 상향된 `VALIDATION_ROWS`를 정상 반영하도록 보장한다.
- [ ] `src/RBAC.gs`의 시트 보호 편집 허용 범위(`_protectTransactionSheet`)도 상향된 `VALIDATION_ROWS` 범위를 적용하여 503행 이후에도 정상 편집 가능하도록 보장한다.
- [ ] `src/Migration.gs`에 v12 마이그레이션(`migrateToV12`)을 추가하여, `CURRENT_SCHEMA_VERSION = 12`로 전환 시 기존에 생성된 다음 시트들에 상향된 서식, 정렬, 드롭다운, 숫자 서식, 조건부 서식을 일괄 확장 적용한다:
  - `🗂️ 품목 마스터`
  - `📋 입출고_템플릿`
  - `📝 통합 입출고 기록장`
  - 활성 업장 시트 전체 (`_getActiveShopNames()`)
- [ ] 마이그레이션 실행 시 기존에 셀에 입력된 데이터(`getValue`/`getValues`)가 유실되거나 초기화되지 않아야 한다.

### Non-Functional
- [ ] 마이그레이션 함수 실행 시간이 GAS 6분 제한에 걸리지 않도록 배치(`getRange` 일괄 처리) 단위로 서식을 적용한다.
- [ ] 단위 테스트(`tests/unit/`)를 통해 마이그레이션 함수가 2,000행 범위까지 서식과 유효성 검사 객체를 호출하는지 시뮬레이션 검증한다.

## Constraints

- GAS 환경 제약: `clear()`를 호출하면 데이터가 지워지므로, 기존 셀 데이터를 보존하면서 서식만 덮어쓰기 위해 `setBackgrounds`, `setNumberFormats`, `setDataValidations` 등을 타겟 레인지에 직접 호출해야 한다.
- 스프레드시트의 총 행 수가 `VALIDATION_ROWS + 10`보다 적을 경우 범위를 가져오다 에러가 발생할 수 있으므로, 서식 적용 전 `sheet.getMaxRows()`를 확인하고 필요 시 `sheet.insertRowsAfter(maxRows, neededRows)`로 행을 자동 확충해야 한다.

## Files to Inspect

- [`src/Config.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Config.gs)
- [`src/SheetBuilder.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs)
- [`src/Migration.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Migration.gs)
- [`src/RBAC.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/RBAC.gs)
- [`tests/unit/migration-v11.test.js`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/tests/unit/migration-v11.test.js)

## Files to Modify

- [`src/Config.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Config.gs): `VALIDATION_ROWS` 상향 (`500` → `2000`), `CURRENT_SCHEMA_VERSION` 상향 (`11` → `12`)
- [`src/SheetBuilder.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs): 시트 생성 시 행 부족 시 자동 확충(`insertRowsAfter`) 안전장치 확인
- [`src/Migration.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Migration.gs): `migrateToV12()` 신설 및 `runMigrations()`에 v12 디스패치 등록
- [`src/RBAC.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/RBAC.gs): `_protectTransactionSheet`에서 보호 범위 적용 시 `VALIDATION_ROWS` 참조 동기화

## Files to Create

- [`tests/unit/migration-v12-formatting.test.js`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/tests/unit/migration-v12-formatting.test.js): v12 마이그레이션 후 2,000행까지 서식/정렬/유효성검사가 확장 적용되는지 검증하는 단위 테스트

## Implementation Plan

1. **상수 변경**:
   - `src/Config.gs`:
     - `const VALIDATION_ROWS = 2000;`
     - `const CURRENT_SCHEMA_VERSION = 12;`
2. **마이그레이션 함수 구현 (`src/Migration.gs`)**:
   - `migrateToV12(ss)` 함수 작성:
     - 품목 마스터 시트:
       - 행 수 확인: `masterSheet.getMaxRows() < VALIDATION_ROWS + 2`이면 행 추가.
       - 입력 컬럼 배경색(`COLORS.inputBg`), 자동수식 컬럼 배경색(`COLORS.autoBg`), 스페이서 회색(`COLORS.grayBg`)을 3행부터 `VALIDATION_ROWS`까지 재적용.
       - A~X열 전체에 대해 `setHorizontalAlignment("center")` 적용.
       - 카테고리(C열), 단위(E열), 과세구분(S열), 사용유무(X열)의 DataValidation 적용.
       - 매입단가(T열) 및 수식금액 열 `#,##0` 포맷 적용.
       - 조건부 서식 범위 갱신.
     - 입출고 시트들(`입출고_템플릿`, `통합 입출고 기록장`, 활성 업장 시트들):
       - 행 수 확인 및 확충.
       - 날짜 포맷(`yyyy-mm-dd`), 단가 포맷(`#,##0`).
       - 배경색(입력컬럼/자동컬럼) 및 가운데 정렬 재적용.
       - 구분(입고/출고/폐기), 수량(>0), 품목코드 드롭다운 재적용.
     - `_protectTransactionSheet()` 재호출하여 시트 보호 범위 갱신.
3. **단위 테스트 작성**:
   - `tests/unit/migration-v12-formatting.test.js`에서 mock sheet를 생성하고 `migrateToV12()` 호출 후 2000행 범위의 range에 서식 및 validation이 호출되었는지 assert.

## Migration Plan

- 본 Task 자체가 Schema v12 마이그레이션을 포함한다.
- 배포 후 관리자가 스프레드시트 메뉴 또는 웹앱 진입/온오프 시 `runMigrations()`가 실행되어 자동으로 v12 마이그레이션을 수행한다.
- 수동 실행이 필요한 경우 Apps Script 콘솔에서 `runMigrations()`를 1회 실행할 수 있다.

## Test Plan

### Unit Test
- `npm run test:unit`
- 신규 작성된 `migration-v12-formatting.test.js`가 정상 통과하는지 검증.
- 기존 단위 테스트 5종(`fifo-lot-splitting`, `migration-v11`, `monthly-closing`, `onedit-changelog`, `run-all`)이 100% 통과하는지 검증.

### E2E Test (Playwright)
- `npm run dev:push`로 DEV 환경 배포.
- DEV 스프레드시트의 `🗂️ 품목 마스터` 503행~520행 셀을 직접 확인:
  - 노란색/파란색 배경색이 채워져 있는가?
  - 텍스트가 가운데 정렬되어 있는가?
  - C열(카테고리), E열(단위), X열(사용유무) 클릭 시 드롭다운 목록이 정상 노출되는가?
  - 숫자 입력 시 천단위 콤마가 자동 서식화되는가?

## Regression Risk

- `VALIDATION_ROWS` 상향으로 인한 시트 행 추가 시 Google Sheet 파일 크기 증가: 2,000행은 Google Sheets 제한(1,000만 셀)의 1% 미만이므로 성능 영향 없음.
- 기존 데이터가 덮어써질 위험: 값(`setValues`)을 건드리지 않고 서식(`setBackground`, `setHorizontalAlignment`, `setDataValidation`, `setNumberFormat`)만 갱신하므로 데이터 유실 위험 없음.

## Acceptance Criteria

- [ ] `src/Config.gs`의 `VALIDATION_ROWS`가 `2000` 이상으로 정의되어 있다.
- [ ] `🗂️ 품목 마스터`의 503행부터 2000행까지 배경색, 가운데 정렬, 드롭다운, 숫자 서식이 정상 적용된다.
- [ ] `📋 입출고_템플릿`, `📝 통합 입출고 기록장`, 각 업장 시트의 503행부터 2000행까지 서식 및 유효성 검사가 정상 적용된다.
- [ ] 단위 테스트 스위트가 에러 없이 100% 통과한다 (`npm run test:unit`).

## Human Approval Required

- 없음. (순수 버그 수정 및 서식 범위 정상화)

## Deployment Notes

- 배포 후 DEV 및 Production 스프레드시트에서 관리자 도구 메뉴의 `🔄 통합 갱신` 또는 Apps Script 콘솔에서 `runMigrations()`를 1회 실행하여 v12 마이그레이션을 즉시 적용해야 한다.

## Rollback Plan

- 문제 발생 시 `git checkout`으로 변경 소스를 이전 커밋으로 되돌리고 `npm run dev:push`를 실행한다.
- 시트 서식은 이전 버전의 `VALIDATION_ROWS = 500` 기준으로 재적용하거나 시트 버전 기록(Version History)을 통해 롤백할 수 있다.

## Final Report

### 구현 내용

**1. 상수 상향 (`src/Config.gs`)**
- `VALIDATION_ROWS`: `500` → `2000` (3행부터 2002행까지 적용)
- `CURRENT_SCHEMA_VERSION`: `11` → `13`
  (v12 = 본 Task의 서식 범위 확장, v13 = 별건인 기초데이터 CASE 단위 삭제)

**2. 서식 로직을 공용 함수로 분리 (`src/SheetBuilder.gs`)**

Task 명세는 `migrateToV12()`에서 서식 코드를 다시 작성하도록 되어 있었으나, 그렇게 하면
`build*()`와 마이그레이션에 **같은 서식 규칙이 두 벌** 생겨 이후 컬럼 추가·색상 변경 때 반드시 어긋난다.
그래서 `build*()` 안의 서식 블록을 그대로 들어내 공용 함수로 만들고 양쪽이 함께 호출하도록 했다.

| 함수 | 대상 | 호출처 |
|------|------|--------|
| `_ensureMinRows(sheet, requiredRows)` | 공통 | 아래 3개 함수 + `MIGRATIONS[12]` |
| `applyItemMasterFormatting(ss, sheet)` | 🗂️ 품목 마스터 | `buildItemMaster()`, `MIGRATIONS[12]` |
| `applyTxInputSheetFormatting(sheet)` | 📋 입출고_템플릿 · 업장 시트 | `buildTemplateSheet()`, `MIGRATIONS[12]` |
| `applyConsolidatedLogFormatting(sheet)` | 📝 통합 입출고 기록장 | `buildConsolidatedLog()`, `MIGRATIONS[12]` |

`_ensureMinRows()`가 행 부족 시 `insertRowsAfter()`로 한 번에 확충하므로,
신규 시트 기본 행 수(1000)가 `VALIDATION_ROWS + 2`(2002)보다 작아 `getRange`가 실패하던 문제도 함께 막는다.

**3. v12 마이그레이션 (`src/Migration.gs`)**
- 🗂️ 품목 마스터 / 📝 통합 입출고 기록장 / 📋 입출고_템플릿 / 활성 업장 시트 전체에 대해
  행 확충 → 공용 서식 함수 재호출
- 업장 시트는 시트 보호의 **편집 허용 범위(`setUnprotectedRanges`)도 2000행으로 확장** —
  이걸 빼면 서식은 생겨도 503행 이후 입력이 시트 보호에 막힌다
- `setValues`/`setFormula`를 일절 호출하지 않으므로 기존 입력 데이터는 보존된다 (단위 테스트로 검증)
- 멱등: 재실행해도 행이 추가되지 않고 서식 결과가 동일하다

**4. `src/RBAC.gs`는 수정하지 않았다**
`_protectTransactionSheet()`라는 함수는 실제로 존재하지 않는다. Task가 지목한 `RBAC.gs:364-375`는
`generateNewShops()`이고, 보호 범위·검증 범위가 모두 `VALIDATION_ROWS` 참조식이라
**상수를 올리는 것만으로 신규 업장 시트에 자동 반영**된다. 기존 업장 시트는 v12가 갱신한다.
(같은 이유로 `fixSheetProtection()`도 별도 수정 없이 2000행 기준으로 동작한다.)

### 명세와 다르게 처리한 점

**업장 시트의 품목코드(B열) 드롭다운은 재적용하지 않았다.**
Implementation Plan에는 "품목코드 드롭다운 재적용"이 있었지만, `RBAC.gs`의 `removeItemCodeValidation()`이
업장 시트를 **"품목코드 직접 입력"** 구조로 전환한 운영 결정이 이미 반영되어 있다
(시트 A1 안내문도 "품목코드: 직접 입력"으로 바뀐다). 여기서 목록 검증을 다시 걸면 그 결정을 되돌리게 되므로
의도적으로 제외하고 `MIGRATIONS[12]`에 사유를 주석으로 남겼다. 단위 테스트에도 회귀 방지 검증을 넣었다.

### 테스트 결과

**단위 테스트 — `npm run test:unit` 전체 통과 (6개 파일)**

신규 `tests/unit/migration-v12-formatting.test.js` (32개 검증 전부 통과).
기존 `migration-v11.test.js`처럼 로직을 복사하지 않고, `src/Config.gs`·`src/SheetBuilder.gs`·
`src/Migration.gs`를 **vm 컨텍스트에 실제로 로드**해 SpreadsheetApp만 모킹했다
(복사본이 원본과 어긋날 여지를 없애기 위함).

검증 항목: 상수 값 / 시트별 2002행 확충 / 서식이 정확히 2002행까지 적용 / 배경색·정렬 적용 /
`setValues`·`setFormula` 미호출(데이터 보존) / 마스터 드롭다운 4종 · 금액 열 `#,##0` /
입출고 시트 구분·수량 드롭다운 / 업장 시트 보호 범위 확장 / 템플릿 보호 범위 미변경 /
B열 드롭다운 미재적용 / 멱등성 / 대상 시트 부재 시 무해 통과.

**E2E — DEV 배포 후 전체 스위트 통과 (8 passed / 1 skipped / 0 failed)**
`npm run dev:push` 후 `npx playwright test` 실행. 기존 5개 스펙 정상 동작 확인.

### 미완료 — Human QA 필요

**시트에 실제로 서식이 칠해진 것은 아직 확인되지 않았다.** 코드 배포만 했고,
`runMigrations()`는 `SpreadsheetApp.getUi()` 확인 다이얼로그를 거치는 **관리자 수동 실행 경로**라
스크립트에서 대신 실행하지 않았다. Test Plan의 "DEV 스프레드시트 503~520행 육안 확인"은
아래 배포 후 절차를 밟은 뒤 QA에서 확인해야 한다.

### 변경 파일

| 파일 | 변경 |
|------|------|
| `src/Config.gs` | `VALIDATION_ROWS` 500→2000, `CURRENT_SCHEMA_VERSION` 11→13 |
| `src/SheetBuilder.gs` | 공용 서식 함수 4종 분리, `build*()`가 이를 호출하도록 변경 |
| `src/Migration.gs` | `MIGRATIONS[12]` 신설 |
| `tests/unit/migration-v12-formatting.test.js` | 신규 |

### 배포 후 필수 절차

DEV·Production 각 스프레드시트에서 관리자 메뉴 또는 Apps Script 콘솔에서 **`runMigrations()`를 1회 실행**해야
기존 시트의 503행 이후에 서식이 적용된다. (v11 → v13까지 순차 실행된다.)
