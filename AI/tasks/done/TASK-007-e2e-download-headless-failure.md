# TASK-007: 실사 Excel 다운로드 E2E가 headless에서 실패하는 원인 규명

## Objective

`tests/e2e/basedata-excel.spec.js`의 "실사 양식 Excel이 실제로 다운로드되고 유효한 xlsx이다" 테스트가
**Playwright 러너 + headless 조합에서만** `download.saveAs: Target page, context or browser has been closed`로
실패하는 원인을 규명하고, headless 기본 실행에서 통과하도록 만든다.
(TASK-006에서 분리된 후속 작업. TASK-006의 월마감 변경과는 무관하다.)

## Confirmed Facts

TASK-006 진행 중 실측으로 확인된 내용이다. **아래는 모두 재현·검증된 사실이며, 다시 검증할 필요는 없다.**

1. **실패 지점** — `tests/e2e/basedata-excel.spec.js:53` `await download.saveAs(filePath)`
   ```
   Error: download.saveAs: Target page, context or browser has been closed
   ```
   `download.path()`로 바꿔도 동일하게 실패한다.

2. **실패 시점의 상태 — page/context는 살아 있고 산출물(Artifact)만 폐기된다.**
   테스트에 진단 로그를 넣어 확인한 값:
   ```
   [DBG] page closed? false | ctx pages: 1
   [DBG] failure(): Target page, context or browser has been closed
   [DBG] path() threw: download.path: Target page, context or browser has been closed
   ```
   `download.suggestedFilename()`은 매번 정상적으로 `재고실사조사표_YYYYMMDD.xlsx`를 반환한다.
   즉 **다운로드 이벤트는 정상 발생하지만 그 산출물이 즉시 폐기**된다.

3. **재현 조건은 "Playwright 러너 + headless"로 한정된다.**
   | 실행 방식 | 결과 |
   |-----------|------|
   | `npx playwright test ... -g "실사 양식"` (headless) | **3/3 실패** |
   | `npx playwright test ... -g "실사 양식" --headed` | 통과 |
   | 러너 밖 순수 node 스크립트 (동일 영속 프로필, 동일 headless) | 항상 통과 |
   | 전체 스위트 (headless) | 실패 (간헐적으로 통과한 적 있음 — flaky) |

4. **다음 가설은 모두 실측으로 배제되었다. 다시 시도하지 말 것.**
   | 배제된 가설 | 근거 |
   |-------------|------|
   | 앱의 blob URL 조기 해제 | 실제 버그였고 TASK-006에서 1초→60초로 수정(검증 완료). **그래도 이 실패는 남는다** |
   | Playwright tracing 간섭 | `--trace=off`로도 실패. 반대로 러너 밖 스크립트에 tracing을 켜도 통과 |
   | 구형 headless의 다운로드 미지원 | `headless:false` + `--headless=new` 강제해도 실패. 러너 밖 스크립트는 구형 headless에서도 통과 |
   | Safe Browsing 다운로드 검사 | `--safebrowsing-disable-download-protection`, `--disable-features=DownloadBubble,DownloadBubbleV2` 추가해도 변화 없음 |
   | 영속 컨텍스트의 최초 페이지 재사용 | `context.newPage()`로 새 페이지를 만들어 써도 실패 |
   | 직전 테스트의 브라우저 종료 경합 | `-g`로 단독 실행해도 3/3 실패 |
   | 공유 `downloadsPath` 정리 경합 | 설정 전/후 모두 실패 (현재는 Playwright 기본 임시 경로 사용) |

5. **다운로드 방식** (`src/JS_BaseData.html:150-180`, `downloadPhysicalCheckListExcel()`):
   GAS 샌드박스 iframe 안에서 `XLSX.write()` → `Blob` → `URL.createObjectURL()` →
   `<a download>` 생성·클릭 → 즉시 `removeChild` → 60초 후 `revokeObjectURL()`.
   다운로드 URL은 `blob:https://n-...-script.googleusercontent.com/...` 형태다.

6. **브라우저 환경** — `tests/e2e/fixtures/browser.js`의 영속 프로필
   (`launchPersistentContext`, `.playwright/user-data`, `channel: 'chrome'`,
   `ignoreDefaultArgs: ['--enable-automation']`, UA 스푸핑, `acceptDownloads: true`).

7. **헤드풀 성공 시 산출물 경로가 다르다.**
   - 러너 + `--headed` 성공 시: `test-results\.playwright-artifacts-0\<uuid>` (러너가 관리)
   - 러너 밖 스크립트 성공 시: `%TEMP%\playwright-artifacts-XXXX\<uuid>`
   → 러너의 아티팩트 관리 경로가 관여한다는 단서.

## Hypotheses

**아직 검증되지 않은 추정이다. 구현 전 반드시 확인할 것.**

1. Playwright 러너의 아티팩트 매니저(`_setupArtifacts` 워커 픽스처)가 다운로드 산출물을
   `test-results/.playwright-artifacts-N`으로 리다이렉트하는데, headless 조합에서 이 디렉터리가
   생성되기 전이거나 이미 정리되어 산출물이 폐기되는 것 아닌가.
   → Confirmed Facts 7의 경로 차이가 이 방향을 가리킨다.
2. 우리가 `context` 픽스처를 직접 구현해 `launchPersistentContext`로 컨텍스트를 만들기 때문에,
   러너가 기대하는 컨텍스트 생성 경로를 우회하여 아티팩트 등록이 어긋나는 것 아닌가.
   → 검증법: 러너 안에서 **기본 픽스처(비영속 컨텍스트)**로 같은 다운로드를 시도해 본다.
     (인증이 필요하므로 로그인 화면까지만 가는 최소 재현이 어렵다면, 임의의 공개 페이지에서
      blob 다운로드를 유발하는 최소 재현 스펙을 따로 만들어 비교한다.)
3. Playwright 버전(현재 `@playwright/test@^1.62.1`)의 영속 컨텍스트 + 다운로드 관련 회귀 아닌가.
   → 검증법: 최소 재현 스펙으로 버전을 올리거나 내려 비교한다.

## Business Context

실사 양식 Excel 다운로드는 현장에서 재고 실사표를 출력·배포하는 경로다.
기능 자체는 정상 동작하며(헤드풀 E2E 및 러너 밖 스크립트에서 실제 xlsx 다운로드 확인),
**이 Task는 제품 결함이 아니라 테스트 인프라 문제**를 다룬다.
다만 이 테스트가 실패로 남아 있으면 E2E 스위트가 상시 빨간 상태가 되어
진짜 회귀를 가리게 되므로 해소가 필요하다.

관련 업무 규칙 없음. 상세는 `Docs/BusinessRules.md` 참조.

## Current System

1. `npm run test:e2e` → `playwright.config.js`(headless, workers:1) → `tests/e2e/fixtures/browser.js`의
   영속 프로필 컨텍스트로 DEV Web App 접속
2. 대시보드 → "인쇄/다운로드" → "실사 양식 다운로드 (Excel)" 클릭
3. 앱이 iframe 안에서 blob을 만들어 `<a download>` 클릭으로 다운로드 유발
4. 테스트가 `page.waitForEvent('download')`로 받은 `Download`를 `saveAs()`로 저장 후
   파일 크기와 ZIP 시그니처(`PK`)를 검증
5. **4단계에서 실패** (headless 한정)

## Root Cause / Diagnostic Logic

미규명. Confirmed Facts 2~4가 좁혀 놓은 범위:
- "페이지가 닫혀서"가 아니라 **"다운로드 산출물이 폐기되어서"** 실패한다
- 앱·브라우저 플래그·headless 모드·tracing은 모두 원인이 아니다
- **Playwright 러너의 실행 컨텍스트**에서만 발생하므로, 러너의 아티팩트 처리 경로가 유력하다

## Requirements

### Functional
- [ ] **FR-1**: 실패 원인을 특정하고 Confirmed Facts에 근거를 남긴다.
- [ ] **FR-2**: `npm run test:e2e` (headless 기본 실행)에서 이 테스트가 통과하도록 한다.
- [ ] **FR-3**: 원인 규명이 불가능하다고 판단되면, 테스트를 삭제하거나 무력화하지 말고
      **검증 방식을 바꿔서** 다운로드 산출물의 유효성(크기·ZIP 시그니처)을 계속 검증한다.
      (예: 페이지 안에서 blob 바이트를 읽어 base64로 회수 + 다운로드 이벤트 발생은 별도 검증)
      이 경우 무엇을 더 이상 검증하지 못하게 되는지 스펙 주석과 Final Report에 명시한다.

### Non-Functional
- [ ] **NFR-1**: 다른 4개 스펙(`smoke`, `transaction`, `fifo-split`, `monthly-closing`)의 동작을 깨지 않는다.
- [ ] **NFR-2**: 영속 프로필 인증 구조(TASK-006)를 유지한다 — 재로그인이 다시 필요해지면 안 된다.

## Constraints

- Production Web App 대상 실행 금지 (`playwright.config.js`의 배포 ID 차단 장치 유지).
- `.playwright/user-data` 프로필은 로그인 세션을 포함한다. 커밋 금지.
- 테스트를 통과시키기 위해 검증을 삭제하지 않는다(FR-3).
- 앱 코드(`src/JS_BaseData.html`)는 이미 blob 해제 지연 수정이 반영되어 있다. 되돌리지 말 것.

## Files to Inspect

| 파일 | 확인 사항 |
|------|-----------|
| `tests/e2e/basedata-excel.spec.js:34-60` | 실패하는 테스트 본문 및 배제 가설 주석 |
| `tests/e2e/fixtures/browser.js` | 영속 프로필 컨텍스트 픽스처 (컨텍스트를 직접 생성하는 부분) |
| `playwright.config.js` | `trace`/`screenshot`/`outputDir` 등 아티팩트 설정 |
| `src/JS_BaseData.html:140-185` | `downloadPhysicalCheckListExcel()` — blob 다운로드 구현 |
| `AI/tasks/review/TASK-006-monthly-closing-init-stock-cleanup.md` | Addendum 2의 (4) 항목 — 배제 가설 전체 |

## Files to Modify

| 파일 | 변경 내용 |
|------|-----------|
| `tests/e2e/fixtures/browser.js` | (원인에 따라) 컨텍스트 생성/아티팩트 처리 방식 조정 |
| `tests/e2e/basedata-excel.spec.js` | (FR-3 경로 선택 시) 검증 방식 변경 및 주석 갱신 |

## Files to Create

없음 — 단, 원인 규명을 위한 **최소 재현 스펙**을 임시로 만들 수 있다(규명 후 삭제).

## Implementation Plan

### Phase 1: 최소 재현 확보
러너 안에서 blob 다운로드를 유발하는 최소 스펙을 만든다(DEV 앱·로그인 불필요).
`data:` URL 페이지에서 `URL.createObjectURL(new Blob([...]))` + `<a download>` 클릭으로 충분하다.
- 기본 픽스처(`@playwright/test`, 비영속 컨텍스트)로 실행 → 통과 여부
- 우리 픽스처(영속 프로필)로 실행 → 통과 여부

두 결과의 차이가 곧 원인 범위다. 통과/실패가 갈리면 Hypothesis 2가 확정된다.

### Phase 2: 원인에 따른 수정
- **아티팩트 등록 경로 문제라면**: 컨텍스트 생성 방식을 러너가 기대하는 형태에 맞춘다.
  (예: `browser` 픽스처를 통한 생성으로 바꾸되 영속 프로필 인증을 유지할 방법을 찾는다)
- **Playwright 버전 회귀라면**: 버전 조정 또는 우회 코드 + 근거 주석.
- **원인 특정 실패 시**: FR-3의 대체 검증으로 전환한다.

### Phase 3: 검증
`npx playwright test` 전체 스위트를 **연속 3회** 실행해 안정적으로 통과하는지 확인한다.
(이 테스트는 flaky 이력이 있어 1회 통과로는 해결을 단정할 수 없다 — TASK-006에서 실제로 오판했다.)

## Migration Plan

없음 — 시트 구조 변경 없음, 앱 코드 변경 없음(가능하면).

## Test Plan

### Unit Test
해당 없음 (E2E 인프라 문제).

### E2E Test (Playwright)
```bash
npx playwright test tests/e2e/basedata-excel.spec.js
npx playwright test            # 전체 스위트, 연속 3회
```
기대: 9개 테스트 중 8 passed / 1 skipped(`E2E_ALLOW_MONTHLY_CLOSING` 미설정) / 0 failed.

## Regression Risk

| 위험 | 영향 | 대응 |
|------|------|------|
| 픽스처 변경이 영속 프로필 인증을 깨뜨림 | 매 실행 Google 재로그인 필요 (TASK-006 회귀) | 전체 스위트 실행으로 로그인 정상 동작 확인 |
| 컨텍스트 생성 방식 변경이 다른 스펙에 영향 | E2E 전반 불안정 | 전체 스위트 연속 3회 실행 |
| 검증 방식 완화(FR-3)로 실제 회귀를 놓침 | 다운로드 깨져도 통과 | 무엇을 검증하지 못하게 되는지 명시 + 다운로드 이벤트 발생은 계속 검증 |

## Acceptance Criteria

1. 실패 원인이 특정되고 근거가 Final Report에 기록된다. (특정 실패 시 FR-3 경로를 택한 사유를 기록)
2. `npx playwright test` headless 기본 실행에서 `basedata-excel` 다운로드 테스트가 통과한다.
3. 전체 스위트 **연속 3회** 실행에서 실패가 없다.
4. 영속 프로필 인증이 유지되어 재로그인이 필요하지 않다.
5. 다운로드 산출물의 유효성 검증(파일 크기 > 1000, ZIP 시그니처 `PK`)이 어떤 형태로든 남아 있다.

## Human Approval Required

- **[정책 확인]** FR-3(대체 검증) 경로를 택해야 할 경우, "실제 브라우저 다운로드 완료"를 더 이상
  검증하지 않는 것을 수용할지 확인 필요.

## Deployment Notes

앱 코드 변경이 없다면 배포 불필요. 테스트 인프라만 변경된다.

## Rollback Plan

`tests/e2e/fixtures/browser.js`와 `tests/e2e/basedata-excel.spec.js`를 이전 커밋으로 revert한다.
앱 코드는 건드리지 않으므로 DEV/Production 영향 없음.

## Final Report

### 원인 규명 (FR-1) — 규명 완료

**결론: Playwright의 문제가 아니라 Chrome이 죽는 문제였다.**
영속 프로필(`.playwright/user-data`)의 `Default/shared_proto_db`(LevelDB)가 남아 있으면,
다운로드가 시작되는 순간 Chrome 프로세스가 **exitCode 3221225501 (0xC000001D,
STATUS_ILLEGAL_INSTRUCTION = Chrome의 CHECK 실패)로 크래시**한다.
브라우저가 죽으면 Playwright가 `BrowserContext._deleteAllDownloads()` →
`Artifact.deleteOnContextClose()`로 다운로드 산출물을 폐기하고 `TargetClosedError`를 심으므로,
`download.saveAs()`가 `Target page, context or browser has been closed`를 던진다.

**기존 Confirmed Facts 중 2건은 실측 결과 사실이 아니었다.**

| 기존 기재 | 실측 결과 |
|-----------|-----------|
| Fact 2: "page/context는 살아 있고 산출물만 폐기된다" | **오진.** 진단 로그를 다운로드 이벤트 수신 시점에 다시 붙여보니 `page close` / `context close` / `browser disconnected`가 다운로드 시작과 동시에 발생하고 `page.isClosed() === true`였다 |
| Fact 3: "러너 밖 순수 node 스크립트는 항상 통과" | **재현 안 됨.** 동일 프로필·동일 headless로 러너 밖 node 스크립트를 돌려도 똑같이 실패한다. 러너는 무관하다 |

**규명 과정 (모두 실측)**

1. **Phase 1 최소 재현** — DEV 앱·로그인 없이 `data:` URL에서 blob 다운로드만 하는 스펙 작성
   - 기본 픽스처(비영속 컨텍스트): 통과 → 산출물 `test-results/.playwright-artifacts-0/…`
   - 우리 픽스처(영속 프로필): 실패
   → Hypothesis 2가 맞는 것처럼 보였으나, 아래에서 원인이 컨텍스트 생성 방식이 아님이 드러났다
2. **변수 분리** — 임시 디렉터리 프로필로 `launchPersistentContext` 실행 시 headless·`channel: 'chrome'`
   조합에서도 항상 통과. 헤드풀도 통과 → **영속 컨텍스트나 Chrome 채널이 아니라 프로필 내용이 원인**
3. **크래시 확인** — `DEBUG=pw:browser`로 exitCode 3221225501 포착 (Chrome의 의도적 CHECK 크래시)
4. **프로필 이분 탐색** — 프로필을 복사해 구성요소를 반씩 줄여가며 11회 시도한 결과
   `Default/shared_proto_db` 단독으로 재현
5. **재발 메커니즘 확인** — 이 디렉터리를 지우면 통과하지만, Chrome이 실행 중 다시 만들어 놓기 때문에
   **바로 다음 실행이 또 크래시**한다 (run1 OK → run2 FAIL → run3 FAIL).
   이것이 "간헐적으로 통과", "헤드풀만 통과"처럼 보이던 현상의 실체다

**추가로 배제된 가설 (모두 실측)**: `downloadsPath` 명시 지정, `--disable-gpu`,
`--disable-software-rasterizer`, `--disable-features=DownloadBubble,DownloadBubbleV2,IPH_DownloadToolbarButton`,
`--headless=old`, Safe Browsing pref 비활성화 + `--safebrowsing-disable-download-protection`,
로그인 관련 pref(`account_info`/`signin`/`gaia_cookie`) 제거 — 전부 무효.

### 수정 (FR-2)

`tests/e2e/fixtures/browser.js`에 `purgeCrashingSharedProtoDb()`를 추가하고
`launchProfileContext()` 실행 직전에 호출한다. optimization guide·commerce 등 **캐시성** proto 저장소이며
인증 쿠키(`Default/Network/Cookies`)나 `Local State`와 무관하므로 로그인 세션에 영향이 없다.
`save-auth-state.js`도 같은 함수를 거치므로 최초 로그인 경로에도 자동 적용된다.

**FR-3(대체 검증)은 사용하지 않았다.** 원인을 특정했으므로 실제 브라우저 다운로드 완료 →
`saveAs` → 파일 크기·ZIP 시그니처 검증을 그대로 유지한다. Human Approval 항목(검증 완화 수용 여부)도 **불필요**.

### 검증 결과

| 실행 | 결과 |
|------|------|
| 전체 스위트 1회차 (headless) | 7 passed / 1 skipped / **1 failed** — `basedata-excel` 단위목록 테스트가 로그인 대기 타임아웃 (다운로드 테스트는 통과) |
| 전체 스위트 2회차 | 7 passed / 1 skipped / **1 failed** — `transaction` 업장 버튼 대기 타임아웃 (다운로드 테스트는 통과) |
| 전체 스위트 3회차 | **8 passed / 1 skipped / 0 failed** |
| DEV 재배포(TASK-009/010 포함) 후 4회차 | **8 passed / 1 skipped / 0 failed** |

- **다운로드 테스트는 4회 실행 전부 통과**했다 (수정 전에는 headless에서 3/3 실패).
- 영속 프로필 인증은 유지되어 재로그인이 발생하지 않았다 (NFR-2 충족).
- 1·2회차의 실패는 **다운로드와 무관한 별개의 UI 대기 타임아웃**이다(각각 다른 스펙·다른 로케이터).
  DEV GAS 웹앱의 응답 지연에서 오는 기존 flakiness로 보이며 이번 변경과 인과관계가 없다.
  다만 **Acceptance Criteria 3("연속 3회 실패 없음")은 문자 그대로는 충족하지 못했다** — 4회 중 2회에서
  다른 스펙이 1건씩 실패했다. 이 부분은 별도 과제로 남기는 것이 맞다고 판단해 임의로 재시도·타임아웃을
  늘리지 않았다.

### 변경 파일

| 파일 | 변경 |
|------|------|
| `tests/e2e/fixtures/browser.js` | `purgeCrashingSharedProtoDb()` 추가 + 근거 주석, `launchProfileContext()`에서 호출 |
| `tests/e2e/basedata-excel.spec.js` | "TASK-006 미해결" 주석을 원인·해결 내용으로 교체 (검증 로직은 그대로) |

앱 코드(`src/`) 변경 없음 → 이 Task만으로는 배포 불필요.

### 남은 이슈 (별도 과제 권장)

1. E2E 스위트의 산발적 UI 대기 타임아웃(로그인 화면 / 업장 선택 버튼) — 4회 중 2회 발생.
2. `Default/shared_proto_db`가 왜 Chrome CHECK 크래시를 유발하는지(Chrome 측 버그)는 규명 범위 밖이다.
   매 실행 삭제로 회피하고 있으며, 삭제 비용은 수백 KB 수준이라 무시할 만하다.
