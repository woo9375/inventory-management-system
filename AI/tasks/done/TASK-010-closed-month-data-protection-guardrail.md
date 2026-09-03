# TASK-010: 과거 마감월 데이터 수정 차단 및 입출고 가드레일 구축

## Objective

월마감 정책을 확정(Super Admin을 포함하여 과거 마감된 월의 데이터 직접 소급 수정/입력 전면 금지)하고, 웹앱 거래 등록 API 및 스프레드시트 직접 편집 시 최신 마감 기준일 이전 날짜의 입출고 거래 입력 및 이월 행 임의 수정을 원천 차단하는 시스템 가드레일을 구축한다.

## Confirmed Facts

1. **월마감 데이터 격리 및 이월 동작** ([`src/Archive.gs:101-115, 230-239, 274`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Archive.gs)):
   - `executeMonthlyClosing(token, year, month)` 실행 시, `cutoffDate = new Date(year, month, 0, 23, 59, 59)` 기준 이전 데이터는 Google Drive 별도 스프레드시트(`[입출고마감]_YYYY_MM`)로 완전 이동(Archive)된다.
   - 활성 스프레드시트의 `📝 통합 입출고 기록장` 및 개별 업장 시트에서 마감 대상 행은 완전히 제거된다 (`_trimShopSheetsForClosing`).
   - 잔여 FIFO 로트는 익월 1일자(`carryoverDate = YYYY-MM-01`) 단일 "입고" 거래(`SYS-YYYYMM01-UUID8`, 비고: `YYYY년 M월 마감 이월`)로 통합 시트에 보존된다.
2. **거래 등록 시 마감 기준일 검증 부재** ([`src/TxService.gs:98-109`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/TxService.gs#L98-L109)):
   - `addTransaction(token, shopName, txData)`는 날짜 형식(`YYYY-MM-DD`)과 유효성만 체크할 뿐, **해당 일자가 이미 마감 완료된 과거 월에 속하는지 여부를 검증하지 않는다**.
   - 따라서 일반 사용자나 관리자가 마감된 이전 달의 날짜로 입출고를 등록하는 것을 시스템이 차단하지 못한다.
3. **과거 일자 입력 시 재고 계산 붕괴 메커니즘** ([`src/StockEngine.gs:88-125`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/StockEngine.gs#L88-L125)):
   - `StockEngine.recalcStockAndUsage()`는 모든 입출고 거래를 날짜 오름차순(`a.date - b.date`)으로 정렬하여 FIFO를 계산한다.
   - 이미 마감되어 `YYYY-MM-01`자로 이월된 행이 존재하는 상태에서, 사용자가 과거 마감월(예: 8월 15일) 거래를 사후 입력하면 해당 거래가 이월 행(9월 1일)보다 앞선 시점으로 소급 삽입된다.
   - 이는 이미 확정된 이월 재고와 중복 계산되거나 FIFO 로트 체인을 파괴하여 현재고 및 재고 평가액을 심각하게 왜곡시킨다.
4. **시트 직접 편집 가드레일 부재** ([`src/Code.gs:91-240`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Code.gs#L91-L240)):
   - `onEdit` 이벤트 핸들러에 업장 시트의 날짜(A열) 편집 시 마감 기준일 검증이나, 통합 시트의 이월 행(`SYS-...`) 직접 수정 차단 가드레일이 없다.

## Hypotheses

- `통합 입출고 기록장`의 "마감 이월" 행들 중 가장 최근 날짜를 조회하거나, `ScriptProperties`에 최신 마감 기준일(`LATEST_CLOSING_CUTOFF_DATE`)을 저장·조회하는 방식으로 밀리초 단위의 고속 날짜 검증이 가능하다.
- 최신 마감 기준일 이전 거래 입력을 전면 차단하더라도, 당월에 정정 전표(`[재고조정]`, `[오류정정]`)를 입력하는 회계 표준 우회책을 제공하면 현장 업무에 지장을 주지 않는다.

## Business Context

- 회계 및 재고 관리의 불변 원칙: 마감(Closing)은 해당 회계 기간의 장부를 동결하는 행위다.
- 과거 마감된 월의 데이터에 직접적인 소급 수정/입력을 허용(Super Admin 예외 포함)할 경우:
  1) 이미 별도 Google Drive로 분리된 아카이브 장부와 메인 장부 간 불일치 발생.
  2) 과거 잔여 로트가 변경되어 당월로 넘어온 이월 행 스냅샷(`SYS-...`)이 허위 데이터가 됨.
  3) 당월 이후 발생한 모든 출고 건의 FIFO 매칭이 연쇄적으로 왜곡됨.
- 따라서 **"과거 마감월 데이터 수정은 Super Admin 포함 전면 금지"** 정책을 확정하고, 과거 오류는 **당월에 정정 거래를 등록**하여 감사 추적성(Audit Trail)을 유지하도록 통제해야 한다.

## Current System

- 마감된 월의 일자를 입력해도 `addTransaction()`이 정상 성공(`success: true`)으로 응답하고 시트에 기록된다.
- 시트에서 관리자가 과거 일자를 직접 입력하거나 이월 행의 수량을 임의 수정해도 아무런 경고나 롤백이 발생하지 않는다.

## Root Cause / Diagnostic Logic

`TxService.gs`의 `addTransaction` 및 `Code.gs`의 `onEdit`에 최신 마감 기준일(`cutoffDate`)과 거래일을 비교하여 과거 거래 입력을 차단하는 검증 함수(`validateNotClosedMonth`)가 존재하지 않기 때문이다.

## Requirements

### Functional
- [ ] **마감 기준일 조회 유틸리티 신설 (`Archive.gs` 또는 `TxService.gs`)**:
  - `getLatestClosingCutoffDate(ss)`: 활성 스프레드시트의 `📝 통합 입출고 기록장`에서 비고란이 `"마감 이월"`을 포함하거나 거래ID가 `"SYS-"`로 시작하는 행들을 스캔하여 가장 최신의 마감 기준일(`Date` 객체 또는 `YYYY-MM-DD`)을 반환한다. 마감 이력이 없으면 `null` 반환.
  - 마감 실행 시점([`executeMonthlyClosing`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Archive.gs#L69))에 `ScriptProperties`의 `LAST_CLOSED_CUTOFF`를 `YYYY-MM-DD`로 자동 갱신하여 캐시 역할을 수행하게 한다.
- [ ] **웹앱 거래 등록 가드레일 (`TxService.gs:addTransaction`)**:
  - 거래일(`transactionDate`)이 최신 마감 기준일(`latestCutoffDate`) 이하인 경우, 즉시 저장을 중단하고 다음 오류 메시지를 반환한다:
    `"❌ 이미 마감된 기간(YYYY년 MM월 이전)의 거래는 등록할 수 없습니다. 과거 누락/정정은 당월 재고조정으로 입력해주세요."`
  - 이 검증은 역할(Admin, Manager, Staff)과 무관하게 모든 사용자에게 예외 없이 적용된다.
- [ ] **시트 직접 편집 가드레일 (`Code.gs:onEdit`)**:
  - 업장 시트에서 날짜(A열)를 직접 편집할 때, 입력된 날짜가 마감 기준일 이하이면 변경을 차단하고 `e.oldValue`로 즉시 롤백하며 사용자 토스트 경고를 띄운다.
  - `📝 통합 입출고 기록장`에서 거래ID(I열)가 `"SYS-"`로 시작하거나 비고(H열)에 `"마감 이월"`이 포함된 행을 직접 수정/삭제하려는 시도를 감지하면 복원 또는 경고를 안내한다.
- [ ] **웹앱 UI 거래 등록 폼 안내 (`JS_Tx.html`)**:
  - 거래 등록 폼의 날짜 선택(`txDate`) input에 `min` 속성(또는 클라이언트 검증)을 적용하여 마감된 날짜를 선택하지 못하도록 UX를 개선한다 (서버 검증과 이중 방어).

### Non-Functional
- [ ] 마감 기준일 조회가 거래 등록마다 전체 시트를 풀 스캔하여 지연을 발생시키지 않도록 `ScriptProperties` 캐싱을 최우선으로 활용한다.
- [ ] 단위 테스트(`tests/unit/`)를 통해 마감 전/후 날짜 거래 입력 시도시의 허용 및 차단 동작을 철저히 검증한다.

## Constraints

- 마감 이력이 없는 초기 상태(`cutoffDate === null`)에서는 모든 유효한 날짜의 거래 등록이 정상 허용되어야 한다.
- 타임존(`Asia/Seoul`) 변환 오류로 인해 당월 1일이 과거 마감일로 오인되어 차단되지 않도록 `toLocalDate()` 또는 `yyyy-MM-dd` 문자열 비교 방식을 일관되게 사용해야 한다.

## Files to Inspect

- [`src/Archive.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Archive.gs)
- [`src/TxService.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/TxService.gs)
- [`src/Code.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Code.gs)
- [`src/JS_Tx.html`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/JS_Tx.html)
- [`tests/unit/monthly-closing.test.js`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/tests/unit/monthly-closing.test.js)

## Files to Modify

- [`src/Archive.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Archive.gs): `executeMonthlyClosing()` 완료 시 `ScriptProperties`에 `LAST_CLOSED_CUTOFF` 저장, 마감 기준일 조회 함수 `getLatestClosingCutoff()` 추가
- [`src/TxService.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/TxService.gs): `addTransaction()` 시작부에 마감일 검증 로직 추가
- [`src/Code.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Code.gs): `onEdit`에서 업장 시트 A열(날짜) 편집 시 마감일 이전 날짜 입력 방어
- [`src/JS_Tx.html`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/JS_Tx.html): 거래 등록 시 과거 마감일 선택 방지 클라이언트 방어 (선택적 UX 개선)

## Files to Create

- [`tests/unit/closed-month-guardrail.test.js`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/tests/unit/closed-month-guardrail.test.js): 마감된 과거 일자 입력 차단 및 마감 이후 일자 정상 입력 검증 단위 테스트

## Implementation Plan

1. **마감 기준일 추적 구현 (`src/Archive.gs`)**:
   - `getLatestClosingCutoff(ss)` 함수 작성:
     - `PropertiesService.getScriptProperties().getProperty("LAST_CLOSED_CUTOFF")` 조회.
     - 프로퍼티가 없으면 `통합 입출고 기록장`의 데이터를 훑어 `SYS-` 거래ID 및 "마감 이월" 비고를 가진 행들의 날짜 중 최신 값을 찾아 프로퍼티에 동기화 후 반환.
   - `executeMonthlyClosing()` 성공 직전 `PropertiesService.getScriptProperties().setProperty("LAST_CLOSED_CUTOFF", Utilities.formatDate(cutoffDate, Session.getScriptTimeZone(), "yyyy-MM-dd"))` 기록.
2. **거래 등록 가드레일 적용 (`src/TxService.gs`)**:
   - `addTransaction()` 내부에서 날짜 포맷 유효성 통과 직후:
     ```javascript
     const cutoffStr = getLatestClosingCutoff(ss);
     if (cutoffStr && dateText <= cutoffStr) {
       return {
         success: false,
         message: `❌ ${cutoffStr} 이전 기간은 이미 월마감되었습니다. 과거 누락 데이터는 당월 재고조정으로 등록해주세요.`
       };
     }
     ```
3. **시트 직접 편집 가드레일 보강 (`src/Code.gs`)**:
   - 업장 시트 `onEdit`에서 A열(날짜)이 수정된 경우:
     - 입력된 날짜가 `cutoffStr` 이전이면 변경 차단 및 `e.range.setValue(e.oldValue)` 롤백.
4. **단위 테스트 작성 (`tests/unit/closed-month-guardrail.test.js`)**:
   - 마감일 `2026-08-31`이 설정된 환경에서 `2026-08-15` 입고 등록 시 실패 반환 검증.
   - `2026-09-01` 입고 등록 시 성공 반환 검증.
   - 마감 이력이 전혀 없는 상태에서 정상 통과 검증.

## Migration Plan

- 마이그레이션 불필요. 기존 마감 이력이 있는 경우 `통합 입출고 기록장` 스캔으로 마감일이 자동 초기화된다.

## Test Plan

### Unit Test
- `npm run test:unit`
- `closed-month-guardrail.test.js` 테스트:
  - Scenario 1: 마감 기준일 이전 거래 등록 거부 (Admin 포함)
  - Scenario 2: 마감 기준일 익일 거래 정상 등록
  - Scenario 3: 마감 이력 없는 신규 시트에서 정상 등록
- 전체 단위 테스트 스위트 정상 통과 검증.

### E2E Test (Playwright)
- DEV 배포 (`npm run dev:push`).
- DEV 환경에서 8월 마감 실행 후, 8월 날짜(`2026-08-20`)로 입출고 등록 시도시 화면에 차단 토스트가 뜨는지 검증.
- 9월 날짜(`2026-09-01`)로 등록 시 정상 저장되는지 확인.

## Regression Risk

- 정상적인 당월 거래가 오차단될 위험: 날짜 비교 시 시각(`00:00:00`)이나 타임존 문제로 당월 1일이 차단되지 않도록 `yyyy-MM-dd` 문자열 대소 비교(`<` vs `<=`)를 정확히 규정한다 (`cutoffDate`는 해당 월의 말일이므로, 마감일 당일까지가 차단 대상이고 익월 1일부터는 허용).

## Acceptance Criteria

- [ ] 마감일 이전 날짜로 `addTransaction()` 호출 시 명확한 에러 메시지와 함께 저장이 차단된다.
- [ ] Super Admin, Manager, Staff 모두 예외 없이 차단된다.
- [ ] 마감일 이후 날짜의 정상 거래는 지연 없이 등록된다.
- [ ] `npm run test:unit` 단위 테스트가 100% 통과한다.

## Human Approval Required

- 없음. (비즈니스 규칙 및 회계 장부 동결 정책의 시스템적 구현)

## Deployment Notes

- 배포 시 기존 운영 환경에 과거 마감 이월 데이터가 이미 존재한다면, 시스템이 자동으로 최신 이월 행을 감지하여 차단 기준일을 수립한다.

## Rollback Plan

- 문제 발생 시 `git checkout`으로 롤백 후 `npm run dev:push`.

## Final Report

### 구현 내용

**1. 마감 기준일 추적 (`src/Archive.gs`)**

| 함수 | 역할 |
|------|------|
| `CLOSING_CUTOFF_PROPERTY` | ScriptProperties 키 `"LAST_CLOSED_CUTOFF"` (값: `yyyy-MM-dd`) |
| `setLatestClosingCutoff(cutoff)` | 마감 기준일 기록. `Date`/문자열 모두 허용하고 `yyyy-MM-dd` 형식이 아니면 저장하지 않는다 |
| `getLatestClosingCutoff(ss?)` | ①ScriptProperties 캐시 → ②없으면 통합 시트의 `마감 이월` 행을 스캔해 역산 후 캐시. 마감 이력이 없으면 `null` |
| `validateNotClosedMonth(dateText, ss?)` | `{blocked, cutoff, message}` 반환. **역할 인자를 받지 않는다** — 예외 경로를 구조적으로 만들지 않기 위함 |
| `getClosingCutoffInfo(token)` | 웹앱 클라이언트용. `minDate`(마감 익일)를 함께 반환 |

역산 규칙: 이월 행 날짜는 마감 **익월 1일**이므로 마감 기준일 = 그 하루 전.
`executeMonthlyClosing()`은 성공이 확정된 시점(반환 직전)에 `setLatestClosingCutoff(cutoffDate)`를 호출한다.

**2. 웹앱 거래 등록 차단 (`src/TxService.gs`)**
`addTransaction()`의 날짜 유효성 검사 직후, 락 획득 전에 `validateNotClosedMonth()`를 호출해
차단 시 즉시 실패 응답을 반환한다. 세션 역할을 보지 않으므로 admin/manager/staff 모두 예외 없이 막힌다.

**3. 시트 직접 편집 차단 (`src/Code.gs` `onEdit`)**
- **업장 시트 A열(날짜)**: 입력값이 마감 기준일 이하이면 토스트 경고 후 롤백.
  단일 셀은 `e.oldValue`로 복원하고, 다중 셀(붙여넣기 등)은 **A열만** `clearContent()`로 지운다.
  기존 코드는 `if (!currentPrefix || row < 3 || !isTargetEdited) return;` 한 줄에서 걸러졌는데,
  `isTargetEdited`는 B/E열 편집만 참이라 A열 단독 편집이 이 지점까지 오지 못했다.
  그래서 조건을 분리해 A열 가드를 그 사이에 넣었다.
- **통합 입출고 기록장의 이월 행**: 거래ID가 `SYS-`로 시작하거나 `isCarryoverRow()`인 행을 편집하면
  경고 후 복원한다. `onEdit`이 시스템 시트를 조기 `return`하기 전에 배치해야 동작하므로
  `SYSTEM_SHEETS` 체크 **앞**에 넣었다.

**4. 클라이언트 이중 방어 (`src/JS_Tx.html`, `src/JS_Auth.html`)**
로그인 초기화 시 `loadClosingCutoff()`가 `getClosingCutoffInfo()`를 호출해
`#txDate`의 `min` 속성을 마감 익일로 설정하고, 저장 직전에도 서버 왕복 없이 즉시 안내한다.

### 타임존 처리

Constraints 요구대로 **`yyyy-MM-dd` 문자열 비교로 일원화**했다.
`Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd")`로만 키를 만들고
`dateText > cutoff` 문자열 비교로 판정하므로, `Date` 산술이나 UTC 변환이 개입할 여지가 없다.
경계 규칙: cutoff는 마감월 **말일**이므로 그날까지 차단, 익월 1일부터 허용.

### 테스트 결과

**단위 테스트 — `npm run test:unit` 전체 통과 (6개 파일)**

신규 `tests/unit/closed-month-guardrail.test.js` (17개 검증). `src/Config.gs` + `src/Archive.gs`를
vm 컨텍스트에 실제로 로드해 검증한다.

| 시나리오 | 검증 |
|----------|------|
| S1 | 마감일(2026-08-31) 당일·이전·전년도 차단 / 익월 1일·이후 허용 |
| S2 | 프로퍼티 없을 때 이월 행에서 2026-08-31 역산 + 캐시 기록 |
| S3 | 여러 번 마감된 경우 **최신** 이월 행 기준 선택 |
| S4 | 마감 이력 없으면 `null` → 어떤 날짜도 차단하지 않음 |
| S5 | 연 경계 (2026-12 마감 → 이월 2027-01-01 → cutoff 2026-12-31) |
| S6 | `setLatestClosingCutoff` 저장 형식 / 잘못된 형식 무시 |
| S7 | `getClosingCutoffInfo`의 `minDate` = 마감 익일 |
| S8 | 검증 함수가 역할 인자를 받지 않음(예외 경로 부재) |

**기존 테스트에 마감일 기록 검증 추가** — `tests/unit/monthly-closing.test.js`의 "기본 마감" 케이스에
실제 `executeMonthlyClosing()` 실행 후 `LAST_CLOSED_CUTOFF === '2026-07-31'`이 되고
2026-07-20은 차단, 2026-08-01은 허용되는지 확인하는 assert를 넣었다(스텁에 `setProperty` 추가).
`tests/unit/fifo-lot-splitting.test.js`는 `addTransaction`이 새로 `Archive.gs`에 의존하게 되어
샌드박스에 `Archive.gs`와 `PropertiesService` 스텁을 추가했다(마감 이력 없음 → 차단되지 않음을 함께 검증).

**E2E — DEV 배포 후 전체 스위트 통과 (8 passed / 1 skipped / 0 failed)**
`npm run dev:push` 후 실행. 입출고 등록(`transaction`)과 FIFO 분할 출고(`fifo-split`)가
2026-09-01 거래로 정상 저장되어, 가드레일이 **정상 거래를 오차단하지 않음**을 확인했다.

### 미완료 — Human QA 필요

**"마감된 날짜로 등록 시 차단 토스트" 시나리오는 실행하지 않았다.**
Test Plan은 DEV에서 8월 마감을 실행한 뒤 8월 날짜 등록을 시도하도록 되어 있으나,
월마감은 아카이브 생성·초기재고 리셋을 동반하는 되돌리기 어려운 작업이라 임의로 실행하지 않았다
(E2E의 마감 실행 테스트도 `E2E_ALLOW_MONTHLY_CLOSING=1`이 있어야 도는 구조다).
차단 로직 자체는 단위 테스트로 검증했으며, 실제 마감 후 동작은 QA에서 확인해 주십시오.

### 변경 파일

| 파일 | 변경 |
|------|------|
| `src/Archive.gs` | 마감 기준일 추적·검증 함수 5종 추가, `executeMonthlyClosing()`에서 기준일 기록 |
| `src/TxService.gs` | `addTransaction()`에 마감일 가드 추가 |
| `src/Code.gs` | `onEdit`에 업장 시트 A열 가드 + 이월 행 보호 추가 |
| `src/JS_Tx.html` | `loadClosingCutoff()` 추가, 날짜 `min` 설정, 저장 전 클라이언트 검증 |
| `src/JS_Auth.html` | 로그인 초기화에 `loadClosingCutoff()` 연결 |
| `Docs/BusinessRules.md` | §10 월마감에 마감월 소급 수정 금지 정책 6개 항목 추가 |
| `tests/unit/closed-month-guardrail.test.js` | 신규 |
| `tests/unit/monthly-closing.test.js` | 마감일 기록 검증 추가 |
| `tests/unit/fifo-lot-splitting.test.js` | 샌드박스에 Archive.gs / PropertiesService 추가 |

### 배포 시 참고

기존 운영 환경에 마감 이월 데이터가 이미 있으면, 첫 호출 시 `getLatestClosingCutoff()`가
통합 시트를 스캔해 기준일을 자동 수립하고 ScriptProperties에 캐시한다. 마이그레이션은 필요 없다.
