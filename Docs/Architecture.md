# Architecture — 호텔 재고 관리 시스템

---

## 현재 Architecture (코드에서 확인)

### ⚠️ SPA에 포함되지 않는 `src/` 파일 (에이전트 필독)

> **`src/`에 파일이 있다는 것은 그 코드가 실행된다는 뜻이 아니다.**
> 웹앱 화면 여부를 판단할 때는 파일 목록이나 파일 내부 코드가 아니라 **`Index.html`의 두 지점**만 근거로 삼는다.

| 파일 | 상태 | 근거 |
|------|------|------|
| **`JS_Master.html`** | 🔴 **사장(Dead Code) — 수정 금지** | `Index.html`에 include되지 않음(커밋 `e4a6d6e`에서 제거). 사이드바에 `tab-master`도 없어 이 파일이 참조하는 DOM(`masterTableBody` 등)이 런타임에 존재하지 않는다 |
| `UploadCsv.html` | 🟢 활성 (SPA 아님) | `Code.gs:36`이 스프레드시트 메뉴에서 모달로 직접 띄운다 |

**품목 마스터는 웹앱 화면이 존재하지 않는다.** 구글 스프레드시트 `🗂️ 품목 마스터` 시트에서 100% 직접 관리하며,
웹앱에서 품목 현재고가 노출되는 유일한 곳은 **대시보드의 '위험·발주필요 품목' 테이블**(`JS_UI.html`)이다.
`JS_Master.html`은 향후 웹 UI 복원 가능성을 위해 파일만 보존 중이다.

**웹앱 진입점 사실 (근거 라인)**
- 사이드바 탭 7개 — `Index.html:81-101`: `dashboard` / `transactions` / `shop` / `season` / `user` / `basedata` / `mysettings`
- include되는 스크립트 5개 — `Index.html:522-527`: `JS_Auth` / `JS_UI` / `JS_Tx` / `JS_Config` / `JS_BaseData`

> 검증 절차는 `.agents/skills/gas-tasks/SKILL.md`의 **Step 2.5 아키텍처 진입점 역추적 게이트**,
> 도메인별 관리 주체는 `.agents/rules/00_roles-and-workflow.md`의 **3. 시스템 물리적 경계**를 따른다.

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  Index.html (SPA Shell)                          │
│  ├── Stylesheet.html (CSS)                       │
│  ├── JS_Auth.html (인증 UI)                      │
│  ├── JS_Config.html (설정 UI)                    │
│  ├── JS_Tx.html (입출고 UI)                      │
│  ├── JS_UI.html (공통 UI)                        │
│  └── JS_BaseData.html (기초데이터 UI)            │
│         │                                        │
│         │ google.script.run.함수명()              │
│         ▼                                        │
├─────────────────────────────────────────────────┤
│                  HtmlService                     │
│  doGet() → Index.html → evaluate()              │
│  include() → 파일 포함                           │
├─────────────────────────────────────────────────┤
│              Server API Layer                    │
│  WebApp.gs (API 라우터)                          │
│  ├── login(), logout(), getSessionUser()         │
│  ├── getDashboardData()                          │
│  ├── runSystemCommand()                          │
│  └── forceRefreshData()                          │
├─────────────────────────────────────────────────┤
│             Service Layer                        │
│  ItemService.gs  (품목 CRUD)                     │
│  TxService.gs    (입출고 CRUD)                   │
│  ConfigService.gs (업장/시즌 관리)               │
│  BaseDataService.gs (기초데이터 관리)            │
├─────────────────────────────────────────────────┤
│            Business Logic Layer                  │
│  StockEngine.gs  (재고 계산, FIFO)               │
│  Archive.gs      (수동 월마감, 백업)             │
│  Dashboard.gs    (대시보드 집계)                 │
│  RBAC.gs         (인증/권한)                     │
│  Migration.gs    (스키마 마이그레이션)            │
├─────────────────────────────────────────────────┤
│           Infrastructure Layer                   │
│  Config.gs       (상수/설정)                     │
│  CacheManager.gs (캐시 관리)                     │
│  SheetBuilder.gs (시트 생성/포맷)                │
│  Triggers.gs     (트리거 설정)                   │
│  Code.gs         (진입점, onOpen/onEdit/createAll)|
├─────────────────────────────────────────────────┤
│              Google Services                     │
│  SpreadsheetApp → Google Sheets (DB)             │
│  DriveApp → Google Drive (Archive)               │
│  CacheService → Session/Data Cache               │
│  LockService → Concurrency Control               │
│  PropertiesService → System Settings             │
│  MailApp → Alert Emails                          │
└─────────────────────────────────────────────────┘
```

---

## 핵심 흐름

### 인증 흐름
```
Frontend (JS_Auth.html)
  → google.script.run.login(username, password)
  → RBAC.gs: authenticateUser()
  → CacheService: session 저장
  → 토큰 반환 → localStorage 저장
```

### 입출고 흐름
```
Frontend (JS_Tx.html)
  → google.script.run.addTransaction(token, shopName, txData)
  → TxService.gs: addTransaction()
    → validateSession() (RBAC)
    → _canAccessShop() (업장 권한)
    → CacheManager: 품목맵 조회
    → LockService: 동시성 제어
    → Sheet: 데이터 기록
    → CacheManager.invalidateAll()
```

### 대시보드 갱신 흐름
```
refreshDashboard()
  → consolidateAllSheets() (업장 데이터 통합)
  → recalcStockAndUsage() (재고/일평균 재계산)
  → runDashboardSync() (대시보드 시트 업데이트)
```

### 월마감 흐름
```
executeMonthlyClosing(token, year, month)
  → LockService 획득
  → 마감 대상 데이터 분리
  → DriveApp: 아카이브 스프레드시트 생성
  → FIFO 이월 계산
  → 메인 시트 갱신 (이월 + 잔여)
  → 초기재고 리셋
  → recalcStockAndUsage()
```

---

## 환경 분리 및 검증 파이프라인 (TASK-004 구축 완료)

DEV / Production은 **별도의 Apps Script 프로젝트**로 분리되어 있다.
동일 소스가 양쪽에 배포되므로 환경 판별은 소스가 아니라, 각 프로젝트가 개별 보유하는
ScriptProperties(`APP_ENV`)로 수행한다 — `Config.gs: getAppEnv()`.
값이 없으면 항상 Production으로 간주한다(안전 기본값).

```
DEV  : .clasp-dev.json → npm run dev:push                      (로컬, 승인 불필요)
                         → @HEAD 배포에 즉시 반영
PROD : .clasp.json     → git push origin main                  (GitHub Actions, Human 승인 필수)
                         → clasp push (코드) + clasp deploy (릴리스)
```

> 환경당 웹앱 배포는 **1개**로 고정한다. `clasp push`는 HEAD 코드만 갱신하므로,
> 버전 배포는 `clasp deploy` 없이는 동결된 채로 남는다 — 상세는 `Docs/Deployment.md`.

검증 파이프라인:

```
구현 → npm run test:unit (Node 로직 시뮬레이션)
     → npm run dev:push  (DEV 배포)
     → npm run test:e2e  (Playwright → DEV Web App)
     → Task review/ → Human QA → Production 배포
```

상세는 `Docs/Deployment.md` 참조.

---

## 향후 개선 Architecture (권장)

### API 레이어 정규화
```
[검토 필요]
- WebApp.gs의 래퍼 함수들을 REST-like 라우터로 통합
- 공통 에러 핸들링 미들웨어
```
