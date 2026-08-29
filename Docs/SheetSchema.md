# Sheet Schema — 호텔 재고 관리 시스템

> 실제 Google Sheet의 물리 구조. `Config.gs` 기준.

---

## 🗂️ 품목 마스터 (`SHEET_MASTER`)

**Purpose**: 전체 품목의 마스터 데이터 관리
**Primary Key**: A열 (품목코드)
**Data Start Row**: 3 (1~2행 헤더)
**Total Columns**: 24 (`MASTER_COL_COUNT`)

| Column | Index (0-based) | Constant | Type | Required | Description |
|--------|-----------------|----------|------|----------|-------------|
| A | 0 | `MASTER_COLS.CODE` | String | ✅ | 품목코드 |
| B | 1 | `MASTER_COLS.NAME` | String | ✅ | 품목명 |
| C | 2 | `MASTER_COLS.CATEGORY` | String | | 카테고리 |
| D | 3 | `MASTER_COLS.GRADE` | String | | 규격 |
| E | 4 | `MASTER_COLS.UNIT` | String | | 단위 |
| F | 5 | — | — | | (스페이서) |
| G | 6 | `MASTER_COLS.INIT_STOCK` | Number | | 초기재고 |
| H | 7 | `MASTER_COLS.CURRENT_STOCK` | Number | | 현재고 (계산) |
| I | 8 | `MASTER_COLS.DAILY_USAGE` | Number | | 일평균 사용량 (계산) |
| J | 9 | — | — | | (스페이서) |
| K | 10 | `MASTER_COLS.LEAD_TIME` | Number | | 리드타임 (일) |
| L | 11 | `MASTER_COLS.SAFETY_DAYS` | Number | | 안전재고일수 |
| M | 12 | `MASTER_COLS.TARGET_DAYS` | Number | | 목표유지일수 |
| N | 13 | `MASTER_COLS.SAFETY_STOCK` | Number | | 안전재고 (ARRAYFORMULA) |
| O | 14 | `MASTER_COLS.ROP` | Number | | 발주점 (ARRAYFORMULA) |
| P | 15 | `MASTER_COLS.ORDER_QTY` | Number | | 적정발주량 (ARRAYFORMULA) |
| Q | 16 | `MASTER_COLS.STATUS` | String | | 재고 상태 (ARRAYFORMULA) |
| R | 17 | — | — | | (스페이서) |
| S | 18 | `MASTER_COLS.TAX_TYPE` | String | | 과세구분 |
| T | 19 | `MASTER_COLS.UNIT_PRICE` | Number | | 매입단가 |
| U | 20 | `MASTER_COLS.SUPPLY_PRICE` | Number | | 공급단가 (수식) |
| V | 21 | `MASTER_COLS.TAX_AMOUNT` | Number | | 단위 세액 (수식) |
| W | 22 | `MASTER_COLS.TOTAL_VALUE` | Number | | 재고 합계금액 (FIFO) |
| X | 23 | `MASTER_COLS.USAGE_STATUS` | String | | 사용유무 (사용/미사용) |

**수식 열** (코드에서 빈 값으로 설정): N, O, P, Q, U, V, W

---

## 📝 통합 입출고 기록장 (`SHEET_INOUT`)

**Purpose**: 모든 업장의 입출고 데이터 통합 뷰
**Data Start Row**: 3
**Columns**: 9 (`TX_COLS`)

| Column | Type | Description |
|--------|------|-------------|
| A | Date | 날짜 |
| B | String | 품목코드 |
| C | String | 품목명 (자동) |
| D | String | 구분 (입고/출고/폐기) |
| E | Number | 수량 |
| F | Number | 단가 (스냅샷) |
| G | String | 담당자 |
| H | String | 비고 |
| I | String | 거래ID |

---

## 📋 입출고_템플릿 (`SHEET_TEMPLATE`)

**Purpose**: 새 업장 시트 생성 시 복사 원본
**구조**: 통합 입출고 기록장과 동일 (9열)

---

## 업장별 시트 (동적)

**Purpose**: 각 업장의 개별 입출고 기록
**구조**: 통합 입출고 기록장과 동일 (9열)
**생성**: `generateNewShops()`가 템플릿을 복사하여 생성
**보호**: C열(품목명), F열(단가), I열(거래ID)은 시트 보호로 편집 차단

---

## 👤 사용자관리 (`SHEET_USERS`)

**Purpose**: 사용자 계정 관리
**Primary Key**: A열 (아이디)
**Data Start Row**: 3

| Column | Constant | Type | Description |
|--------|----------|------|-------------|
| A (1) | `USER_COLS.USERNAME` | String | 아이디 (이메일) |
| B (2) | `USER_COLS.PASSHASH` | String | 비밀번호 해시 |
| C (3) | `USER_COLS.NAME` | String | 성함 |
| D (4) | `USER_COLS.DEPT` | String | 부서 |
| E (5) | `USER_COLS.ROLE` | String | 역할 |
| F (6) | `USER_COLS.SHOPS` | String | 배정 업장 (쉼표 구분) |

---

## 🏢 업장관리 (`SHEET_SHOPS`)

**Purpose**: 업장 목록 및 시트 관리
**Data Start Row**: 3

| Column | Type | Description |
|--------|------|-------------|
| A | String | 분류 |
| B | String | 업장명 (유일) |
| C | String | 거래ID 태그 |
| D | String | 시트 생성 상태 |
| E | Formula | 바로가기 링크 |
| F | Number | Sheet GID |

---

## 📅 시즌설정 (`SHEET_SEASONS`)

**Purpose**: 성수기/비수기 시즌 및 안전재고 배수 관리
**Data Start Row**: 5 (1~4행 헤더/현재시즌)

| Column | Type | Description |
|--------|------|-------------|
| A | String | 시즌명 |
| B | Date | 시작일 |
| C | Date | 종료일 |
| D | Number | 안전재고배수 |

**특수 셀**:
- B2: 현재 적용 시즌 (수식)
- D2: 현재 안전재고 배수 (수식)

---

## 📂 기초데이터 (`SHEET_BASE_DATA`)

**Purpose**: 드롭다운 목록 관리
**Data Start Row**: 3

| Column | Description |
|--------|-------------|
| A | 대분류 목록 |
| B | 단위 목록 |
| C | 품목 카테고리 |

---

## 📋 변경이력 (`SHEET_CHANGELOG`)

**Purpose**: 품목 마스터 변경 감사 이력
**Data Start Row**: 3

| Column | Type | Description |
|--------|------|-------------|
| A | DateTime | 변경일시 |
| B | String | 변경자 |
| C | String | 품목코드 |
| D | String | 품목명 |
| E | String | 변경필드 |
| F | String | 변경 전 |
| G | String | 변경 후 |

---

## 📊 대시보드 (`SHEET_DASHBOARD`)

**Purpose**: 재고 현황 요약 (KPI, 위험/발주필요 품목)
**구조**: SheetBuilder에서 생성, Dashboard.gs에서 갱신

---

## 🚨 System_Logs (`SHEET_SYSTEM_LOGS`)

**Purpose**: 시스템 에러 로그 (숨김 시트)
**Data Start Row**: 3

| Column | Type | Description |
|--------|------|-------------|
| A | DateTime | 시각 |
| B | String | 함수명 |
| C | String | 사용자 |
| D | String | 에러 메시지 |
| E | String | 스택 트레이스 |
| F | String | 심각도 |
