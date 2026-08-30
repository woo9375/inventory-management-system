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
- (작업 완료 후 작성)
