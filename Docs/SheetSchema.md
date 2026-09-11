# Sheet Schema — 호텔 재고 관리 시스템

> 실제 Google Sheet의 물리 구조. `Config.gs` 기준.

---

## 🗂️ 품목 마스터 (`SHEET_MASTER`)

**Purpose**: 전체 품목의 마스터 데이터 관리
**Primary Key**: A열 (품목코드)
**Data Start Row**: 3 (1~2행 헤더)
**Total Columns**: 25 (`MASTER_COL_COUNT`) — [TASK-017] S열 거래처코드 삽입으로 24 → 25

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
| S | 18 | `MASTER_COLS.VENDOR_CODE` | String | | 거래처코드 (`SHEET_VENDORS` 참조, 빈 값 허용) |
| T | 19 | `MASTER_COLS.TAX_TYPE` | String | | 과세구분 |
| U | 20 | `MASTER_COLS.UNIT_PRICE` | Number | | 매입단가 |
| V | 21 | `MASTER_COLS.SUPPLY_PRICE` | Number | | 공급단가 (수식) |
| W | 22 | `MASTER_COLS.TAX_AMOUNT` | Number | | 단위 세액 (수식) |
| X | 23 | `MASTER_COLS.TOTAL_VALUE` | Number | | 재고 합계금액 (FIFO) |
| Y | 24 | `MASTER_COLS.USAGE_STATUS` | String | | 사용유무 (사용/미사용) |

**수식 열** (코드에서 빈 값으로 설정): N, O, P, Q, V, W, X

**거래처 참조 규칙** — S열은 거래처 **코드만** 담는다. 거래처명을 VLOOKUP으로 복제하지 않는
이유는 거래처명이 바뀌었을 때 품목 마스터를 함께 고치지 않으면 두 시트가 갈라지기 때문이다.
드롭다운 소스는 `🤝 거래처관리`의 숨김 N열(사용 중인 코드만 FILTER)이다.

---

## 🤝 거래처관리 (`SHEET_VENDORS`)

**Purpose**: 매입처(거래처) 마스터. 품목 마스터가 코드로 참조한다. (TASK-017, v17 신설)
**Primary Key**: A열 (거래처코드, `VND-001` 형식)
**Data Start Row**: 3 (1~2행 헤더)
**Total Columns**: 13 (`VENDOR_COL_COUNT`) + 숨김 N열(드롭다운 소스)

| Column | Index (0-based) | Constant | Type | Required | Description |
|--------|-----------------|----------|------|----------|-------------|
| A | 0 | `VENDOR_COLS.CODE` | String | ✅ | 거래처코드 (PK, `VND-001`) |
| B | 1 | `VENDOR_COLS.NAME` | String | ✅ | 거래처명 |
| C | 2 | `VENDOR_COLS.SHORT_NAME` | String | | 약어명 |
| D | 3 | `VENDOR_COLS.BIZ_NO` | String | | 사업자번호 (텍스트 서식) |
| E | 4 | `VENDOR_COLS.CEO` | String | | 대표자명 |
| F | 5 | `VENDOR_COLS.BIZ_TYPE` | String | | 업태 |
| G | 6 | `VENDOR_COLS.BIZ_ITEM` | String | | 업종 |
| H | 7 | `VENDOR_COLS.ADDRESS` | String | | 주소 |
| I | 8 | `VENDOR_COLS.PHONE` | String | | 전화 (텍스트 서식) |
| J | 9 | `VENDOR_COLS.EMAIL` | String | | 이메일 |
| K | 10 | `VENDOR_COLS.BIZ_ENTITY` | String | | 사업자구분 (개인/법인) |
| L | 11 | `VENDOR_COLS.NOTE` | String | | 비고 |
| M | 12 | `VENDOR_COLS.USAGE_STATUS` | String | | 사용여부 (사용/미사용) |
| N | — | `VENDOR_ACTIVE_CODE_COL` | Formula | | **숨김** — 사용 중인 코드만 거른 FILTER 목록 (v18에 O→N 이전) |

**운영 규칙**
- **행 물리 삭제 금지.** 거래를 끊을 때는 M열을 `미사용`으로 바꾼다(논리 삭제).
  이미 그 거래처를 참조 중인 품목이 있을 수 있어, 행을 지우면 품목의 S열이 미아가 된다.
- 거래처코드는 한 번 부여하면 바꾸지 않는다. 품목 마스터가 이름이 아니라 코드로 참조한다.
- A열 검증은 **경고(allowInvalid)** 다. 대량 붙여넣기를 막지 않기 위함이며,
  형식이 어긋나면 셀에 경고 삼각형만 표시된다. 코드 중복은 조건부 서식으로 빨갛게 뜬다.
- 텍스트 서식(`@`)을 쓰는 열: 거래처코드·사업자번호·전화 — 앞자리 0 유실과 날짜 자동 변환 방지.
- **초기 데이터는 시트에 직접 붙여넣되, 거래처코드는 비워 둔다.** 코드는 사람이 정하는 값이 아니라
  서버 채번 값이라 붙여넣기 경로에는 채워 주는 손이 없다. 붙여넣은 뒤 관리자 메뉴의
  **🤝 거래처코드 일괄 부여**(`assignMissingVendorCodes`)를 누르면 거래처명이 있고 코드가 빈 행에
  위에서부터 `VND-NNN`이 붙는다. 이미 있는 코드는 건드리지 않으므로 몇 번을 눌러도 안전하다.
  코드가 빈 행은 웹앱 목록에도, 품목 마스터 드롭다운 소스에도 나타나지 않는다.
- 숨김 N열은 **지우면 안 된다.** M 오른쪽의 빈 열을 정리하다 함께 지우면 품목 마스터의
  거래처 드롭다운이 통째로 빈다. 지워졌다면 관리자 메뉴의 **🎨 시트 서식/검증 복구**가 되살린다
  (그때 결과 창에 "확충한 열"로 표시된다).

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
