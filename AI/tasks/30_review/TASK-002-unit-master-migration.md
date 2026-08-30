# TASK-002

## Objective
기초데이터 중 "단위" 목록을 업데이트(추가, 명칭 변경, 삭제)하고, 이 변경으로 인해 영향을 받는 기존 `SHEET_MASTER` 시트의 품목 데이터(마이그레이션)를 안전하게 처리한다.

## Confirmed Facts
- 새 단위 추가 요구: 망, 판, 마리, 족, 타레, 벌, 켤레, 매, 평, 본
- 단위 변경 요구: PACK → 팩, set → 세트
- 단위 삭제 요구: CASE
- 현재 단위 리스트의 기본 초기값은 `SheetBuilder.gs`와 `Migration.gs` 내 배열에 하드코딩되어 있다.
- 런타임 단위 리스트는 `BaseDataService.gs`를 통해 `SHEET_BASE_DATA` 시트에서 불러온다.

## Hypotheses
- 기존 품목 데이터(`SHEET_MASTER`의 E열 단위 데이터) 중 `PACK`, `set`, `CASE`를 사용하는 데이터가 여전히 남아있을 수 있다.
- 코드와 시스템 초기 데이터만 변경하고 기존 시트 데이터를 변환하지 않으면 드롭다운 불일치 및 입출고 데이터 정합성 문제가 발생할 것이다.

## Business Context
- 재고 단위를 한국어 실무 용어로 통일하고, 취급 품목의 다양성에 대응하기 위한 기초데이터 재구성 작업.

## Current System
- `SheetBuilder.gs` 및 `Migration.gs`가 초기 구축을 담당하며, 품목 단위는 `SHEET_MASTER`의 E열에 단순 텍스트로 저장된다.

## Root Cause / Diagnostic Logic
- 하드코딩된 배열과 시트에 저장된 기존 값 두 곳을 모두 업데이트(Migration)해야 해결된다.

## Requirements
- 배열에 명시된 단위 목록 일괄 반영.
- PACK은 '팩'으로, set은 '세트'로 일괄 변경.
- CASE 단위 사용 데이터를 어떻게 처리할 것인지 사용자 결정을 받아 처리.

## Constraints
- CASE 단위를 사용 중인 기존 데이터가 존재하는지 반드시 먼저 쿼리하여 확인한다.
- 기존 데이터를 단순 삭제하거나 임의로 수정하여 운영에 혼선을 주지 않는다.

## Files to Inspect
- `src/SheetBuilder.gs`
- `src/Migration.gs`
- `src/BaseDataService.gs` (기능 확인)
- 실제 구글 시트 `SHEET_MASTER`

## Files to Modify
- `src/SheetBuilder.gs`
- `src/Migration.gs`
- (1회성 마이그레이션 스크립트를 위한 임시 함수 작성 필요)

## Files to Create
- 없음 (임시 마이그레이션 함수 포함)

## Implementation Plan
1. `SHEET_MASTER`에서 `PACK`, `set`, `CASE`를 사용하는 품목 수 카운트 후 사용자에게 보고.
2. `SheetBuilder.gs` 및 `Migration.gs` 내 `units` 배열 수정.
3. 데이터 마이그레이션 스크립트(`migrateUnits_v10()` 등) 생성.
4. 사용자 승인 후 마이그레이션 실행.

## Migration Plan
- **안전 조건**: Idempotent(재실행 가능), 변경 전/후 검증 가능(건수 보고).
- `SHEET_MASTER` E열 순회 및 치환 -> `setValues()` 배치 업데이트 적용.

## Test Plan
- 신규 단위가 품목 등록/수정 화면 드롭다운에 정상 노출되는지 확인.
- CSV 업로드 시 새 단위 및 변경된 단위명(`팩`, `세트`)이 검증에 통과하는지 확인.
- 기존 데이터가 정상적으로 마이그레이션 되었는지 시트 눈측 검사.

## Regression Risk
- High (데이터 오염 시 마스터-트랜잭션 정합성 깨짐)

## Acceptance Criteria
- 새 단위 목록 완벽 반영
- PACK → 팩, set → 세트 적용 확인
- CASE 처리방안(일괄 공란 처리 등) 확정 후 데이터 반영
- 기존 품목 데이터 정합성 유지
- CSV 업로드 정상
- 품목 등록/수정 정상

## Human Approval Required
- **필수**: `CASE` 단위를 기존에 사용하고 있던 품목을 어떤 텍스트로 치환할 것인지(혹은 미입력으로 둘 것인지) 결정. 마이그레이션 실행 전 승인 요망.

## Deployment Notes
- 코드 배포 후 마이그레이션 스크립트를 수동으로 1회 실행(Run)해야 합니다.

## Rollback Plan
- 마이그레이션 전 `SHEET_MASTER` 사본(시트 복제) 백업 생성 필수. 오류 시 백업 시트로 덮어쓰기.

## Final Report

### Data Investigation
이 세션에서는 Google Sheets에 저장된 실제 Production 데이터(`SHEET_MASTER`의 PACK/set/CASE 사용 건수)에 직접 접근할 수 있는 안전한 read-only 경로가 없었다(Sheets 파일 ID/URL 미제공, 인증 세션 없음). **"기존 품목이 PACK/set/CASE를 실제로 몇 건 사용 중인지"는 Not Run — Production 데이터 접근 불가**로 남긴다. 대신 마이그레이션 함수(`MIGRATIONS[11]`) 자체가 실행 시점에 정확한 변경 전/후 건수를 콘솔 로그로 출력하도록 구현했으므로(아래 Implementation 참고), 사용자가 Apps Script 편집기에서 먼저 `testMigrationOnCopy()`(사본에서 안전하게 시험 실행)로 정확한 건수를 확인할 수 있다.

### Implementation
1. **[src/SheetBuilder.gs](src/SheetBuilder.gs)** `buildBaseDataSheet()` — 신규(브랜드 뉴) 스프레드시트 생성 시 사용되는 단위 목록 기본값에 PACK→팩, CASE 제거, 신규 10종(망/판/마리/족/타레/벌/켤레/매/평/본) 반영. (이미 운영 중인 시트에는 영향 없음 — 순수 신규 설치용 기본값)
2. **[src/Migration.gs](src/Migration.gs)** `migrate_to_v8()` 내 레거시 폴백 단위 배열도 동일하게 갱신(과거 스키마에서 업그레이드하는 극히 드문 경로 대비, 마찬가지로 라이브 데이터에는 영향 없음).
3. **[src/Migration.gs](src/Migration.gs)** `MIGRATIONS[11] = migrate_to_v11(ss)` 신규 추가 — 실제 운영 중인 시트를 대상으로 하는 진짜 마이그레이션:
   - 📂 기초데이터 시트 B열(단위 목록): `PACK`→`팩`, `set`(대소문자 무관)→`세트`로 치환, 신규 10종을 목록에 없는 것만 추가, `CASE`는 **목록에서만 제거**.
   - 🗂️ 품목마스터 시트 E열(품목별 단위): `PACK`/`set`만 자동 치환. **`CASE` 값은 건드리지 않고 그대로 둔 채 건수만 콘솔에 보고**(`⚠️ USER DECISION REQUIRED` 로그 출력).
   - 전체 로직이 "현재 값을 읽어 조건에 맞으면 바꾸고, 이미 바뀐 값은 다시 안 바뀜" 구조이므로 재실행해도 안전(멱등) — 아래 Tests에서 실제로 2회 연속 실행해 검증함.
4. **[src/Config.gs](src/Config.gs)** `CURRENT_SCHEMA_VERSION`을 `9` → `11`로 상향.
   - **부수 발견 사항**: 기존 코드에 이미 `MIGRATIONS[10]`(System_Logs 시트 추가)이 작성되어 있었으나 `CURRENT_SCHEMA_VERSION`이 계속 9에 머물러 있어 `runMigrations()`의 반복 범위(`currentVersion+1 ~ CURRENT_SCHEMA_VERSION`)에 v10이 한 번도 포함되지 못했다 — 즉 v10 마이그레이션이 지금까지 사실상 실행 불가능한 상태였다. 이번 TASK-002 구현을 위해 새 마이그레이션(v11)을 추가하려면 이 상수를 올려야 했으므로, 기존 v10 미실행 문제도 함께 해소된다(원치 않으면 알려달라 — v10/v11 순서와 영향은 아래 Deployment Notes 참고).

### CASE 처리 (User Decision Required)
Task 지시대로 "단위 목록에서 CASE 제거"와 "기존 데이터의 CASE 값 치환"을 분리했다:
- ✅ 목록에서 CASE 제거 — 구현 완료(신규 등록 시 더 이상 CASE를 선택할 수 없음).
- ⛔ **CASE replacement policy: USER DECISION REQUIRED** — 기존에 CASE로 등록된 품목의 단위를 무엇으로 바꿀지 결정되지 않았으므로, 마이그레이션은 해당 값을 건드리지 않고 그대로 남겨둔다. 결정 후 정확한 대체값과 건수를 알려주면 별도의 1회성 스크립트로 반영하겠다.

### Changed Files
- [src/SheetBuilder.gs](src/SheetBuilder.gs)
- [src/Migration.gs](src/Migration.gs)
- [src/Config.gs](src/Config.gs)

### Migration
- `MIGRATIONS[11]`는 코드에 작성 및 로직 테스트만 완료된 상태이며 **Production에서 실행하지 않았다** (본 세션 규칙 준수: Production 데이터 임의 수정 금지, Migration 자동 실행 금지).
- 실행 방법(사용자가 직접 수행): 코드 배포 후 Apps Script 편집기에서 우선 `testMigrationOnCopy()`를 실행해 스프레드시트 사본에서 결과를 먼저 확인한 뒤, 문제가 없으면 `runMigrations()`를 실행한다. `runMigrations()`는 실행 전 자동으로 `backupToCSV()`를 호출하고 Yes/No 확인창을 띄우므로 이미 안전장치가 있다.
- 참고: `runMigrations()`/`testMigrationOnCopy()`는 현재 `onOpen()` 커스텀 메뉴("🏨 관리자 도구")에 연결되어 있지 않다 — Apps Script 편집기에서 함수명을 직접 선택해 실행해야 한다(이 프로젝트의 기존 상태이며 이번 Task 범위 밖이라 변경하지 않음).

### Tests
- **Passed (자동, 로직 시뮬레이션)**: `MIGRATIONS[11]`과 동일한 로직을 Node.js 환경에 그대로 옮겨 실제 Sheet API(`getRange/getValues/setValues/clearContent`)를 모킹한 테스트를 작성해 실행. 22개 assertion 전부 통과:
  - PACK/set(대소문자 무관) → 팩/세트 정확히 치환됨(기초데이터 목록 및 품목마스터 데이터 양쪽).
  - CASE는 기초데이터 목록에서는 제거되지만 품목마스터의 기존 CASE 데이터 값은 변경되지 않고 보존됨.
  - 신규 10종 단위가 정확히 추가됨.
  - **멱등성 검증**: 동일 마이그레이션을 연속 2회 실행했을 때 2번째 실행에서는 변경 건수가 모두 0으로 떨어짐(추가 변형 없음) — CASE 건수만 원래 값 그대로 유지.
- **Passed (정적 검증)**: `node --check`로 `Migration.gs`/`Config.gs`/`SheetBuilder.gs` 구문 오류 없음 확인.
- **Not Run**: 실제 Production 스프레드시트 대상 실행(위 Migration 섹션 사유), CSV 업로드 화면·품목 등록/수정 화면에서 새 단위 드롭다운 노출 여부의 실기기/실계정 확인.

### Regression Risk
High(Task 명시)로 유지. 실제 라이브 데이터에는 아직 아무 변경도 가하지 않았으므로 현재 시점의 회귀 위험은 0이지만, `runMigrations()` 실행 시점부터는 Task가 지정한 백업/사전 테스트 절차를 반드시 거쳐야 한다.

### HUMAN ACTION REQUIRED
1. **CASE 대체 단위 결정** — 기존 CASE 품목을 무엇으로 바꿀지(또는 공란 처리할지) 결정.
2. 코드 리뷰/승인 후 배포(`git push origin main`).
3. Apps Script 편집기에서 `testMigrationOnCopy()` → 결과 확인 → `runMigrations()` 순서로 실행.
4. CASE 대체값이 결정되면 알려주면 별도 1회성 스크립트로 마무리 처리.
