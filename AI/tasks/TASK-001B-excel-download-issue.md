# TASK-001B

## Objective
`JS_BaseData.html` 내 재고 실사 Excel 다운로드가 실패하는 원인을 진단하고 최소 변경으로 개선한다.

## Confirmed Facts
- 사용자가 "📥 실사 양식 다운로드 (Excel)" 버튼 클릭 시 `downloadPhysicalCheckListExcel()`가 호출된다.
- 프론트엔드는 SheetJS(XLSX) 라이브러리를 사용하여 브라우저 메모리에 `excelData` 배열을 기반으로 워크북(wb)을 만들고, `XLSX.writeFile(wb, fileName)`로 파일(Data URI Blob 기반) 다운로드를 트리거한다.
- 구문상의 명백한 에러(null 참조 등)는 발견되지 않았으며, `.xlsx` 포맷을 생성하는 것이 맞다.

## Hypotheses
- 코드 로직에는 문제가 없으나, 모바일 WebView(카카오톡, 네이버 앱 등) 및 특정 Iframe 샌드박싱 환경(GAS Web App 제약)에서는 클라이언트 사이드 다운로드(Blob 기반)가 팝업 차단 또는 보안 정책에 의해 무시/차단될 수 있다.

## Business Context
- 관리자가 현장에서 재고를 실사하기 위해 필수적으로 사용되는 기능이므로 모든 사용 디바이스(PC, 모바일)에서 원활하게 동작해야 한다.

## Current System
- 클라이언트(브라우저)에서 데이터를 수집하여 엑셀을 만들고 바로 다운로드하는 구조.

## Root Cause / Diagnostic Logic
1. 클라이언트(PC Chrome, 모바일 Safari 등)에서 직접 다운로드 버튼을 눌렀을 때 브라우저 콘솔 로그 및 아무 반응이 없는지 확인.
2. 만약 특정 기기나 인앱 브라우저에서만 실패한다면 브라우저 제약이 원인이다.
3. 클라이언트 방식만으로 해결할 수 있는 우회 방법(Blob + `window.open`, 팝업 차단 우회 등)을 먼저 모색한다.

## Requirements
- 재고 실사 데이터 누락 없이 엑셀 형식(`.xlsx`)으로 정상 다운로드.

## Constraints
- 클라이언트 방식으로 해결 가능한데도 불필요하게 서버사이드 엑셀 생성/Drive 권한 부여/임시파일 스케줄러 삭제 등을 설계하여 복잡도를 높이지 않는다.

## Files to Inspect
- `src/JS_BaseData.html`
- `src/Index.html` (SheetJS 포함 여부)

## Files to Modify
- `src/JS_BaseData.html` (다운로드 로직 개선이 필요한 경우)

## Files to Create
- 없음

## Implementation Plan
1. 테스트 환경(PC, Mobile, In-app)에서 실패 원인 확인.
2. 클라이언트 다운로드 방식의 호환성을 높이는 최소 변경 코드 작성.
3. (최후의 수단으로만) GAS 서버사이드 기반 URL 제공 방식으로 전환 설계.

## Migration Plan
- N/A

## Test Plan
- PC Chrome, PC Edge, Android Chrome, iOS Safari 환경 다운로드 성공 여부 검증.
- 다운로드한 파일이 MS Excel에서 오류 없이 열리는지 검증.

## Regression Risk
- Low (프론트엔드 특정 버튼 함수 내로 국한됨)

## Acceptance Criteria
- PC 브라우저 다운로드 성공
- 모바일 브라우저 다운로드 성공
- In-App Browser에서도 정상 동작하거나 지원 범위를 명확히 정의
- 실제 `.xlsx` 파일이 Excel에서 정상 열림
- 품목 데이터 누락 없음
- 파일명 정상
- 다운로드 후 잔여 임시파일 없음

## Human Approval Required
- In-App Browser 등 절대 지원이 불가능한 기기가 발견될 경우 지원 범위 확정.

## Deployment Notes
- 테스트 과정 중 잦은 팝업 차단 확인 요망.

## Rollback Plan
- `JS_BaseData.html` 원복.

## Final Report
- (작업 완료 후 작성)
