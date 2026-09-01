# Apps Script Environment Rules (SSOT)

이 문서는 AI가 Google Apps Script(V8) 환경에서 작업할 때 지켜야 할 **런타임 제약**만 정의합니다.

> **모듈 구성과 책임 분담은 `Docs/CodingRules.md` §3~4를 참조하십시오.**
> **레이어 구조와 데이터 흐름은 `Docs/Architecture.md`를 참조하십시오.**
> **배포 경로와 `clasp` 설정은 `Docs/Deployment.md`를 참조하십시오.**

GAS는 V8 JavaScript를 쓰지만 Node.js/브라우저와 실행 환경이 근본적으로 다르다.
혼동하면 배포 실패, 런타임 오류, 쿼터 초과가 발생한다.

**적용 범위**: 모든 `.gs`(서버 사이드), 모든 `.html`(HtmlService 프론트엔드), `appsscript.json`

---

## 금지사항

| 금지 | 이유 |
|------|------|
| `import` / `export` / `require()` | GAS 미지원. 모든 `.gs`는 **단일 전역 스코프**를 공유 |
| `fs`, `path`, `http`, `process` 등 Node.js 모듈 | GAS 런타임에 없음 |
| `.gs` 내 `window`, `document`, 브라우저 전역 `alert()` | 서버 사이드에서 DOM API 불가 |
| 루프 내 개별 셀 `getValue()` / `setValue()` | 6분 제한·쿼터 초과 위험. `getValues()`/`setValues()` 배치 필수 |
| `.gs` 파일 간 전역 함수명 중복 선언 | 마지막 선언만 유효 (예: `onEdit` 중복 → CR-01 버그) |
| 시트명·컬럼번호·역할 등 상수 하드코딩 | 반드시 `Config.gs` 상수 사용 |
| 시크릿을 소스에 문자열로 기록 | `ScriptProperties`로만 주입 |

### 금지사항의 명시적 예외

- **`console.log()`는 `.gs`에서 허용**된다 — 마이그레이션·아카이브·배치 작업의 **진행 로그** 용도.
  단, **에러는 반드시 `console.error()`** 를 쓰고, 심각한 에러는 `_logError()`로 `SHEET_SYSTEM_LOGS`에 기록한다.
- **`SpreadsheetApp.getUi().alert()`는 허용**된다 — 위 표의 `alert()` 금지는 **브라우저 전역 `alert()`** 만 지칭한다.
  단, WebApp 등 UI가 없는 실행 컨텍스트에서는 예외가 나므로 `try/catch`로 감싼다.
- **저빈도 관리자 작업**(업장 시트 생성, 상태 동기화, DEV 시드)에서 대상 건수만큼 발생하는
  개별 `setValue()`는 허용된다 — 수식 컬럼 덮어쓰기 방지 목적의 의도적 분할을 포함한다.
  **사용자 데이터 경로(입출고·재고 계산·마감)에서는 예외 없이 배치 I/O를 지킨다.**
- **마이그레이션 함수(`Migration.gs`의 `MIGRATIONS[n]`)는 시트명 리터럴을 하드코딩해도 된다.**
  마이그레이션은 *해당 버전 시점의* 시트 구조에 고정되어야 하므로, 값이 바뀔 수 있는
  `Config.gs` 상수를 참조하면 과거 마이그레이션이 깨진다.

---

## 서비스별 한도

### SpreadsheetApp
- 읽기 `getRange().getValues()` / 쓰기 `getRange().setValues()` — 2D 배열 일괄 처리
- 대량 작업 후 `SpreadsheetApp.flush()` 호출
- 루프 안에서 `getRange()` 반복 호출 금지

### CacheService
- 항목당 **100KB** → 초과 시 `CacheManager.gs`의 청크 분할 사용
- 전체 **25MB**, TTL 최대 **6시간**(21600초)
- 세션 키는 `SESSION_PREFIX` 사용

### PropertiesService
- Script Properties: 시스템 설정(스키마 버전, `APP_ENV`, 초기 관리자 등)
- 키/값 각각 **9KB**, 전체 **500KB**
- 인증정보는 여기에만 저장 (소스코드 금지)

### LockService
- 월마감·입출고·품목 등록/수정 등 동시성 제어에 사용
- `waitLock()` 타임아웃 필수, **`finally` 블록에서 반드시 `releaseLock()`**

### DriveApp
- 아카이브 파일 생성/관리 전용
- 폴더 ID는 `Config.gs`의 `getArchiveFolderId()`로 조회 (환경별 ScriptProperties 재정의 지원)

---

## 실행 시간 제약

| 트리거 유형 | 제한 |
|-------------|------|
| Simple Trigger (`onEdit`, `onOpen`) | **30초** |
| Installable Trigger / Web App(`doGet`) / 일반 함수 | **6분** |
| Custom Function (수식) | **30초** |

---

## 전역 네임스페이스

- 모든 `.gs`가 단일 전역 스코프를 공유한다. `const`로 선언한 객체(`COLORS`, `CacheManager` 등)도 전역이다.
- 새 전역 함수/상수를 추가하기 전에 **기존 이름과 충돌하지 않는지 반드시 확인**한다.
- **Private 함수**는 `_` 접두사로 구분한다 (`_hashPassword`, `_requireDevEnv`). 클라이언트에서 직접 호출 불가.
- `.html` 파일에서는 `document`, `window` 등 브라우저 API 사용 가능하며,
  프론트엔드 → 서버 호출은 `google.script.run` 전용이다.

---

## AI 작업 시 검증 체크리스트

```
□ import/export/require 미사용
□ Node.js 내장 모듈 미사용
□ .gs에서 DOM API 미사용
□ 사용자 데이터 경로에서 getValues()/setValues() 배치 처리 사용
□ 6분 실행 제한 준수 / onEdit 등 Simple Trigger 30초 이내
□ LockService finally 블록에서 해제
□ CacheService 100KB 항목 제한 준수
□ 시트명·컬럼번호 Config.gs 상수 사용 (Migration 제외)
□ 전역 함수명 충돌 없음
□ 모든 소스 파일이 src/ 내에 위치
```
