/**
 * 호텔덕구온천 재고 관리 시스템 v7.0 — 설정 모듈
 * 모든 상수, 색상, 시트명을 한곳에서 관리합니다.
 */

const MIN_ANALYSIS_DAYS = 7; // 시즌 초기 일평균 산출 시 최소 분석 일수
const ARCHIVE_FOLDER_ID = "1wCOsDjxZcPEQjKVh3z0gsN9fXilfPLDr"; // [v9.0] 월별 마감 데이터가 저장될 드라이브 폴더 ID ("마감 데이터")

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
const VALIDATION_ROWS = 500; // 성능 최적화를 위한 검증/서식 고정 적용 범위

const CURRENT_SCHEMA_VERSION = 8; // [v7.0] v8 스키마

// [v8.0] 성능 최적화용 캐시 키 & TTL 상수
const CACHE_KEYS = {
  ITEM_MAP: 'ITEM_CODE_MAP'
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

// 기본 계정 리스트 (createAll 초기화 시 자동 생성)
const DEFAULT_USERS = [
  { username: "mh_kwon@dukgu.com", password: "dukgu1013!", name: "권미화", dept: "경영지원팀", role: "admin" },
  { username: "yw_bae@dukgu.com", password: "dukgu1013!", name: "배영우", dept: "관리팀", role: "admin" },
  { username: "ss_shim@dukgu.com", password: "dukgu1013!", name: "심순섭", dept: "관리팀", role: "admin" },
  { username: "js_seo@dukgu.com", password: "dukgu1013!", name: "서정승", dept: "구매팀", role: "manager" },
  { username: "gy_jeong@dukgu.com", password: "dukgu1013!", name: "정경용", dept: "구매팀", role: "staff" }
];

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
