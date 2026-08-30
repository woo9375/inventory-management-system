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

### Root Cause (확정)
**B/C 아님, A 아님 → D(다른 Web App 배포 버전 사용) 유력.**

1. **A. 현재 소스코드 문제 — 배제.**
   `src/` 전체(`grep -rn "itemMap"`)에서 `itemMap`은 `CacheManager.gs`의 `buildItemMapCache()` 함수 내부에 정상적으로 `const itemMap = {}`로 선언된 지역 변수 1곳뿐이며, 함수 스코프를 벗어나지 않는다. `TxService.gs`/`Code.gs`는 모두 `itemInfoMap`이라는 이름으로 일관되게 참조하고 있고, 미선언 `itemMap` 참조는 어디에도 없다.
2. **B. 다른 함수/파일에 itemMap 잔존 — 배제.** 위와 동일 근거.
3. **C. GAS deployment에 과거 코드 잔존(스크립트 콘텐츠 자체) — 배제.**
   `clasp pull`로 실제 GAS 프로젝트(scriptId: `1TKJb8HXschFgu257XGoHOhohogyAvleagnuHbdLRathBu1ueiMWAAbvO`)의 **HEAD 스크립트 콘텐츠**를 스크래치 디렉터리로 받아 전체 15개 `.gs` 파일을 `src/`와 `diff` 했다. **전 파일 바이트 단위로 100% 동일**했다. 즉 스크립트 프로젝트 자체(HEAD)는 GitHub 소스와 완전히 동기화되어 있다.
4. **D. 다른 Web App 배포(버전 고정본) 사용 — 유력 (근거 확보, 확정은 Human 확인 필요).**
   `clasp deployments` 조회 결과, 이 프로젝트에는 **총 16개의 서로 다른 배포(Deployment)**가 존재하며 각각 `@1`~`@16` 및 `@HEAD`의 특정 스크립트 버전에 고정(pin)되어 있다:
   ```
   ...@HEAD  (항상 최신)
   ...@1   - v6.8 웹앱 초기 배포
   ...@3   - v1.0.0 자동 배포
   ...@4, @5, @6, @7, @8, @9, @10, @11, @12, @13, @14, @15, @16 - No description
   ```
   Apps Script Web App은 **`@HEAD`가 아닌 특정 배포 ID**를 실제 사용자 URL로 고정하는 것이 일반적이다. 사용자가 실제 브라우저에서 사용 중인 Web App URL이 오래된 배포(예: `@1`, `@3` 등 예전 버전)에 고정되어 있다면, GitHub/HEAD 소스가 아무리 최신이어도 해당 URL 사용자는 과거 코드를 계속 실행하게 된다. 이 배포들 중 어느 것이 오래된 버전에서 `itemMap` 미선언 참조 버그를 실제로 포함했는지는 각 버전의 스냅샷 콘텐츠를 개별 확인해야 하나(clasp CLI로는 과거 버전 콘텐츠를 직접 pull할 수 없음), 최소한 "다수의 오래된 배포가 존재하고 그중 일부가 실사용 URL일 수 있다"는 사실 자체가 사용자 보고 증상과 정확히 부합한다.

### Evidence
- `grep -rn "itemMap" src/` → `CacheManager.gs`의 지역 변수 1건만 존재, 스코프 이탈 없음.
- `git log -p --all -S itemMap -- src/TxService.gs src/Code.gs src/CacheManager.gs` → 히스토리 전체에서 `itemMap`이 미선언 전역으로 사용된 커밋 없음.
- `clasp pull` (scriptId 동일, 스크래치 디렉터리) 후 15개 `.gs` 전체 `diff` → 전 파일 동일.
- `clasp deployments` → 16개 배포, 대부분 특정 과거 버전에 고정.

### Changed Files
- 없음 (코드 문제가 아니므로 TxService.gs / Code.gs / CacheManager.gs 미수정 — Task 지시대로 "배포 문제라면 불필요한 코드 변경을 하지 않는다"를 따름)

### Tests
- **Not Run / Manual Verification Required**: 로그인 → 업장선택 → 품목선택 → 입출고 저장 → 거래ID/단가 스냅샷 확인의 실사용 흐름 테스트는 Production 데이터에 실제 로그인·쓰기가 필요하므로 이번 작업에서 실행하지 않았다(Production 데이터 임의 수정 금지 원칙). 코드 자체는 변경하지 않았으므로 회귀 위험도 없음.

### HUMAN ACTION REQUIRED
1. Apps Script 편집기(script.google.com) → **배포 관리(Manage deployments)**에서, 실제 사용 중인 Web App URL이 어느 배포 ID(`@1`~`@16` 중 어느 것)에 연결되어 있는지 확인.
2. 해당 배포가 최신 버전이 아니라면, **"수정" → 새 버전 선택** 방식으로 같은 배포 ID를 최신 버전으로 갱신(URL 불변, 코드만 최신화). 이는 Production 배포 승인 행위이므로 사용자가 직접 수행해야 함.
3. 갱신 후 동일 URL에서 재현 테스트(로그인 → 입출고 저장) 수행하여 `itemMap is not defined` 재발 여부 확인.

### Deployment Status
- 코드 변경 없음 → 별도 `clasp push` 불필요.
- Web App 배포 버전 갱신은 위 HUMAN ACTION 항목 참고.
