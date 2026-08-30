# TASK-004: DEV 환경 연결 및 E2E 테스트 인프라 구축

## Objective
사용자가 Google Drive에 직접 만들어 둔 DEV 환경(스프레드시트 / Apps Script / 마감 데이터 폴더)을 Git repository와 연결하고,
Production과 안전하게 분리된 상태에서 Playwright 기반 E2E 테스트를 수행할 수 있는 인프라를 구축한다.

## Business Context
지금까지 TASK-001A/001B/002/003의 검증이 모두 "Production 접근 불가"를 이유로 로직 시뮬레이션 수준에 머물렀다.
실제 GAS 런타임과 실제 Google Sheets에서 검증할 수 있는 DEV 환경이 연결되면
`10_ready → Claude Code → DEV 검증 → 30_review → Human QA` 루프가 실제로 닫힌다.

## Current System (조사로 확인된 사실)

### Drive 구조 (Google Drive Connector로 실측)
```
GAS_Apps (187bDPZA4IKcjJ0JR2u1AbaOgXxSi_Gc8)
└── 1. (주)호텔덕구온천_재고관리 시스템 (1wCOsDjxZcPEQjKVh3z0gsN9fXilfPLDr)
    ├── 재고관리 시스템            (1GRoFaYsWVcOUeoWPIyEbbb_QxLpovkqGiaIjQm4zpJM)  ← PROD Spreadsheet
    ├── 마감 데이터                (1gGzUY3dnc-5plYoI2J-zMdeIYTuIu1gJ)             ← 비어 있음
    ├── 시스템_데이터_백업          (18pn7eaQB19W4xSj6d6UY9gksiXm0W5C2)             ← 비어 있음
    └── DEV                       (1ErAsZuFUyljoSjeA1jDI5cHRVQmc0C95)
        ├── 재고관리 시스템_DEV     (17ukRYqvpsRSuFoDHuk0ZTba1ATzC8_odCkw6kYEG5dE)  ← DEV Spreadsheet
        └── 마감 데이터_DEV         (1HdnbvTyNIu3nGmKnO3--2_R8N1rTZN9x)             ← 비어 있음
```

### Apps Script 바인딩 (Apps Script API로 실측)
| | Script ID | parentId (바인딩 대상) |
|---|---|---|
| DEV | `1oPmA-pzD_m1c4nXgjfF7RHzKHYm-KOQIwwrppUIR55XPk4byxFW_SdAY` | `17ukRY...` = DEV Spreadsheet ✅ |
| PROD | `1TKJb8HXschFgu257XGoHOhohogyAvleagnuHbdLRathBu1ueiMWAAbvO` | `1GRoFa...` = PROD Spreadsheet ✅ |

두 스크립트 모두 각자의 스프레드시트에 **container-bound**이므로
`SpreadsheetApp.getActiveSpreadsheet()`는 환경별로 자동 분리된다.

### 발견된 환경 분리 결함 (Critical)
`Config.gs`의 `ARCHIVE_FOLDER_ID`는 **하드코딩된 단일 상수**이며 DEV/PROD가 동일한 값을 공유한다.
- 현재 값 `1wCOsDjxZcPEQjKVh3z0gsN9fXilfPLDr` = **프로젝트 루트 폴더**("1. (주)호텔덕구온천_재고관리 시스템")
- 주석은 `("마감 데이터")`라고 되어 있으나 실제 "마감 데이터" 폴더는 `1gGzUY3dnc-5plYoI2J-zMdeIYTuIu1gJ`로 **서로 다름**
- 결과: **DEV에서 월마감을 실행하면 아카이브 파일이 Production 폴더 트리에 생성된다** (환경 오염)
- `backupToCSV()`는 스프레드시트 자신의 부모 폴더를 쓰므로 이미 환경 안전함 — 문제는 월마감 경로 한 곳뿐

## Requirements
### Functional
- [ ] DEV/PROD clasp 타깃 분리 (Production `.clasp.json` 불변)
- [ ] `ARCHIVE_FOLDER_ID`를 환경별로 분리 (Production 동작은 하위 호환 유지)
- [ ] DEV 전용 검증/시드/정리 함수 제공, Production에서는 실행 자체가 차단될 것
- [ ] Playwright 테스트 인프라 구성 (Production URL을 기본값으로 두지 않을 것)

### Non-Functional
- [ ] Production 데이터/배포/스키마 무변경
- [ ] 인증정보를 repository에 커밋하지 않을 것

## Constraints
- 동일한 소스가 DEV/PROD 양쪽 Apps Script로 배포되므로 **환경 구분은 런타임에 결정**되어야 한다
  → 각 Apps Script 프로젝트가 개별 보유하는 `ScriptProperties`를 사용
- 기존 DEV 스프레드시트에는 Production에서 복제된 실데이터(품목 4,292건)가 이미 존재 → 임의 삭제 금지

## Files to Modify
- `src/Config.gs` — 환경 판별 상수/리졸버 추가, 잘못된 주석 정정
- `src/Archive.gs` — `ARCHIVE_FOLDER_ID` 직접 참조 → `getArchiveFolderId()`
- `package.json` — DEV clasp / Playwright 스크립트
- `.gitignore` — 인증정보 및 테스트 산출물 제외

## Files to Create
- `src/DevTools.gs` — DEV 전용 검증/시드/정리 (Production 차단 가드 포함)
- `.clasp-dev.json` — DEV clasp 타깃
- `playwright.config.js`, `tests/e2e/*` — E2E 인프라
- `.env.example`
- `Docs/DevEnvironment.md`

## Security Considerations
- `.env`, Playwright `storageState`, `.clasprc.json`은 절대 커밋하지 않는다
- DEV 계정 비밀번호는 환경변수로만 주입하며 소스/문서에 기록하지 않는다

## Acceptance Criteria
- DEV/PROD clasp 타깃이 명확히 분리되고 실수 방지 장치가 있을 것
- DEV에서 월마감 시 아카이브가 DEV 폴더로 가도록 구성 가능할 것
- `verifyDevEnvironment()`가 DEV 실제 상태를 보고할 것
- Playwright가 실제로 실행되고, Production URL 대상 실행이 차단될 것

## Final Report

### Summary
사용자가 만들어 둔 DEV 환경을 **새로 만들지 않고 그대로 활용**하여 Git repository와 연결했다.
Drive 구조와 Apps Script 바인딩을 실측으로 확인했고, 발견된 환경 분리 결함 1건을
하위 호환 방식으로 해소했으며, Playwright 인프라를 구축해 실제로 동작시켰다.

### Implementation
1. **환경 판별 (`src/Config.gs`)** — `getAppEnv()` / `isDevEnv()` / `getArchiveFolderId()` 추가.
   ScriptProperties `APP_ENV` 가 `"DEV"` 인 경우에만 DEV로 판정하고, 미설정 시 항상 Production.
   `ARCHIVE_FOLDER_ID` 미설정 시 기존 상수를 그대로 반환 → **Production 동작 무변경**.
2. **아카이브 환경 분리 (`src/Archive.gs`)** — `executeMonthlyClosing()`에서 상수 직접 참조를
   `getArchiveFolderId()`로 교체. DEV에서 월마감해도 Production 폴더를 오염시키지 않는다.
3. **DEV 전용 도구 (`src/DevTools.gs`, 신규)** — `setupDevScriptProperties()`,
   `verifyDevEnvironment()`(읽기 전용), `seedDevData()`, `resetDevEnvironment()`.
   쓰기 함수는 모두 `_requireDevEnv()` 가드로 Production 실행 차단.
   `resetDevEnvironment()`는 `ITEM-TEST-` 접두어 데이터만 삭제하며 기존 운영 복제 데이터는 건드리지 않는다.
4. **clasp 분리** — `.clasp-dev.json` 추가, `.clasp.json`(Production) 불변.
   npm 스크립트 `dev:push` / `dev:pull` / `dev:status` / `prod:status` 추가.
   **`prod:push`는 의도적으로 만들지 않았다** — Production은 GitHub Actions 경로만 사용.
5. **Playwright 인프라** — `playwright.config.js`(Production URL 차단 가드 포함),
   `tests/e2e/{smoke,transaction,basedata-excel}.spec.js`, `fixtures/env.js`,
   `save-auth-state.js`(사용자가 직접 Google 로그인 세션 저장), `.env.example`.
6. **단위 테스트 정식화** — 이전 세션의 로직 시뮬레이션을 `tests/unit/*.test.js`로 편입하고
   `tests/unit/run-all.js` 러너 추가. `npm test`가 TODO 플레이스홀더에서 실제 테스트로 전환됨.
7. **문서** — `Docs/DevEnvironment.md`(신규), `Docs/Deployment.md`·`Docs/TestStrategy.md` 갱신.

### Tests
| 항목 | 결과 |
|---|---|
| 전체 `.gs` 구문 검사 (`node --check`) | **PASS** (16개 파일) |
| 단위 테스트 `npm test` | **PASS** (2파일, 34 assertion) |
| Playwright 설치/브라우저 | **PASS** (v1.62.1, Chromium) |
| Playwright 테스트 수집 | **PASS** (3파일 5개) |
| 환경변수 없을 때 skip 동작 | **PASS** (5 skipped, exit 0) |
| Production URL 차단 가드 | **PASS** (실행 거부 확인) |
| Git source → DEV push | **PASS** (16개 `.gs` 전부 일치, `DevTools.gs` 반영 확인) |
| Production 무변경 검증 | **PASS** (25파일, `DevTools` 없음, 리졸버 없음) |
| DEV Web App E2E | **BLOCKED** (아래 참고) |

### BLOCKED: DEV Web App E2E
DEV Web App `/exec`는 **Google 계정 로그인을 요구**한다(실측: 최종 URL이
`accounts.google.com/v3/signin/...`). manifest의 `webapp.access: "ANYONE"`은
"Google 계정이 있는 모든 사용자"를 의미하며, 익명 공개는 `ANYONE_ANONYMOUS`다.
**manifest는 Production과 공유되므로 익명 공개로 바꾸면 Production까지 공개된다 — 변경 불가.**

또한 Claude Code가 사용자의 Google 비밀번호를 대신 입력하는 것은 허용되지 않는다.
따라서 `tests/e2e/save-auth-state.js`를 제공하여 **사용자가 직접** 실제 브라우저에서
1회 로그인하고 세션만 저장하는 경로를 마련했다.

### 부수 발견 (별도 판단 필요)
`Config.gs`의 `ARCHIVE_FOLDER_ID`는 주석과 달리 "마감 데이터" 폴더가 아니라
**프로젝트 루트 폴더**를 가리킨다(실제 마감 데이터 폴더는 `1gGzUY3dnc-5plYoI2J-zMdeIYTuIu1gJ`).
두 폴더 모두 비어 있어 실제 아카이브 이력으로는 확인 불가.
운영 정책 변경에 해당하므로 **값은 변경하지 않고 주석으로 사실만 기록**했다.
변경을 원하면 Production Script Properties에 `ARCHIVE_FOLDER_ID`를 설정하면 코드 수정 없이 교체된다.

### Regression Risk
Low. Production에서는 ScriptProperties가 비어 있으므로 `getArchiveFolderId()`가
기존 상수를 그대로 반환하여 동작이 완전히 동일하다. `DevTools.gs`는 Production에 배포되더라도
모든 쓰기 함수가 환경 가드로 차단된다.

### HUMAN ACTION REQUIRED
1. DEV Apps Script 편집기에서 `setupDevScriptProperties()` 1회 실행 (APP_ENV/아카이브 폴더 설정)
2. 이어서 `verifyDevEnvironment()` 실행 — DEV 상태 리포트 확인
   (**TASK-002의 미해결 질문인 "CASE 단위 사용 품목 건수"가 여기서 정확히 산출된다**)
3. E2E를 돌리려면 `node tests/e2e/save-auth-state.js`로 Google 세션 1회 저장 후
   `.env`에 `PLAYWRIGHT_BASE_URL` / `DEV_TEST_USERNAME` / `DEV_TEST_PASSWORD` /
   `PLAYWRIGHT_STORAGE_STATE` 설정
4. 커밋 리뷰 후 Production 배포 승인 여부 결정 (이번 세션에서 push하지 않음)
