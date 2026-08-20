# Code Conventions & Module Structure

Follow these conventions when writing or modifying code in this project.

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

## 4. Frontend Module Pattern
- Frontend JavaScript is split by feature into `JS_*.html` files:
  `JS_Auth`, `JS_Config`, `JS_Master`, `JS_Tx`, `JS_UI`, `JS_BaseData`
- All CSS is centralized in `Stylesheet.html`.
- These files are included into `Index.html` via `HtmlService.createHtmlOutputFromFile()`.

## 5. Logging & Error Handling
- Use `Logger.log()` for all server-side logging. Do NOT use `console.log()` in `.gs` files.
- In `try-catch` blocks, always log the error with `Logger.log()` and return a user-friendly message to the frontend.
  ```javascript
  try {
    // business logic
  } catch (e) {
    Logger.log(`[ModuleName] Error: ${e.message}\n${e.stack}`);
    return { success: false, message: "처리 중 오류가 발생했습니다." };
  }
  ```
