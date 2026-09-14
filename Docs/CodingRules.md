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

### SPA 밖의 HTML
- `AdminActionDialog.html`은 `Index.html`이 아니라 `Code.gs`가 스프레드시트 관리자 도구 메뉴에서 직접 띄운다(템플릿).
- 사장 파일은 두지 않는다 — 옛 품목 마스터 스크립트와 시트 전용 CSV 업로드 창은 TASK-026에서 삭제했다. 새 `JS_*.html`은
  반드시 `Index.html`에 include하고 `showTab`에 연결한다. 품목 관리는 `JS_Items.html`(TASK-025)이다.

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
캐시에 든 데이터(마스터·업장·시즌·사용자·기초데이터·거래처·대시보드)를 바꾸는 API는 끝에 `CacheManager.invalidateAll();`을 호출한다.
- 새 캐시 키를 만들면 `Config.gs`의 `CACHE_KEYS`와 **`CACHE_INVALIDATE_KEYS`에 반드시 넣는다** — 빠지면 쓰기 직후에도 TTL(10분)이 끝날 때까지 낡은 값이 남는다.
- **거래 등록(입출고)은 캐시를 지우지 않는다.** 거래 행은 어떤 캐시에도 들어 있지 않고, 현재고는 통합 갱신이 다시 계산할 때 바뀐다. 등록마다 지우면 다음 호출이 전부 콜드 미스(마스터 4,300행 재조회)가 된다 (TASK-027).
- 같은 시트를 한 요청 안에서 두 번 읽지 않는다. 업장관리 시트는 `_getActiveShops()`로만 읽는다.
- 화면 쪽은 `loadWithTabCache(key, force, render, fetch)`(JS_UI.html) 패턴으로 탭 응답을 세션 동안 보관하고, 쓰기 직후에는 `force=true`로 다시 받는다.
- `google.script.run` 왕복은 빈 함수도 약 1초다(DEV 실측). 화면 하나가 여러 호출을 순서대로 쏘지 말고, 서버에서 묶어 1회로 돌려준다(`getBootstrapData` 참고).
- **큰 목록은 화면에 통째로 내리지 않는다.** 품목 마스터(4,300행)는 서버 페이징(`queryItems` — 인덱스 캐시 `ITEM_INDEX`에서 검색·필터·정렬 후 25건)으로만 조회한다. 검색어는 디바운스 뒤 1회 호출하고 늦게 온 옛 응답은 버린다(`reqSeq`). 쓰기 API는 갱신된 행(`item`)을 돌려주고 화면이 그 행만 고친다 — 목록을 다시 받지 않는다 (TASK-025).
- 인덱스처럼 쓰기 직후 곧바로 다시 읽히는 캐시는 `invalidateAll()` 뒤 같은 요청 안에서 다시 채운다(`_refreshItemIndexAfterWrite`). 캐시 실패는 삼키고 다음 조회가 콜드 미스로 채운다 — 쓰기 성공을 뒤집지 않는다.

## 커밋 메시지
```
[feat] 시즌 관리 UI 추가
[fix] FIFO 마감 시 로트 단가 누락 수정
[refactor] WebApp.gs API 핸들러 모듈 분리
[style] 대시보드 카드 레이아웃 개선
[docs] README 배포 가이드 업데이트
[chore] Migration v10 에러 로그 시트 추가
```
