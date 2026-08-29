# Apps Script Environment Guidelines

This project runs on Google Apps Script (V8 runtime), NOT a standard Node.js or browser environment.

## 적용 범위
- 모든 `.gs` 파일 (서버 사이드)
- 모든 `.html` 파일 (HtmlService 프론트엔드)
- `appsscript.json` 매니페스트

## 왜 필요한가
GAS는 V8 JavaScript를 사용하지만, Node.js/브라우저와 근본적으로 다른 실행 환경이다. 이를 혼동하면 배포 실패, 런타임 오류, 성능 문제가 발생한다.

---

## Critical Constraints

1. **No Node.js Modules**: Do NOT use `fs`, `path`, `http`, or any other built-in Node.js modules.
2. **No Browser APIs**: Do NOT use `window`, `document`, or DOM manipulation in the `.gs` files (they run server-side). UI code exists strictly within `HtmlService` templates (`.html` files).
3. **Google Services**: Use `SpreadsheetApp` for database operations and `DriveApp` for file/folder management.
4. **API Limits**: Google Apps Script has quotas and execution time limits (max 6 minutes). Whenever possible, batch read/write operations on spreadsheets (e.g., use `getValues()` and `setValues()` on ranges instead of looping over individual cells).
5. **Syntax**: The `.gs` files support modern ES6+ JavaScript (V8 engine). However, `import`/`export` and `require()` are NOT supported — all `.gs` files share a single global scope.

---

## 금지사항

| 금지 | 이유 |
|------|------|
| `import` / `export` / `require()` | GAS에서 지원하지 않음 |
| `window`, `document`, `alert()` (`.gs` 내) | 서버 사이드에서 DOM API 불가 |
| `fs`, `path`, `http`, `process` 등 Node.js 모듈 | GAS 런타임에 없음 |
| `console.log()` (`.gs` 내, 디버깅 이외) | `Logger.log()` 또는 `console.error()` 사용 |
| 개별 셀 반복 `getValue()`/`setValue()` | 6분 제한 초과 위험. 반드시 `getValues()`/`setValues()` 배치 사용 |
| `.gs` 파일 간 전역 함수명 중복 선언 | 마지막 선언만 유효 (예: `onEdit` 중복 시 하나만 실행됨) |
| 시트명 하드코딩 | 반드시 `Config.gs` 상수 사용 |

---

## 핵심 Google Services 사용 원칙

### SpreadsheetApp
- **읽기**: `getRange().getValues()` → 2D 배열로 일괄 읽기
- **쓰기**: `getRange().setValues()` → 2D 배열로 일괄 쓰기
- **Flush**: 대량 작업 후 `SpreadsheetApp.flush()` 호출
- **불필요한 API 호출 금지**: 루프 안에서 `getRange()` 반복 금지

### DriveApp
- 아카이브 파일 생성/관리에만 사용
- `ARCHIVE_FOLDER_ID`는 `Config.gs`에 정의

### CacheService
- 항목당 **100KB** 제한 → `CacheManager.gs`의 청크 분할 사용
- 전체 **25MB** 제한
- TTL 최대 **6시간** (21600초)
- 세션 관리에 `SESSION_PREFIX` 사용

### LockService
- 동시성 제어에 사용 (월마감, 입출고, 품목 등록/수정)
- `waitLock()` 타임아웃 설정 필수
- `finally` 블록에서 반드시 `releaseLock()` 호출

### PropertiesService
- **Script Properties**: 시스템 설정 (스키마 버전, 초기 관리자 등)
- 키/값 각각 **9KB**, 전체 **500KB** 제한
- 인증정보는 Script Properties에만 저장 (소스코드 금지)

---

## 실행 시간 제약

| 트리거 유형 | 시간 제한 |
|-------------|-----------|
| Simple Trigger (`onEdit`, `onOpen`) | **30초** |
| Installable Trigger | **6분** |
| Web App (`doGet`) | **6분** |
| 일반 함수 호출 | **6분** |
| Custom Function (수식) | **30초** |

---

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
| `ItemService.gs` | Item master CRUD APIs |
| `TxService.gs` | Transaction (입출고) APIs |
| `ConfigService.gs` | Configuration/shop/season management APIs |
| `BaseDataService.gs` | Base data (카테고리/단위) CRUD APIs |

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
| `UploadCsv.html` | CSV upload modal |

---

## 전역 네임스페이스 주의사항
- GAS에서 모든 `.gs` 파일은 **단일 전역 스코프**를 공유한다
- 함수명 충돌 시 마지막 로드된 파일의 정의만 유효 (예: `onEdit` 중복 → CR-01 버그)
- `const`로 선언된 객체(`CacheManager`, `COLORS` 등)도 전역
- **Private 함수**: `_` 접두사로 구분 (예: `_hashPassword`, `_requireAdmin`)

---

## 예외
- `console.error()`는 `.gs`에서 Stackdriver 로깅 목적으로 허용
- `HtmlService` 내 `.html` 파일에서는 `document`, `window` 등 브라우저 API 사용 가능
- `google.script.run`은 프론트엔드 → 서버 호출 전용 API

---

## AI 작업 시 검증 체크리스트

```
□ import/export/require 미사용
□ Node.js 내장 모듈 미사용
□ .gs에서 DOM API 미사용
□ getValues()/setValues() 배치 처리 사용
□ 6분 실행 제한 준수
□ onEdit 등 Simple Trigger 30초 이내
□ LockService finally 블록에서 해제
□ CacheService 100KB 항목 제한 준수
□ 시트명 Config.gs 상수 사용
□ 전역 함수명 충돌 없음
□ 모든 파일이 src/ 내에 위치
```
