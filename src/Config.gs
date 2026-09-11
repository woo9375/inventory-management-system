/**
 * 호텔덕구온천 재고 관리 시스템 v7.0 — 설정 모듈
 * 모든 상수, 색상, 시트명을 한곳에서 관리합니다.
 */

const MIN_ANALYSIS_DAYS = 7; // 시즌 초기 일평균 산출 시 최소 분석 일수

// [v9.0] 월마감 아카이브가 생성될 드라이브 폴더 ID (기본값 / Production fallback)
// ⚠️ [TASK-004 확인됨] 이 ID는 "마감 데이터" 폴더가 아니라 프로젝트 루트 폴더
//    "1. (주)호텔덕구온천_재고관리 시스템" 이다. 실제 "마감 데이터" 폴더 ID는
//    1gGzUY3dnc-5plYoI2J-zMdeIYTuIu1gJ 이며 서로 다르다.
//    현재 동작(루트 폴더 밑에 연도 폴더 생성)을 바꾸는 것은 운영 정책 변경이므로
//    값은 그대로 두고 사실만 기록한다. 변경이 필요하면 아래 ScriptProperties로 재정의할 것.
const ARCHIVE_FOLDER_ID = "1wCOsDjxZcPEQjKVh3z0gsN9fXilfPLDr";

// ═══════════════════════════════════════════════════════════════════
//  [TASK-004] DEV / Production 환경 분리
//  동일한 소스가 DEV·Production 두 Apps Script 프로젝트에 함께 배포되므로,
//  환경 구분은 소스가 아니라 각 프로젝트가 개별 보유하는 ScriptProperties로 한다.
//  ScriptProperties가 비어 있으면 항상 Production으로 간주한다(안전 기본값).
// ═══════════════════════════════════════════════════════════════════

const APP_ENV_DEV  = "DEV";
const APP_ENV_PROD = "PROD";

const ENV_PROPERTY_KEYS = {
  APP_ENV: "APP_ENV",                     // "DEV" 인 경우에만 DEV로 판정
  ARCHIVE_FOLDER_ID: "ARCHIVE_FOLDER_ID"  // 설정 시 위 상수 대신 이 폴더에 아카이브 생성
};

/**
 * 현재 실행 중인 Apps Script 프로젝트의 환경을 반환한다.
 * @returns {string} APP_ENV_DEV | APP_ENV_PROD
 */
function getAppEnv() {
  try {
    const v = PropertiesService.getScriptProperties().getProperty(ENV_PROPERTY_KEYS.APP_ENV);
    return (v && String(v).trim().toUpperCase() === APP_ENV_DEV) ? APP_ENV_DEV : APP_ENV_PROD;
  } catch (e) {
    return APP_ENV_PROD; // 조회 실패 시 보수적으로 Production 취급
  }
}

/** @returns {boolean} 현재 환경이 DEV인지 여부 */
function isDevEnv() {
  return getAppEnv() === APP_ENV_DEV;
}

/**
 * 월마감 아카이브 폴더 ID를 환경에 맞게 반환한다.
 * ScriptProperties에 값이 없으면 기존 상수를 그대로 사용하므로 Production 동작은 변하지 않는다.
 * @returns {string}
 */
function getArchiveFolderId() {
  try {
    const v = PropertiesService.getScriptProperties().getProperty(ENV_PROPERTY_KEYS.ARCHIVE_FOLDER_ID);
    if (v && String(v).trim()) return String(v).trim();
  } catch (e) { /* fallthrough */ }
  return ARCHIVE_FOLDER_ID;
}

const SHEET_DASHBOARD = "📊 대시보드";
const SHEET_INOUT     = "📝 통합 입출고 기록장"; 
const SHEET_MASTER    = "🗂️ 품목 마스터";
const SHEET_TEMPLATE  = "📋 입출고_템플릿";

// [v7.0] 통합 설정 시트 → 개별 시트 분리
const SHEET_SHOPS     = "🏢 업장관리";
const SHEET_SEASONS   = "📅 시즌설정";
const SHEET_USERS     = "👤 사용자관리";
const SHEET_BASE_DATA = "📂 기초데이터";
const SHEET_CHANGELOG = "📋 변경이력";
// [TASK-017] 매입처(거래처) 마스터 — 품목 마스터가 거래처코드로만 참조한다(거래처명 복제 금지)
const SHEET_VENDORS   = "🤝 거래처관리";
const SHEET_SYSTEM_LOGS = "🚨 System_Logs"; // [v10.0] 에러 로그 시트

const STATUS_RISK  = "🚨 위험";
const STATUS_ORDER = "⚠️ 발주필요";
const STATUS_OK    = "✅ 정상";

const COLORS = {
  headerBg: "#0d2240", headerText: "#ffffff",
  riskBg: "#c0392b", orderBg: "#e67e22", normalBg: "#27ae60",
  inputBg: "#fffde7", autoBg: "#e8f0fb", grayBg: "#f3f3f3"
};

const ALERT_EMAIL = "[EMAIL_ADDRESS]";
const SEND_EMAIL_ALERT = false; 
// [TASK-016] 2000 → 5000. 이 값은 이제 **상한이 아니라 하한**이다.
// SheetBuilder의 _formatRowCount()가 시트의 실제 행 수(getMaxRows)까지 서식을 넓히므로,
// 이 상수는 "새 시트를 최소 몇 행까지 미리 구워 둘 것인가"만 결정한다.
// (TASK-009에서 500→2000으로 올렸지만 품목이 2000건을 넘자 2003행부터 같은 결함이 재발했다.)
const VALIDATION_ROWS = 5000; // 서식/검증을 미리 구워 두는 최소 행 수

// [TASK-002] v9 → v11로 상향: 기존 v10(System_Logs) 마이그레이션이 이 상수가
// 9에 머물러 있어 runMigrations()에서 한 번도 실행되지 않았던 것을 함께 바로잡음.
const CURRENT_SCHEMA_VERSION = 18; // [v12] 서식/검증 행 범위 확장(TASK-009) + [v13] 단위 목록 CASE 삭제 + [v14] 음수 재고 수식/서식(TASK-011) + [v15] 단위 '조', '줄' 추가 + [v16] 서식 범위 동적 확장(TASK-016) + [v17] 거래처 마스터 신설(TASK-017) + [v18] 사용유무 손상 복구 + 거래처 드롭다운 소스 열 정리

// [v8.0] 성능 최적화용 캐시 키 & TTL 상수
const CACHE_KEYS = {
  ITEM_MAP: 'ITEM_CODE_MAP',
  VENDOR_LIST: 'VENDOR_LIST' // [TASK-018] 거래처 목록
};
const TTL = {
  ITEM_MAP: 600 // 품목 마스터 인덱스 (10분)
};

// ═══════════════════════════════════════════════════════════════════
//  인증 시스템 상수
// ═══════════════════════════════════════════════════════════════════

const ROLES = { ADMIN: "admin", MANAGER: "manager", STAFF: "staff" };

const SESSION_TIMEOUT_SECONDS = 21600; // 6시간 (CacheService 최대값)
const SESSION_PREFIX = "session_";     // CacheService 키 접두어
const LOGIN_ATTEMPT_PREFIX = "login_attempt_";
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 900;
const MIN_PASSWORD_LENGTH = 8;

// 최초 관리자 계정은 소스가 아닌 Script Properties에서만 읽습니다.
const INITIAL_ADMIN_PROPERTY_KEYS = {
  USERNAME: "INITIAL_ADMIN_USERNAME",
  PASSWORD: "INITIAL_ADMIN_PASSWORD",
  NAME: "INITIAL_ADMIN_NAME",
  DEPT: "INITIAL_ADMIN_DEPT"
};

const VALID_TRANSACTION_TYPES = ["입고", "출고", "폐기"];
const MAX_TRANSACTION_QTY = 100000000;
const MAX_TRANSACTION_NOTE_LENGTH = 500;

// [TASK-019] 웹앱 입출고 일괄 업로드(CSV/XLSX)
//   BULK_TX_CHUNK_SIZE — 서버가 한 번의 호출에서 저장하는 최대 행 수.
//     GAS 실행 제한(6분) 안에서 FIFO 분할 계산 + 1회 setValues가 넉넉히 끝나는 크기다.
//     클라이언트는 Index.html 템플릿이 이 값을 그대로 주입받아 같은 크기로 나눠 보낸다(양쪽이 어긋나지 않게 한 곳에만 둔다).
//   BULK_TX_MAX_ROWS   — 파일 1개에서 받아들이는 최대 행 수(사전 검증 호출의 상한).
const BULK_TX_CHUNK_SIZE = 100;
const BULK_TX_MAX_ROWS = 2000;

// [v7.0] 사용자 데이터 열 매핑 (👤 사용자관리 시트 A~E열)
const USER_COLS = {
  USERNAME: 1,   // A열: 아이디 (다우오피스 이메일)
  PASSHASH: 2,   // B열: 비밀번호 해시 (SHA-256 + salt)
  NAME: 3,       // C열: 성함
  DEPT: 4,       // D열: 부서
  ROLE: 5,       // E열: 역할 (admin/manager/staff)
  SHOPS: 6       // F열: 배정된 업장 (쉼표 구분)
};

// [v7.0] 입출고 시트 열 수 (단가 스냅샷 열 추가)
const TX_COLS = 9; // [날짜|품목코드|품목명|구분|수량|단가(스냅샷)|담당자|비고|거래ID]

// [v10.0] 품목 마스터 시트 열 인덱스 매핑 (0-based, getValues() 배열용)
const MASTER_COLS = {
  CODE: 0,          // A열: 품목코드
  NAME: 1,          // B열: 품목명
  CATEGORY: 2,      // C열: 카테고리
  GRADE: 3,         // D열: 규격
  UNIT: 4,          // E열: 단위
  // F열(5): 스페이서
  INIT_STOCK: 6,    // G열: 초기재고
  CURRENT_STOCK: 7, // H열: 현재고
  DAILY_USAGE: 8,   // I열: 일평균 사용량
  // J열(9): 스페이서
  LEAD_TIME: 10,    // K열: 리드타임
  SAFETY_DAYS: 11,  // L열: 안전재고일수
  TARGET_DAYS: 12,  // M열: 목표유지일수
  SAFETY_STOCK: 13, // N열: 안전재고 (수식)
  ROP: 14,          // O열: 발주점 (수식)
  ORDER_QTY: 15,    // P열: 적정발주량 (수식)
  STATUS: 16,       // Q열: 재고 상태 (수식)
  // R열(17): 스페이서
  // [TASK-017] S열에 거래처코드를 삽입 — 이하 과세구분~사용유무가 한 칸씩 우측으로 이동했다
  VENDOR_CODE: 18,  // S열: 거래처코드 (🤝 거래처관리 참조, 빈 값 허용)
  TAX_TYPE: 19,     // T열: 과세구분
  UNIT_PRICE: 20,   // U열: 매입단가
  SUPPLY_PRICE: 21, // V열: 공급단가 (수식)
  TAX_AMOUNT: 22,   // W열: 단위 세액 (수식)
  TOTAL_VALUE: 23,  // X열: 재고 합계금액
  USAGE_STATUS: 24  // Y열: 사용유무
};
const MASTER_COL_COUNT = 25; // 총 열 수 (getRange 호출 시 사용) — [TASK-017] 24 → 25

// [TASK-017] 🤝 거래처관리 시트 열 인덱스 매핑 (0-based, getValues() 배열용)
//
// 거래처명은 여기에만 존재한다. 품목 마스터는 코드만 들고 있으므로
// 거래처명이 바뀌어도 품목 마스터를 손댈 필요가 없다(VLOOKUP 복제 금지).
const VENDOR_COLS = {
  CODE: 0,          // A열: 거래처코드 (PK, VND-001 형식)
  NAME: 1,          // B열: 거래처명
  SHORT_NAME: 2,    // C열: 약어명
  BIZ_NO: 3,        // D열: 사업자번호
  CEO: 4,           // E열: 대표자명
  BIZ_TYPE: 5,      // F열: 업태
  BIZ_ITEM: 6,      // G열: 업종
  ADDRESS: 7,       // H열: 주소
  PHONE: 8,         // I열: 전화
  EMAIL: 9,         // J열: 이메일
  BIZ_ENTITY: 10,   // K열: 사업자구분 (개인/법인)
  NOTE: 11,         // L열: 비고
  USAGE_STATUS: 12  // M열: 사용여부 (사용/미사용 — 논리 삭제)
};
const VENDOR_COL_COUNT = 13; // A~M 총 열 수

// 거래처코드 표기 규칙 — 입력 경고(데이터 검증)와 문서가 같은 규칙을 보게 상수로 둔다
const VENDOR_CODE_PREFIX = "VND-";
const VENDOR_BIZ_ENTITIES = ["개인", "법인"]; // K열 드롭다운

// [TASK-017] 품목 마스터 거래처 드롭다운의 소스 열 (🤝 거래처관리 N열, 1-based).
//
// 데이터 검증의 requireValueInRange는 조건 필터를 걸 수 없다. "사용여부=사용"인 코드만
// 고르게 하려면 걸러진 목록이 시트 어딘가에 실제로 존재해야 하므로,
// 13열 입력 폼(A~M) 바깥에 FILTER 수식용 숨김 열을 하나 둔다.
//
// [v18] 15(O열) → 14(N열). 처음에는 입력 폼과 한 칸 떼어 두려고 O열에 뒀는데,
//   그 사이의 N열이 **보이는 빈 열**로 남았다. 서식 복구가 열을 확충할 때마다
//   "N열이 새로 생겼다"로 보여 사용자가 결함으로 신고했다(실제로는 소스 열 재생성).
//   소스 열은 어차피 숨기므로 M 바로 옆으로 당기면 시트가 M에서 끝나는 것처럼 보인다.
const VENDOR_ACTIVE_CODE_COL = 14;   // N열 (숨김)

// [v18] v17이 쓰던 옛 소스 열. 마이그레이션이 이 열을 비울 때만 참조한다.
//   헤더 문구가 일치할 때만 손대므로 사용자가 O열에 적어 둔 내용은 건드리지 않는다.
const VENDOR_ACTIVE_CODE_COL_LEGACY = 15;
const VENDOR_ACTIVE_CODE_HEADER = "사용중 거래처코드(자동)";

const VENDOR_DROPDOWN_ROWS = 500;    // 드롭다운 소스로 잡아 두는 행 수
