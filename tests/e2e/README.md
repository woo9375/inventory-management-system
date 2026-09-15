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
| `login-bootstrap.spec.js` | 로그인·새로고침(세션 복원) 직후 대시보드 KPI·알림 표가 서버 값으로 채워지고 pageerror·`[bootstrap]` console.error가 없다 (2026-09-15 핫픽스 회귀 방지 — 사라진 `#lastSyncTimeText` 참조로 로그인마다 대시보드가 비던 문제) |
| `dashboard-recalc-time.spec.js` | 대시보드 헤더 「재고 계산 기준」이 서버의 재고 재계산 시각(`LAST_SYNC_TIMESTAMP`)과 일치하고 24시간 경과 배지가 나이와 맞는다 (TASK-029). `E2E_ALLOW_REFRESH=1`일 때만: 「통합갱신」 실행 → 완료 토스트 → 헤더 시각·KPI가 다시 그려진다 (DEV 시트 취합·재계산, 수 분) |
| `basedata-excel.spec.js` | 단위 목록 신규 10종 노출 (TASK-002), 실사 양식 xlsx 다운로드 (TASK-001B) |
| `transaction-bulk-upload.spec.js` | 입출고 일괄 업로드 (TASK-019): 안내 모달 취소, 오류 CSV 검증 실패(무저장), 정상 CSV 저장 → 최근 내역 표시 |
| `items-management.spec.js` | 품목 관리 탭 (TASK-025): 서버 페이징 목록·검색·사용유무 필터, 등록 → diff·사유 필수 수정 → 이력(웹앱 경로) → 미사용 → 재사용, CSV 사전 검증 미리보기 → 등록, manager 노출/staff 숨김, 768px 가로 오버플로우 없음. 스크린샷을 `AI/audits/UI-AUDIT-001/after/TASK-025/`에 남긴다 |
| `perf-baseline.spec.js` | **기본 실행에서 제외** — `E2E_PERF=1`일 때만. 화면이 부르는 API의 콜드/웜 응답 시간(ms) 표를 찍는다 (TASK-027). 성능 작업 전후 비교용이며 임계값으로 실패시키지 않는다 |
| `perf-server-ops.spec.js` | **기본 실행에서 제외** — `E2E_PERF=1`일 때만. `DevTools.gs devProfileServerOps`로 Sheets/Cache/Properties 연산별 소요 시간(ms)을 찍는다 (TASK-027) |

`fixtures/env.js`가 `.env` 로드, 로그인, iframe 진입, 로딩 대기 헬퍼를 제공한다.

> GAS Web App은 중첩 iframe(`sandboxFrame` → `userHtmlFrame`) 구조이므로,
> 요소 접근은 반드시 `fixtures/env.js`의 `getAppFrame()` / `login()`을 경유한다.
