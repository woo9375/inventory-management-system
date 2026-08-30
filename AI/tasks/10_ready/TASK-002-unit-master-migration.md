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
- (작업 완료 후 작성)
