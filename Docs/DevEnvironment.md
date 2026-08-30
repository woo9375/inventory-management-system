# DEV 환경 가이드 (SSOT)

> TASK-004에서 실제 Google Drive / Apps Script API 조사를 통해 확인된 사실만 기록한다.
> 추정치는 포함하지 않는다.

## 1. Drive 구조 (실측)

```
GAS_Apps                                        187bDPZA4IKcjJ0JR2u1AbaOgXxSi_Gc8
└── 1. (주)호텔덕구온천_재고관리 시스템            1wCOsDjxZcPEQjKVh3z0gsN9fXilfPLDr
    ├── 재고관리 시스템          [PROD Sheet]    1GRoFaYsWVcOUeoWPIyEbbb_QxLpovkqGiaIjQm4zpJM
    ├── 마감 데이터              [PROD Archive]  1gGzUY3dnc-5plYoI2J-zMdeIYTuIu1gJ
    ├── 시스템_데이터_백업                        18pn7eaQB19W4xSj6d6UY9gksiXm0W5C2
    └── DEV                                     1ErAsZuFUyljoSjeA1jDI5cHRVQmc0C95
        ├── 재고관리 시스템_DEV   [DEV Sheet]     17ukRYqvpsRSuFoDHuk0ZTba1ATzC8_odCkw6kYEG5dE
        └── 마감 데이터_DEV       [DEV Archive]   1HdnbvTyNIu3nGmKnO3--2_R8N1rTZN9x
```

## 2. 환경별 리소스

| 항목 | DEV | Production |
|---|---|---|
| Spreadsheet | `17ukRYqvpsRSuFoDHuk0ZTba1ATzC8_odCkw6kYEG5dE` | `1GRoFaYsWVcOUeoWPIyEbbb_QxLpovkqGiaIjQm4zpJM` |
| Apps Script | `1oPmA-pzD_m1c4nXgjfF7RHzKHYm-KOQIwwrppUIR55XPk4byxFW_SdAY` | `1TKJb8HXschFgu257XGoHOhohogyAvleagnuHbdLRathBu1ueiMWAAbvO` |
| 스크립트 바인딩 | 위 DEV Spreadsheet에 container-bound | 위 PROD Spreadsheet에 container-bound |
| 마감 데이터 폴더 | `1HdnbvTyNIu3nGmKnO3--2_R8N1rTZN9x` | `Config.gs`의 `ARCHIVE_FOLDER_ID` 기본값 |
| clasp 설정 파일 | `.clasp-dev.json` | `.clasp.json` |
| 배포 방식 | 로컬 `npm run dev:push` | `git push origin main` → GitHub Actions |

두 Apps Script 모두 각자의 스프레드시트에 **container-bound**이므로
`SpreadsheetApp.getActiveSpreadsheet()`는 환경별로 자동 분리된다.
별도의 스프레드시트 ID 설정이 필요 없다.

## 3. 환경 판별 (ScriptProperties)

동일한 소스가 DEV/PROD 양쪽에 배포되므로 환경은 **런타임에** 결정한다.
각 Apps Script 프로젝트가 개별 보유하는 Script Properties를 사용한다.

| 키 | DEV 값 | Production |
|---|---|---|
| `APP_ENV` | `DEV` | 미설정 (= PROD로 간주) |
| `ARCHIVE_FOLDER_ID` | `1HdnbvTyNIu3nGmKnO3--2_R8N1rTZN9x` | 미설정 (= `Config.gs` 기본값 사용) |

- `getAppEnv()` — 미설정 시 항상 `PROD` 반환 (안전 기본값)
- `getArchiveFolderId()` — 미설정 시 기존 상수를 그대로 반환 → **Production 동작 무변경**

### DEV 최초 설정 (1회)
DEV Apps Script 편집기에서 `setupDevScriptProperties()` 실행.
이 함수는 바인딩된 스프레드시트가 DEV Spreadsheet인지 검사하고,
아니면 예외를 던져 Production에서 실행되는 것을 막는다.

## 4. ⚠️ ARCHIVE_FOLDER_ID 관련 확인 사항

`Config.gs`의 `ARCHIVE_FOLDER_ID = "1wCOsDjxZcPEQjKVh3z0gsN9fXilfPLDr"`는
주석과 달리 **"마감 데이터" 폴더가 아니라 프로젝트 루트 폴더**를 가리킨다.
실제 "마감 데이터" 폴더는 `1gGzUY3dnc-5plYoI2J-zMdeIYTuIu1gJ`로 서로 다르다.

- 현재 동작: 월마감 아카이브가 프로젝트 루트 밑에 `<연도>/` 폴더를 만들어 저장
- 두 폴더 모두 현재 비어 있어 실제 아카이브 이력으로는 확인 불가
- **운영 정책 변경에 해당하므로 값은 변경하지 않았다.** 변경이 필요하면 Production
  Script Properties에 `ARCHIVE_FOLDER_ID`를 설정하면 코드 수정 없이 교체 가능하다.

## 5. DEV 전용 함수 (`src/DevTools.gs`)

| 함수 | 성격 | 설명 |
|---|---|---|
| `setupDevScriptProperties()` | 쓰기 | DEV ScriptProperties 설정 (DEV Sheet 바인딩 검사) |
| `verifyDevEnvironment()` | **읽기 전용** | 환경/시트/단위목록/단위 사용실태/시드 상태 리포트 |
| `seedDevData()` | 쓰기 (DEV 전용) | `ITEM-TEST-001~003` 시드 (멱등) |
| `resetDevEnvironment()` | 쓰기 (DEV 전용) | `ITEM-TEST-*` 흔적만 정리 |

모든 쓰기 함수는 진입 즉시 `_requireDevEnv()`로 환경을 확인하고
DEV가 아니면 예외를 던진다. **Production에서는 실행 자체가 불가능하다.**

`resetDevEnvironment()`는 `ITEM-TEST-` 접두어 데이터만 삭제한다.
DEV 스프레드시트에 이미 존재하는 운영 복제 데이터(품목 약 4,292건)는 건드리지 않는다.

### 시드 데이터
| 코드 | 품목명 | 단위 | 초기재고 | 매입단가 |
|---|---|---|---|---|
| `ITEM-TEST-001` | 테스트품목_단가1000 | 박스 | 100 | 1,000 |
| `ITEM-TEST-002` | 테스트품목_단가2000 | 개 | 50 | 2,000 |
| `ITEM-TEST-003` | 테스트품목_단가3000 | 팩 | 0 | 3,000 |

서로 다른 단가를 두어 FIFO / 단가 스냅샷 / 변경이력 테스트가 가능하다.

## 6. DEV 배포

```bash
npm run dev:push      # git source → DEV Apps Script
npm run dev:pull      # DEV Apps Script → 로컬 (확인용)
npm run dev:status    # DEV 배포 목록
npm run prod:status   # Production 배포 목록 (조회 전용)
```

> `prod:push` 스크립트는 **의도적으로 만들지 않았다.**
> Production 배포는 `git push origin main` → GitHub Actions 경로만 사용한다.

### DEV Web App
- 배포 목록: `@HEAD` 1개 + 버전 고정 배포 1개
- `/exec` URL은 **Google 계정 로그인을 요구한다** (manifest `webapp.access: "ANYONE"` =
  "Google 계정이 있는 모든 사용자"). manifest는 Production과 공유되므로
  익명 공개(`ANYONE_ANONYMOUS`)로 바꾸면 Production까지 공개된다 — **변경 금지**.

## 7. Playwright E2E

```bash
cp .env.example .env          # 값 입력
npm run test:e2e              # 환경변수 없으면 전체 skip (실패 아님)
npm run test:e2e:headed
```

| 환경변수 | 용도 |
|---|---|
| `PLAYWRIGHT_BASE_URL` | DEV Web App `/exec` URL |
| `DEV_TEST_USERNAME` / `DEV_TEST_PASSWORD` | 앱 자체 로그인 계정 |
| `PLAYWRIGHT_STORAGE_STATE` | Google 로그인 세션 재사용 경로 |

### Google 로그인 세션 저장 (1회)
```bash
node tests/e2e/save-auth-state.js
```
실제 브라우저 창이 열리면 **사용자가 직접** Google 로그인 후 Enter.
세션은 `.playwright/dev-auth.json`에 저장되며 `.gitignore` 처리되어 있다.

### 안전장치
- `playwright.config.js`는 `PLAYWRIGHT_BASE_URL`이 Production 배포 ID를 포함하면 실행을 중단한다.
- 환경변수가 없으면 테스트는 **skip** 된다 — 실행하지 않은 테스트가 통과로 집계되지 않는다.
- `page.goto('/')`는 baseURL의 경로를 날려버리므로 반드시 `gotoApp()` 헬퍼를 쓴다.

## 8. 역할 분리

| 대상 | 도구 |
|---|---|
| Drive 파일 / Spreadsheet / Archive 확인 | Google Drive Connector |
| Web App UI / 로그인 / 입력 / 다운로드 | Playwright |

Google Drive UI 자체를 Playwright로 조작하지 않는다.

## 9. Production 보호 규칙

```
❌ Production 데이터 생성/수정/삭제
❌ Production Migration / 월마감
❌ Production Web App 대상 E2E
❌ 로컬에서 Production clasp push
❌ git push origin main (Human 승인 필요)
✅ Production 조회 / 구조 확인 / 배포 정보 확인
```

## 10. 보안

`.gitignore`로 차단되는 항목: `.env`, `.playwright/`, `storageState.json`,
`auth.json`, `.clasprc.json`, `test-results/`, `playwright-report/`.
DEV 계정 비밀번호와 세션 토큰은 소스/문서 어디에도 기록하지 않는다.
