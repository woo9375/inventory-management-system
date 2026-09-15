# TASK-028: 월마감 재실행 · 미종료 월 · 건너뛴 월 · 동명 아카이브 파일 차단

## Objective
2026-09-14 DEV 환경에서 월마감 모달의 기본값(이번 달)으로 9월을 마감하여 당월 잔여 기간의 모든 거래 등록이 차단되는 장애가 발생하였다. 현재 백엔드 `executeMonthlyClosing()`에는 대상 연/월에 대한 검증(기마감 여부, 월 종료 여부, 순차 마감 여부, 동명 아카이브 파일 존재 여부)이 전무하며, 재마감이 막히는 것은 마감 직후 데이터가 비어 있어 발생하는 우연한 결과에 불과하다(초기재고 > 0인 품목이 존재하면 재마감이 뚫림).

본 Task의 목표는:
1. 서버(`Archive.gs`) 최선행단에 마감 대상 월의 유효성 검사(순수 함수 `_validateClosingTarget`) 및 동명 아카이브 파일 중복 검사를 추가하여 잘못된 마감 시도를 원천 거절한다.
2. 웹앱 월마감 모달(`JS_Config.html`)에서 현재 마감 기준일과 다음 마감 대상 월을 명시하고, 기본 선택값을 다음 마감 대상 월로 지정하며, 마감 불가한 월을 `disabled` 처리한다.
3. 소급 입력 차단 안내 메시지(`Archive.gs`, `JS_Tx.html`, `Code.gs`)를 현장 업무에 맞게 구체화한다.

---

## Confirmed Facts
실제 코드를 읽어 확인된 사실과 라인 번호는 다음과 같다:

1. **월마감 UI 진입점 (Step 2.5 아키텍처 진입점 역추적 통과)**:
   - [진입점 호출 경로 증빙: `src/Index.html:43` (사이드바 `data-tab="transactions"`) → `src/Index.html:207` (`section id="tab-transactions"`) → `src/Index.html:230-240` (관리자 전용 헤더 드롭다운 `#btnTxAdminMenu` → `#txAdminMenu`) → `src/Index.html:237` (`onclick="closeTxAdminMenu(); openMonthlyClosingModal()"`)]
   - [스크립트 로딩 증빙: `src/Index.html:689` (`<?!= include('JS_Config') ?>`)]
   - `src/JS_Config.html:357`: `openMonthlyClosingModal()` 함수가 모달 HTML 동적 구성.
   - `src/JS_Config.html:362-374`: 연도 선택지는 `작년~올해`, 월 선택지는 `1~12월`이며 기본 선택값이 현재 연/월(`currYear`, `currMonth`)로 설정되어 있음. 마감 기준일이나 다음 마감 대상에 대한 정보가 전혀 표시되지 않음.
   - `src/JS_Config.html:388`: `confirmMonthlyClosing()`에서 2차 확인 모달 표시.
   - `src/JS_Config.html:399-423`: `submitMonthlyClosing(year, month)`에서 '동의' 입력 확인 후 `google.script.run.executeMonthlyClosing(getToken(), year, month)` 호출.

2. **백엔드 월마감 실행 로직 (`src/Archive.gs`)**:
   - `src/Archive.gs:93`: `executeMonthlyClosing(token, year, month)`
   - `src/Archive.gs:95-97`: 관리자 세션 검사 (`role !== 'admin'`).
   - `src/Archive.gs:100-103`: 아카이브 폴더 ID 유효성 검사.
   - `src/Archive.gs:106-111`: `LockService.getScriptLock()` 획득.
   - `src/Archive.gs:115-124`: 시트 로드 (`SHEET_INOUT`, `SHEET_MASTER`) 및 데이터 추출.
   - `src/Archive.gs:128-136`: 음수 재고 가드레일 (TASK-011).
   - `src/Archive.gs:139`: `cutoffDate = new Date(year, month, 0, 23, 59, 59)` (해당 월 말일 계산).
   - `src/Archive.gs:144-152`: `archiveRows`와 `keepRows` 분리.
   - `src/Archive.gs:154-156`: `if (archiveRows.length === 0 && masterData.every(r => (Number(r[6]) || 0) === 0))` 검사 후 `"해당 기간에 아카이브할 입출고 데이터나 초기 재고가 없습니다."` 실패 반환.
   - `src/Archive.gs:161-176`: Google Drive 아카이브 폴더 및 연도 서브폴더(`yearFolder`) 획득/생성.
   - `src/Archive.gs:179-182`: `archiveName = [입출고마감]_${yearStr}_${monthStr}` 생성 후 **동명 파일 존재 여부 검사 없이 `SpreadsheetApp.create(archiveName)` 무조건 실행**.
   - `src/Archive.gs:196-310`: FIFO 잔여 로트 이월 행 생성, 품목 마스터 `INIT_STOCK` 0으로 리셋, 시트 되쓰기.
   - `src/Archive.gs:311`: `_trimShopSheetsForClosing()` 업장 시트 정리 (TASK-006).
   - `src/Archive.gs:332`: `recalcStockAndUsage(ss)`.
   - `src/Archive.gs:340`: `setLatestClosingCutoff(cutoffDate)`.

3. **마감 기준일 관리 및 클라이언트 공유 (`src/Archive.gs`, `src/WebApp.gs`, `src/JS_Tx.html`)**:
   - `src/Archive.gs:589-597`: `setLatestClosingCutoff(cutoff)`가 `ScriptProperties.LAST_CLOSED_CUTOFF`에 `yyyy-MM-dd` 저장 및 부정 캐시 제거.
   - `src/Archive.gs:614-648`: `getLatestClosingCutoff(ss)`가 프로퍼티 캐시 조회, 없으면 통합 시트 이월 행 역산, 없으면 10분간 부정 캐시(`CLOSING_CUTOFF_NONE`, TASK-027).
   - `src/Archive.gs:695-705`: `getClosingCutoffInfo(token)`가 `{ success: true, cutoff: string|null, minDate: string|null }` 반환.
   - `src/WebApp.gs:195-205`: `getBootstrapData(token)`가 `closing: getClosingCutoffInfo(token)`를 포함하여 1회 번들 반환 (TASK-027).
   - `src/JS_Auth.html:126`: 부트스트랩 응답에서 `applyClosingCutoff(boot.closing)` 호출.
   - `src/JS_Tx.html:148, 158-163`: `closedCutoffDate` 전역 변수에 마감일 보관 및 `txDate.min` 설정.
   - 요청 연/월과 `getLatestClosingCutoff()`를 비교하는 검증 코드가 서버에 전혀 없음.

4. **소급 입력 차단 메시지 불일치 현황**:
   - `src/Archive.gs:683-685`: `evaluateClosingCutoff` 내 `"과거 누락/정정 데이터는 당월 재고조정 거래로 등록해주세요."`
   - `src/JS_Tx.html:357`: `addTransaction` 클라이언트 검증 내 `"당월 재고조정으로 등록하세요"`
   - `src/Code.gs:410`: `onEdit` 시트 편집 검증 내 `"과거 누락/정정은 당월 거래로 입력하세요."`
   - 시스템 거래 유형(구분: 입고, 출고, 폐기)에 "재고조정"이라는 구분이 없어 현장 실무자에게 혼선을 줌.

5. **기존 테스트 현황**:
   - `tests/unit/monthly-closing.test.js`: VM 샌드박스 기반 단위 테스트. 580행에서 "아카이브할 입출고 데이터나 초기 재고가 없습니다" 가드 테스트. 188-196행의 `yearFolder` 모의 객체에는 `getFilesByName`이 구현되어 있지 않음.
   - `tests/unit/lib/gas-sheet-mock.js`: 411-420행 `makeFolder`에 `getFilesByName` 부재, 드라이브 파일에 `isTrashed()` 메서드 부재.
   - `tests/unit/closed-month-guardrail.test.js`: `getLatestClosingCutoff` 및 `validateNotClosedMonth` 검증.
   - `tests/e2e/monthly-closing.spec.js`: 137행 `ALLOW_REAL_CLOSING = process.env.E2E_ALLOW_MONTHLY_CLOSING === '1'` 게이트, 164행 결과 정규식 `/아카이브할 입출고 데이터나 초기 재고가 없습니다|마감 완료/`.

6. **문서 현황**:
   - `Docs/BusinessRules.md:151-175` (§10 월마감, §11 이월): 재마감 금지, 미종료 월 금지, 순차 마감, 동명 파일 차단 규칙 누락.
   - `Docs/Architecture.md:170-180`: 월마감 흐름에 대상 월 검증 단계 미기재.

---

## Hypotheses
- 대상 연/월 유효성 검사 로직을 외부 상태(시트, 드라이브)와 무관한 순수 함수 `_validateClosingTarget(year, month, cutoff, today)`로 분리하면, 가상 일자(`today`) 주입을 통해 연말/연초 경계, 윤년, 순차 마감, 첫 마감 시나리오를 빠르고 완벽하게 단위 테스트할 수 있다.
- `getClosingCutoffInfo`의 반환 객체에 `nextClosable: { year, month } | null` 필드를 추가하면 클라이언트(`JS_Config.html`)가 복잡한 일자 계산 없이 모달의 안내 문구, 기본 선택값 및 `disabled` 옵션을 즉시 렌더링할 수 있다.
- 동명 파일 검사 시 `isTrashed()`를 함께 확인하면, 사용자가 실수로 휴지통에 버린 구 파일 때문에 정상적인 월마감이 차단되는 문제를 방지할 수 있다.

---

## Business Context
- 월마감은 특정 회계 기간의 입출고 데이터를 동결하고 원장을 분리하는 매우 엄격한 비가역 작업이다.
- 마감된 기간에 대해서는 TASK-010에 의해 소급 입력 및 수정이 전면 차단된다. 만약 아직 종료되지 않은 월(예: 당월 중순)을 조기 마감해버리면, 그 달 남은 기간의 모든 거래 입력이 차단되어 호텔 현장 운영이 마비된다.
- 이미 마감된 월을 과거 연/월로 다시 마감할 경우, 기준일(`LAST_CLOSED_CUTOFF`)이 과거로 후퇴하여 기마감 기간에 대한 소급 차단 보호벽이 해제되고, 동일한 아카이브 파일이 중복 생성되거나 중복 이월 행이 발생하여 재고 데이터 무결성이 영구적으로 파괴된다.
- 따라서 마감 작업은 반드시 **이미 종료된 월**, **이전 마감월의 직후 월(순차 마감)**에 한해서만 실행되어야 하며, 드라이브 연도 폴더에 동일한 아카이브 파일이 이미 존재하는 비정상 상태에서는 즉시 중단되어야 한다.

---

## Current System
- `executeMonthlyClosing(token, year, month)`는 클라이언트가 전달한 `year`, `month`를 아무런 선행 검증 없이 그대로 수용한다.
- 마감 직후에는 통합 시트 내 대상 기간의 데이터가 비어 있어 "아카이브할 데이터가 없습니다" 가드(154행)에 걸리지만, 초기재고가 0보다 큰 신규 품목이 등록되면 데이터가 있는 것으로 판정되어 재마감이 통과된다.
- 기준일보다 이전 월을 요청하면 `setLatestClosingCutoff(cutoffDate)`에 의해 마감 기준일이 과거로 되돌아가 소급 입력 차단이 풀려버린다.
- 모달 UI(`JS_Config.html`)는 현재 마감 기준일 정보를 보여주지 않고 기본값으로 '현재 연/월'을 선택해 두어 오마감을 유도하는 위험한 구조다.

---

## Root Cause / Diagnostic Logic
- **서버 검증 부재**: `executeMonthlyClosing`에 `LAST_CLOSED_CUTOFF` 및 현재 일자 기준 유효성 검증 단계가 누락됨.
- **아카이브 파일 생성 전 중복 검사 부재**: `yearFolder` 내 `[입출고마감]_YYYY_MM` 존재 여부를 확인하지 않고 `SpreadsheetApp.create()`를 바로 호출함.
- **클라이언트 UI 기본값 설계 오류**: 종료되지도 않은 '당월'을 기본 선택값으로 제공하고 마감 불가한 월을 차단하지 않음.

---

## Requirements

### Functional
- [x] **1. 순수 검증 함수 추가 (`src/Archive.gs: _validateClosingTarget(year, month, cutoff, today)`)**:
  - `cutoff`: `getLatestClosingCutoff()` 반환값 (`"yyyy-MM-dd"` 또는 `null`).
  - `today`: 현재 일자 `Date` 객체 (단위 테스트 시 가상 일자 주입 가능).
  - 검사 1 (**재마감 및 과거 월 금지**): 요청 월의 말일(`cutoffDate`) 문자열이 `cutoff` **이하**이면 거절.
    - 메시지: `${year}년 ${month}월은 이미 마감된 월입니다 (마감 기준일 ${cutoff}).`
  - 검사 2 (**미종료 월 금지**): 스크립트 타임존 기준 `today`가 요청 월의 익월 1일 이전이면 거절.
    - 메시지: `${year}년 ${month}월은 아직 끝나지 않았습니다. ${nextMonth}월 1일 이후에 마감할 수 있습니다.` (12월인 경우 `${year+1}년 1월 1일 이후`)
  - 검사 3 (**순차 마감 강제**): 마감 이력이 있는 경우(`cutoff !== null`), 요청 월은 반드시 `마감 기준일의 익월`이어야 함 (건너뜀 거절). 마감 이력이 없으면(첫 마감) 지난 아무 월이나 허용.
    - 메시지: `다음 마감 대상은 ${expectedYear}년 ${expectedMonth}월입니다. 순서대로 마감하세요.`
  - 성공 시 `{ ok: true }`, 실패 시 `{ ok: false, message: string }` 반환.
- [x] **2. 동명 아카이브 파일 중복 검사 (`src/Archive.gs: executeMonthlyClosing`)**:
  - `yearFolder` 획득 후, `archiveName = [입출고마감]_${yearStr}_${monthStr}` 파일이 존재하는지 `yearFolder.getFilesByName(archiveName)`으로 검사.
  - 휴지통에 있지 않은(`!file.isTrashed()`) 파일이 1개라도 존재하면 파일 생성 및 시트 조작을 일체 수행하지 않고 즉시 거절.
    - 메시지: `아카이브 폴더 ${yearStr}에 '${archiveName}' 파일이 이미 있습니다. 기존 파일을 확인(이름 변경 또는 이동)한 뒤 다시 실행하세요.`
- [x] **3. 서버 최선행 가드 적용 순서 (`src/Archive.gs: executeMonthlyClosing`)**:
  - 권한 검사 → 아카이브 폴더 ID 검사 → `LockService` 획득 직후, **시트 읽기 및 음수 재고 검사 전**에 아래 순서로 실행:
    1. `_validateClosingTarget(year, month, cutoff, new Date())` 검사
    2. Drive 아카이브 연도 폴더 내 동명 파일 중복 검사
  - 검사 실패 시 Lock 해제 후 `{ success: false, message }` 반환 (예외 throw 금지).
  - 1~4 검사를 통과한 뒤에만 기존 음수 재고 가드(TASK-011) 및 "아카이브할 데이터가 없습니다" 단계로 진입.
- [x] **4. `getClosingCutoffInfo` API 확장 (`src/Archive.gs`)**:
  - 반환 객체에 `nextClosable: { year: number, month: number } | null` 추가 (기존 `success`, `cutoff`, `minDate` 필드는 100% 보존).
  - 마감 이력이 있으면 `cutoff` 익월을 계산하여 `{ year, month }` 제공, 이력이 없으면 `null` 반환.
- [x] **5. 월마감 모달 UI 개편 (`src/JS_Config.html`)**:
  - `openMonthlyClosingModal()` 실행 시 클라이언트 캐시 또는 `getClosingCutoffInfo`를 기반으로 동작:
    - **기준일 및 다음 대상 안내**: 모달 본문에 `현재 마감 기준일: YYYY-MM-DD · 다음 마감 대상: YYYY년 MM월` 표시 (이력 없으면 `현재 마감 기준일: 마감 이력 없음 · 다음 마감 대상: 지난 월 선택 가능`).
    - **기본 선택값**: `nextClosable`이 있으면 해당 연/월을 기본 선택. 마감 이력이 없으면 직전 월(당월 - 1개월)을 기본 선택.
    - **선택지 비활성화 (`disabled`)**: 마감 이력이 있는 경우 `nextClosable`에 해당하지 않는 월(또는 연도)을 `disabled` 처리. 마감 이력이 없는 경우 당월 및 미래 월을 `disabled` 처리.
  - 2차 확인 모달("정말 YYYY년 MM월 마감을 실행하시겠습니까?") 및 "동의" 텍스트 입력 절차는 그대로 유지.
  - 마감 성공 시 클라이언트의 `closedCutoffDate` 최신화 및 `loadClosingCutoff()` 재호출을 통해 거래 탭의 `txDate.min` 하한 동기화.
- [x] **6. 소급 입력 차단 안내 문구 구체화**:
  - `src/Archive.gs:683-685` (`evaluateClosingCutoff`):
    - 기존: `과거 누락/정정 데이터는 당월 재고조정 거래로 등록해주세요.`
    - 변경: `오늘 날짜의 입고/출고로 등록하고 비고에 정정 사유를 남기세요.`
  - `src/JS_Tx.html:357`:
    - 기존: `... 이전은 이미 월마감된 기간입니다. 당월 재고조정으로 등록하세요`
    - 변경: `... 이전은 이미 월마감된 기간입니다. 오늘 날짜의 입고/출고로 등록하고 비고에 정정 사유를 남기세요.`
  - `src/Code.gs:410`:
    - 기존: `... 과거 누락/정정은 당월 거래로 입력하세요.`
    - 변경: `... 과거 누락/정정은 오늘 날짜의 입고/출고로 등록하고 비고에 정정 사유를 남기세요.`
- [x] **7. 문서 동기화**:
  - `Docs/BusinessRules.md` §10 월마감 표에 재마감 금지, 미종료 월 금지, 순차 마감, 동명 파일 차단 규칙 추가.
  - `Docs/Architecture.md` §월마감 흐름 다이어그램에 선행 유효성 검사 단계 반영.

### Non-Functional
- [x] **API 하위 호환성 유지**: `executeMonthlyClosing(token, year, month)` 시그니처 및 `getClosingCutoffInfo(token)` 기존 필드 구조 변경 없음.
- [x] **타임존 무결성**: 모든 날짜 판정은 `Session.getScriptTimeZone()` (Asia/Seoul)을 기준으로 수행하여 해외 브라우저나 서버 시차 오류 방지.
- [x] **안전한 에러 핸들링**: 유효성 검사 실패 시 에러를 던져 스크립트를 중단시키지 않고 `{ success: false, message }` JSON 형태로 클라이언트에 통보.
- [x] **UI 가이드라인 준수**: 서버 응답 실패 메시지 포맷팅 시 `Docs/UIGuidelines.md` 표준 준수.

---

## Constraints
- **Antigravity `/gas-tasks` 가드레일**: 본 Task 생성 후 즉시 턴을 종료하며, 코드(`.gs`, `.html`) 및 `Docs/` 문서를 직접 수정하지 않는다.
- **기존 비즈니스 로직 보존**:
  - TASK-010 소급 입력 차단 가드레일 보존.
  - TASK-011 음수 재고 마감 차단 로직 보존.
  - TASK-006 초기재고 리셋 및 이월 순서, 업장 시트 정리 로직 보존.
- **환경 제약**:
  - Production 시트 및 환경 직접 수정 금지. 오직 DEV 환경에서만 검증.
  - `import / export / require` ES 모듈 문법 사용 금지 (GAS 런타임 제한). 상수는 `Config.gs` 유지.

---

## Files to Inspect
- `src/Archive.gs`: `executeMonthlyClosing`, `getLatestClosingCutoff`, `evaluateClosingCutoff`, `getClosingCutoffInfo`
- `src/JS_Config.html`: `openMonthlyClosingModal`, `confirmMonthlyClosing`, `submitMonthlyClosing`
- `src/JS_Tx.html`: `applyClosingCutoff`, `closedCutoffDate`, 357행 소급 입력 차단 메시지
- `src/Code.gs`: 410행 `onEdit` 소급 입력 차단 메시지
- `tests/unit/monthly-closing.test.js`: 월마감 단위 테스트 및 Drive 모의 객체
- `tests/unit/lib/gas-sheet-mock.js`: Drive/Folder 모의 객체
- `tests/unit/closed-month-guardrail.test.js`: 소급 입력 차단 메시지 단언
- `tests/e2e/monthly-closing.spec.js`: E2E 모달 및 마감 실행 검증
- `Docs/BusinessRules.md`: §10 월마감 업무 규칙
- `Docs/Architecture.md`: 월마감 아키텍처 흐름

---

## Files to Modify
1. `src/Archive.gs`
   - 순수 함수 `_validateClosingTarget(year, month, cutoff, today)` 추가
   - `executeMonthlyClosing` 최선행단에 `_validateClosingTarget` 및 동명 아카이브 파일(`isTrashed` 확인) 가드 배치
   - `getClosingCutoffInfo`에 `nextClosable` 필드 추가
   - `evaluateClosingCutoff` 안내 문구 구체화
2. `src/JS_Config.html`
   - `openMonthlyClosingModal`에 마감 기준일/다음 대상 정보 표시, `nextClosable` 기본 선택값 적용, 불가능한 월 `disabled` 처리
   - 마감 성공 후 클라이언트 기준일 동기화 호출
3. `src/JS_Tx.html`
   - 357행 소급 입력 차단 토스트 문구 구체화
4. `src/Code.gs`
   - 410행 `onEdit` 소급 입력 차단 토스트 문구 구체화
5. `tests/unit/lib/gas-sheet-mock.js`
   - `makeFolder`에 `getFilesByName` 추가, `driveFiles` 항목에 `isTrashed()` 메서드 지원
6. `tests/unit/monthly-closing.test.js`
   - 샌드박스 `yearFolder`에 `getFilesByName` 및 `isTrashed` 모킹 추가
   - 재마감 거절, 미종료 월 거절, 순차 마감 거절, 동명 파일 거절, 첫 마감 허용, 초기재고 존재 시 재마감 거절 등 신규 시나리오 추가
7. `tests/unit/closed-month-guardrail.test.js`
   - 갱신된 소급 차단 안내 문구 단언 갱신
8. `tests/e2e/monthly-closing.spec.js`
   - 1차 모달 내 마감 기준일 안내 및 기본값 단언 추가
   - 미종료 월 강제 선택 시 `아직 끝나지 않았습니다` 거절 토스트 수신 단언 추가
   - 164행 결과 정규식에 신규 거절 메시지들 포함
9. `Docs/BusinessRules.md`
   - §10 월마감에 4대 유효성 검사 규칙 추가
10. `Docs/Architecture.md`
    - 월마감 흐름에 선행 유효성 검사 단계 반영

---

## Files to Create
- 없음

---

## Implementation Plan

### 1. 백엔드 순수 유효성 검사 함수 구현 (`src/Archive.gs`)
```javascript
/**
 * 마감 대상 연/월의 유효성을 검사한다 (순수 함수).
 * @param {number} year 마감 대상 연도 (예: 2026)
 * @param {number} month 마감 대상 월 (1~12)
 * @param {string|null} cutoff 최신 마감 기준일 "yyyy-MM-dd" (없으면 null)
 * @param {Date} today 기준 일자 (스크립트 타임존 Date)
 * @return {{ok: boolean, message?: string}}
 */
function _validateClosingTarget(year, month, cutoff, today) {
  const tz = Session.getScriptTimeZone();

  // 요청 월의 말일 (yyyy-MM-dd)
  const targetEnd = new Date(year, month, 0, 23, 59, 59);
  const targetEndKey = Utilities.formatDate(targetEnd, tz, "yyyy-MM-dd");

  // 1. 재마감 및 과거 월 금지: 요청 월 말일 <= 기존 cutoff
  if (cutoff && targetEndKey <= cutoff) {
    return {
      ok: false,
      message: `${year}년 ${month}월은 이미 마감된 월입니다 (마감 기준일 ${cutoff}).`
    };
  }

  // 2. 미종료 월 금지: today < 요청 월 익월 1일
  const nextMonthFirst = new Date(year, month, 1, 0, 0, 0);
  const nextMonthFirstKey = Utilities.formatDate(nextMonthFirst, tz, "yyyy-MM-dd");
  const todayKey = Utilities.formatDate(today, tz, "yyyy-MM-dd");
  if (todayKey < nextMonthFirstKey) {
    const nextMonthNum = month === 12 ? 1 : month + 1;
    const nextYearNum = month === 12 ? year + 1 : year;
    const nextLabel = month === 12 ? `${nextYearNum}년 1월 1일` : `${nextMonthNum}월 1일`;
    return {
      ok: false,
      message: `${year}년 ${month}월은 아직 끝나지 않았습니다. ${nextLabel} 이후에 마감할 수 있습니다.`
    };
  }

  // 3. 순차 마감 강제: 마감 이력이 있는 경우, 반드시 cutoff 익월이어야 함
  if (cutoff) {
    const [cYear, cMonth] = cutoff.split('-').map(Number);
    const expYear = cMonth === 12 ? cYear + 1 : cYear;
    const expMonth = cMonth === 12 ? 1 : cMonth + 1;
    if (year !== expYear || month !== expMonth) {
      return {
        ok: false,
        message: `다음 마감 대상은 ${expYear}년 ${expMonth}월입니다. 순서대로 마감하세요.`
      };
    }
  }

  return { ok: true };
}
```

### 2. 백엔드 동명 아카이브 파일 검사 및 선행 배치 (`src/Archive.gs: executeMonthlyClosing`)
- LockService 획득 직후:
  ```javascript
  const cutoff = getLatestClosingCutoff(ss);
  const valResult = _validateClosingTarget(year, month, cutoff, new Date());
  if (!valResult.ok) {
    return { success: false, message: `❌ [월마감 차단] ${valResult.message}` };
  }

  // 연도 폴더 확인 및 동명 파일 검사
  let baseFolder = DriveApp.getFolderById(archiveFolderId);
  const yearStr = year.toString();
  const yearFolders = baseFolder.getFoldersByName(yearStr);
  let yearFolder = yearFolders.hasNext() ? yearFolders.next() : null;

  const monthStr = String(month).padStart(2, '0');
  const archiveName = `[입출고마감]_${yearStr}_${monthStr}`;

  if (yearFolder) {
    const existingFiles = yearFolder.getFilesByName(archiveName);
    while (existingFiles.hasNext()) {
      const f = existingFiles.next();
      if (!f.isTrashed()) {
        return {
          success: false,
          message: `❌ [월마감 차단] 아카이브 폴더 ${yearStr}에 '${archiveName}' 파일이 이미 있습니다. 기존 파일을 확인(이름 변경 또는 이동)한 뒤 다시 실행하세요.`
        };
      }
    }
  }
  ```
- 이후에만 `txSheet`, `masterSheet` 읽기 및 음수 재고 가드(TASK-011) 실행.

### 3. `getClosingCutoffInfo` 확장 (`src/Archive.gs`)
```javascript
function getClosingCutoffInfo(token) {
  const session = validateSession(token);
  if (!session) return { success: false, cutoff: null, minDate: null, nextClosable: null };

  const cutoff = getLatestClosingCutoff();
  if (!cutoff) return { success: true, cutoff: null, minDate: null, nextClosable: null };

  const c = new Date(cutoff + "T00:00:00");
  const minDate = _toDateKey(new Date(c.getFullYear(), c.getMonth(), c.getDate() + 1));
  const [cYear, cMonth] = cutoff.split('-').map(Number);
  const nextClosable = {
    year: cMonth === 12 ? cYear + 1 : cYear,
    month: cMonth === 12 ? 1 : cMonth + 1
  };
  return { success: true, cutoff: cutoff, minDate: minDate, nextClosable: nextClosable };
}
```

### 4. 클라이언트 모달 렌더링 개선 (`src/JS_Config.html`)
- `openMonthlyClosingModal()`에서 `closedCutoffInfo`(또는 `getClosingCutoffInfo`)를 참조:
  - 안내 헤더 구성:
    ```javascript
    var info = window.lastClosingCutoffInfo || null;
    var guideText = info && info.cutoff
      ? '현재 마감 기준일: <strong>' + info.cutoff + '</strong> · 다음 마감 대상: <strong>' + info.nextClosable.year + '년 ' + info.nextClosable.month + '월</strong>'
      : '현재 마감 기준일: <em>마감 이력 없음</em> · 다음 마감 대상: <em>지난 월 선택 가능</em>';
    ```
  - 연/월 셀렉트 박스에서 불가능한 월 `disabled` 처리 및 유효 월 기본 선택:
    - `nextClosable`이 있는 경우: 해당 연/월만 활성화 또는 기본 선택.
    - 없는 경우: 당월 및 미래 월은 `disabled`, 직전 월을 기본 선택.

---

## Migration Plan
- 시트 구조 변경 없음. 데이터 마이그레이션 없음. ("없음")

---

## Test Plan

### Unit Test
- `tests/unit/monthly-closing.test.js`:
  1. **재마감 시도 차단**: `LAST_CLOSED_CUTOFF = '2026-08-31'` 상태에서 2026년 8월 마감 호출 시 `{ success: false }` 및 `이미 마감된 월입니다` 메시지 단언. 파일 미생성, 시트 데이터 불변.
  2. **과거 월 소급 마감 차단**: `LAST_CLOSED_CUTOFF = '2026-08-31'` 상태에서 2026년 7월 마감 호출 시 거절 및 `LAST_CLOSED_CUTOFF` 프로퍼티 불변 확인.
  3. **미종료 월 마감 차단**: `today`가 2026-09-14일 때 2026년 9월 마감 호출 시 `아직 끝나지 않았습니다` 거절 단언.
  4. **건너뛴 월 마감 차단**: `LAST_CLOSED_CUTOFF = '2026-08-31'` 상태에서 2026년 10월 마감 호출 시(9월 누락) `다음 마감 대상은 2026년 9월입니다. 순서대로 마감하세요` 거절 단언.
  5. **동명 아카이브 파일 차단**: 2026 폴더에 `[입출고마감]_2026_09`가 존재할 때 마감 호출 시 `파일이 이미 있습니다` 거절 단언. 단, `isTrashed: true`인 파일만 있는 경우 정상 통과.
  6. **첫 마감(이력 없음) 동작**: 마감 이력이 없을 때 과거 임의의 종료된 월은 통과하되, 미종료 월은 동일하게 차단됨을 단언.
  7. **초기재고 잔존 시에도 재마감 거절**: 마스터에 `INIT_STOCK > 0`인 품목이 존재하더라도 규칙 1~4에 의해 안전하게 차단됨을 단언(우연 가드가 아닌 규칙 방어 증명).
- `tests/unit/closed-month-guardrail.test.js`:
  - 갱신된 소급 입력 차단 문구(`오늘 날짜의 입고/출고로 등록하고 비고에 정정 사유를 남기세요`) 검증.

### E2E Test (Playwright)
- `tests/e2e/monthly-closing.spec.js`:
  1. **모달 안내 문구 및 기본 선택 검증**:
     - 입출고 탭 → 관리 ▾ → 수동 월마감 모달 진입.
     - 모달 본문에 마감 기준일 안내 텍스트 노출 확인.
     - 기본 선택된 연/월이 당월(현재 진행 중인 월)이 아님을 확인.
  2. **미종료 월 선택 시 클라이언트/서버 차단 검증 (쓰기 없이 상시 실행 가능)**:
     - 현재 월(당월)을 강제로 선택 후 2차 확인 모달에서 "동의" 입력 → 실행.
     - `아직 끝나지 않았습니다` 토스트 발생 확인.
     - 메인 시트 및 아카이브 파일에 변화가 없음을 단언.
  3. **실제 마감(`E2E_ALLOW_MONTHLY_CLOSING=1`) 단언 정규식 보강**:
     - 164행 정규식에 신규 거절 문구 패턴(`/아카이브할 입출고 데이터나 초기 재고가 없습니다|마감 완료|이미 마감된 월입니다|아직 끝나지 않았습니다|순서대로 마감하세요|파일이 이미 있습니다/`) 추가.

---

## Regression Risk
- 정상적인 순차 월마감 시 흐름(음수 재고 검사, 데이터 분리, FIFO 이월, INIT 리셋, 업장 시트 정리)에는 영향을 주지 않음.
- 만약 운영 중 스크립트 프로퍼티(`LAST_CLOSED_CUTOFF`)가 유실되더라도, 기존 `getLatestClosingCutoff`가 통합 시트의 이월 행을 스캔하여 기준일을 자동으로 역산 복구하므로 순차 마감 가드가 정상 유지됨.

---

## Acceptance Criteria
- [x] `_validateClosingTarget` 순수 함수가 작성되고 재마감, 미종료 월, 건너뛴 월, 첫 마감에 대해 정확한 성공/거절을 반환한다.
- [x] 연도 폴더 내 동일한 이름의 아카이브 파일이 존재할 경우 새 스프레드시트를 생성하지 않고 즉시 거절한다.
- [x] 유효성 검사 실패 시 스프레드시트나 Drive에 어떠한 쓰기 작업도 발생하지 않는다.
- [x] 웹앱 모달에 기준일/다음 대상이 표시되고, 기본값이 다음 마감 대상 월로 자동 설정되며, 마감 불가 월이 `disabled` 처리된다.
- [x] 소급 입력 차단 안내 메시지가 `오늘 날짜의 입고/출고로 등록하고 비고에 정정 사유를 남기세요`로 통일된다.
- [x] 신규 추가된 단위 테스트(`monthly-closing.test.js`, `closed-month-guardrail.test.js`)가 100% 통과한다.
- [x] DEV E2E 테스트(`monthly-closing.spec.js`)가 통과한다.
- [x] `Docs/BusinessRules.md` 및 `Docs/Architecture.md`에 업무 규칙 및 아키텍처 흐름이 명확히 기록된다.

---

## Human Approval Required
- **DEV 환경 실제 마감 테스트 후 원복 주의**:
  - `E2E_ALLOW_MONTHLY_CLOSING=1`을 켜고 실제 마감을 수행한 경우, 스프레드시트 버전 복원만으로는 원복되지 않는다.
  - **반드시 Google Apps Script 프로젝트 설정의 스크립트 속성(`LAST_CLOSED_CUTOFF`)을 수동으로 삭제**해야 마감 기준일이 초기화된다.
- **Production 배포**:
  - DEV 환경 검증 및 Human QA 통과 후, 명시적 승인을 받아 `git push origin main`으로 배포한다.

---

## Deployment Notes
- 배포 전 `LAST_CLOSED_CUTOFF` 스크립트 속성이 유효한 형식(`yyyy-MM-dd`)인지 확인한다.
- 만약 속성이 없더라도 시스템이 첫 마감 또는 시트 역산으로 정상 작동한다.

---

## Rollback Plan
- 배포 후 치명적 오류 발생 시 이전 커밋으로 롤백 배포 (`git revert`).
- 만약 잘못된 마감이 실행된 경우:
  1. 생성된 아카이브 스프레드시트 파일 삭제.
  2. 메인 스프레드시트를 마감 직전 버전으로 복원 (버전 기록 사용).
  3. 스크립트 속성 `LAST_CLOSED_CUTOFF`를 직전 유효 기준일로 복구(또는 삭제 후 역산 유도).

---

## Final Report
*(Claude Code · 2026-09-15 · DEV 배포 `npm run dev:push` 완료 · 로컬 커밋 · Production 미배포)*

착수 전 `git status`: Files to Modify 중 미리 수정된 파일 없음(Task 파일만 untracked).

### 1. 구현 요약

| 요구사항 | 구현 | 근거 |
|---|---|---|
| FR-1 순수 검증 함수 | `_validateClosingTarget(year, month, cutoff, today)` — 입력 정합성(정수·1~12·2000~2100) → ① 재마감(대상 월 말일 ≤ 기준일) → ② 미종료 월(오늘 < 다음 달 1일) → ③ 순차(기준일의 다음 달만, 이력 없으면 끝난 아무 달) 순으로 `{ok:false,message}`. 날짜 비교는 전부 `_toDateKey`(스크립트 타임존 yyyy-MM-dd 문자열)로 한다. `_nextClosableMonth(cutoff)`를 서버 판정과 `getClosingCutoffInfo`가 공유 | `src/Archive.gs` |
| FR-2 동명 파일 검사 | `_hasLiveFileNamed(folder, name)` — `getFilesByName` 순회, `isTrashed()`는 무시. 연도 폴더는 검사 단계에서 **만들지 않고** 찾기만 하며(거절 경로에 Drive 쓰기 없음), 실제 파일을 쓸 때 없으면 그때 만든다 | `src/Archive.gs` |
| FR-3 선행 배치 | 락 획득 직후 `ss`만 얻고 → ① `_validateClosingTarget(..., getLatestClosingCutoff(ss), new Date())` → ② 폴더 접근·동명 파일 검사 → 그 뒤에야 시트 읽기·음수 재고 가드(TASK-011)·데이터 부재 가드. 거절은 `{ success:false, message: "❌ [월마감 차단] …" }`(TASK-011 메시지와 같은 틀), 예외 없음, `finally`가 락 해제. 옛 폴더 블록에 있던 권한 오류 처리는 앞단으로 옮겼고 `monthStr`·`archiveName`·`yearFolder` 중복 선언을 정리 | `src/Archive.gs` |
| FR-4 API 확장 | `getClosingCutoffInfo` → `nextClosable: {year, month} | null` 추가, 기존 `success/cutoff/minDate` 그대로 | `src/Archive.gs` |
| FR-5 모달 | `openMonthlyClosingModal`은 admin 검사 뒤 **열 때마다 기준일을 다시 읽고**(`loadClosingCutoff(cb)`, 되돌릴 수 없는 작업이라 로그인 시점 값을 믿지 않음) `renderMonthlyClosingModal(info, today)`. 안내 callout `#closingGuide`: `현재 마감 기준일: … · 다음 마감 대상: …`(이력 없음 → `마감 이력 없음 · 지난 월 선택 가능`, 다음 대상이 아직 안 끝났으면 `(N월 1일 이후 가능)`). 기본 선택 = `nextClosable`(이력 없으면 지난달, 1월이면 작년 12월). 연도 목록은 작년~올해에 다음 대상 연도를 포함하도록 확장, 고를 수 있는 달이 없는 연도는 `disabled`; 달은 `refreshClosingMonthOptions()`(연도 `onchange`에도 연결)가 `isClosableMonth`로 `disabled`. 2차 확인·"동의" 절차 불변. 성공 시 `loadClosingCutoff()`로 `txDate.min`·안내 최신화. 토스트는 `itemMsg`로 앞 이모지 제거(UIGuidelines §3) | `src/JS_Config.html`, `src/JS_Tx.html`(`closingCutoffInfo` 전역, `loadClosingCutoff(cb)`, `applyClosingCutoff`가 이력 없음도 반영해 `min`을 비움) |
| FR-6 안내 문구 | `evaluateClosingCutoff`·`JS_Tx.html` 클라이언트 사전 거절·`Code.gs onEdit` 토스트 3곳을 "오늘 날짜의 입고/출고로 등록하고 비고에 정정 사유를 남기세요"로 통일 | `src/Archive.gs`, `src/JS_Tx.html`, `src/Code.gs` |
| FR-7 문서 | `Docs/BusinessRules.md` §10에 「마감 대상 월 검증」 + ①~④ + 「모달 안내·기본값」 행 추가, 「과거 오류 정정 방법」 문구 갱신. `Docs/Architecture.md` 월마감 흐름에 검증 2단계 삽입 | |

### 2. 검증

- `npm test` — **22개 파일 전체 통과**(신규 1 포함).
  - `monthly-closing.test.js` 13 → **22건**: 재마감 / 과거 월(기준일 불변·8월 거래 여전히 차단) / 미종료 월(실제 오늘의 달) / 건너뜀(→ 순서대로 하면 통과) / 동명 파일(휴지통만 있으면 통과·기존 연도 폴더 재사용) / 첫 마감(끝난 아무 달) / **초기재고 > 0 신규 품목이 있어도 규칙으로 거절**(우연 가드 아님 증명) / `_validateClosingTarget` 순수 판정(기준일 주입·연말 경계·검사 순서·문자열 입력·잘못된 입력) / `nextClosable`. 거절 케이스는 공통 헬퍼로 파일·폴더 미생성 + 시트 쓰기 0 + 속성 불변을 단언. 하네스에 `CacheService` 스텁, `closedCutoff`·`existingArchiveFiles` 옵션 추가.
  - `closing-modal-client-logic.test.js`(신규, 9건): `JS_Config.html` `<script>`를 vm에 올려 `isClosableMonth`·`defaultClosingTarget`·렌더 결과(안내 문구·selected·disabled·연말 경계)·`refreshClosingMonthOptions`·비관리자 차단 검증.
  - `closed-month-guardrail.test.js` +2(문구·`nextClosable`), `negative-stock.test.js`(`CacheService` 스텁 — 마감 전 기준일 조회가 부정 캐시를 읽음), `perf-cache-paths.test.js`(부트스트랩 `closing` 형태), `tests/unit/lib/gas-sheet-mock.js`(`getFilesByName`·`isTrashed`).
- Playwright `monthly-closing.spec.js`(DEV) — **3 passed / 1 skipped(실제 마감 게이트)**. 신규 「미종료 월 강제 선택」: disabled 옵션을 evaluate로 풀어 이번 달을 골라 "동의"까지 → 서버 응답 `마감 실패: [월마감 차단] 2026년 9월은 아직 끝나지 않았습니다. 10월 1일 이후에 마감할 수 있습니다.`(앞 이모지 없음), 모달 유지, 기준일·첫 업장 최근 내역 불변. 1차 모달 테스트는 기준일 안내·기본 선택(이력 있으면 `nextClosable`, 없으면 지난달)·이번 달/미래 달 disabled를 단언.
  - DEV 관찰: `LAST_CLOSED_CUTOFF` 삭제 뒤에도 통합 시트의 `2026년 8월 마감 이월`(SYS-, 9/1자) 행에서 **2026-08-31이 역산**돼 있다(이전 DEV 검증의 8월 마감). 그래서 모달은 `기준일 2026-08-31 · 다음 대상 2026년 9월 (10월 1일 이후 가능)`을 보여 주고 9월이 disabled였다 — 규칙대로다. 오늘 날짜 거래 등록에는 영향 없음.
- Playwright 전체 회귀(DEV) — `npx playwright test` **29 passed / 5 skipped / 0 failed**(15.7분, 34건). skip 5건은 기존 게이트(실제 월마감 2 · perf 2 · 거래처 삭제 제약 1). 로그인 부트스트랩(`applyClosingCutoff` 변경)·거래 등록·일괄 업로드·품목 관리·관리자 도구 전부 통과 — 기존 스펙 회귀 없음.

### 3. 명세와 다른 점 / 판단

- 클라이언트 사전 거절(토스트)은 넣지 않았다 — 옵션 `disabled`만으로 UI에서 고를 수 없고, 서버 거절을 E2E가 실제로 확인해야 하므로(명세: 서버가 1차 방어).
- 모달은 로그인 때 받은 `closingCutoffInfo`를 쓰지 않고 열 때마다 서버를 1회 더 부른다(≈1초). 다른 관리자가 그사이 마감했을 수 있고, 마감은 되돌릴 수 없어서다. 기준일 조회에 실패하면 모달을 열지 않고 토스트로 안내한다.
- `negative-stock.test.js`·`perf-cache-paths.test.js`·`closing-modal-client-logic.test.js`(신규)는 Files to Modify에 없었다. 앞 둘은 마감 전 기준일 조회(`CacheService`)와 `nextClosable` 필드 때문에 깨져서 고쳤고, 신규 파일은 모달 로직(이력 없음 분기 등 DEV 상태로는 E2E가 닿지 않는 경로)을 검증하기 위해 추가했다.
- 검증 실패 반환 형식은 TASK-011과 같은 `❌ [월마감 차단] …`으로 맞췄다(서버 메시지 규약 유지, 화면에서는 `itemMsg`로 이모지를 뗀다).

### 4. Human Approval Required

- DEV에서 실제 마감(`E2E_ALLOW_MONTHLY_CLOSING=1`)을 돌렸다면 되돌릴 때 **스프레드시트 버전 복원 + 스크립트 속성 `LAST_CLOSED_CUTOFF` 삭제**가 모두 필요하다(이번 Task에서는 실제 마감을 실행하지 않았다). 단, 통합 시트에 이월 행(SYS-)이 남아 있으면 속성을 지워도 기준일이 역산된다 — DEV에 지금 남아 있는 8월 이월 행이 그 예.
- Production 반영은 Human QA 뒤 `git push origin main`.

### 5. 배포 메모

- 시트 구조·마이그레이션 없음. Production 스크립트 속성 `LAST_CLOSED_CUTOFF`가 없어도 이월 행 역산 또는 "첫 마감"으로 동작한다.
- Human QA 전이라 **push하지 않았다**(로컬 커밋만).
