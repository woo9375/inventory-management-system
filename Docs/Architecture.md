# Architecture — 호텔 재고 관리 시스템

---

## 현재 Architecture (코드에서 확인)

### ⚠️ SPA에 포함되지 않는 `src/` 파일 (에이전트 필독)

> **`src/`에 파일이 있다는 것은 그 코드가 실행된다는 뜻이 아니다.**
> 웹앱 화면 여부를 판단할 때는 파일 목록이나 파일 내부 코드가 아니라 **`Index.html`의 두 지점**만 근거로 삼는다.

| 파일 | 상태 | 근거 |
|------|------|------|
| `AdminActionDialog.html` | 🟢 활성 (SPA 아님) | `Code.gs` `openAdminActionDialog()`가 스프레드시트 「🏨 관리자 도구」 메뉴에서 모달로 띄운다 |

> 사장 파일은 현재 **없다.** 옛 품목 마스터 스크립트와 시트 전용 CSV 업로드 창은 TASK-026에서 삭제했다(품목 관리는 `JS_Items.html`).
> 새로 파일을 만들 때는 `Index.html`의 include 또는 `Code.gs`의 템플릿 호출 중 하나에 반드시 연결한다.

**품목 마스터 관리는 웹앱 `품목 관리` 탭(`#tab-items`, `JS_Items.html`)이 전담한다 (TASK-025).** admin과 구매팀(manager)만 쓰고,
등록·수정(diff 확인 + 변경사유 필수)·미사용/재사용 전환·변경이력 조회·CSV 일괄 등록이 전부 `ItemService.gs` API를 거쳐
9열 변경이력을 남긴다. 구매팀은 스프레드시트를 편집하지 않는다(뷰어 또는 미공유 — `Docs/Security.md` 공유 정책). 시트 직접 편집은 소유자의 비상 유지보수 경로이며 onEdit이 이력만 남긴다.
시트 메뉴 「📤 품목마스터 CSV 업로드」와 그 대화상자는 TASK-026에서 제거됐다 — 관리자 도구 메뉴는 6개 항목(통합 갱신·권한 재동기화·시즌 설정 검증·CSV 백업·서식/검증 복구·거래처코드 일괄 부여)이다.
웹앱에서 품목 현재고가 노출되는 곳은 **대시보드의 '위험·발주필요 품목' 테이블**(`JS_UI.html`)이다.

**웹앱 진입점 사실 (근거 라인)**
- 사이드바 탭 9개 — `Index.html` `<nav class="sidebar-nav">`: `dashboard` / `transactions` / `shop` / `season` / `user` / `basedata` / `vendor` / `items` / `mysettings`
  (`shop`~`vendor`는 `.admin-only`, `items`는 `.admin-manager-only` — JS_Auth `applyRolePermissions`)
- include되는 스크립트 7개 — `Index.html` 하단: `JS_Auth` / `JS_UI` / `JS_Tx` / `JS_Config` / `JS_BaseData` / `JS_Vendor` / `JS_Items`

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
│  ├── JS_BaseData.html (기초데이터 UI)            │
│  ├── JS_Vendor.html (거래처 UI, TASK-018)        │
│  └── JS_Items.html (품목 관리 UI, TASK-025)      │
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
    → _canAccessShop() (업장 권한 — 활성 업장 캐시 _getActiveShops, 시트 재조회 없음)
    → CacheManager: 품목맵 조회
    → LockService: 동시성 제어
    → Sheet: 데이터 기록
    → 응답 records(방금 쓴 행) — 화면은 목록 맨 위에 끼워 넣고 재조회하지 않는다 (TASK-027)
    (캐시를 지우지 않는다 — 거래 행은 어떤 캐시에도 없다. 현재고는 통합 갱신이 다시 계산하며 그쪽이 지운다)
```

### 입출고 일괄 업로드 흐름 (TASK-019)
```
Web App: JS_Tx.html openBulkUploadModal() → 안내문 → 파일 선택 → SheetJS 파싱 (CSV: UTF-8→EUC-KR 판별)
  → uploadBulkTransactions(token, shop, rows, {dryRun:true})   // 전체 사전 검증, 쓰기 없음
  → 확인 모달 → BULK_TX_CHUNK_SIZE(100)건씩 순차 호출
  → TxService.gs: uploadBulkTransactions()
    → validateSession() / _canAccessShop()
    → _normalizeTxInput() · _validateTxAgainstMaster()   // addTransaction과 같은 헬퍼
    → getLatestClosingCutoff() 1회 → evaluateClosingCutoff() 행별 비교
    → LockService: 동시성 제어
    → Sheet 1회 읽기 → _calculateFifoOutboundSplitsFromRows(existing + pending) → _buildTxRows()
    → _appendTxRows(): 청크를 setValues 1회로 기록
    (캐시를 지우지 않는다 — 단건 등록과 같은 이유)
```

### 품목 관리 흐름 (TASK-025)
```
Web App: JS_Items.html — 탭 진입 queryItems(token, {q, category, usage, page, pageSize:25, withCatalog}) 1회
  → ItemService.gs: queryItems()
    → validateSession() / staff 거부
    → _getItemIndex(): 캐시 ITEM_INDEX(사람이 고치는 13개 필드, 미사용 포함, 배열로 압축 저장) — 미스면 마스터 1회 스캔
    → 서버에서 검색(코드·품목명 부분 일치)·카테고리·사용유무 필터, 정렬(사용 → 미사용, 코드순), 한 페이지 slice
    → { total, totalAll, page, items[25], catalog? }   // 마스터 4,300행을 화면에 내리지 않는다
  검색어 입력은 350ms 디바운스 → 1회 호출, 늦게 온 옛 응답은 버림(reqSeq). "더 보기" = 다음 page를 받아 뒤에 붙임.
  등록 addNewItem / 수정 updateItem(diff 확인 → reason 필수) / 미사용 disableItemMaster / 재사용 updateItem({usageStatus:'사용'})
    → 응답 item(갱신된 행)으로 화면을 고친다 — 목록 재조회 없음
    → 서버는 invalidateAll() 뒤 같은 요청 안에서 ITEM_INDEX를 다시 채운다(_refreshItemIndexAfterWrite) — 다음 조회가 웜 히트
  CSV: 파일(SheetJS, JS_Tx readBulkFile 재사용) → 형식 검사 → uploadItemMasterCSV(rows, {dryRun:true}) 미리보기(신규/건너뜀/오류, 무쓰기)
    → 확인 → uploadItemMasterCSV(rows) (백업 스냅샷 → 등록 → 이력 → 서식 → 재계산). 상한 ITEM_CSV_MAX_ROWS.
  화면 상수(필드 라벨·기본값·페이지 크기)는 Index.html이 getItemUiConfigJson()으로 주입 — Config.gs SSOT.
```

### 캐시 계층 (TASK-027)
```
CacheService(스크립트 캐시) ← CacheManager (90KB 청크 분할, 기본 TTL 10분 = Config.gs TTL.DEFAULT)
  키: Config.gs CACHE_INVALIDATE_KEYS — 마스터 목록·코드·품목맵, 업장(SHOP_LIST), 설정(CONFIG_DATA_역할),
      기초데이터(BASE_DATA_역할), 거래처(VENDOR_LIST), 대시보드(DASHBOARD_DATA), 품목 관리 인덱스(ITEM_INDEX — TASK-025)
  무효화: invalidateAll() = getAll 1회 + removeAll 1회. 부르는 곳 — 마스터/업장/시즌/사용자/기초데이터/거래처 쓰기 API,
      시트 직접 편집(onEdit, 시스템 시트 어디든), 통합 갱신, 월마감, 마이그레이션, 웹앱 「시트 동기화」
  거래 등록은 캐시를 지우지 않는다. 마감 기준일이 없는 환경은 CLOSING_CUTOFF_NONE 부정 캐시로 통합 시트 풀 스캔을 막는다.
클라이언트(JS_UI loadWithTabCache): 업장·시즌·사용자(getConfigData)·기초데이터·거래처 응답을 세션 동안 보관.
  1분 안 재방문은 서버 호출 없음, 그 뒤는 먼저 그리고 뒤에서 갱신. 쓰기 직후 loadXxx(true), 「시트 동기화」는 clearTabData().
로그인: getBootstrapData 1회 = 대시보드 + 업장 목록 + 마감 기준일 + 마지막 동기화 시각.
```

### 대시보드 갱신 흐름
```
refreshDashboard()   // 시트 메뉴에서는 menuRefreshDashboard() → 안내 대화상자(AdminActionDialog.html) → runAdminAction()이 isSilent=true로 호출 (TASK-019/023)
  → consolidateAllSheets() (업장 데이터 통합)
  → recalcStockAndUsage() (재고/일평균 재계산)
  → runDashboardSync() (대시보드 시트 업데이트)
```

### 월마감 흐름
```
executeMonthlyClosing(token, year, month)
  → LockService 획득
  → [TASK-028] 마감 대상 월 검증 _validateClosingTarget(year, month, 기준일, 오늘)
       재마감 · 미종료 월 · 건너뛴 월이면 { success:false } — 시트/Drive 읽기·쓰기 전
  → [TASK-028] 연도 폴더의 동명 파일([입출고마감]_YYYY_MM, 휴지통 제외) 검사 — 있으면 중단
  → 음수 재고 가드 (TASK-011)
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
