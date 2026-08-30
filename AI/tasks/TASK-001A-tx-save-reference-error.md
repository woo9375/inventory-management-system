# TASK-001A

## Objective
사용자 환경에서 발생하는 입출고 기록 저장 실패 오류(`ReferenceError: itemMap is not defined`)의 실제 원인을 확정하고 해결한다.

## Confirmed Facts
- 현재 GitHub 소스코드의 `src/TxService.gs` 내부 `addTransaction` 함수는 `itemInfoMap`이라는 변수를 선언하고 참조하고 있다.
- GitHub 저장소 전체(`src/` 디렉터리 내 `.gs`, `.html`)에서 `itemMap`을 단일/전역 변수로서 `addTransaction` 안에서 참조하는 코드는 존재하지 않는다 (`CacheManager.gs` 내부 지역변수 제외).
- 클라이언트 폼 데이터(`JS_Tx.html`)는 `google.script.run.addTransaction`을 정상적으로 호출하고 있다.

## Hypotheses
- 사용자가 실행 중인 Apps Script 배포 환경(Web App)은 최신 `itemInfoMap` 수정이 포함되지 않은 과거 버전의 스크립트가 실행 중일 가능성이 높다.
- 배포본(GAS)과 소스코드(GitHub) 간 불일치가 근본 원인일 것이다.

## Business Context
- 트랜잭션 기록 불가(저장 실패)는 재고 시스템의 가장 핵심적인 기능 마비를 의미하므로 최우선으로 해결해야 한다.

## Current System
- `TxService.gs`에서 입출고 정보를 기록하며, 품목 유효성 및 단가 스냅샷을 위해 캐시에서 맵(Map) 데이터를 로드한다.

## Root Cause / Diagnostic Logic
1. **GitHub에도 itemMap 존재?** → No.
2. **GitHub에는 없음 + 배포본이 이전 버전?** → 최유력. 
   - **Diagnostic Procedure**: 배포 권한자(사용자)가 Apps Script 편집기에 접근하여 배포된 코드 내에 `addTransaction` 함수에 `itemMap`이 남아 있는지 직접 확인해야 한다. 만약 존재한다면 최신 코드를 배포(Publish new version)하여 해결.
3. **GitHub/배포본 모두 없음** → 다른 실행 경로/프론트엔드 내 이벤트 핸들러 추적.

## Requirements
- 오류 없이 입출고 트랜잭션 정상 등록 완료
- `itemMap is not defined` 에러 미발생

## Constraints
- 단순 변수명 치환 등 증거 없는 코드 수정을 지양한다.
- 기존 입출고 업무 규칙을 우회하지 않는다.

## Files to Inspect
- `src/TxService.gs`
- `src/JS_Tx.html`
- `.github/workflows/deploy.yml` (실제 배포 프로세스 검증용)

## Files to Modify
- 없음 (진단 후 단순 버전 배포로 해결될 경우)
- 코드 수정이 불가피한 경우 (예: 다른 실행경로 발견 시)에만 수정.

## Files to Create
- 없음

## Implementation Plan
1. 실제 배포본의 코드를 검사하도록 사용자에게 가이드를 제시하거나, `clasp push` 후 Web App 새로운 버전 배포를 실행한다.
2. 재현 테스트 진행.

## Migration Plan
- N/A

## Test Plan
- 새로운 품목으로 입출고 기록(입고/출고) 신규 등록.
- 브라우저 개발자 도구 및 GAS 실행 로그에 ReferenceError 미발생 확인.

## Regression Risk
- Low (단순 버전 동기화 문제일 확률 높음)

## Acceptance Criteria
- 입출고 신규 등록 성공
- `itemMap is not defined` 미발생
- 품목명 정상 조회
- 단가 스냅샷 정상 저장
- 거래ID 정상 생성
- 캐시 정상 동작

## Human Approval Required
- 진단 후 "Apps Script 새 배포 생성" 및 "버전 업데이트" 작업은 사용자(Admin)가 직접 확인 및 승인해야 함.

## Deployment Notes
- `clasp push` 후, Apps Script UI에서 "새 배포" 생성이 필요할 수 있음.

## Rollback Plan
- 롤백 불필요 (동기화 과정)

## Final Report
- (작업 완료 후 작성)
