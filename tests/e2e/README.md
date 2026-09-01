# End-to-End (E2E) Tests (`tests/e2e/`)

Playwright로 **DEV Web App만** 검증한다. Production URL은 `playwright.config.js`가 실행 시점에 차단한다.

## 실행

```bash
npm run test:e2e          # headless
npm run test:e2e:headed   # 브라우저 표시
```

## 사전 조건

1. `.env.example`을 `.env`로 복사 후 값 입력 (`PLAYWRIGHT_BASE_URL`, `DEV_TEST_USERNAME`, `DEV_TEST_PASSWORD`)
2. DEV에 최신 코드 배포: `npm run dev:push`
3. DEV Apps Script 편집기에서 1회 실행: `setupDevScriptProperties()` → `seedDevData()`

환경변수가 없으면 테스트는 **실패가 아니라 skip** 되며, 누락된 변수명을 사유로 출력한다.
DEV 배포가 Google 계정 로그인을 요구하면 `node tests/e2e/save-auth-state.js`로 세션을 1회
저장하고 `PLAYWRIGHT_STORAGE_STATE`를 지정한다. (세션 파일은 `.gitignore` 처리됨 — 절대 커밋 금지)

## 현재 스펙

| 파일 | 검증 대상 |
|------|-----------|
| `smoke.spec.js` | DEV Web App 접속, 로그인 화면 렌더링, SheetJS(XLSX) CDN 로드 |
| `transaction.spec.js` | 입고 등록 성공 및 거래ID 생성 (TASK-001A 회귀 방지) |
| `basedata-excel.spec.js` | 단위 목록 신규 10종 노출 (TASK-002), 실사 양식 xlsx 다운로드 (TASK-001B) |

`fixtures/env.js`가 `.env` 로드, 로그인, iframe 진입, 로딩 대기 헬퍼를 제공한다.

> GAS Web App은 중첩 iframe(`sandboxFrame` → `userHtmlFrame`) 구조이므로,
> 요소 접근은 반드시 `fixtures/env.js`의 `getAppFrame()` / `login()`을 경유한다.
