# Code Conventions & Module Structure

Follow these conventions when writing or modifying code in this project.

## 적용 범위
- 모든 `.gs` 파일
- 모든 `.html` 파일
- 새 파일 생성 시

## 왜 필요한가
일관된 코드 구조는 AI가 코드를 정확하게 이해하고 수정할 수 있게 하며, 유지보수성을 보장한다.

---

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
- Use section separators for logical grouping within a file:
  ```javascript
  // ═══════════════════════════════════════════════════════════════════
  //  [섹션 이름]
  // ═══════════════════════════════════════════════════════════════════
  ```

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
- Frontend JavaScript is split by feature into `JS_*.html` files:
  `JS_Auth`, `JS_Config`, `JS_Master`, `JS_Tx`, `JS_UI`, `JS_BaseData`
- All CSS is centralized in `Stylesheet.html`.
- These files are included into `Index.html` via `HtmlService.createHtmlOutputFromFile()`.

## 5. Logging & Error Handling
- Use `Logger.log()` or `console.error()` for all server-side logging. Do NOT use `console.log()` in `.gs` files for production code.
- In `try-catch` blocks, always log the error and return a user-friendly message to the frontend.
  ```javascript
  try {
    // business logic
  } catch (e) {
    Logger.log(`[ModuleName] Error: ${e.message}\n${e.stack}`);
    return { success: false, message: "처리 중 오류가 발생했습니다." };
  }
  ```
- 심각한 에러는 `_logError()` 함수로 `SHEET_SYSTEM_LOGS`에 기록

---

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
```javascript
const lock = LockService.getScriptLock();
try {
  lock.waitLock(10000);
} catch (e) {
  return { success: false, message: "⏳ 다른 사용자가 작업 중입니다." };
}
try {
  // business logic
} finally {
  lock.releaseLock();
}
```

## 10. CacheManager 사용 패턴
```javascript
let data = CacheManager.get(CACHE_KEY);
if (!data) {
  data = /* expensive query */;
  CacheManager.set(CACHE_KEY, data, TTL);
}
// 데이터 변경 후: CacheManager.invalidateAll();
```

---

## 금지사항

| 금지 | 대안 |
|------|------|
| 새 파일에 상수 선언 | `Config.gs`에 추가 |
| 시트명 문자열 직접 사용 | `SHEET_*` 상수 |
| 열 번호 매직 넘버 | `MASTER_COLS.*`, `USER_COLS.*` |
| 프론트엔드에서 `fetch()` | `google.script.run.함수명()` |
| 동기 `alert()` 남용 (`.gs`) | 조용한 로깅 또는 반환 값 |

---

## AI 작업 시 검증 체크리스트

```
□ 새 상수는 Config.gs에 추가
□ 모듈 헤더 JSDoc 포함
□ API 응답은 { success, message } 패턴
□ 배치 read/write 사용
□ LockService는 try/finally 패턴
□ CacheManager.invalidateAll() 호출 (데이터 변경 후)
□ Private 함수 _ 접두사
□ 에러 처리에 사용자 친화적 메시지
```
