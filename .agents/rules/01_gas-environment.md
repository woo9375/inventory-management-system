# Apps Script Environment Guidelines

This project runs on Google Apps Script (V8 runtime), NOT a standard Node.js or browser environment.

## Critical Constraints
1. **No Node.js Modules**: Do NOT use `fs`, `path`, `http`, or any other built-in Node.js modules.
2. **No Browser APIs**: Do NOT use `window`, `document`, or DOM manipulation in the `.gs` files (they run server-side). UI code exists strictly within `HtmlService` templates (`.html` files).
3. **Google Services**: Use `SpreadsheetApp` for database operations and `DriveApp` for file/folder management.
4. **API Limits**: Google Apps Script has quotas and execution time limits (max 6 minutes). Whenever possible, batch read/write operations on spreadsheets (e.g., use `getValues()` and `setValues()` on ranges instead of looping over individual cells).
5. **Syntax**: The `.gs` files support modern ES6+ JavaScript (V8 engine). However, `import`/`export` and `require()` are NOT supported — all `.gs` files share a single global scope.

## Project Structure
- `.clasp.json` sets `rootDir` to `"src"`. All source files (`.gs`, `.html`) **must** be placed inside the `src/` directory.
- `.claspignore` excludes `*.md`, `backup/**`, `node_modules/**`, and other non-source files from Apps Script uploads.

## Source Modules (`src/`)

### Backend (`.gs` files)
| File | Role |
|------|------|
| `Code.gs` | System entry point (`onOpen`, `createAll`, etc.) |
| `Config.gs` | All constants: sheet names, colors, column mappings, roles, defaults |
| `SheetBuilder.gs` | Sheet creation and formatting (called by `createAll`) |
| `WebApp.gs` | Frontend API endpoints (`doGet`, server-side handlers for `google.script.run`) |
| `RBAC.gs` | Authentication & role-based access control |
| `Archive.gs` | Month-end closing, FIFO carry-over, backup to Google Drive |
| `StockEngine.gs` | Inventory calculation engine |
| `Dashboard.gs` | Dashboard data aggregation |
| `Migration.gs` | Schema migration framework |
| `CacheManager.gs` | CacheService wrapper for session and data caching |
| `Triggers.gs` | Time-driven trigger setup |
| `Test_Validation.gs` | Validation and testing utilities |

### Frontend (`.html` files, served via `HtmlService`)
| File | Role |
|------|------|
| `Index.html` | Main SPA shell |
| `Stylesheet.html` | All CSS styles |
| `JS_Auth.html` | Authentication UI logic |
| `JS_Config.html` | System configuration UI logic |
| `JS_Master.html` | Item Master management UI logic |
| `JS_Tx.html` | Transaction (입출고) UI logic |
| `JS_UI.html` | Common UI utilities and components |
| `JS_BaseData.html` | Base data management UI logic |
