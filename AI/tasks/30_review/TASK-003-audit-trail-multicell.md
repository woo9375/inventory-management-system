# TASK-003

## Objective
`Code.gs`의 `onEdit`에서 발생하는 품목마스터 편집 변경이력(Audit Trail) 로직을 다중 셀 편집, 복사-붙여넣기, 범위 삭제(Clear) 상황에서도 누락 없이 동작하도록 지원(배치 처리)한다.

## Confirmed Facts
- 현재 `onEdit` 내 기록 조건은 `e.range.getNumRows() === 1 && e.range.getNumColumns() === 1`로 제한되어 있다.
- 단일 셀 변경은 `appendRow()`를 사용하여 기록되며 동시 다발적 잦은 편집 시 GAS 쿼터 초과나 행 덮어쓰기 위험이 존재한다.
- API(`ItemService.gs`)를 통한 저장은 내부적으로 `setValues()` 배치 삽입으로 다뤄지며 안정적이다.

## Hypotheses
- `e.range` 객체의 폭(cols)과 높이(rows)를 순회하거나 2차원 배열(`e.range.getValues()`)로 읽어들여, 변경된 컬럼이 추적 대상(`TRACKED_COLS`)일 경우 로그 레코드(배열)를 수집하여 한 번에 `setValues()` 하면 다중 셀 복붙의 감사 로그를 안전하게 보존할 수 있다.

## Business Context
- 구글 시트 마스터 테이블을 엑셀처럼 여러 행/열을 긁어서 직접 복사-붙여넣기 하는 작업 패턴이 흔하므로, 이때 발생하는 대량의 변경 사항이 유실되지 않고 시스템 로그(`SHEET_CHANGELOG`)에 남아야 한다.

## Current System
- `onEdit(e)` 트리거에서 `e.oldValue`와 `e.range.getValue()`를 비교하여 단건 변경이력을 시트에 추가함. 다중 범위 복붙 시 `e.oldValue`는 `undefined`가 될 수 있다.

## Root Cause / Diagnostic Logic
- 기존 로직이 단일 셀 엣지 케이스에만 초점이 맞춰져 있어, 다중 셀 편집 시 `e.value` / `e.oldValue` 속성의 형태(단일 값이 아님) 변화를 대응하지 못해 차단해둔 상태임.

## Requirements
- 다중 셀/행에 대한 데이터 변경 시 각각의 셀별 변경 이력을 수집하여 한 번에 기록.
- 단, 단순 복붙으로 인해 "실제 값이 변경되지 않은 경우"는 제외 처리.
- `appendRow()`를 제거하고 메모리 배열 생성 후 일괄 기록 방식(`setValues()`) 도입.

## Constraints
- 구글 Apps Script의 `onEdit` 이벤트 객체 제약 상, 여러 셀을 한 번에 복붙(Paste)할 경우 `e.oldValue`가 단일 값이 아니거나 아예 제공되지 않는다. 이로 인해 과거값 추적이 일부 불가능해 "이전값 없음" 등으로 치환될 수 있음을 명확히 안내해야 한다.
- 동시성 충돌 방지를 위해 `LockService`를 추가해야 한다.
- 불필요하게 `Code.gs` 외의 코드(API 구조 등)를 리팩토링하지 않는다.

## Files to Inspect
- `src/Code.gs`

## Files to Modify
- `src/Code.gs` (onEdit 함수 내 변경이력 블록만 수정)

## Files to Create
- 없음

## Implementation Plan
1. `onEdit` 함수에서 단일 셀 제한 조건(`getNumRows === 1...`) 제거.
2. `e.range`의 범위만큼 반복문을 돌거나 `e.range.getValues()`를 사용하여 값이 존재하는(실제 수정된) 좌표 파악.
3. 대상 컬럼(품목명, 카테고리 등)인지 확인 후 변경내역 배열(`changeRecords`)에 `push`.
4. 배열이 비어있지 않다면 `LockService` 획득 후 `SHEET_CHANGELOG` 시트의 최하단에 `setValues`로 일괄 삽입.

## Migration Plan
- N/A

## Test Plan
- 단일 셀 변경
- 단일 셀 Delete
- 여러 셀 붙여넣기
- 여러 행 붙여넣기
- 여러 셀 Clear
- 값이 실제로 변경되지 않은 경우 (무시 확인)
- 이전 값이 없는 경우 (이전값 없음 처리)
- 숫자/문자/빈값 처리 등

## Regression Risk
- Medium (트리거 내장 오류 시 전체 편집 작업이 느려지거나 멈출 수 있음)

## Acceptance Criteria
- 단일/다중 셀 직접 편집에서 변경 건수가 정확히 `SHEET_CHANGELOG`에 기록되어야 함.
- 단순 UI/API 수정 기능은 영향을 받지 않아야 함.
- 락 에러 미발생 및 데이터 중복/누락 없음.

## Human Approval Required
- 다중 셀 복붙 시 GAS의 기술적 한계로 `oldValue` 추적이 완벽하지 않을 수 있음에 대한 사용자 사전 인지 및 승인.

## Deployment Notes
- `Code.gs` 수정 후 곧바로 `clasp push` 필요. (트리거 함수이므로 즉시 반영됨)

## Rollback Plan
- `Code.gs`의 `onEdit` 내 변경이력 블록 원복 (`git checkout`).

## Final Report

### Current Limitation (수정 전)
`onEdit()`의 변경이력 블록이 `e.range.getNumRows() === 1 && e.range.getNumColumns() === 1` 조건으로 하드 게이트되어 있어, 여러 셀/행을 한 번에 붙여넣거나 범위를 Clear하면 이력이 **전혀 기록되지 않고 조용히 무시**되었다. `appendRow()`도 사용 중이어서 동시 편집 시 행 유실/덮어쓰기 위험이 있었다.

### Implementation
`src/Code.gs`의 `onEdit()` 내 SHEET_MASTER 변경이력 블록만 재작성(다른 블록·다른 파일 변경 없음, `git diff --stat` 기준 이 함수 내부만 75줄 추가/16줄 삭제):
- 단일 셀 제한을 제거하고, 편집 범위(`startCol ~ startCol+numCols-1`)가 추적 대상 컬럼(`TRACKED_COLS`)을 하나라도 포함하면 진입하도록 변경.
- `sheet.getRange(row, 1, numRows, 2).getValues()`로 범위 내 전 행의 품목코드/품목명을 한 번에 배치 조회(개별 `getValue()` 반복 없음).
- `e.range.getValues()`로 편집된 범위의 새 값을 배치 조회.
- **oldValue 처리(GAS 제약 반영)**: `numRows===1 && numCols===1`(단일 셀)일 때만 `e.oldValue`를 신뢰할 수 있으므로 이 경우에만 실제 값 변경 여부를 비교해 "값이 실제로 변경되지 않은 경우"를 정확히 걸러낸다. 그 외(다중 셀 붙여넣기/드래그채우기/다중 Clear)는 GAS가 이전값을 제공하지 않으므로 `"(이전값 없음)"`으로 표기하고 새 값만 기록한다 — 이 한계는 Task의 Constraints/Human Approval 항목에 이미 명시되어 있던 사항으로, 별도 스냅샷 저장 로직을 새로 만들지는 않았다(Task 범위 밖의 과설계 방지).
- 품목코드(A열)가 없는 행(빈 템플릿 행 등)은 기록 대상에서 제외.
- 변경 레코드가 1건이라도 있으면 `LockService.getScriptLock()`(5초 타임아웃)으로 잠금 후 `SHEET_CHANGELOG`의 마지막 행 다음에 `setValues()` 일괄 삽입 — `appendRow()` 제거. 락 획득 실패 시에는 편집 자체를 막지 않고 콘솔에 에러만 남기고 넘어가도록 처리(Simple Trigger 30초 제한 고려, Task Constraints 준수).

### Changed Files
- [src/Code.gs](src/Code.gs) — `onEdit()` 내 SHEET_MASTER 변경이력 블록만 수정.

### Tests
- **Passed (정적 검증)**: `node --check`로 `Code.gs` 구문 오류 없음 확인.
- **Passed (로직 시뮬레이션, 12개 시나리오)**: 수정한 블록과 동일한 로직을 Node.js로 추출해 Sheet API를 모킹한 테스트를 작성, Task Test Plan에 명시된 10개 시나리오 전부 + 추가 2개(추적 대상 외 컬럼 무시, 품목코드 없는 행 무시)를 실행 — 전부 통과:
  1. 단일 셀 수정 — 이전값/새값 정확히 기록
  2. 단일 셀 삭제 — 이전값→빈값 정확히 기록
  3. 여러 셀 붙여넣기(한 행, B:D) — 3개 추적 컬럼 모두 기록, 이전값은 "(이전값 없음)"
  4. 여러 행 붙여넣기(B열, 3행) — 행별 품목코드 정확히 매칭되어 3건 기록
  5. 여러 셀 Clear(E열, 2행) — 새값 빈값으로 2건 기록
  6. 값이 동일한 경우(단일 셀) — 기록 안 함(무시 확인)
  7. 이전 값이 없는 경우 — "(이전값 없음)"으로 표기 후 기록
  8. 숫자 변경(매입단가) — 숫자값 그대로 정확히 기록
  9. 문자 변경(카테고리) — 문자값 정확히 기록
  10. 빈 값 → 값(초기재고) — 정확히 기록
  - (추가) 자동계산 컬럼 등 추적 대상 외 컬럼은 무시됨
  - (추가) 품목코드 없는 빈 행은 무시됨
- **Not Run**: 실제 Google Sheets에서의 라이브 `onEdit` 트리거 동작(로그인 후 실제 시트에 붙여넣기/Clear를 수행해 `SHEET_CHANGELOG`에 정확히 쌓이는지, LockService 동시성 등)은 Production 스프레드시트 접근 권한이 없어 수행하지 못했다.

### Remaining Risk
- **다중 셀 편집의 "실제 변경 여부" 미판별**: 위에서 설명한 GAS 자체의 구조적 한계로, 다중 셀 붙여넣기 시에는 이전 값을 알 수 없어 "동일한 값을 다시 붙여넣은 경우"도 변경 이력으로 기록될 수 있다(과다 기록 가능성). Task Human Approval 항목에 명시된 대로 사용자가 사전에 인지하고 승인한 제약이며, 이를 해결하려면 별도의 "편집 전 전체 스냅샷 저장" 메커니즘이 필요해 Task 범위를 크게 벗어나므로 이번에는 구현하지 않았다.
- Regression Risk는 Task 명시대로 Medium 유지 — `onEdit` 트리거 코드이므로 배포 즉시 반영되며, 실제 다중 사용자 동시 편집 환경에서의 라이브 검증은 Human QA 단계에서 필요하다.

### Deployment Notes
- `Code.gs`는 트리거 함수를 포함하므로 배포(`git push origin main` → GitHub Actions → clasp push) 후 별도 조치 없이 즉시 적용된다. 이번 세션에서는 push하지 않았다.
