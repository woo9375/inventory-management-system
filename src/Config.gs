/**
 * 호텔덕구온천 재고 관리 시스템 v1.0.0 — 설정 모듈
 * 모든 상수, 색상, 시트명을 한곳에서 관리합니다.
 */

const MIN_ANALYSIS_DAYS = 7; // 시즌 초기 일평균 산출 시 최소 분석 일수

const SHEET_DASHBOARD = "📊 대시보드";
const SHEET_INOUT     = "📝 통합 입출고 기록장"; 
const SHEET_MASTER    = "🗂️ 품목 마스터";
const SHEET_CONFIG    = "⚙️ 통합 설정";
const SHEET_TEMPLATE  = "📋 입출고_템플릿";

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

const CURRENT_SCHEMA_VERSION = 7; // v6.8 내부 스키마 버전

// ═══════════════════════════════════════════════════════════════════
//  [NEW] 인증 시스템 상수
// ═══════════════════════════════════════════════════════════════════

const ROLES = { ADMIN: "admin", MANAGER: "manager", STAFF: "staff" };

const SESSION_TIMEOUT_SECONDS = 21600; // 6시간 (CacheService 최대값)
const SESSION_PREFIX = "session_";     // CacheService 키 접두어

// 기본 관리자 계정 (createAll 초기화 시 자동 생성)
const DEFAULT_ADMIN = {
  username: "yw_bae@dukgu.com",
  password: "2468097531b!",
  name: "관리자",
  dept: "경영지원",
  role: "admin"
};

// 사용자 데이터 열 매핑 (⚙️ 통합 설정 시트 I~M열)
const USER_COLS = {
  USERNAME: 9,   // I열: 아이디 (다우오피스 이메일)
  PASSHASH: 10,  // J열: 비밀번호 해시 (SHA-256 + salt)
  NAME: 11,      // K열: 성함
  DEPT: 12,      // L열: 부서
  ROLE: 13       // M열: 역할 (admin/manager/staff)
  // 담당 업장은 기존 권한범위 드롭다운 구조 활용하여 별도 관리
};
