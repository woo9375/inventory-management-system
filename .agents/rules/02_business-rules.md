# Core Business Rules

Always adhere to these domain-specific logic rules when modifying inventory or transaction calculations.

## 적용 범위
- 입출고 처리 (TxService.gs)
- 재고 계산 (StockEngine.gs)
- 월마감/FIFO (Archive.gs)
- 대시보드 (Dashboard.gs)
- 품목 마스터 (ItemService.gs)

## 왜 필요한가
재고 관리 시스템에서 업무 규칙 오류는 **실제 자산 평가 오류**로 직결된다. 수량/단가/금액이 1원이라도 틀리면 월마감 데이터가 전파적으로 오염된다.

---

## 1. FIFO (First-In-First-Out) Month-End Closing
- **Never merge distinct lots**: When performing month-end closing, remaining inventory MUST NOT be lumped together by product.
- **Maintain unit costs**: Inventory must be carried over by dividing it into distinct lots based on purchase history. If 5 items cost 1,000 won and 20 items cost 1,200 won, they must be recorded as separate rows in the new month's sheet. This ensures accurate inventory valuation.
- **Key module**: The closing logic resides in `Archive.gs`. The entry point is `executeMonthlyClosing()`. Closed records are saved to Google Drive under `ARCHIVE_FOLDER_ID` (defined in `Config.gs`), organized by year and month (e.g., `2026/[입출고마감]_2026_08`).
- **자동 아카이빙**: `archiveOldRecords()`는 월 1회 트리거로 이전 달 데이터를 별도 스프레드시트로 이관

### FIFO 금지사항
- 로트 병합 금지 (동일 품목이라도 매입 단가가 다르면 별도 행)
- 이월 시 단가 임의 변경 금지
- 마감 중 동시 입출고 허용 금지 (LockService로 차단됨)

---

## 2. Transaction Record Structure
- All transaction records follow a **9-column structure** defined by `TX_COLS = 9` in `Config.gs`:
  `[날짜 | 품목코드 | 품목명 | 구분 | 수량 | 단가(스냅샷) | 담당자 | 비고 | 거래ID]`
- When adding or modifying transaction-related logic, always respect this column order and count.

### 입출고 규칙
- **유효 거래 구분**: `VALID_TRANSACTION_TYPES = ["입고", "출고", "폐기"]`
- **수량**: 0보다 큰 양의 정수/실수, 최대 `MAX_TRANSACTION_QTY` (1억)
- **단가 스냅샷**: 거래 시점의 품목 마스터 매입단가를 자동 복사 (변경 불가)
- **거래ID**: `{업장태그}-{YYYYMMDD}-{UUID8}` 형식으로 자동 생성, 발급 후 변경 불가
- **품목명**: 품목코드 입력 시 마스터에서 자동 조회 (직접 편집 차단)
- **날짜**: `YYYY-MM-DD` 형식만 허용

### 자동 계산 열 보호
- C열(품목명), F열(단가), I열(거래ID)은 시스템 자동 생성
- 사용자 직접 편집 시 `onEdit`에서 감지하여 자동 복구

---

## 3. Sheet Name Constants
- **Never hardcode sheet names.** Always use the constants defined in `Config.gs`:
  - `SHEET_DASHBOARD` = "📊 대시보드"
  - `SHEET_INOUT` = "📝 통합 입출고 기록장"
  - `SHEET_MASTER` = "🗂️ 품목 마스터"
  - `SHEET_TEMPLATE` = "📋 입출고_템플릿"
  - `SHEET_SHOPS` = "🏢 업장관리"
  - `SHEET_SEASONS` = "📅 시즌설정"
  - `SHEET_USERS` = "👤 사용자관리"
  - `SHEET_BASE_DATA` = "📂 기초데이터"
  - `SHEET_CHANGELOG` = "📋 변경이력"
  - `SHEET_SYSTEM_LOGS` = "🚨 System_Logs"

---

## 4. Seasonal Inventory Adjustment (Multiplier)
- The hospitality industry has distinct peak and off-peak seasons.
- The system uses a 'Multiplier' (배수) for safety stock calculation during designated peak seasons (e.g., Summer/Winter peak times).
- Season configuration is managed via the `SHEET_SEASONS` sheet. The `MIN_ANALYSIS_DAYS` constant (7 days) defines the minimum analysis period for calculating daily averages in a new season.
- Whenever calculating `안전재고` (Safety Stock) or `적정발주량` (Order Quantity), always check if the current date falls within a configured season and apply the multiplier.

---

## 5. 재고 계산 규칙

### 현재고 산출
```
현재고 = 초기재고 + Σ입고 - Σ출고 - Σ폐기
```
- `recalcStockAndUsage()`에서 일괄 계산
- 음수 재고 방지: `Math.max(0, ...)`

### 일평균 사용량
- **출고만** 집계 (입고/폐기 제외)
- 시즌 기간 또는 최근 30일 기준

### 안전재고 / 발주점 / 적정발주량
- ARRAYFORMULA 수식으로 자동 계산
- 안전재고: `일평균 × 안전재고일수 × 시즌배수`
- 발주점: `일평균 × 리드타임 + 안전재고`
- 적정발주량: `일평균 × 목표유지일수 - 현재고`

### 재고 합계금액 (FIFO)
- `StockEngine.gs`에서 FIFO 잔여 로트별 `수량 × 단가` 합산
- 입고 기록 없는 품목: `현재 매입단가 × 현재고`

---

## 6. 품목 마스터 규칙

### 사용유무
- `"사용"` / `"미사용"` 2가지 상태
- 미사용 품목은 대시보드, 품목검색, 캐시에서 제외
- 삭제 대신 미사용 처리 (소프트 삭제)

### 품목코드 유일성
- 등록 시 중복 검증 (`existingCodes` 확인)
- CSV 업로드 시 동일 파일 내 중복도 방지

### 변경이력
- 품목 마스터의 주요 필드 변경 시 `SHEET_CHANGELOG`에 자동 기록
- 추적 대상: 품목명, 카테고리, 규격, 단위, 초기재고, 리드타임, 안전재고일수, 목표유지일수, 과세구분, 매입단가, 사용유무

---

## 7. 업장 관리 규칙
- 업장 태그: 영어 대문자 2~3자 (`/^[A-Z]{2,3}$/`)
- "생성완료" 상태의 업장명/태그는 변경 불가 (onEdit 가드레일)
- 업장 삭제는 소프트 삭제 (시트 숨김 + 상태 "삭제됨")

---

## 예외
- 이월 거래의 거래ID는 `SYS-{YYYYMMDD}-{UUID8}` 형식
- 시트 UI에서의 CSV 업로드는 토큰 대신 `'SHEET_UI'` 문자열 사용

---

## AI 작업 시 검증 체크리스트

```
□ TX_COLS = 9 (9열 구조) 유지
□ FIFO 로트별 단가 유지
□ 시트명 Config.gs 상수 사용
□ 시즌 배수 보정 반영
□ 자동 계산 열(C, F, I) 보호 유지
□ 품목코드 유일성 검증 유지
□ 변경이력 기록 로직 유지
□ 업장 가드레일 유지
□ 수량 양수 검증 유지
□ VALID_TRANSACTION_TYPES 준수
```
