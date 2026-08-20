# Core Business Logic Guidelines

Always adhere to these domain-specific logic rules when modifying inventory or transaction calculations.

## 1. FIFO (First-In-First-Out) Month-End Closing
- **Never merge distinct lots**: When performing month-end closing, remaining inventory MUST NOT be lumped together by product.
- **Maintain unit costs**: Inventory must be carried over by dividing it into distinct lots based on purchase history. If 5 items cost 1,000 won and 20 items cost 1,200 won, they must be recorded as separate rows in the new month's sheet. This ensures accurate inventory valuation.
- **Key module**: The closing logic resides in `Archive.gs`. The entry point is `archiveOldRecords()`. Closed records are saved to Google Drive under `ARCHIVE_FOLDER_ID` (defined in `Config.gs`), organized by year and month (e.g., `2026/[입출고마감]_2026_08`).

## 2. Transaction Record Structure
- All transaction records follow a **9-column structure** defined by `TX_COLS = 9` in `Config.gs`:
  `[날짜 | 품목코드 | 품목명 | 구분 | 수량 | 단가(스냅샷) | 담당자 | 비고 | 거래ID]`
- When adding or modifying transaction-related logic, always respect this column order and count.

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

## 4. Seasonal Inventory Adjustment (Multiplier)
- The hospitality industry has distinct peak and off-peak seasons.
- The system uses a 'Multiplier' (배수) for safety stock calculation during designated peak seasons (e.g., Summer/Winter peak times).
- Season configuration is managed via the `SHEET_SEASONS` sheet. The `MIN_ANALYSIS_DAYS` constant (7 days) defines the minimum analysis period for calculating daily averages in a new season.
- Whenever calculating `안전재고` (Safety Stock) or `적정발주량` (Order Quantity), always check if the current date falls within a configured season and apply the multiplier.
