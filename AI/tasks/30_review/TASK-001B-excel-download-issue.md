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

### Root Cause
코드에 명백한 syntax/null-참조 오류는 없었다는 기존 진단이 맞다. 실제 코드를 재검토한 결과 두 가지 사실을 확인했다:

1. **미포착 클라이언트 예외 (확정, 코드로 검증됨)**: 기존 `downloadPhysicalCheckListExcel()`는 `google.script.run(...).withSuccessHandler(fn)`의 `fn` 내부에서 `XLSX.writeFile()`을 직접 호출한다. `withFailureHandler`는 **서버(Apps Script) 측 오류만** 잡으며, 성공 콜백(`fn`) 내부에서 발생하는 **클라이언트 JS 예외는 어디서도 catch되지 않는다.** 즉 `XLSX.writeFile()`이 어떤 이유로든(iframe 제약, 팝업 차단, 메모리 등) throw 하면 사용자에게는 "아무 반응도 없는" 것처럼 보이고 콘솔에도 사용자에게 노출되는 토스트가 없다. 이것만으로도 "실패했는데 원인을 알 수 없다"는 증상을 설명한다.
2. **GAS 샌드박스 iframe 하의 저장 방식 취약성 (정황 증거)**: GAS Web App은 `script.google.com`이 아닌 `n-*.appspot.com`/`googleusercontent.com` 도메인의 **샌드박스 iframe** 안에서 실제 콘텐츠가 렌더링된다. SheetJS의 `XLSX.writeFile()`은 내부적으로 `msSaveBlob` → `<a download>` 클릭 순으로 자동 분기하는 축약형 저장 로직을 쓰는데, 일부 브라우저(특히 모바일 Safari, 카카오톡/네이버 인앱 브라우저)의 중첩 iframe/샌드박스 환경에서 이 축약형 로직이 조용히 무시되는 사례가 널리 보고되어 있다. PC/Android Chrome, iOS Safari, 인앱 브라우저를 이번 환경에서 직접 재현 테스트할 수는 없었으므로 이 부분은 정황 증거로만 취급한다.

### Implementation
`src/JS_BaseData.html`의 `downloadPhysicalCheckListExcel()`만 최소 수정:
- `XLSX.writeFile(wb, fileName)` 대신 `XLSX.write(wb, {type:'array'})`로 원시 바이트를 얻어 `Blob`을 직접 생성하고, `<a download>` 요소를 실제로 `document.body`에 추가한 뒤 클릭 → 제거 → `URL.revokeObjectURL()`하는 방식으로 변경. 라이브러리의 내장 축약 로직에 의존하지 않고 다운로드 과정을 직접 제어하여 더 넓은 브라우저/iframe 환경에서 안정적으로 동작하도록 함(서버사이드 전환 없이 클라이언트 방식 유지, Task 제약 준수).
- 전체를 `try/catch`로 감싸 실패 시 `showToast(..., 'error')`로 사용자에게 실패 사유를 노출하도록 함 — 위 Root Cause 1번(미포착 예외) 자체를 해결.

`printPhysicalCheckList()`(인쇄 기능)는 Task 범위 밖이므로 변경하지 않음.

### Changed Files
- [src/JS_BaseData.html](src/JS_BaseData.html) — `downloadPhysicalCheckListExcel()` 함수만 수정.

### Tests
- **Passed (자동 검증)**: 수정한 함수 로직을 별도 정적 HTML 하네스(SheetJS CDN 동일 버전 로드, `google.script.run`의 비동기 콜백을 흉내 낸 `setTimeout`)로 추출하여 실제 Chromium 브라우저(Claude Browser pane, PC 데스크톱 환경)에서 실행. 콘솔 로그로 `Blob` 생성(16,595 bytes, `application/octet-stream`), `URL.createObjectURL` 성공, 예외 없이 다운로드 트리거까지 확인. JS 구문/런타임 오류 없음.
- **Manual Verification Required**: PC Chrome/Edge, Android Chrome, iOS Safari, 카카오톡/네이버 인앱 브라우저에서의 실제 다운로드 성공 여부 및 Excel에서 파일이 정상적으로 열리는지 여부. 이 프로젝트 환경에서는 실제 GAS Web App(로그인 필요, Production 데이터 접근)과 각 실제 디바이스에 접근할 수 없어 수행하지 못했다.
- **Not Run**: 실제 GAS Web App URL을 통한 엔드투엔드 테스트(로그인 → 기초데이터 탭 → 다운로드 버튼 클릭).

### Regression Risk
- Low. 변경 범위가 해당 함수 내부로 완전히 국한되며, 서버 API(`getItemMasterData`) 호출 방식이나 다른 화면 로직은 건드리지 않음.

### HUMAN ACTION REQUIRED (Manual Verification)
아래 환경에서 실제 다운로드 후 Excel에서 정상적으로 열리는지 확인 필요:
- [ ] PC Chrome
- [ ] PC Edge
- [ ] Android Chrome
- [ ] iOS Safari
- [ ] 카카오톡/네이버 등 인앱 브라우저 (지원 범위를 Task의 Human Approval 항목대로 사용자가 최종 확정)

### Deployment Notes
- 변경 파일은 `src/JS_BaseData.html` 하나뿐이며 배포는 기존과 동일하게 `git push origin main` → GitHub Actions로 처리됨(이번 세션에서는 push하지 않음).
