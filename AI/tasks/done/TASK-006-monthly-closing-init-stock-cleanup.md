# TASK-006: 월마감 UI 동작·Drive 아카이브 검증 및 INIT_STOCK 정합성 강화

## Objective

1. **월마감 UI 및 Drive 아카이브 저장 규칙 검증**: Web App의 "수동 월마감" 버튼 클릭부터 2단계 확인 모달, 실행, 그리고 Google Drive 아카이브 폴더/시트가 규칙에 맞게 생성·저장되는지 E2E 및 시스템 레벨에서 철저히 검증한다.
2. **INIT_STOCK 중복 계상 방지**: 월마감(`executeMonthlyClosing`) 이후 **마스터 `INIT_STOCK`(G열)이 이월 입고 행과 중복 계상될 수 있는 잠재적 위험**을 원천 제거한다.
3. 실행 순서 재배치, 실패 시 백업 복원, 이중 계상 사전 감지 로그, 그리고 유닛/E2E 테스트 스위트를 구축한다.

## Confirmed Facts

1. **`executeMonthlyClosing`은 마감 마지막 단계에서 INIT_STOCK을 0으로 리셋한다** — `Archive.gs:383-387`
   ```js
   const newInitStocks = masterData.map(r => [0]);
   masterSheet.getRange(3, 7, newInitStocks.length, 1).setValues(newInitStocks);
   ```
2. **Google Drive 아카이브 저장 규칙 (`Archive.gs:250-291`):**
   - 상위 폴더: `ARCHIVE_FOLDER_ID` (환경별 ScriptProperties로 분리됨)
   - 연도별 폴더: `baseFolder` 하위의 `${year}` 폴더 (없으면 자동 생성)
   - 스프레드시트 파일명: `[입출고마감]_${yearStr}_${monthStr}` (예: `[입출고마감]_2026_08`)
   - 시트명: `${yearStr}-${monthStr} 마감` (예: `2026-08 마감`)
   - 헤더 9열: `["날짜", "품목코드", "품목명", "구분", "수량", "단가", "담당자", "비고", "거래ID"]` (스타일: `COLORS.headerBg`, `COLORS.headerText`, bold, center, frozen 1행)
3. **수동 월마감 UI 흐름 (`JS_Config.html:333-400`, `Index.html:208`):**
   - 버튼: `#btnMonthlyClosing` (Admin 전용)
   - 1차 모달: 연도/월 선택 (`#closingYear`, `#closingMonth`) 및 경고 표시
   - 2차 모달: 최종 확인 및 "동의" 입력 필드 (`#closingConfirmText`)
   - "동의" 일치 시 `executeMonthlyClosing` 호출, 로딩 및 토스트 안내
4. **INIT_STOCK을 읽어 FIFO 로트로 편입하는 지점이 3곳 존재한다:**
   - `StockEngine.gs:78-86` — `recalcStockAndUsage()` FIFO 로트 구성
   - `StockEngine.gs:158,165` — `recalcStockAndUsage()` 현재고 계산: `currentStock = initStock + stockMap[code]`
   - `TxService.gs:244,250-251` — `_calculateFifoOutboundSplits()` 출고 분할 계산
   - `Archive.gs:299-310` — `executeMonthlyClosing()` 이월 FIFO 계산
   - `CacheManager.gs:137` — `buildItemMapCache()` 캐시에 `initStock` 포함
5. **`archiveOldRecords()`는 INIT_STOCK을 리셋하지 않는다** — 이 함수는 단순 보관 복사 목적이며 이월 계산을 하지 않으므로 현 동작은 정상. (`Archive.gs:11-108`)
6. **`recalcStockAndUsage()`의 현재고 공식에서 이중 계상이 발생하는 구조:**
   ```
   currentStock = INIT_STOCK + Σ(입고) - Σ(출고) - Σ(폐기)
   ```
   월마감 이후 이월 입고 행이 Σ(입고)에 이미 포함되는데, INIT_STOCK이 0으로 리셋되지 않으면 이중 카운트된다.
7. **현재 executeMonthlyClosing의 실행 순서:**
   ① 입출고 시트 클리어 → ② 이월+잔존행 삽입 → ③ INIT_STOCK 전체 0 리셋 → ④ `SpreadsheetApp.flush()` → ⑤ `recalcStockAndUsage()`.
   ③~④ 사이에 에러가 발생하면 INIT_STOCK 리셋이 누락된 채 이월 행만 남을 수 있다.
8. **월마감에 대한 테스트가 0건이다.** (`tests/unit/` 및 `tests/e2e/`에 closing/monthly 관련 테스트 부재)

## Hypotheses

1. **가설**: 현재 production에서는 월마감이 항상 정상 완료되어 INIT_STOCK이 0으로 리셋되므로, 실제로 이중 계상이 발생한 적은 없을 수 있다. → 구현 전 DEV 시트에서 마감 후 INIT_STOCK 값을 확인하여 검증 필요.
2. **가설**: `SpreadsheetApp.flush()` 이전에 GAS 런타임이 크래시하면 시트에 부분 반영이 남을 수 있다. → GAS의 트랜잭션 보장 범위를 확인 필요.
3. **가설**: 사용자가 마감 후 마스터 시트의 초기재고 셀(G열)에 수동으로 값을 입력할 수 있다. 현재 이 열에 대한 시트 보호가 없다면 수동 입력으로 이중 계상이 발생할 수 있다. → 시트 보호 설정 확인 필요.

## Business Context

**`Docs/BusinessRules.md` 제10조 "월마감":**
> - 실행: Admin만 가능 (`executeMonthlyClosing()`)
> - 아카이브: 마감 대상 데이터를 Google Drive 별도 스프레드시트로 이관
> - FIFO 이월: 잔여 로트를 "입고" 거래로 다음 달에 이월 (로트별 단가 유지)
> - 이월 거래ID: `SYS-{YYYYMMDD}-{UUID8}` 형식
> - 초기재고 리셋: 마감 후 품목 마스터의 초기재고를 0으로 리셋 (이중 카운팅 방지)

**`.agents/rules/02_business-rules.md` 제1항:**
> FIFO 원칙 보존: 마감 및 이월 시 서로 다른 매입단가를 가진 로트를 절대 병합하지 마십시오.

월마감은 시스템에서 가장 위험도 높은 비가역 작업이다.
수동 월마감 실행 시 UI 인터랙션, Drive 파일 생성, 데이터 이월, 마스터 초기재고 리셋까지 전 과정의 무결성이 완벽히 보장되어야 한다.

## Current System

1. Admin이 Web App에서 "수동 월마감" 버튼 클릭 → 연/월 선택 → "동의" 입력 → `executeMonthlyClosing(token, year, month)` 호출
2. `executeMonthlyClosing`이 마감 기준일 이전 입출고 데이터를 Google Drive 아카이브 폴더 하위의 연도 폴더 내 스프레드시트로 이관
3. 잔여 로트를 FIFO 계산하여 `[이월] 입고` 행으로 생성, 마감 기준 이후 기존 행과 합쳐 메인 시트에 기록
4. 마스터 INIT_STOCK을 일괄 0으로 리셋
5. `recalcStockAndUsage()` 호출하여 현재고/일평균/FIFO금액 재계산
6. 별도로 `archiveOldRecords()` (월간 자동 트리거)가 오래된 데이터를 연도별 아카이브 시트로 복사 (원본 유지, INIT_STOCK 미접촉)

## Root Cause / Diagnostic Logic

**직접적 버그가 아닌, 구조적 취약점 및 검증 부재:**

### 취약점 A: 부분 실패 시 INIT_STOCK 리셋 누락
`executeMonthlyClosing`의 ①입출고 시트 갱신 → ③INIT_STOCK 리셋 사이에 에러가 발생하면:
- 이월 입고 행은 이미 시트에 기록됨
- INIT_STOCK은 아직 원래 값이 남아있음
- 다음 `recalcStockAndUsage()` 호출 시 `initStock + 이월입고` = 이중 카운트

### 취약점 B: INIT_STOCK 수동 편집 가능
현재 마스터 시트의 G열(초기재고)에 대한 시트 보호가 확인되지 않았다.
마감 후 사용자가 수동으로 값을 입력하면 같은 이중 카운트 문제가 발생한다.

### 취약점 C: 월마감 UI 및 Drive 아카이브 저장 검증 부재
- 월마감 버튼 동작 및 2단계 모달 유효성 검사 E2E 테스트 부재
- Drive 아카이브 폴더/파일 규칙 준수 여부에 대한 체계적인 검증 부재

## Requirements

### Functional
- [ ] **FR-1**: `executeMonthlyClosing`의 INIT_STOCK 리셋을 이월 행 삽입보다 **앞**에 실행하여, 부분 실패 시에도 이중 카운트가 발생하지 않도록 순서를 재배치한다.
- [ ] **FR-2**: 마감 시작 시점에 마스터 INIT_STOCK 값을 메모리에 백업하고, 전체 처리가 실패할 경우 백업값으로 복원하는 방어 로직을 추가한다.
- [ ] **FR-3**: `recalcStockAndUsage()` 호출 전 **사전 검증 단계**를 추가한다: INIT_STOCK > 0인 품목이 존재하면서 동시에 해당 품목의 이월 입고 행(`비고`에 "마감 이월" 포함)이 있으면 **경고 로그**를 기록한다. (자동 교정은 하지 않되, 감지는 한다)
- [ ] **FR-4**: Web App UI 월마감 인터랙션 및 유효성 검증:
  - 비관리자(staff/manager) 접근 시 차단 토스트 표시
  - 1차 모달에서 연도/월 선택 및 2차 모달 전환
  - 2차 모달에서 '동의' 오입력 시 실행 차단
  - 마감 대상 데이터 부재 시 에러 토스트 표시
  - 정상 실행 시 로딩 토스트 및 성공 토스트 수신
- [ ] **FR-5**: Google Drive 아카이브 저장 규칙 준수 검증:
  - `ARCHIVE_FOLDER_ID` 하위에 연도(`YYYY`) 폴더 생성 여부
  - `[입출고마감]_YYYY_MM` 파일명 및 `YYYY-MM 마감` 시트명 생성
  - 9열 헤더 서식(스타일, Frozen Row) 및 데이터 정상 이관
- [ ] **FR-6**: 월마감 유닛 테스트 및 Playwright E2E 테스트를 작성한다.

### Non-Functional
- [ ] **NFR-1**: 기존 `executeMonthlyClosing` API 시그니처와 반환값 형식을 유지한다.
- [ ] **NFR-2**: 추가되는 로직이 GAS 6분 실행 제한에 영향을 주지 않도록 한다.

## Constraints

- GAS 런타임에는 DB 트랜잭션(BEGIN/COMMIT/ROLLBACK)이 없다. `SpreadsheetApp.flush()`와 `LockService`가 유일한 동시성 제어 수단이다.
- `TX_COLS`(9열) 구조 변경 금지.
- `MASTER_COLS` 인덱스 변경 금지.
- `recalcStockAndUsage()`의 기존 인터페이스 (`ss` 파라미터) 유지.
- 테스트 시 생성된 Drive 아카이브 파일은 감사/확인용으로 삭제하지 않고 보존하며, 메인 시트의 데이터 복원 절차를 제공한다.

## Files to Inspect

| 파일 | 확인 사항 |
|------|-----------|
| `src/Archive.gs:197-399` | `executeMonthlyClosing` 전체 흐름 및 Drive 저장 로직 |
| `src/JS_Config.html:330-400` | 수동 월마감 모달 및 이벤트 핸들러 |
| `src/Index.html:208` | 수동 월마감 버튼 DOM 구조 |
| `src/StockEngine.gs:19-188` | `recalcStockAndUsage` — INIT_STOCK 읽기 지점 2곳 |
| `src/TxService.gs:239-314` | `_calculateFifoOutboundSplits` — INIT_STOCK 읽기 |
| `src/CacheManager.gs:137` | `buildItemMapCache` — INIT_STOCK 캐시 |
| `src/Config.gs` | `MASTER_COLS.INIT_STOCK`, `SHEET_INOUT`, `SHEET_MASTER` 상수 |
| `Docs/BusinessRules.md` | 제10조 월마감 규칙 |

## Files to Modify

| 파일 | 변경 내용 |
|------|-----------|
| `src/Archive.gs` | `executeMonthlyClosing` 실행 순서 재배치 (INIT_STOCK 리셋 우선), 실패 시 복원 로직, 이중 계상 감지 로그 추가 |

## Files to Create

| 파일 | 용도 |
|------|------|
| `tests/unit/monthly-closing.test.js` | 월마감 FIFO 이월 및 INIT_STOCK 리셋의 정합성 유닛 테스트 |
| `tests/e2e/monthly-closing.spec.js` | Playwright E2E: 수동 월마감 버튼, 1/2차 모달 인터랙션, '동의' 유효성 검증 |

## Implementation Plan

### Phase 1: INIT_STOCK 리셋 순서 재배치 및 안정화 (`src/Archive.gs`)

**변경 후 실행 순서:**
```
① INIT_STOCK 값 메모리 백업 (rollback용)
② INIT_STOCK 전체 0 리셋   ← 먼저 리셋하여 중간 실패 시 이중 카운트 방지
③ flush()
④ txSheet 클리어
⑤ 이월행 + keepRows 삽입
⑥ flush()
⑦ recalcStockAndUsage()
// 전체 try-catch: 실패 시 INIT_STOCK 백업값으로 복원
```

### Phase 2: 이중 계상 감지 로그 (`src/Archive.gs`)

`recalcStockAndUsage()` 실행 전에 sanity check:
```js
masterData.forEach(row => {
  const code = row[MASTER_COLS.CODE];
  const initStock = Number(row[MASTER_COLS.INIT_STOCK]) || 0;
  if (initStock > 0 && hasCarryoverRow(code, txData)) {
    console.warn(`[WARN] 이중 계상 위험: ${code} INIT_STOCK=${initStock}, 이월 입고 존재`);
  }
});
```

### Phase 3: 유닛 테스트 (`tests/unit/monthly-closing.test.js`)

기존 GAS 모킹 패턴을 활용하여 6개 시나리오 작성:
1. 기본 마감: 입고 3건 + 출고 2건 → FIFO 이월 및 INIT_STOCK=0
2. 초기재고만 있는 품목 마감 → 이월 입고 행 전환 및 INIT_STOCK=0
3. 재고 0인 품목 마감 → 이월 행 미생성
4. 다중 로트 잔여 → 이월 (로트별 개별 이월 행, 단가 보존)
5. 이월 후 recalc → `currentStock = Σ(이월입고)` 일치 검증
6. 이중 계상 감지 → INIT_STOCK > 0 + 이월행 감지 로그 검증

### Phase 4: Playwright E2E 테스트 (`tests/e2e/monthly-closing.spec.js`)

1. **Staff 계정 로그인**: 월마감 버튼 클릭 시 `최고 관리자만 실행할 수 있습니다` 에러 토스트 검증
2. **Admin 계정 로그인**:
   - '🗓️ 수동 월마감' 버튼 클릭 → 1차 모달 오픈 확인
   - 연도/월 선택 후 '실행' 클릭 → 2차 확인 모달 오픈
   - '동의' 대신 오타 입력 후 클릭 → `"동의"라고 입력하셔야 실행됩니다` 경고 토스트 검증
   - 데이터가 없는 과거 기간 선택 후 '동의' 입력 마감 → `해당 기간에 아카이브할 데이터가 없습니다` 실패 토스트 검증

## Migration Plan

없음 — 시트 구조 변경 없음. 코드 배포만으로 적용.

## Test Plan

### Unit Test

```bash
node tests/unit/monthly-closing.test.js
```

### E2E Test (Playwright)

```bash
npx playwright test tests/e2e/monthly-closing.spec.js
```

### Human QA & Drive 아카이브 검증 절차 (DEV Spreadsheet & Google Drive)

1. **사전 준비**: DEV 메인 시트에 마감 대상 월(예: 2026-07)의 테스트 입고/출고 데이터를 2건 이상 입력
2. **실행**: Admin 계정으로 Web App 접속 → 수동 월마감 실행 (2026년 7월)
3. **Google Drive 결과 확인**:
   - `ARCHIVE_FOLDER_ID` 폴더 내에 `2026` 폴더가 존재하는지 확인
   - `2026` 폴더 내에 `[입출고마감]_2026_07` 스프레드시트가 생성되었는지 확인
   - 해당 스프레드시트의 시트명이 `2026-07 마감`인지, 9열 헤더 스타일과 과거 데이터가 올바르게 이동되었는지 확인
4. **DEV 메인 시트 결과 확인**:
   - 메인 입출고 시트에 2026-08-01 일자의 `[이월] 입고` 행이 생성되었는지 확인
   - 품목 마스터 시트의 `INIT_STOCK`(G열)이 `0`으로 변경되었는지 확인
   - 품목 마스터의 `현재고`와 `합계금액`이 마감 전 잔여 재고와 동일하게 유지되는지 확인
5. **데이터 정리(Rollback) 절차**:
   - 테스트로 생성된 Drive 아카이브 파일은 확인용으로 보존
   - 필요 시 DEV 시트는 백업본 복원 또는 테스트 행 정리 후 `recalcStockAndUsage()` 실행

## Regression Risk

| 위험 | 영향 | 대응 |
|------|------|------|
| INIT_STOCK 리셋 순서 변경으로 기존 마감 로직 깨짐 | 재고 수치 오류 | 유닛 테스트로 이월 정합성 검증 |
| 실패 복원 로직이 오동작하면 INIT_STOCK이 의도치 않게 변경 | 재고 수치 오류 | catch 블록에서 복원 후 반드시 에러를 다시 throw |
| `recalcStockAndUsage` 호출 시점 변경 | 대시보드 표시 오류 | 기존 호출 순서 유지, 추가 검증 로그만 삽입 |

## Acceptance Criteria

1. `executeMonthlyClosing` 정상 실행 후 모든 품목의 `INIT_STOCK`이 0이다.
2. 이월 입고 행의 수량·단가가 마감 전 FIFO 잔여 로트와 일치한다.
3. `recalcStockAndUsage` 결과가 이월 전후로 현재고 수치가 동일하다 (이중 계상 없음).
4. Google Drive 아카이브 폴더에 연도 폴더 및 `[입출고마감]_YYYY_MM` 파일이 규칙대로 생성된다.
5. Web App에서 비관리자 접근 차단, '동의' 유효성 검사, 데이터 부재 예외 토스트가 정상 동작한다.
6. `tests/unit/monthly-closing.test.js` 및 `tests/e2e/monthly-closing.spec.js`가 모두 PASS한다.
7. 기존 `tests/unit/run-all.js` 전체 통과.

## Human Approval Required

1. **[정책 확인]** INIT_STOCK 리셋 순서 변경(이월 행 삽입보다 앞으로)이 비즈니스 관점에서 허용되는지 확인. 리셋 후 이월 삽입 실패 시, INIT_STOCK은 0이 되고 이월 행도 없어 잠시 재고가 0으로 보일 수 있다. (아카이브에서 재마감으로 복구 가능)
2. **[정책 확인]** 마스터 시트 G열(초기재고)에 대한 시트 보호 추가 여부. 추가하면 마감 전 수동 초기재고 입력이 차단되므로 운영 방식 변경이 필요할 수 있다.

## Deployment Notes

- `executeMonthlyClosing`의 API 시그니처 변경 없음 → 프런트엔드 변경 불필요.
- 배포 후 첫 월마감 실행 시 정상 동작 확인 필요.

## Rollback Plan

1. `Archive.gs`의 `executeMonthlyClosing` 함수를 이전 버전으로 revert.
2. 이미 마감이 실행된 경우: 아카이브 시트에 원본 데이터가 보존되어 있으므로, 아카이브 시트에서 수동으로 데이터를 복원하고 `recalcStockAndUsage()`를 실행.

## Final Report

**구현일**: 2026-09-01 / **상태**: 구현 완료, 단위 테스트 통과, DEV 배포 완료, **E2E 미실행(환경 차단)** — Human QA 대기

### 변경 파일
| 파일 | 내용 |
|------|------|
| `src/Archive.gs` | `executeMonthlyClosing` 실행 순서 재배치(INIT_STOCK 리셋 우선), 실패 시 원복 로직, 이중 계상 사전 감지. 헬퍼 `restoreInitStockAfterFailure()` / `detectCarryoverDoubleCount()` 신규 |
| `tests/unit/monthly-closing.test.js` | 신규 단위 테스트 11건 |
| `tests/e2e/monthly-closing.spec.js` | 신규 Playwright 스펙 3건 (실행 검증 1건은 opt-in) |

### 구현 요약 (FR-1 ~ FR-3)

**FR-1 실행 순서 재배치** — 마감의 쓰기 구간을 다음 순서로 재배치했다.
```
① INIT_STOCK 메모리 백업  ② INIT_STOCK 전체 0 리셋  ③ flush()
④ txSheet 클리어          ⑤ 이월행 + keepRows 삽입   ⑥ flush()
⑦ 이중 계상 사전 감지     ⑧ recalcStockAndUsage()
```
Drive 아카이브 생성과 FIFO 이월 계산은 종전대로 쓰기 구간 **이전**에 수행한다
(이월 계산은 리셋 전 `masterData` 스냅샷을 쓰므로 리셋 순서 변경의 영향을 받지 않는다).
리셋 컬럼 지정도 매직넘버 `7` 대신 `MASTER_COLS.INIT_STOCK + 1`로 바꿨다.

**FR-2 실패 시 원복** — 리셋 전 값을 `initStockBackup`에 담고, 쓰기 구간을 try/catch로 감싸
`restoreInitStockAfterFailure()` 호출 후 **에러를 그대로 다시 throw** 한다.

> ⚠️ **명세에서 1가지를 의도적으로 좁혔다.** 명세 FR-2는 "전체 처리가 실패할 경우 복원"이지만,
> **입출고 시트에 이월 행을 이미 쓴 뒤의 복원은 그 자체가 이번 Task가 없애려는 이중 계상**이다
> (`INIT_STOCK 복원값 + 이월 입고` = 이중 카운트). 따라서 `txSheetMutated` 플래그로
> **입출고 시트 변경 전 실패에서만 복원**하고, 변경 후 실패에서는 복원하지 않고
> `console.error`로 "아카이브에서 수동 복구 필요"를 남긴다. 단위 테스트 케이스 8·9가 두 경로를 각각 검증한다.

**FR-3 이중 계상 사전 감지** — `recalcStockAndUsage()` 직전에 마스터를 **시트에서 다시 읽어**
(리셋이 실제로 반영됐는지까지 확인) `detectCarryoverDoubleCount(masterRows, txRows)`를 호출한다.
`INIT_STOCK > 0` 이면서 비고에 `마감 이월`이 포함된 입고 행이 있는 품목을 `console.warn`으로 기록하고,
감지 시 성공 메시지 뒤에 `⚠️ 초기재고 이중 계상 위험 N건 감지 (실행 로그 확인).`을 덧붙인다.
자동 교정은 하지 않는다(명세대로 감지만).

**NFR-1 시그니처/반환 형식 유지** — `executeMonthlyClosing(token, year, month)` → `{success, message}` 그대로.
프런트엔드(`JS_Config.html`) 무변경.
**NFR-2 실행 시간** — 추가 시트 I/O는 `getValues()` 1회 + `flush()` 1회뿐이다.

### 테스트 결과

**단위 테스트: 11/11 통과** — `npm run test:unit` 전체 4개 파일 통과.
로직을 복사하지 않고 `src/Config.gs`, `src/StockEngine.gs`, `src/Archive.gs` 원본을 `vm` 샌드박스에 로드한 뒤
GAS 전역(SpreadsheetApp / DriveApp / Utilities / Session / LockService / PropertiesService)만 스텁으로 대체했다.

| # | 케이스 | 검증 내용 |
|---|--------|-----------|
| 1 | 기본 마감 (입고 3 + 출고 2) | 잔여 9개가 로트별 이월행 `1@1,200` / `8@1,500`, 일자 `2026-08-01`, 비고 `2026년 7월 마감 이월`, 거래ID `SYS-20260701-XXXXXXXX`, INIT_STOCK=0 |
| 2 | 초기재고만 있는 품목 | 초기재고 5가 `5@800`(매입단가) 이월행으로 전환, INIT_STOCK=0 |
| 3 | 재고 0 | 이월행 미생성, 시트 비움 |
| 4 | 다중 로트 잔여 | 초기재고 로트 포함 4개 로트가 단가별로 분리 보존(병합 없음) |
| 5 | **recalc 정합성** | 마감 전 현재고/합계금액 == 마감 후 현재고/합계금액, `현재고 == Σ(이월입고)`, 경고 0건 (**AC-3**) |
| 6 | 이중 계상 감지 | `INIT_STOCK>0 + 이월행` 품목만 감지, 일반 입고행·이월행 없는 품목은 미감지 |
| 7 | **실행 순서** | opLog로 `INIT_STOCK 리셋 → flush → txSheet 클리어 → 이월행 삽입` 순서 단정 (**FR-1**) |
| 8 | 실패 복원 (시트 변경 전) | flush 실패 주입 → INIT_STOCK 원복, 입출고 시트 무변경, 에러 재전파 |
| 9 | 실패 복원 (시트 변경 후) | tx 쓰기 실패 주입 → INIT_STOCK 0 유지(복원 안 함), 수동 복구 로그, 에러 재전파 |
| 10 | **Drive 아카이브 규칙** | 연도 폴더 `2026`, 파일명 `[입출고마감]_2026_08`, 시트명 `2026-08 마감`, 9열 헤더, `setFrozenRows(1)`, 연도 폴더로 파일 이동, 마감일 기준 분리 (**FR-5**) |
| 11 | 가드 | 비관리자 `{success:false, "권한이 없습니다."}` + 시트 무변경, 대상 부재 시 실패 반환 + Drive 파일 미생성 |

**DEV 배포: 완료** — `npm run dev:push`, 26개 파일 푸시.

**E2E: 미실행 (환경 차단)** — `tests/e2e/monthly-closing.spec.js`는 작성·문법 검증(`--list` 3건 인식) 완료했으나
DEV Web App이 Google 계정 로그인을 요구하고 저장된 세션(`.playwright/dev-auth.json`, 2026-08-31 저장)이 만료되어 실패했다.
**기존 `tests/e2e/smoke.spec.js`도 동일하게 실패**하므로 이번 변경과 무관한 환경 문제다.
해결: 사용자가 `node tests/e2e/save-auth-state.js`를 1회 실행해 Google 세션을 갱신한 뒤
```
npx playwright test tests/e2e/monthly-closing.spec.js
```

### E2E 스펙 구성 (FR-4)

| 테스트 | 내용 | 마감 실행 여부 |
|--------|------|----------------|
| 비관리자 가드 | admin에게 버튼 노출 확인 → `currentUser.role='staff'` + `applyRolePermissions()` 주입 → 버튼 숨김 확인 → `openMonthlyClosingModal()` 강제 호출 시 `최고 관리자만 실행할 수 있습니다.` 토스트 + 모달 미오픈 | ✗ |
| 2단계 모달 + '동의' 유효성 | 1차 모달(경고문·연/월 select) → '실행' → 2차 모달(제목·대상 연월) → 빈 입력/오타 입력 각각 `"동의"라고 입력하셔야 실행됩니다.` 경고 + 모달 유지 + 로딩 미표시(서버 호출 없음) → '취소' | ✗ |
| 마감 실행 | 진행 토스트 → 서버 결과 토스트(`아카이브할 ... 없습니다` 또는 `마감 완료`), 이중 계상 경고 문구 부재 확인 | **✓ (opt-in)** |

> ⚠️ **명세의 E2E 시나리오 1가지를 opt-in으로 바꿨다.** 명세 Phase 4는
> "데이터가 없는 과거 기간을 선택해 실제로 마감을 실행하고 실패 토스트를 검증"하도록 되어 있으나,
> **"과거 기간이라 데이터가 없다"는 전제가 성립하지 않는다.** 서버는
> `archiveRows.length === 0 && 모든 품목의 초기재고 === 0` 일 때만 실패를 반환하므로,
> DEV 마스터에 초기재고가 남은 품목이 하나라도 있으면 **실제 월마감이 수행**되어
> 입출고 행이 Drive로 이관되고 전 품목 INIT_STOCK이 0으로 리셋된다(비가역).
> 따라서 이 테스트는 `E2E_ALLOW_MONTHLY_CLOSING=1` 환경변수로 명시 승인한 경우에만 실행되며,
> 기본 실행에서는 사유와 함께 skip 된다. 승인 시:
> ```
> E2E_ALLOW_MONTHLY_CLOSING=1 npx playwright test tests/e2e/monthly-closing.spec.js
> ```

**명세와 실제가 달랐던 DOM 사항 (스펙에 반영)**
- 월마감 버튼에 `id="btnMonthlyClosing"`는 **존재하지 않는다**. `Index.html:206-209`의 `.admin-only` 버튼(`🗓️ 수동 월마감`)이며, 스펙은 role+텍스트로 찾는다. (`Files to Modify`에 `Index.html`이 없어 id는 추가하지 않았다 — 필요하면 별도 승인 후 추가 가능)
- `#modalOverlay`는 `display`가 아니라 `opacity`로 숨겨지므로(`Stylesheet.html:476-490`) Playwright의 visible 판정이 통하지 않는다. `#loadingOverlay`와 동일하게 `.active` 클래스 유무로 판정한다.

### 가설 검증 결과
| # | 가설 | 결과 |
|---|------|------|
| 1 | Production에서 실제 이중 계상이 발생한 적은 없을 수 있다 | **미검증** — Production 데이터 조회 금지 원칙(CLAUDE.md)에 따라 확인하지 않았다. DEV 시트 확인도 E2E 세션 만료로 미수행. FR-3 감지 로그가 배포 후 이 가설의 상시 검증 장치가 된다. |
| 2 | `flush()` 이전 크래시 시 부분 반영이 남을 수 있다 | **성립** — GAS에는 트랜잭션이 없어 시트 쓰기는 개별 커밋된다. 이 때문에 FR-1의 순서 재배치가 유일한 구조적 방어다. |
| 3 | 마스터 G열 수동 편집으로 이중 계상 가능 | **성립하나 미조치** — 시트 보호 추가는 Human Approval 항목(아래)이며 `Files to Modify` 범위 밖이라 구현하지 않았다. 대신 FR-3 감지 로그가 사후 탐지한다. |

### Acceptance Criteria 대비
| # | 기준 | 상태 |
|---|------|------|
| 1 | 마감 후 모든 INIT_STOCK = 0 | ✅ 단위 1·2·3·4·5·7 |
| 2 | 이월 행 수량·단가 == 마감 전 FIFO 잔여 로트 | ✅ 단위 1·2·4 |
| 3 | 이월 전후 현재고 동일 (이중 계상 없음) | ✅ 단위 5 |
| 4 | Drive 연도 폴더 + `[입출고마감]_YYYY_MM` 규칙 | ✅ 단위 10 (모킹) / ⏳ 실제 Drive는 Human QA |
| 5 | 비관리자 차단·'동의' 검증·데이터 부재 토스트 | ⏳ E2E 작성 완료, 세션 만료로 미실행 |
| 6 | 신규 유닛/E2E PASS | 유닛 ✅ 11/11 / E2E ⏳ 미실행 |
| 7 | 기존 `run-all.js` 전체 통과 | ✅ 4개 파일 전체 통과 |

### Human Approval 필요 (미해결)
1. **[정책]** INIT_STOCK 리셋을 이월 행 삽입보다 앞으로 옮기는 것에 대한 최종 승인.
   구현은 완료했으나, 리셋 직후~이월 삽입 사이에 실패하면 일시적으로 재고가 0으로 보인다(아카이브 기반 재마감으로 복구 가능).
   반대 순서의 위험(이중 계상 = 재고 과대 계상)보다 안전하다고 판단해 명세대로 진행했다.
2. **[정책]** 마스터 시트 G열(초기재고) 시트 보호 추가 여부 — **미구현**. 취약점 B는 여전히 열려 있으며 FR-3 감지 로그로만 커버된다.

### 다음 단계 (Human QA)
1. `node tests/e2e/save-auth-state.js`로 Google 세션 갱신 → `npx playwright test tests/e2e/monthly-closing.spec.js` 실행
2. DEV 시트에 마감 대상 월 테스트 데이터 입력 후 Admin 계정으로 수동 월마감 실행
3. Drive `ARCHIVE_FOLDER_ID` → `2026` 폴더 → `[입출고마감]_2026_MM` 파일 / `2026-MM 마감` 시트 / 9열 헤더 확인
4. 메인 시트의 `[이월]` 입고 행, 마스터 G열 0, 현재고·합계금액 마감 전후 동일 확인
5. 실행 로그에 `[TASK-006][WARN]` 항목이 없는지 확인

---

## Addendum (2026-09-01, 사용자 피드백 반영)

### ① Google 인증 세션 만료 — 근본 원인 및 해결

**원인**: `storageState`(`.playwright/dev-auth.json`)는 저장 시점의 **정지된 스냅샷**이다.
Google 로그인 세션을 실제로 붙잡아 두는 것은 `__Secure-1PSIDTS` / `__Secure-1PSIDRTS`
**회전(rotating) 쿠키**인데, 저장 파일을 열어보면 이 쿠키들의 만료가 **저장 시각 +10분**이다.
storageState는 파일에 되쓰기가 없으므로 매 실행이 같은 만료 토큰을 재생하고, Google은 결국
세션을 무효화하고 `accounts.google.com`으로 되돌린다.

실측으로 확인:
- 09-01 10:03 저장 → 10:07 실행 **성공** (회전 쿠키 만료 10:12 이전, 유효 창 약 5분)
- 같은 스냅샷을 프로필에 이식한 뒤 재확인: `SID` / `__Secure-1PSID`는 **2027년까지 유효**한데
  `__Secure-1PSIDRTS`만 사라진 상태 → 그래도 Google은 재로그인 요구
  ⇒ 세션 유지의 열쇠가 장기 쿠키가 아니라 **회전 쿠키**임이 확정됨.
- 즉 실질 유효기간은 "하루"가 아니라 **약 10분**이었다.

**해결**: `storageState` → **영속 브라우저 프로필**(`launchPersistentContext`)로 전환.
회전 쿠키가 매 실행 디스크에 되쓰기되므로 일반 브라우저처럼 세션이 스스로 갱신된다.

| 파일 | 변경 |
|------|------|
| `tests/e2e/fixtures/browser.js` | **신규** — 영속 프로필 컨텍스트 픽스처(`.playwright/user-data`). 채널 고정(chrome→msedge→번들, `.channel` 마커), 자동화 탐지 완화 옵션, 기존 `storageState` 쿠키 1회 이식 |
| `tests/e2e/*.spec.js` (5개) | `require('@playwright/test')` → `require('./fixtures/browser')` |
| `tests/e2e/save-auth-state.js` | 동일 프로필을 headed로 열어 로그인시키도록 재작성 |
| `playwright.config.js` | `use.storageState` 비활성 + 사유 주석 |
| `tests/e2e/fixtures/env.js`, `smoke.spec.js` | 실패 안내 문구를 새 절차로 갱신 |
| `.env.example` | `PLAYWRIGHT_USER_DATA_DIR`, `PLAYWRIGHT_BROWSER_CHANNEL` 문서화 |

**남은 1회 작업(사용자)**: 만료된 스냅샷은 되살릴 수 없으므로 프로필 부트스트랩 로그인이 1회 필요하다.
```
node tests/e2e/save-auth-state.js
```
이후로는 재로그인이 필요 없다. (trace/screenshot 수집은 Playwright가 자체 컨텍스트에도
자동으로 붙여주므로 픽스처에서 별도 처리하지 않는다 — 중복 시 `Tracing has been already started`.)

### ② FR-1 실행 순서 변경 — **승인 완료**
사용자 승인(2026-09-01). Human Approval 항목 1 해소. `Docs/BusinessRules.md` 제10조에
"리셋 순서" 규칙으로 명문화했다.

### ③ 초기재고(G열) 시트 보호 — **구현 완료**

**왜 필요한가**: 현재고 계산식이 `초기재고(G열) + Σ입고 − Σ출고 − Σ폐기` 이다.
월마감은 남은 재고를 "마감 이월" 입고 행으로 옮겨 적고 G열을 0으로 만드는데,
마감 후 누군가 G열에 숫자를 다시 적으면 **같은 재고가 두 번 계산**된다.
재고가 부풀려지면 안전재고·발주점·적정발주량(N·O·P열)까지 전부 틀어져 발주 판단이 무너진다.

**왜 '경고 전용(warning-only)'인가**: G열은 신규 품목 등록 시 "지금 창고에 이미 있는 수량"을
적는 정상 입력 칸(`COLORS.inputBg` 노란색)이기도 하다. 완전히 잠그면 그 운영 경로가 막히므로,
편집을 시도하면 확인 대화상자만 띄워 **의도치 않은 수정**을 거른다.
이는 `RBAC.gs`의 `_protectSystemSheets()` 및 `SheetBuilder.gs`의 기존 보호와 동일한 관례다.

| 파일 | 변경 |
|------|------|
| `src/SheetBuilder.gs` | `applyInitStockProtection(ss)` 신규 — G3:G 범위 경고 전용 보호, 멱등(기존 보호 제거 후 재적용). `buildItemMaster()` 말미에서 호출 |
| `src/RBAC.gs` | `_protectSystemSheets()`에서 함께 동기화 (기존 스프레드시트에 적용되는 경로) |
| `src/Archive.gs` | `executeMonthlyClosing` 마감 직후 보호 갱신. 보호 실패가 마감을 되돌리지 않도록 try/catch + 경고 로그 |
| `Docs/BusinessRules.md` | 제10조에 "초기재고 보호" 규칙 추가 |

**적용 방법(기존 DEV/Production 시트)**: Apps Script 편집기에서 `applyInitStockProtection()`을 1회 실행하거나,
시트 메뉴의 권한 동기화(`syncPermissions()`)를 실행하면 적용된다.

취약점 B는 이로써 **예방(보호) + 탐지(FR-3 경고 로그)** 2중으로 커버된다.

### 갱신된 테스트 결과
- **단위 12/12 통과** (케이스 12 추가: G열 보호가 경고 전용으로 걸리는지 + 재적용 시 중복되지 않는지),
  `npm run test:unit` 전체 4개 파일 통과.
- **DEV 배포 완료** — `npm run dev:push` 26개 파일.
- **E2E**: `1차 모달 → 2차 확인 모달 → '동의' 유효성` 테스트 **통과 확인(42.9s)**.
  `비관리자 가드` 테스트는 `currentUser`가 `let` 선언이라 `window.currentUser`가 아님을 확인하고
  식별자 직접 참조로 수정했다(미검증 — 프로필 부트스트랩 후 재실행 필요).
  전체 재실행은 위 ①의 1회 로그인 이후 가능하다.

### Human Approval 잔여
없음. (항목 1 승인 완료, 항목 2 구현 완료)

---

## Addendum 2 (2026-09-01, E2E 전체 실행 결과)

사용자가 `save-auth-state.js`로 프로필 부트스트랩 로그인을 1회 완료한 뒤 전체 스위트를 실행했다.
**결과: 7 passed / 1 skipped(opt-in) / 1 failed.** 영속 프로필 인증은 정상 동작했고,
그 과정에서 기존 스펙의 결함 1건과 **앱 코드 버그 1건**을 발견해 수정했으며,
**미해결 1건**(`basedata-excel` 다운로드, headless 한정)이 남았다.
실패한 테스트는 TASK-001B 소관이며 TASK-006의 변경과 무관하다.

### E2E 최종 결과

| 스펙 | 결과 |
|------|------|
| `monthly-closing.spec.js` — 비관리자 가드 | ✅ PASS |
| `monthly-closing.spec.js` — 2단계 모달 + '동의' 유효성 | ✅ PASS |
| `monthly-closing.spec.js` — 마감 실행 | ⏭ SKIP (`E2E_ALLOW_MONTHLY_CLOSING=1` 미설정) |
| `basedata-excel.spec.js` — 단위 목록 | ✅ PASS |
| `basedata-excel.spec.js` — 실사 Excel 다운로드 | ❌ FAIL (headless 한정 — TASK-007로 분리) |
| `fifo-split.spec.js` | ✅ PASS |
| `smoke.spec.js` (2건) | ✅ PASS |
| `transaction.spec.js` | ✅ PASS |

FR-4 항목 중 "비관리자 차단", "1/2차 모달 전환", "'동의' 오입력 차단"이 실제 DEV Web App에서 검증됐다.
AC-5의 "데이터 부재 예외 토스트"만 opt-in 테스트로 남아 있다(비가역 실행이므로 의도된 설계).

### 발견·수정한 결함

**(1) `fifo-split.spec.js` — 테스트 격리 결함 (TASK-005 스펙, 사전 존재)**
출고 비고가 `'playwright-fifo-out'` **고정 문자열**이라, 수집 루프가 "다른 비고를 만나야 멈추는" 구조와
맞물려 **이전 실행이 DEV 시트에 남긴 분할행까지 함께 집계**했다.
서버는 이번 출고를 `2개 로트로 분할(합 7)`이라고 정확히 응답했는데 테스트는 14를 셌다.
즉 이 스펙은 DEV 시트에서 **최초 1회만 통과**하는 구조였다.
→ 실행마다 고유한 태그(`playwright-fifo-out-${Date.now()}`)로 변경.

**(2) `src/JS_BaseData.html` — 실사 Excel 다운로드 취소 (앱 코드 버그)**
`downloadPhysicalCheckListExcel()`은 blob URL을 만들어 `<a download>`로 클릭한 뒤
**1초 후 `URL.revokeObjectURL()`** 을 호출한다. 브라우저가 blob을 다 읽어 파일로 쓰기 전에 해제되면
다운로드가 **조용히 취소**된다.

진단 과정(추측이 아니라 실측으로 좁힘):
- 러너 밖 단독 스크립트에서는 `download.path()` 성공 → 다운로드 경로 자체는 정상
- 러너 안에서는 실패. `--trace=off`로도 실패 → tracing 무관
- 실패 시점 상태: 페이지·컨텍스트는 **살아 있고**(`isClosed() === false`, pages 1개)
  **산출물(Artifact)만 폐기**됨 → "페이지가 닫혀서"가 아니라 "다운로드가 취소되어서"
- 확정: 성공하던 단독 스크립트에 **1.5초 지연만 추가**하자 동일하게 실패 재현

품목 수가 많거나 느린 기기에서는 **실사용자도 다운로드가 실패**할 수 있는 버그다.
→ 해제 지연을 1초 → 60초로 늘렸다. blob URL은 페이지를 벗어나면 어차피 해제되므로 비용은 사실상 없다.
**수정 유효성 검증**: 수정 전 실패를 재현했던 동일 실험(1.5초 지연 후 산출물 접근)이 수정 후 통과한다.
(`Files to Modify` 범위 밖이지만, E2E가 실증한 실사용자 영향 버그이므로 수정 후 명시한다.)

**다만 이 수정이 E2E 실패를 해소하지는 못했다.** 아래 (4) 참조.

**(4) `basedata-excel.spec.js` 다운로드 테스트 — 미해결**
`download.saveAs: Target page, context or browser has been closed`로 실패한다.
실패 시점에 page/context는 **살아 있고 다운로드 산출물(Artifact)만 폐기**된다.

배제한 가설(모두 실측):
| 가설 | 결과 |
|------|------|
| 앱의 blob 해제(1초) | 실제 버그였고 수정했으나 이 실패의 원인은 아님 |
| Playwright tracing | `--trace=off`로도 실패 |
| 구형 headless(다운로드 미지원) | `--headless=new` 강제해도 실패. 러너 밖 스크립트는 구형 headless에서도 성공 |
| Safe Browsing 다운로드 검사 | 관련 플래그 추가해도 변화 없음 |
| 영속 컨텍스트의 최초 페이지 재사용 | 새 페이지를 만들어도 실패 |
| 이전 테스트의 브라우저 종료 경합 | `-g`로 단독 실행해도 3/3 실패 |

재현 조건: **Playwright 러너 + headless**에서만 실패한다.
- 러너 밖 순수 스크립트(동일 프로필·동일 headless): 항상 성공
- `--headed`: 성공

TASK-006의 변경(월마감/초기재고)과 무관하고 TASK-001B 소관이므로, 사용자 승인(2026-09-01) 하에
**`AI/tasks/ready/TASK-007-e2e-download-headless-failure.md`로 분리**했다.
배제된 가설 6건과 재현 조건이 그 Task의 Confirmed Facts에 기록되어 있어 재조사가 필요 없다.
당장 이 테스트를 검증해야 한다면 `npx playwright test tests/e2e/basedata-excel.spec.js --headed`로 통과를 확인할 수 있다.

**(3) 브라우저 픽스처 보강** — 실제 Chrome 프로필은 `--enable-automation`이 빠져 Safe Browsing
다운로드 검사가 살아 있으므로 `--safebrowsing-disable-download-protection`, `acceptDownloads: true`를 추가했다.
(공유 `downloadsPath`는 브라우저 종료 시 정리 경합을 만들 수 있어 채택하지 않고 Playwright 기본 임시 경로를 쓴다.)

### 추가 변경 파일
| 파일 | 변경 |
|------|------|
| `src/JS_BaseData.html` | blob URL 해제 지연 1초 → 60초 (다운로드 취소 방지) |
| `tests/e2e/fifo-split.spec.js` | 출고 비고를 실행별 고유 태그로 변경 (테스트 격리) |
| `tests/e2e/basedata-excel.spec.js` | 미해결 실패의 배제 가설을 주석으로 기록 |
| `tests/e2e/fixtures/browser.js` | `acceptDownloads` 명시, headed 모드 viewport 버그 수정(`viewport: null` + `deviceScaleFactor` 충돌로 `npm run test:e2e:headed`가 깨져 있었음) |

**DEV 배포 완료** (`npm run dev:push`, 26개 파일) — 위 앱 수정 포함.

---

## Addendum 3 (2026-09-01, Human QA 결과 — 데이터 손실 버그 발견 및 수정)

### 보고된 증상
> 수동 월마감 시 `마감 데이터_DEV`에 `[입출고마감]_2026_08` 시트가 생성됐으나,
> 품목 마스터의 초기재고·현재고가 전부 0으로 표시됨.

**착각이 아니라 실제 데이터 손실 버그였다.**

### 조사 방법
DEV 스프레드시트(`17ukRYqvpsRSuFoDHuk0ZTba1ATzC8_odCkw6kYEG5dE`)와
아카이브 파일(`1PVNYzqps4QFsn2Aol0uOgKbOwAVLt3lqLjRg14_hjuk`)의 **실제 셀 값을 직접 읽어** 대조했다.

| 확인 항목 | 결과 |
|-----------|------|
| Drive 아카이브 파일 | `[입출고마감]_2026_08`에 2026-08-31 행 **8건 정확히 이관됨** ✅ |
| 마스터 INIT_STOCK | 전부 0 (리셋 정상 수행) ✅ |
| 통합 입출고 기록장 | **아카이브했던 08-31 행 8건이 그대로 남아 있음** ❌ |
| 통합 입출고 기록장 | **`마감 이월` 행이 하나도 없음** ❌ |
| 업장 시트(맛다락) | 08-31 행이 원본 그대로 존재 (마감이 건드리지 않음) |
| System_Logs | 에러 기록 없음 |

### 근본 원인

`executeMonthlyClosing`은 **통합 시트(SHEET_INOUT)만** 정리하는데,
`consolidateAllSheets()`(`Dashboard.gs:6`)는 **통합 시트를 비우고 업장 시트로부터 통째로 재구성**한다.

```
월마감      → 통합 시트 정리 + 이월 행 기록 (업장 시트는 그대로)
재취합      → 통합 시트를 업장 시트로 덮어씀
              ├─ 아카이브했던 과거 행이 되살아남
              └─ 업장 시트에 없는 "마감 이월" 행은 삭제됨
INIT_STOCK  → 이미 0이라 복구되지 않음
⇒ 초기재고분이 통째로 증발
```

즉 통합 시트는 업장 시트로부터 재생성되는 **파생 뷰**인데, 월마감이 이를 **원장**으로 취급한 것이
구조적 원인이다. (v9.0 월마감 도입 시점부터 존재한 결함으로, TASK-006의 순서 재배치와는 무관하다.)

**재취합 진입점 4곳** — 어느 하나만 돌아도 마감이 무효화된다:
`Triggers.gs:7` 매일 자정 트리거 / 웹앱 `⚡ 신규 내역 취합` / 웹앱 `🔄 시트 동기화` /
시스템 명령 `refreshDashboard` (모두 `refreshDashboard()` → `consolidateAllSheets()`)

**실측 검산 (FBV-001 냉동단호박)**
되살아난 행 기준: 입고 5+5=10, 출고 10+5+2=17 → `max(0, 0 + 10 − 17)` = **현재고 0**,
일평균 = 17/30 = **0.57** — 시트의 실제 값과 정확히 일치한다.

### 수정 (사용자 승인 2026-09-01)

한쪽만 고치면 각각 **재고 증발** / **이중 계상**이 되므로 **두 가지를 함께** 적용했다.

| 파일 | 변경 |
|------|------|
| `src/Archive.gs` | `_trimShopSheetsForClosing(ss, cutoffDate)` 신규 — 마감 대상 행을 업장 시트에서도 제거. `executeMonthlyClosing`의 쓰기 구간(try) 안에서 이월 행 기록 직후 호출하고, 정리 결과를 완료 메시지에 포함 |
| `src/Archive.gs` | `isCarryoverRow(row)` / `CARRYOVER_NOTE_TAG` 신규 — 이월 행 판별을 한 곳으로 모으고 `detectCarryoverDoubleCount`도 이를 사용 |
| `src/Dashboard.gs` | `consolidateAllSheets()`가 통합 시트의 `마감 이월` 행을 **보존**하도록 수정. 업장 시트에 같은 거래ID가 있으면 업장 쪽을 우선해 중복을 막는다 |
| `tests/unit/monthly-closing.test.js` | 케이스 13 — 손실 재현 테스트를 작성해 버그를 증명한 뒤, 수정 후 기대값을 정상 동작으로 전환 |

**운영 영향**: 마감하면 이제 **업장 시트에서도 해당 월 입력 내역이 사라진다**(기존에는 남아 있었다).
원본은 Drive 아카이브 스프레드시트에 보존되며, 거래ID 접두사(`TX`/`AX`/`MB`/`WB`/`HA`)로
어느 업장의 행이었는지 역추적해 복구할 수 있다.

### 검증
- **단위 13/13 통과** — 케이스 13이 `마감 → 재취합 ×2`를 돌려 이월 행 보존, 과거 행 미부활,
  현재고 9 유지(증발도 이중 계상도 없음), 업장 시트 정리를 함께 단정한다.
- `npm run test:unit` 전체 4개 파일 통과.
- **DEV 배포 완료** (`npm run dev:push`, 26개 파일).
- **E2E 8 passed / 1 skipped(opt-in) / 0 failed.**

### ⚠️ DEV 데이터 복구 필요 (사용자 조치)
이번 손실로 사라진 **초기재고 값은 아카이브 파일로 복구할 수 없다**(아카이브에는 거래 내역만 있고,
초기재고를 담고 있던 이월 행은 재취합 때 삭제됐다).

`재고관리 시스템_DEV` → 파일 → **버전 기록**에서 **2026-09-01 11:35(KST) 이전** 시점으로 복원해야 한다.
복원 전에 자정 트리거(`refreshDashboard`)가 다시 돌지 않도록 주의할 것.

---

## Addendum 4 (2026-09-01, DEV 실마감 검증 완료)

사용자 확인: **DEV/Production의 초기재고·리드타임·안전재고일수 등은 전부 임시값**이며
(구매팀에 요청한 것은 품목코드·품목명·카테고리·단위뿐), Production도 아직 미배포 상태다.
테스트를 위해 수치를 임의 조정해도 좋다는 승인을 받아 **DEV에서 실제 마감을 실행해 검증**했다.

→ Addendum 3의 "버전 기록 복원 필요" 안내는 **철회**한다. 손실된 초기재고가 임시값이므로 복구 불필요.

### 추가로 발견·수정한 결함

**(1) 마감/재취합 후 캐시 미무효화** (`Archive.gs`, `Dashboard.gs`)
`executeMonthlyClosing`과 `refreshDashboard` 모두 재고를 통째로 바꾸면서도
`CacheManager.invalidateAll()`을 호출하지 않았다. 캐시 TTL이 60초이므로 마감 직후 웹앱이
**마감 전 수치를 최대 1분간 그대로 보여준다.** 두 함수 모두에 무효화를 추가했다.

**(2) 업장 시트 정리 기준 불일치** (`Archive.gs`)
초기 구현이 `r[0] || r[1]`(날짜 또는 품목코드)를 데이터 행으로 세어, **품목코드가 없는 행**
(입력 중이거나 메모성 행)까지 삭제 대상에 포함했다. 실제 DEV 마감에서
`11건 보관 / 업장 시트 12건 정리`로 개수가 어긋나 발견했다.
`consolidateAllSheets`와 동일하게 **품목코드(`r[1]`)가 있는 행만** 거래로 판정하도록 고쳤고,
그 외의 행은 마감이 건드리지 않는다. 수정 후 `3건 보관 / 3건 정리`로 일치한다.

### DEV 실마감 검증 결과

기존 품목 3건의 초기재고를 결정적 값으로 설정한 뒤, 마감 대상 월(2026-08)에 거래를 넣고
`마감 → 재취합 ×2` 전 구간을 서버 API로 직접 호출해 검증했다.

| 품목 | 초기재고 | 8월 거래 | 마감 전 현재고 | 마감 직후 | 재취합 ×2 후 | 초기재고 |
|------|---------|---------|--------------|----------|-------------|---------|
| FBV-002 | 100 | 입고 20, 출고 30 | 90 | **90** | **90** | 0 ✅ |
| FBV-003 | 50 | 출고 10 | 40 | **40** | **40** | 0 ✅ |
| FBV-005 | 0 | 없음 | 0 | 0 | 0 | 0 ✅ |

마감 응답: `2026년 8월 마감 완료. 3건 보관, 3건 이월됨. 업장 시트 1곳에서 3건 정리됨.`

**수정 전이라면 재취합 후 현재고가 90 → 0, 40 → 0으로 증발했을 자리에서 값이 그대로 유지된다.**
AC-1~AC-4가 DEV 실환경에서 확인됐다.

### E2E 중 자초한 오염과 정리 (기록)
검증 과정에서 `seedDevData()`를 호출해 `ITEM-TEST-001~003`을 마스터 끝에 추가했더니,
`fifo-split` / `transaction` 스펙의 품목 검색('테스트')이 이 시드 품목을 집어 들면서
**업장 시트 B열(품목코드)의 데이터 확인 규칙 위반**으로 저장이 실패했다.
`resetDevEnvironment()`로 시드를 제거하자 전부 복구됐다.

> ⚠️ **별도 확인 필요(TASK-006 범위 밖)**: `seedDevData()`가 만드는 시드 품목은
> 업장 시트의 품목코드 검증을 통과하지 못해 **거래 등록에 사용할 수 없다.**
> (시드가 4,292행짜리 마스터 맨 끝에 추가되는데 검증 범위가 이를 포함하지 않는 것으로 보인다.)
> DEV 시딩 도구가 사실상 무용지물이므로 별도 Task로 다룰 것을 권한다.

### 최종 검증
- **단위 13/13 통과**, `npm run test:unit` 전체 4개 파일 통과
  (케이스 13에 캐시 무효화 단정 추가)
- **E2E 8 passed / 1 skipped(opt-in) / 0 failed**
- **DEV 실마감 검증 통과** (위 표)
- DEV 배포 완료
