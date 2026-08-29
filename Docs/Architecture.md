# Architecture — 호텔 재고 관리 시스템

---

## 현재 Architecture (코드에서 확인)

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  Index.html (SPA Shell)                          │
│  ├── Stylesheet.html (CSS)                       │
│  ├── JS_Auth.html (인증 UI)                      │
│  ├── JS_Config.html (설정 UI)                    │
│  ├── JS_Master.html (품목 관리 UI)               │
│  ├── JS_Tx.html (입출고 UI)                      │
│  ├── JS_UI.html (공통 UI)                        │
│  ├── JS_BaseData.html (기초데이터 UI)            │
│  └── UploadCsv.html (CSV 업로드 모달)            │
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
│  Archive.gs      (월마감, 아카이빙)              │
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

## 향후 개선 Architecture (권장)

### 1. DEV/PROD 환경 분리
```
[검토 필요]
- DEV 용 별도 Apps Script 프로젝트 생성
- .clasp.json을 환경별로 관리 (또는 clasp 다중 프로젝트)
- GitHub Actions에서 branch별 배포 대상 분리
```

### 2. E2E 테스트 레이어 추가
```
Playwright → DEV Web App → 자동 검증 → Human QA
```

### 3. API 레이어 정규화
```
[검토 필요]
- WebApp.gs의 래퍼 함수들을 REST-like 라우터로 통합
- 공통 에러 핸들링 미들웨어
```
