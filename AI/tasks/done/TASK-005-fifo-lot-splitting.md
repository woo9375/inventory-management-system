# TASK-005: FIFO 출고 시 다중 입고 로트 분할 저장(Parent-Child) 구현

## Objective
출고 또는 폐기 등록 시 단일 출고 요청 수량이 복수의 이전 입고 로트(단가가 상이한 로트)에 걸치는 경우, 선입선출(FIFO) 원칙에 따라 각 로트별 수량과 매입단가 스냅샷을 적용한 분할 로그(Parent-Child TxID 접미사 `-01`, `-02`...)로 자동 분할 저장하여 원가 정합성과 이력 추적성을 확보한다.

---

## Confirmed Facts
- `src/TxService.gs:86-174`의 `addTransaction()`은 출고/폐기 시 품목 마스터의 현재 매입단가(`itemInfoMap[code].price`)를 일괄 스냅샷으로 하여 단 1개의 행만 기록하고 있음.
- `src/StockEngine.gs:74-151`의 `recalcStockAndUsage()`는 입출고 로그 전체를 읽어 메모리 상에서 입고 로트(`lotsMap`)와 출고 이벤트(`outEventsMap`)를 정렬 및 FIFO 매칭하여 재고 합계금액(`TOTAL_VALUE`)을 산출하고 있음.
- `src/Archive.gs:294-367`의 `executeMonthlyClosing()` 역시 FIFO 로직을 통해 잔여 로트를 계산하고 이월 입고 건(`SYS-YYYYMM01-UUID8`)을 생성하고 있음.
- `src/Config.gs:137`에 따라 입출고 시트는 9열 구조(`[날짜|품목코드|품목명|구분|수량|단가(스냅샷)|담당자|비고|거래ID]`, `TX_COLS = 9`)로 고정되어 있음.
- `src/Config.gs:122`의 `VALID_TRANSACTION_TYPES = ["입고", "출고", "폐기"]`임.
- `Docs/BusinessRules.md:86-95`에 로트별 출고 차감은 FIFO 방식이며, 각 입고 건이 하나의 로트(날짜 + 수량 + 단가)로 규정되어 있음.

---

## Hypotheses
- 대상 업장 시트(및 품목 마스터의 초기재고)에서 해당 품목의 과거 입출고 내역을 조회하여 현재 시점의 미소진 잔여 로트(Unconsumed Lots) 목록을 시간순으로 도출하는 계산 모듈을 `TxService.gs`에 구현할 수 있다.
- 출고 요청 수량 $Q$를 미소진 로트 순서대로 소진하여 분할 레코드 배열(`splits`)을 생성하고, 1회의 `setValues()` 배치 삽입으로 원자적으로 기록할 수 있다.
- 가용 로트 총량이 출고 요청 수량보다 부족한 경우(초과 출고), 가용 로트를 전량 소진한 후 남은 수량은 '현재 마스터 단가'로 마지막 분할행을 생성(`[FIFO 초과출고]`)하거나 사용자 설정에 따라 처리할 수 있다.

---

## Business Context
- 호텔 재고 운영 중 동일 품목이라도 납품 시기나 물가 변동에 따라 매입단가가 달라질 수 있다.
- 출고 시 실제 먼저 들어온 로트의 단가가 기록되지 않고 당시 품목마스터 단가로 단일 기록되면, 장부상 출고금액과 실제 매입원가 간에 오차가 발생한다.
- 사용자는 1번의 출고 행위를 수행하지만, 시스템 내부적으로 로트별로 장부에 쪼개어 기록(Parent-Child TxID 연계)함으로써 회계/원가 정합성을 1원 단위까지 보장한다.

---

## Current System
1. 사용자가 웹앱에서 `수량: 10` 출고를 등록하면, `TxService.gs`의 `addTransaction()`이 호출됨.
2. `addTransaction()`은 현재 품목 마스터의 기준 매입단가를 조회하여 1개의 행(`수량: 10, 단가: 마스터단가, 거래ID: PREFIX-YYYYMMDD-UUID8`)으로 저장함.
3. 과거 입고 로트 중 어떤 로트에서 몇 개가 나갔는지 장부(시트)상에는 명시적으로 기록되지 않음.

---

## Root Cause / Diagnostic Logic
- 해당 없음 (신규 기능 및 로직 고도화)

---

## Requirements

### Functional
- [x] **FIFO 잔여 로트 산출**: 출고(`type === "출고"`) 또는 폐기(`type === "폐기"`) 등록 시, 해당 업장 시트의 과거 입출고 내역 및 마스터 초기재고를 기반으로 미소진 입고 로트 목록을 FIFO 순서(오래된 날짜순)로 계산.
- [x] **단일 로트 충족 시 처리**: 출고 수량이 1개 로트 내에서 전량 충족되는 경우:
  - 1개 행으로 저장.
  - 단가는 해당 소진 로트의 실제 입고단가 적용.
  - 거래ID: `PREFIX-YYYYMMDD-UUID8-01` (또는 기본 TxID).
- [x] **다중 로트 분할 시 처리**: 출고 수량이 2개 이상의 로트에 걸쳐 소진되는 경우:
  - 로트 소진 수만큼 N개 행으로 분할 생성.
  - 각 행마다 해당 로트의 실제 소진 수량과 매입단가 스냅샷 기록.
  - 거래ID: 동일한 Parent UUID에 인덱스 서브키 부여 (`{ParentTxID}-01`, `{ParentTxID}-02`, ...).
  - 비고: 사용자 입력 비고 + `[FIFO N/총분할수, 로트일자: YYYY-MM-DD]` 자동 부착.
- [x] **입고(`type === "입고"`) 처리**: 분할 없이 기존 단일 행 저장 로직 유지.
- [x] **재고 부족(초과 출고) 처리**:
  - 가용 로트 총합 < 출고 요청 수량인 경우: 가용 로트 전량 소진 분할행 생성 후, 나머지 잔여 수량은 '현재 마스터 매입단가'로 마지막 분할행 생성 (비고: `[FIFO 초과출고]`).
- [x] **응답 메시지 및 반환값**:
  - 분할 저장된 경우 안내 메시지 제공 (예: `✅ [출고 완료] 2개 로트로 분할 저장되었습니다. (거래ID: FB-20260831-XXXX-01 외 1건)`).

### Non-Functional
- [x] **동시성 제어**: `LockService.getScriptLock()`을 유지하여 동시 출고 시 동일 로트의 이중 차감 방지.
- [x] **성능 최적화**: 분할된 N개 행을 단일 `setValues()` 호출로 배치 삽입하여 GAS 실행 시간 및 쿼터 절약.
- [x] **캐시 갱신**: 트랜잭션 기록 후 `CacheManager.invalidateAll()` 정상 호출.

---

## Constraints
- 구글 스프레드시트의 9열 데이터 스키마(`TX_COLS = 9`)를 엄격히 준수할 것 (시트 열 구조 변경 불가).
- 기존 웹앱 API 호출 인터페이스(`addTransaction(token, shopName, txData)`)의 시그니처를 유지할 것.
- GAS 실행 제한시간(Web App 30초)을 고려하여 불필요한 전체 시트 재스캔을 지양하고 메모리 내 정렬/계산을 활용할 것.

---

## Files to Inspect
- `src/TxService.gs` (addTransaction, getRecentTransactions)
- `src/StockEngine.gs` (FIFO lotsMap/outEventsMap 로직 참조)
- `src/Config.gs` (TX_COLS, VALID_TRANSACTION_TYPES)
- `src/JS_Tx.html` (프론트엔드 출고 등록 및 테이블 렌더링)
- `Docs/BusinessRules.md` (제8조 로트/FIFO 규칙)

---

## Files to Modify
- `src/TxService.gs`:
  - `addTransaction()` 내 출고/폐기 시 FIFO 로트 분할 계산 및 배치 삽입 로직 구현.
  - 내부 헬퍼 함수 `_calculateFifoOutboundSplits(sheet, code, requestedQty, masterItemInfo)` 추가.
- `Docs/BusinessRules.md`:
  - 제2조(재고 출고) 및 제8조(로트/FIFO)에 다중 로트 분할 저장 규칙 반영.

---

## Files to Create
- 없음

---

## Implementation Plan
1. **FIFO 분할 계산 헬퍼 함수 설계 (`_calculateFifoOutboundSplits`)**:
   - 업장 시트에서 대상 품목코드(`code`)의 기존 입출고 데이터를 조회.
   - 마스터 시트 초기재고(`INIT_STOCK`, `UNIT_PRICE`)를 최우선 로트(date=0)로 편입.
   - 기존 입고 로트와 기존 출고/폐기 이력을 시간순으로 대조하여 현재 시점의 각 로트별 `remaining` 수량 계산.
   - 요청 수량(`requestedQty`)을 잔여 로트에서 차감하며 `splits = [{ qty, unitPrice, lotDate, index, totalSplits }]` 생성.
2. **`addTransaction()` 로직 분기**:
   - `type === "입고"`: 기존대로 1개 행 생성 및 삽입.
   - `type === "출고"` 또는 `type === "폐기"`:
     - `_calculateFifoOutboundSplits` 실행.
     - 생성된 splits 배열을 2차원 row 배열(`finalRows`)로 변환.
     - `sheet.getRange(startRow, 1, finalRows.length, TX_COLS).setValues(finalRows)`로 배치 삽입.
     - 서식 및 배경색(`COLORS.autoBg`) 배치 적용.
3. **UI 피드백 최적화**:
   - 분할 건수와 Parent TxID를 포함한 사용자 친화적 완료 메시지 리턴.

---

## Migration Plan
- 없음 (기존 9열 시트 구조 그대로 유지되며, 신규 출고 건부터 자동 분할 저장 적용).

---

## Test Plan

### Unit Test
- `tests/unit/` 시뮬레이션 테스트 작성:
  1. **단일 로트 출고**: 입고 로트(10개 @ 1,000원) 상태에서 5개 출고 -> 1개 행 (5개 @ 1,000원, TxID-01) 생성 검증.
  2. **2개 로트 분할 출고**: 로트1(4개 @ 1,000원), 로트2(10개 @ 1,200원) 상태에서 10개 출고 -> 2개 행 (4개 @ 1,000원 / 6개 @ 1,200원) 생성 검증.
  3. **초기재고 연계 출고**: 초기재고(3개 @ 800원), 입고로트(5개 @ 1,000원) 상태에서 5개 출고 -> 2개 행 (3개 @ 800원 / 2개 @ 1,000원) 생성 검증.
  4. **초과 출고(재고 부족)**: 가용 로트 총 5개 상태에서 8개 출고 -> 가용 5개 소진 후 3개는 마스터 단가로 초과출고 행 생성 검증.
  5. **입고 등록 불변성**: 입고 등록 시 분할 없이 정상 1개 행 기록 검증.

### E2E Test (Playwright)
- DEV Web App 환경 테스트:
  1. 로그인 -> 업장 선택.
  2. 테스트 품목 입고 2회 등록 (예: 5개 @ 1,000원, 5개 @ 1,500원).
  3. 출고 7개 등록 -> 최근 입출고 기록 테이블에 2줄(5개 @ 1,000원, 2개 @ 1,500원) 분할 생성 확인.

---

## Regression Risk
- **Low ~ Medium**:
  - 출고 저장 시 과거 입출고 로그를 읽는 단계가 추가되므로, 입출고 데이터가 매우 많을 경우 실행 시간이 소폭 증가할 수 있음 (품목 필터링 및 배치 연산으로 최적화 필요).
  - 기존 대시보드 집계(`recalcStockAndUsage`) 및 월마감(`executeMonthlyClosing`)은 이미 9열 구조의 개별 행 단가를 읽도록 설계되어 있어 완벽히 호환됨.

---

## Acceptance Criteria
- 단일 출고 수량이 다수의 이전 입고 로트에 걸칠 때 정확한 수량과 로트별 단가로 분할된 복수의 행이 생성되어야 함.
- 분할된 행들의 거래ID가 동일한 Parent 접두사 + `-01`, `-02` 인덱스를 가져야 함.
- 비고란에 분할 차수(`[FIFO 1/2]`) 정보가 기록되어야 함.
- `StockEngine.gs`의 대시보드 합계금액 및 현재고 계산에 오차가 없어야 함.

---

## Human Approval Required
- 없음 (사용자가 '방법 1. 장부에 2줄로 나누어 적기' 정책을 승인함에 따라 작성됨).

---

## Deployment Notes
- 배포 시 `src/TxService.gs` 파일이 업데이트되며, 기존 데이터 마이그레이션 없이 즉시 적용 가능.

---

## Rollback Plan
- `git checkout`으로 `src/TxService.gs`의 `addTransaction` 함수를 이전 단일 행 저장 방식으로 원복.

---

## Final Report

**구현일**: 2026-08-31 / **상태**: 구현 완료, DEV E2E 미실행(차단됨) — Human QA 대기

### 변경 파일
| 파일 | 내용 |
|------|------|
| `src/TxService.gs` | `addTransaction()` 출고/폐기 FIFO 분할 저장 + 헬퍼 `_calculateFifoOutboundSplits()` 신규 |
| `src/CacheManager.gs` | `buildItemMapCache()` 본문 복구(아래 참조) + 품목 맵에 `initStock` 추가 |
| `Docs/BusinessRules.md` | 제2조에 로트 단가/분할 규칙 추가, 제8-1조(다중 로트 분할 저장) 신설 |
| `tests/unit/fifo-lot-splitting.test.js` | 신규 단위 테스트 7건 |
| `tests/e2e/fifo-split.spec.js` | 신규 Playwright 스펙 (DEV 배포 후 실행 필요) |

### 구현 요약
- **분할 계산**: `_calculateFifoOutboundSplits(sheet, code, requestedQty, masterItemInfo)`
  - 로트 구성 규칙을 `StockEngine.recalcStockAndUsage()` / `Archive.executeMonthlyClosing()`과 동일하게 맞춤
    (마스터 `INIT_STOCK`을 `date=0` 최초 로트로 편입 → 시트의 "입고" 행을 로트, "출고"/"폐기" 행을 소진 이벤트로 처리).
  - 대상 품목 행만 메모리에서 필터링하며 시트 읽기는 `getValues()` 1회.
  - 같은 날짜 로트는 시트 행 순서(`seq`)로 안정 정렬. 부동소수 오차는 1e-6 반올림 + 1e-9 임계값으로 흡수.
- **저장**: 입고는 기존과 동일한 1행(TxID 접미사 없음). 출고/폐기는 분할행 N개를 `setValues()` 1회로 배치 삽입하고,
  품목명/단가/거래ID 열 배경색도 열 단위 1회 호출로 적용. 기존 `LockService` 잠금 구간 안에서 수행.
- **TxID**: 출고/폐기는 항상 `{ParentTxID}-01`, `-02` … (분할이 1건이어도 `-01`).
- **비고**: 2건 이상 분할 시 `[FIFO n/N, 로트일자: YYYY-MM-DD]`(초기재고 로트는 `로트일자: 초기재고`), 초과분은 `[FIFO 초과출고]`.
- **반환값**: 기존 `success/message/txId`를 유지하고 `parentTxId`, `txIds`, `splitCount`, `overdraftQty`를 추가(프론트엔드 수정 불필요).

### 부수적으로 고친 기존 버그 (TASK-005 범위 밖이지만 선행 조건)
`src/CacheManager.gs`의 `buildItemMapCache()` 본문이 한 줄로 뭉개진 채(`\uXXXX`·`\n` 리터럴이 그대로 박힌 주석)
커밋되어 있어, `const masterData` / `const itemMap` 선언 전체가 `//` 주석 안에 들어가 있었다.
즉 캐시 미스 시 이 함수는 항상 `ReferenceError: itemMap is not defined`로 실패한다 (HEAD 기준 재현).
FIFO가 초기재고(`initStock`)를 이 맵에서 읽어야 하므로 함께 복구했다.

### 테스트 결과
- **단위 테스트: 7/7 통과** (`npm run test:unit` 전체 3개 파일 통과)
  - 신규 테스트는 로직을 복사하지 않고 `src/Config.gs`, `src/StockEngine.gs`, `src/TxService.gs` 원본을
    `vm` 샌드박스에 로드한 뒤 GAS 전역 객체만 스텁으로 대체 → 소스 변경 시 테스트가 따라감.
  - 케이스: ①단일 로트 ②2개 로트 분할(4@1,000 / 6@1,200) ③초기재고 연계(3@800 / 2@1,000)
    ④초과 출고(5 소진 + 3 마스터 단가) ⑤입고 불변성 ⑥기존 출고 이력 반영·타 품목 격리 ⑦잔여 금액 정합성(4,800원).
- **DEV 배포: 완료** — 최초 `npm run dev:push`는 clasp 액세스 토큰 만료로 실패했으나,
  `~/.clasprc.json` 갱신 후 재실행하여 26개 파일 푸시 완료.
- **E2E: 통과** (`tests/e2e/fifo-split.spec.js`, 1.1분) — 로그인 → 업장 선택 →
  입고 5 ×2 → 출고 7 → 분할행 수량 합·Parent TxID·접미사 검증.
- **다중 로트 분할 실증(DEV 실데이터)** — 위 E2E는 잔여 로트가 넉넉해 1행으로 끝났으므로,
  현재고 S인 품목에 입고 5 ×2 후 출고 (S+7)을 등록해 분할을 강제 확인했다.
  품목 `FBV-001 냉동단호박`(현재고 10) → 출고 17:

  | 구분 | 수량 | 비고 | 거래ID |
  |------|------|------|--------|
  | 출고 | 10 | `[FIFO 1/3, 로트일자: 초기재고]` | `TX-20260831-16B9F4B1-01` |
  | 출고 | 5 | `[FIFO 2/3, 로트일자: 2026-08-31]` | `TX-20260831-16B9F4B1-02` |
  | 출고 | 2 | `[FIFO 3/3, 로트일자: 2026-08-31]` | `TX-20260831-16B9F4B1-03` |

  서버 응답: `✅ [출고 완료] 3개 로트로 분할 저장되었습니다. (거래ID: …-01 외 2건)`

#### E2E 과정에서 드러난 기존 인프라 문제 (모두 수정함)
1. **DEV 웹앱이 옛 코드를 서빙** — `.env`의 `PLAYWRIGHT_BASE_URL`이 가리키는 배포
   `AKfycbwomsnY4…`는 **@2 버전에 고정**되어 있어, `clasp push` 후에도 새 코드가 반영되지 않는다
   (첫 실행에서 `ReferenceError: itemMap is not defined` — 즉 수정 전 CacheManager가 돌고 있었다).
   `@HEAD`를 따라가는 DEV 배포 `AKfycbz-0sbkngtuonF3m9SDu_J1JJF809ISze-Nxvf5La7S`가 따로 있으며,
   검증은 이 URL로 실행했다. **조치 필요**: `.env`의 `PLAYWRIGHT_BASE_URL`을 @HEAD 배포로 바꾸거나,
   매 푸시 후 `npx clasp deploy -P .clasp-dev.json -i AKfycbwomsnY4… `로 재배포할 것.
   (권한 정책상 Claude가 `.env`를 수정하지 못해 실행 시 환경변수로 주입했다.)
2. **`waitForIdle()`가 매 호출 60초를 낭비** (`tests/e2e/fixtures/env.js`) —
   `#loadingOverlay`는 항상 DOM에 있고 `opacity`로만 숨겨져 Playwright의 `state:'hidden'`이
   영원히 만족되지 않았다. `.active` 클래스 기준으로 판정하도록 수정.
3. **`env.js`의 `.env` 경로가 한 단계 부족** — `tests/.env`를 보고 있어 독립 실행 시 로드 실패
   (Playwright에서는 config가 따로 로드해 가려져 있었음). 세 단계 위로 수정.
4. **저장 실패가 조용히 넘어감** — 스펙에 서버 토스트 문구 캡처/검증을 추가해
   실패 시 원인이 로그에 그대로 드러나도록 했다.
  (스펙은 DEV 시트의 기존 로트 잔량을 알 수 없으므로 "분할행 수량 합 = 요청 수량,
  동일 Parent TxID + `-01`/`-02` 접미사, 분할 시 FIFO 태그" 불변식으로 검증한다.)

### Human QA 확인 요청 사항
1. DEV 시트(맛다락)에 남은 검증 데이터 정리 여부 판단:
   - `FBM-015 LA갈비`: 입고 5 ×2, 출고 7 (`playwright-fifo-*`)
   - `FBV-001 냉동단호박`: 입고 5 ×2, 출고 17 3행 (`fifo-verify-*`)
   두 품목 모두 순증감은 각각 +3 / -7 로 음수 재고는 발생하지 않았다.
2. `.env`의 `PLAYWRIGHT_BASE_URL`을 @HEAD 배포로 교체(위 "기존 인프라 문제 1번").
2. 정책 확인: 출고/폐기는 분할이 1건이어도 TxID에 `-01`이 붙는다(기존 출고 TxID 포맷과 달라짐). 외부 정산 시스템과의 연동이 있다면 사전 확인 필요.
3. 정책 확인: 재고보다 많이 출고한 경우 차단하지 않고 마스터 단가로 초과분 행을 기록한다(Task 명세대로).
4. 월마감(`executeMonthlyClosing`) 이후에도 마스터 `INIT_STOCK`이 그대로 남아 이월 입고 행과 중복 계상되는 기존 동작이 있다.
   본 구현은 `StockEngine`과 동일 규칙을 따랐으므로 정합성 차이는 없으나, 별도 Task로 검토 필요.
