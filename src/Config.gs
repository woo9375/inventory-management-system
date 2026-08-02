/**
 * 호텔덕구온천 구매 재고 관리 시스템 — 설정 모듈
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
