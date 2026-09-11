# TASK-017: 거래처 마스터 신설 및 품목 마스터 연동

## Objective
매입처 관리를 위한 "🤝 거래처관리" 시트를 신설하고, 기존 "🗂️ 품목 마스터" 시트에 거래처코드 열을 삽입하여 각 품목이 주 거래처를 참조할 수 있도록 구조를 확장한다.

## Confirmed Facts
- 품목 마스터는 웹앱 화면이 없고 스프레드시트 전용이다. (범위 외: 웹앱 거래처 관리 화면, 사장된 `src/JS_Master.html`은 수정하지 않는다)
- `src/Config.gs`에서 `CURRENT_SCHEMA_VERSION`은 16이다 (라인 95).
- 품목 마스터의 열 수는 현재 24개(`MASTER_COL_COUNT`)이다 (라인 170).
- `src/SheetBuilder.gs`에는 `A1:X1`, `X2` 등의 A1 Notation이 여러 곳 하드코딩 되어 있다.
- `src/Migration.gs`의 과거 마이그레이션(v9, v14)에도 `X2`, `W3` 등 하드코딩 주소가 존재한다.
- `src/Code.gs`의 `onEdit` 함수 내에 변경 이력 추적 컬럼 맵(`TRACKED_COLS`)이 존재한다 (라인 151-158).

## Hypotheses
- "🤝 거래처관리" 시트의 사용여부(M열) 검증 드롭다운은 생성 시점에 하드코딩으로 적용 가능하다.
- `uploadItemMasterCSV` 등 기존 기능은 S열 삽입으로 인해 인덱스가 하나씩 밀리므로, 영향을 받는 CSV 매핑 로직 수정 시 에러가 발생하지 않는지 확인 필요하다.

## Business Context
- 시스템에 거래처(매입처) 개념이 부재하여 발주 및 정산 시 담당자 기억에 의존하고 있다.
- 거래처코드는 PK로 `VND-001` 형식으로 자동 채번되며, 사용여부는 "사용", "미사용" 상태로 논리적 삭제를 원칙으로 한다. (사용 중인 품목이 있는 거래처 물리 삭제 금지)
- 품목 1건당 주 거래처 1곳을 매핑하며, 거래처명 변경 시 마스터가 깨지지 않게 코드로만 참조(VLOOKUP 금지)한다.
- 초기 데이터 59건은 Human이 직접 붙여넣을 예정이므로 마이그레이션 코드에 하드코딩해서는 안 된다.

## Current System
- 품목 마스터는 S열(19번)이 과세구분, X열(24번)이 사용유무로 총 24열 구조이다.
- 입출고 기록장은 9열 구조이며 이번 Task에서 건드리지 않는다.

## Root Cause / Diagnostic Logic
해당 없음

## Requirements
### Functional
- [ ] `Config.gs`에 `SHEET_VENDORS = "🤝 거래처관리"` 상수 정의
- [ ] "🤝 거래처관리" 시트 생성 함수(`buildVendors`) 추가 (SheetBuilder.gs)
- [ ] 품목 마스터의 기존 S열(과세구분) 위치에 "거래처코드" 열 삽입. (이후 열은 우측 1칸 시프트)
- [ ] 품목 마스터 S열에 "🤝 거래처관리" 시트의 거래처코드(사용여부='사용')를 참조하는 드롭다운 적용
- [ ] `v17` 마이그레이션 로직 구현 (새 시트 생성, 열 삽입, 수식 재작성, 서식 재적용)
- [ ] `Code.gs` onEdit 변경이력 대상에 "거래처" 필드 추가
- [ ] `ItemService.gs` CSV 매핑 및 배열 길이에 거래처코드 반영

### Non-Functional
- [ ] VLOOKUP 등을 사용해 거래처명을 품목 마스터에 복제하지 않는다.
- [ ] 기존 품목에 대한 거래처코드 소급 입력을 강제하지 않는다 (빈 값 허용).
- [ ] 초기 데이터 마이그레이션은 코드에 하드코딩하지 않고 빈 시트만 생성한다.

## Constraints
- **사장 파일 수정 금지**: `src/JS_Master.html` 수정 불가.
- **입출고 기록장 9열 구조 유지**: `SHEET_INOUT` 구조는 일절 변경하지 않는다.
- **의존적 수식 재작성**: 자동 시프트에 의존하지 말고 마이그레이션 코드에서 명시적으로 `ARRAYFORMULA`를 덮어쓴다.

## Files to Inspect
- `src/Config.gs`
- `src/SheetBuilder.gs`
- `src/Migration.gs`
- `src/Code.gs`
- `src/ItemService.gs`
- `src/Archive.gs`, `src/Dashboard.gs`, `src/StockEngine.gs` (MASTER_COL_COUNT 활용 부위)

## Files to Modify
- **`src/Config.gs`**
  - [NEW] `const SHEET_VENDORS = "🤝 거래처관리";` 추가 (라인 73 부근)
  - [MODIFY] `CURRENT_SCHEMA_VERSION` 16 → 17 (라인 95)
  - [MODIFY] `MASTER_COLS` 객체 내 `VENDOR_CODE: 18` 추가. 이후 인덱스 19~24로 +1 시프트 (라인 144~168)
  - [MODIFY] `MASTER_COL_COUNT` 24 → 25 (라인 170)

- **`src/SheetBuilder.gs`**
  - [NEW] `buildVendors(ss)` 함수 구현
  - [MODIFY] `reapplyAllSheetFormatting(ss)` 내에 `track(SHEET_VENDORS, ...)` 추가 (라인 192 부근)
  - [MODIFY] `applyItemMasterFormatting(ss, sheet)`
    - (3, 19) 과세 검증 → (3, 20) (라인 86)
    - (3, 24) 사용유무 검증 → (3, 25) (라인 88)
    - (3, 20) 숫자서식 → (3, 21) (라인 91)
    - (3, 19) 입력배경(과세, 매입단가) → 거래처(19), 과세(20), 매입단가(21) 각각 배경색 분리 적용 (라인 99)
    - (3, 24) 입력배경(사용유무) → (3, 25) (라인 100)
    - (3, 21) 자동수식배경 → (3, 22) (라인 105)
    - 가운데 정렬 폭 `rows, 24` → `rows, 25` (라인 112)
    - 조건부 서식 `=$X3="미사용"` → `=$Y3="미사용"`, 서식 범위 폭 24 → 25 (라인 121)
  - [MODIFY] `buildItemMaster(ss)`
    - `A1:X1` 병합 → `A1:Y1` (라인 422)
    - `headers` 배열 S열 위치에 "거래처코드" 삽입 (라인 424-428)
    - `S2:W2`, `X2` 색상 범위 → `T2:X2`, `Y2` 및 `S2`(입력색) 등 재조정 (라인 441-442)
    - `U3`, `V3` `W3` 수식 내 `S3:S`, `T3:T` 참조 1열씩 시프트 (`S3:S`→`T3:T`, `T3:T`→`U3:U`, 등) (라인 459-464)
    - `setColumnWidth` 19~24 블록을 19~25로 재조정 (라인 474-476)

- **`src/Migration.gs`**
  - [NEW] `MIGRATIONS[17] = function(ss) { ... }` 신규 작성
    - 1. "🤝 거래처관리" 시트 없으면 생성
    - 2. 품목 마스터 2행 S열이 "거래처코드"가 아니면 `insertColumnBefore(19)` 수행 후 헤더 기입
    - 3. 기존 시프트된 ARRAYFORMULA(V3, W3, X3) 코드로 재설정
    - 4. `reapplyAllSheetFormatting(ss)` 호출 (서식 재적용)
  - [MODIFY] 기존 마이그레이션 `X2` 헤더 검사 로직(v9) 등은 필요시 명시적 주소로 수정 (라인 268)
  - [MODIFY] `W3` 수식 재작성 로직(v14)을 `X3` 재작성으로 업데이트 등 과거 마이그레이션이 깨지지 않는지 검토 (라인 729)

- **`src/Code.gs`**
  - [MODIFY] `onEdit` 내 `TRACKED_COLS` 객체에 `[MASTER_COLS.VENDOR_CODE + 1]: "거래처"` 추가 (라인 151-158)

- **`src/ItemService.gs`**
  - [MODIFY] `addNewItem`, `updateItem` 등 새로운 필드 길이에 맞게 매핑 로직 수정. `newRowData[MASTER_COLS.VENDOR_CODE]` 처리 추가 (라인 134-148, 303-324)
  - [MODIFY] `uploadItemMasterCSV` 배열 매핑에서 기존 인덱스 겹침 방지 (거래처코드는 빈 값 처리) (라인 215-230)

## Files to Create
없음

## Implementation Plan
1. **Config.gs 수정**: 버전 상향 및 상수, `MASTER_COLS` 시프트 반영.
2. **SheetBuilder.gs 수정**: `buildVendors` 신규 작성 및 품목 마스터 25열 대응 서식/수식 재조정.
3. **Migration.gs 작성**: `v17` 마이그레이션 함수를 구현하여 열 삽입, 수식 강제 덮어쓰기, 시트 서식 리프레시 수행.
4. **Code.gs / ItemService.gs 보완**: 변경 이력 및 API 로직에 거래처코드(19번) 반영 처리.

## Migration Plan
- CURRENT_SCHEMA_VERSION 16 → 17
- "🤝 거래처관리" 시트 신규 생성
- 품목 마스터 시트에 거래처코드 열을 S열(19번)에 `insertColumnBefore(19)`로 삽입
- 기존 U, V, W 수식 등 뒤로 밀리는 `ARRAYFORMULA` 들을 새 위치에서 명시적 `setFormula`로 재작성
- `reapplyAllSheetFormatting()` 호출로 서식 복원

## Test Plan
### Unit Test
- `MASTER_COLS` 변경 후에도 `Dashboard.gs`, `Archive.gs` 의 의존성 함수들이 에러 없이 동작하는지 모킹 테스트.

### E2E Test (Playwright)
- DEV Web App 접속 후 마이그레이션 팝업 노출 및 v17 성공 여부 확인
- 스프레드시트 갱신 시 "🤝 거래처관리" 시트 생성 확인
- 품목 마스터의 S열 거래처코드 열 생성 및 U~Y열 동작 이상 유무 확인

## Regression Risk
- `Dashboard.gs`, `Archive.gs`, `StockEngine.gs` 에서 `MASTER_COL_COUNT`를 기반으로 가져온 2차원 배열의 인덱스가 밀려, 기존 19~24번 열을 참조하는 로직이 오작동할 수 있음 (상수화되어 있으므로 대부분 안전하나 하드코딩 부분 유의).

## Acceptance Criteria
- "🤝 거래처관리" 시트가 올바른 13열 폼으로 생성된다.
- 품목 마스터에 S열(거래처코드)이 삽입되고 기존 열은 한 칸씩 우측으로 밀린다.
- 마이그레이션 실행 후 서식/수식이 25열 구조에 맞게 복구된다.
- CSV 업로드 등 API 로직에서 에러가 발생하지 않는다.

## Human Approval Required
- 초기 거래처 59건 데이터 수동 삽입

## Deployment Notes
- 프로덕션 배포 후 최초 실행 시 v17 마이그레이션을 필히 수행.

## Rollback Plan
- 마이그레이션 전 자동 백업된 CSV를 활용하여 24열 구조 롤백 스크립트 실행.

## Final Report

### 명세에 대한 피드백 (구현 전 검토)

**1. 거래처관리 13열의 내용이 명세에 없다 (사용자 확인으로 해소)**
Acceptance Criteria는 "올바른 13열 폼"을, Hypotheses는 "사용여부(M열)"만 못박고 나머지 11열을 비워 뒀다.
Human이 59건을 직접 붙여넣는 작업이라 열을 잘못 잡으면 그 붙여넣기를 통째로 다시 해야 한다.
구현 전에 사용자에게 확인해 A~M을 확정했다: 거래처코드 / 거래처명 / 약어명 / 사업자번호 / 대표자명 /
업태 / 업종 / 주소 / 전화 / 이메일 / 사업자구분 / 비고 / 사용여부.

**2. `StockEngine.gs`에 열 하드코딩 2곳이 있다 — Files to Modify 누락 (가장 위험)**
명세는 StockEngine을 "Files to Inspect"에만 뒀고 Regression Risk에 "대부분 상수화되어 있으므로 안전"이라 적었으나,
실제로는 **쓰기 경로에 매직 넘버가 살아 있었다.**

```js
const unitPrice = Number(row[19]) || 0;                              // 매입단가 (S열 삽입으로 20이 됨)
masterSheet.getRange(3, 23, valueUpdates.length, 1).setValues(...);  // 재고 합계금액 (24가 됨)
```

두 번째가 특히 위험하다. 고치지 않았다면 FIFO 평가액이 **단위 세액 열**에 기록된다.
둘 다 `MASTER_COLS` 기반으로 교체했다.

**3. 대시보드 KPI 4개도 사용유무 열을 하드코딩한다 — 명세 누락**
`buildDashboard()`의 KPI 수식 4개가 `'품목 마스터'!X3:X`를 각자 들고 있다.
시트가 열 삽입 시 상호 참조를 자동으로 밀어 주긴 하지만, 그 시프트는 **지금 시트에 들어 있는 수식에만** 걸린다.
Constraints가 "자동 시프트에 의존하지 말 것"을 요구하므로 KPI 생성을 `applyDashboardKpiFormulas()`로 떼어내
빌더와 v17이 같은 정의를 쓰게 했다. 참조 문자열도 4벌 → 1벌로 줄여 다음 열 이동 때 하나만 빠뜨리는 실수를 막았다.

**4. 명세의 "v9/v14를 새 주소로 수정" 지시는 반대로 하면 깨진다**
Files to Modify는 v9의 `X2` 검사와 v14의 `W3` 재작성을 "명시적 주소로 수정 / X3 재작성으로 업데이트"하라고 적었다.
그대로 하면 **레거시 업그레이드 경로가 망가진다.** 마이그레이션은 낮은 버전부터 순서대로 도는데,
v9·v14가 도는 시점의 시트는 아직 24열이고 열을 미는 일은 v17이 뒤이어 한 번만 하기 때문이다.
지금 값을 최신 열로 바꾸면 두 번 밀린다. 두 함수는 **당시 지오메트리에 고정**해 두고,
왜 최신 열로 올리면 안 되는지를 주석으로 못박았다.

**5. 그래도 v14는 공용 서식 헬퍼 때문에 깨질 수 있었다 (명세 누락)**
v14는 `applyItemMasterFormatting()`을 부르는데, 이 헬퍼는 늘 **현재**(25열) 구조 기준으로 `getRange`를 쓴다.
v14가 도는 시점의 24열 시트에서는 열이 모자라 GAS 런타임 에러로 마이그레이션 체인이 통째로 죽는다.
`_ensureMinColumns()`(`_ensureMinRows`의 열 버전)로 선제 확보하고, v14의 헬퍼 호출을 try/catch로 감쌌다.
서식이 한 칸 어긋나게 발려도 곧바로 도는 v17이 전부 다시 굽는다.

**6. 열이 밀리면 데이터 검증도 함께 밀려 온다 (명세 누락)**
`insertColumnBefore(19)`는 값뿐 아니라 그 오른쪽 셀의 **데이터 검증도** 한 칸씩 민다.
새 검증만 덮어쓰면 밀려난 옛 과세/비과세 드롭다운이 **매입단가 열에 눌러앉아 숫자 입력을 막는다.**
`applyItemMasterFormatting`이 S~Y 구간 검증을 먼저 지우고 시작하도록 했다(멱등성도 함께 좋아진다).

**7. 배포와 마이그레이션 사이에 사용유무 열이 지워지는 창이 있다 (명세 누락, 최우선)**
코드는 `git push`로 즉시 나가지만 `runMigrations()`는 사람이 스프레드시트 메뉴에서 눌러야 한다.
그 사이 창에서 코드가 믿는 열(25열)과 시트의 실제 열(24열)이 한 칸 어긋난다.
읽기 오차보다 **쓰기**가 문제다 — `MASTER_COLS.TOTAL_VALUE + 1 = 24`인데 아직 안 밀린 시트에서 24열은 사용유무다.

자정 시간 트리거(`refreshDashboard` → `recalcStockAndUsage`)가 이 창에 걸리면
**전 품목의 사용유무 값이 FIFO 평가액으로 덮어써져 조용히 사라진다.** 사람이 아무것도 하지 않아도 벌어진다.
명세의 Rollback Plan(CSV 백업)은 사후 복구일 뿐 이 자동 파괴를 막지 못한다.

마스터에 값을 되쓰는 두 함수(`recalcStockAndUsage`, `_sortMasterByUsageStatus`)가 쓰기 전에
`_isMasterSchemaCurrent()`(셀 1개 조회)로 구조를 확인하고, 어긋나면 조치 방법을 로그로 남기고 멈추게 했다.

### 구현 내용

**Config.gs**
- `SHEET_VENDORS = "🤝 거래처관리"`, `VENDOR_COLS`(13열), `VENDOR_COL_COUNT`, `VENDOR_CODE_PREFIX`,
  `VENDOR_BIZ_ENTITIES`, `VENDOR_ACTIVE_CODE_COL`(드롭다운 소스 O열) 추가
- `MASTER_COLS.VENDOR_CODE: 18` 삽입 + 과세구분~사용유무 19~24로 시프트, `MASTER_COL_COUNT` 24 → 25
- `CURRENT_SCHEMA_VERSION` 16 → 17

**SheetBuilder.gs**
- `buildVendors(ss)` / `applyVendorsFormatting(sheet)` 신설 (A~M 13열 + 숨김 O열)
- `applyItemMasterFormatting`을 25열 구조로 재작성 — 거래처 드롭다운 추가, S~Y 검증 선클리어,
  조건부 서식 `=$Y3="미사용"`, 정렬/배경 범위를 `MASTER_COL_COUNT` 기반으로 변경
- `buildItemMaster` — `A1:Y1` / `A2:Y2` / 헤더 그룹색 / 열 너비 19~25 / 회계 수식 V3·W3·X3
- 회계 수식을 `_masterSupplyPriceFormula()` 등 3개 함수로 분리 (빌더와 v17이 같은 정의 공유)
- `applyDashboardKpiFormulas(sheet)` 분리, KPI의 사용유무 참조를 상수 기반 1벌로 통합
- `reapplyAllSheetFormatting`에 거래처관리 편입 (품목 마스터보다 **먼저** — 드롭다운 소스가 먼저 서야 한다)
- 신규 헬퍼: `_ensureMinColumns`, `_colLetter`, `_vendorActiveCodeRange`,
  `_isMasterSchemaCurrent`, `_warnMasterSchemaStale`

**Migration.gs**
- `MIGRATIONS[17]` 신설 — ①거래처 시트 생성 ②`insertColumnBefore(19)` + 헤더 ③회계 수식 V3/W3/X3 명시 재작성
  ④대시보드 KPI 재작성 ⑤전 시트 서식 재적용 ⑥캐시 무효화 ⑦재계산. 헤더 검사로 멱등
- 1행 제목 병합을 `A1:Y1`로 명시 확장 (병합이 이미 깨진 시트에서는 자동 확장이 일어나지 않는다)
- 삽입 열 너비를 110으로 명시 지정 — 삽입 열은 **왼쪽 열**(R열 스페이서, 20px) 서식을 물려받는다
- v9 · v14에 "당시 지오메트리 고정" 주석, v14의 공용 헬퍼 호출을 try/catch로 보호

**Code.gs** — `createAll`에 `buildVendors(ss)`를 품목 마스터보다 앞에 배치, `onEdit` `TRACKED_COLS`에 `"거래처"` 추가
**ItemService.gs** — `getItems` 응답에 `vendorCode`, `addNewItem`/`updateItem` 3종 매핑에 거래처 반영,
CSV 업로드는 거래처를 빈 값으로 유지(주석으로 명시), 정렬 헬퍼에 스키마 가드
**StockEngine.gs** — 하드코딩 2곳 상수화, `recalcStockAndUsage`에 스키마 가드

**드롭다운을 "사용 중인 거래처"로 좁힌 방법**
`requireValueInRange`에는 조건을 걸 수 없다. 걸러진 목록이 시트에 실제로 존재해야 하므로
13열 폼 밖(O열, 숨김)에 `=IFERROR(SORT(FILTER(A3:A, M3:M="사용")), "")`를 두고 이를 소스로 삼았다.
범위 폭은 고정 상수가 아니라 시트 행 수를 따라간다(TASK-016의 교훈).

### 명세와 다르게 처리한 점

1. **`(3,19)` 배경색 "각각 분리 적용" → 연속 1범위**
   거래처·과세·매입단가는 셋 다 입력색으로 같다. `setBackground` 3회 대신 `(3, 19, rows, 3)` 한 번으로 칠했다.
   결과는 동일하고 Batch I/O 원칙에 맞는다.
2. **v9/v14를 새 주소로 올리지 않았다** — 피드백 4 참조. 올리면 레거시 경로가 깨진다.
3. **거래처코드 자동 채번 함수는 만들지 않았다**
   Business Context에 "자동 채번"이 적혀 있으나 Files to Create는 "없음"이고, 웹앱 거래처 화면은 범위 외이며
   초기 59건은 Human이 코드까지 포함해 붙여넣는다. 즉 호출자가 없는 함수가 된다.
   대신 A열에 `VND-\d{3,}` 형식 **경고**(차단 아님 — 대량 붙여넣기를 막으면 안 된다)와
   코드 중복 조건부 서식을 걸어 PK 규칙을 시트가 스스로 지키게 했다.
4. **스키마 가드를 추가했다** — 피드백 7. 명세에 없지만 없으면 자동으로 데이터가 사라진다.

### 테스트 결과

**단위 테스트 — 전체 통과 (11개 파일)**

`tests/unit/migration-v17-vendor-master.test.js` 신규 (40개 검증). `src/*.gs`를 vm에 실제 로드해
마이그레이션을 끝까지 돌리는 방식이며, 재사용 가능한 목을 `tests/unit/lib/gas-sheet-mock.js`로 분리했다.

| 축 | 내용 |
|----|------|
| [1] 신규 생성 | 거래처관리 13열 헤더/드롭다운/텍스트 서식/숨김 소스열, 품목 마스터 25열, 회계 수식, 대시보드 KPI |
| [2] 마이그레이션 | 24열 → 25열, 데이터 보존, 거래처 빈 값, 밀려난 옛 검증 제거, 병합 확장, 열 너비, **멱등(재실행 동일)** |
| [3] 회귀 | `MASTER_COLS` 소비자(Dashboard·CacheManager·Archive·StockEngine·onEdit)가 25열 배열에서 동작 |
| [4] 스키마 가드 | 마이그레이션 전 재계산/정렬이 쓰기를 거부하고 **사용유무 열이 보존됨**을 실증 |

**기존 테스트 4건이 깨져서 함께 고쳤다** (모두 테스트 쪽 문제, 프로덕션 코드 아님)
- `migration-v12` / `migration-v16` — 목에 `getMaxColumns`/`insertColumnsAfter`가 없어 `_ensureMinColumns`에서 실패.
  검증 호출 수 기대값 4 → 5 (늘어난 1회는 새 드롭다운이 아니라 S~Y 선클리어)
- `monthly-closing` / `negative-stock` — 픽스처가 24열 배열과 인덱스 19/22/23을 하드코딩.
  **실제 `MASTER_COLS`를 읽어 쓰도록** 바꿔 다음 열 이동 때 또 깨지지 않게 했다. 목에 2행 헤더도 심었다
  (스키마 가드가 헤더를 본다). 더불어 목의 `getRange(row, col)` 2인자 형태가 단일 셀로 동작하지 않던 버그도 수정

**E2E (DEV) — 12 passed / 2 skipped / 1 failed**
실패 1건(`basedata-excel.spec.js`)은 코드 회귀가 아니라 **환경 문제**다. DEV 웹앱이 Google 계정 로그인을 요구하며,
`node tests/e2e/save-auth-state.js`를 1회 대화형 실행해 인증 프로필을 만들어야 한다.
로그인 자격증명 입력은 내가 수행하지 않는 작업이라 Human 조치가 필요하다.

⚠️ **이번 E2E 결과는 v17 검증으로 볼 수 없다.** DEV 스프레드시트는 아직 v16(24열)이고
`runMigrations()`는 메뉴에서 사람이 눌러야 하기 때문이다. 아래 절차 후 재실행이 필요하다.

### 미완료 — Human QA 필요

1. **DEV 스프레드시트에서 v17 마이그레이션 실행** (메뉴 → 스키마 마이그레이션). 코드는 DEV에 푸시 완료.
2. 마이그레이션 후 **E2E 재실행** (`npm run test:e2e`) — 위 ⚠️ 참조.
3. **초기 거래처 59건 붙여넣기** (A~M 13열). 코드는 데이터를 한 줄도 심지 않는다.
4. 붙여넣은 뒤 품목 마스터 S열 드롭다운에 **사용 중인 거래처만** 뜨는지 확인.
5. `save-auth-state.js` 1회 실행으로 E2E 인증 프로필 생성 (실패 1건 해소).
6. Production 배포 승인.

### 변경 파일

| 파일 | 내용 |
|------|------|
| `src/Config.gs` | 거래처 상수군, `MASTER_COLS` 시프트, 스키마 v17 |
| `src/SheetBuilder.gs` | `buildVendors`/`applyVendorsFormatting`, 25열 서식·수식, KPI 분리, 헬퍼 5종 |
| `src/Migration.gs` | `MIGRATIONS[17]`, v9·v14 지오메트리 고정 주석 및 보호 |
| `src/Code.gs` | `createAll` 순서, `onEdit` 거래처 이력 |
| `src/ItemService.gs` | 거래처 매핑 3종, CSV 주석, 정렬 스키마 가드 |
| `src/StockEngine.gs` | 하드코딩 2곳 상수화, 재계산 스키마 가드 |
| `Docs/SheetSchema.md` | 품목 마스터 25열 갱신, 🤝 거래처관리 섹션 신설 |
| `tests/unit/migration-v17-vendor-master.test.js` | 신규 (40 검증) |
| `tests/unit/lib/gas-sheet-mock.js` | 신규 — 재사용 가능한 GAS/Sheets 목 |
| `tests/unit/{migration-v12,migration-v16,monthly-closing,negative-stock}.test.js` | 열 상수화 및 목 보강 |

### 배포 후 필수 절차

**Production 배포 직후 곧바로 v17 마이그레이션을 실행할 것.**
코드만 배포하고 마이그레이션을 미루면 그 사이 시트가 24열, 코드가 25열이 되어 어긋난다.
스키마 가드가 자동 데이터 손실은 막지만, 그 상태에서는 재고 재계산과 품목 정렬이 **동작하지 않고 스킵된다**
(로그에 `[TASK-017] ... 중단` 이 남는다). 자정 트리거도 마찬가지로 스킵되므로 재고 수치가 갱신되지 않는다.

---

## 후속: DEV 마이그레이션 실행 실패와 수정 (1차 QA 피드백)

### 증상
DEV에서 `runMigrations()` 실행 시 v17에서 중단.

> ❌ 마이그레이션 v17 실행 중 오류:
> 병합된 셀의 일부만 포함된 열을 고정할 수 없습니다. 셀을 병합 해제하거나 병합된 셀을 모두 포함하도록 더 많은 열을 고정하세요.
> v16까지는 정상 적용되었습니다.

### 원인
`buildVendors()`의 `sheet.setFrozenColumns(2)`.
1행 제목을 `A1:M1`로 병합해 놓고 2열만 고정하면 고정선이 그 병합 범위를 가로지른다.
Sheets는 이를 거부한다. 품목 마스터가 `A1:Y1` 병합 + **행 고정만** 쓰는 것과 같은 제약인데,
거래처 시트에만 "가로 스크롤에도 코드·거래처명이 남게" 하려고 열 고정을 넣은 것이 화근이었다.

**왜 테스트가 못 잡았나** — 목(mock)의 `setFrozenColumns`가 값만 저장하는 no-op이었다.
실제 Sheets의 제약을 재현하지 않아 통과해 버렸다.

### 2차 피해: 반쯤 만들어진 시트
예외가 `insertSheet()` **뒤에** 터졌다. 즉 시트는 생성됐고 내용은 덜 채워진 상태로 남는다.
그런데 v17 Step 1이 `if (!ss.getSheetByName(SHEET_VENDORS))`로 존재 여부만 보고 스킵하게 되어 있어,
**고친 뒤 재실행해도 그 반쯤 만들어진 시트가 그대로 굳는다.** 존재 검사로는 "있다"와 "제대로 있다"를 구별할 수 없다.

### 수정
1. **`setFrozenColumns(2)` 제거** — 품목 마스터와 같이 행 고정만 쓴다. 왜 쓰면 안 되는지 주석으로 못박음
2. **`buildVendors`를 멱등으로** — `getSheetByName(...) || insertSheet(...)`. 이하 작업이 전부 같은 값 재기록이라
   재실행이 곧 복구가 된다
3. **v17 Step 1이 조건 없이 `buildVendors` 호출** — 신규 생성인지 복구인지는 로그로만 구분
4. **목이 실제 제약을 재현하도록** — `setFrozenRows/Columns`가 병합 범위를 가로지르면 실제와 같은 메시지로 예외

### 검증
- 고친 코드를 되돌려 버그를 일부러 재주입 → 목이 즉시 실패시킴을 확인 (재발 방지 실증)
- v17 테스트에 [5] 축 추가: 반쯤 만들어진 시트에서 v17 재실행 시 헤더·드롭다운·숨김 소스열·열 너비가
  모두 복구되고, 품목 마스터 25열 마이그레이션도 정상 완료됨
- v17 테스트 40 → **46 검증**, 단위 테스트 11개 파일 전체 통과
- DEV 재푸시 완료

### Human 재조치
DEV 스프레드시트에서 **v17 마이그레이션을 다시 실행**하면 된다.
남아 있는 반쪽 거래처 시트는 재실행이 알아서 복구하므로 **수동으로 지울 필요 없다.**
(직접 지워도 무방하다 — 그 경우 새로 생성된다.)
