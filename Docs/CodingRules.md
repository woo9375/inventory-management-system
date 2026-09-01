# Coding Rules & Conventions

> **이 문서는 재고 관리 시스템의 전체 코딩 규약을 정의하는 SSOT(Single Source of Truth)입니다.**
> **AI 행동 제약 및 핵심 원칙 요약은 `.agents/rules/05_code-conventions.md`를 참조하십시오.**

## 1. Constants Management
- **All configuration constants** (sheet names, colors, column mappings, roles, default values) must be defined in `Config.gs`.
- Do NOT declare new constants in other `.gs` files. If a new constant is needed, add it to `Config.gs`.

## 2. Module Header Comments
- Every `.gs` file must start with a JSDoc comment block describing the module's purpose and version:
  ```javascript
  /**
   * 호텔덕구온천 재고 관리 시스템 v7.0 — [모듈명] 모듈
   * [모듈 설명]
   * [v7.0] [주요 변경사항]
   */
  ```
- Use section separators for logical grouping within a file.

## 3. Module Responsibilities
- **Sheet creation/formatting** → `SheetBuilder.gs`
- **Web App API endpoints** (handlers for `google.script.run`) → `WebApp.gs`
- **Authentication & authorization** → `RBAC.gs`
- **Month-end closing & archiving** → `Archive.gs`
- **Inventory calculations** → `StockEngine.gs`
- **Dashboard aggregation** → `Dashboard.gs`
- **Schema migrations** → `Migration.gs`
- **Item master CRUD** → `ItemService.gs`
- **Transaction CRUD** → `TxService.gs`
- **Config/shop/season management** → `ConfigService.gs`
- **Base data CRUD** → `BaseDataService.gs`
- **Cache management** → `CacheManager.gs`
- **Trigger setup** → `Triggers.gs`

## 4. Frontend Module Pattern
- Frontend JavaScript is split by feature into `JS_*.html` files.
- All CSS is centralized in `Stylesheet.html`.
- These files are included into `Index.html` via `HtmlService.createHtmlOutputFromFile()`.

### ⚠️ 현재 include되지 않는 파일
- **`JS_Master.html`**: `Index.html`에 include되어 있지 않다(커밋 `e4a6d6e`에서 제거).
  사이드바에 품목 관리 탭이 없고 `tab-master` 영역도 없으므로 **웹 UI로 제공되지 않는다.**
  품목 마스터는 현재 **스프레드시트에서 직접 관리**한다.
  파일은 향후 웹 UI 복원 가능성을 위해 보존 중이며, 관련 기능 Task를 설계할 때
  "이미 동작하는 화면"으로 전제하지 말 것. (`JS_UI.html`의 `showTab('master')` 분기도 도달 불가 잔재)
- `UploadCsv.html`은 `Index.html`이 아니라 `Code.gs`가 스프레드시트 메뉴에서 직접 띄운다.

## 5. Logging & Error Handling
- **진행 로그**: `console.log()` 또는 `Logger.log()` 사용. 마이그레이션·아카이브·배치 작업의
  단계별 진행 상황을 남기는 용도로 `.gs`에서 허용된다.
- **에러 로그**: 반드시 `console.error()` 사용. `console.log()`로 에러를 남기지 않는다.
- `try-catch` 블록에서는 항상 에러를 로깅하고, 프론트엔드에는 내부 정보가 없는
  사용자 친화적 메시지만 반환한다 (스택 트레이스·시트 구조 노출 금지).
- 심각한 에러는 `_logError()` 함수로 `SHEET_SYSTEM_LOGS`에 기록.

## 6. 네이밍 규약
| 구분 | 규약 | 예시 |
|------|------|------|
| 전역 함수 (API) | camelCase | `getItemMasterData()`, `addTransaction()` |
| Private 함수 | `_` 접두사 + camelCase | `_hashPassword()`, `_requireAdmin()` |
| 상수 | UPPER_SNAKE_CASE | `SHEET_MASTER`, `TX_COLS` |
| 상수 객체 | UPPER_SNAKE_CASE | `COLORS`, `ROLES`, `MASTER_COLS` |
| 프론트엔드 함수 | camelCase | `loadDashboard()`, `handleLogin()` |

## 7. API 응답 패턴
모든 서버 → 프론트엔드 응답은 다음 형식을 따른다:
```javascript
// 성공
{ success: true, message: "✅ ...", data: ... }
// 실패
{ success: false, message: "❌ ..." }
```

## 8. 배치 처리 원칙
- **읽기**: 한 번의 `getValues()`로 필요한 범위를 모두 읽기
- **쓰기**: 메모리에서 배열 구성 후 한 번의 `setValues()`로 쓰기
- **금지**: 루프 안에서 `getValue()`/`setValue()` 반복

## 9. LockService 패턴
동시성 제어는 `try/finally` 패턴과 `waitLock()`을 사용합니다.

## 10. CacheManager 사용 패턴
데이터 캐싱 및 변경 후 `CacheManager.invalidateAll();` 호출.

## 커밋 메시지
```
[feat] 시즌 관리 UI 추가
[fix] FIFO 마감 시 로트 단가 누락 수정
[refactor] WebApp.gs API 핸들러 모듈 분리
[style] 대시보드 카드 레이아웃 개선
[docs] README 배포 가이드 업데이트
[chore] Migration v10 에러 로그 시트 추가
```
