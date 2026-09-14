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
const CURRENT_SCHEMA_VERSION = 19; // [v12] 서식/검증 행 범위 확장(TASK-009) + [v13] 단위 목록 CASE 삭제 + [v14] 음수 재고 수식/서식(TASK-011) + [v15] 단위 '조', '줄' 추가 + [v16] 서식 범위 동적 확장(TASK-016) + [v17] 거래처 마스터 신설(TASK-017) + [v18] 사용유무 손상 복구 + 거래처 드롭다운 소스 열 정리 + [v19] 변경이력 9열(변경사유·경로) 확장(TASK-024)

// [v8.0] 성능 최적화용 캐시 키 & TTL 상수
const CACHE_KEYS = {
  ITEM_MAP: 'ITEM_CODE_MAP',
  VENDOR_LIST: 'VENDOR_LIST', // [TASK-018] 거래처 목록
  SHOP_LIST: 'SHOP_LIST',     // [TASK-027] 활성 업장 목록 — 접근 검사·거래ID 접두사도 이 캐시를 읽는다
  DASHBOARD: 'DASHBOARD_DATA', // [TASK-027] 대시보드 KPI/알림 (마스터 4,300행 스캔 결과)
  CLOSING_CUTOFF_NONE: 'CLOSING_CUTOFF_NONE', // [TASK-027] "마감 이력 없음" 부정 캐시 — 통합 시트 풀 스캔 억제
  ITEM_INDEX: 'ITEM_INDEX' // [TASK-025] 품목 관리 화면의 검색·페이징 인덱스 (사람이 고치는 필드만, 미사용 포함)
};
// [TASK-027] 기본 TTL을 60초 → 10분으로 올렸다. 캐시된 데이터(마스터·업장·시즌·기초데이터·거래처·대시보드)를
//   바꾸는 모든 경로가 CacheManager.invalidateAll()을 부르므로(웹앱 API·시트 onEdit·통합 갱신·마이그레이션)
//   TTL은 "무효화가 빠졌을 때의 상한"일 뿐이다. 60초일 때는 사용자가 흩어져 접속하는 실제 운영에서
//   탭을 열 때마다 콜드 미스(마스터 4,300행 재조회, 3~5초)가 나는 것이 느림의 큰 원인이었다.
const TTL = {
  DEFAULT: 600,
  ITEM_MAP: 600 // 품목 마스터 인덱스 (10분)
};
// [TASK-027] invalidateAll이 지우는 키 목록(청크 접미사는 CacheManager가 붙인다).
//   역할별 접미사 키(CONFIG_DATA_admin 등)는 여기서 풀어 둔다. 새 캐시 키를 추가하면 반드시 여기에도 넣는다 —
//   빠지면 등록/수정 직후에도 TTL(10분)이 끝날 때까지 낡은 값이 화면에 남는다.
const CACHE_INVALIDATE_KEYS = [
  'ITEM_MASTER_DATA', 'ITEM_MASTER_DATA_ALL', 'ITEM_CODES',
  'CONFIG_DATA_admin', 'CONFIG_DATA_manager', 'CONFIG_DATA_staff',
  'BASE_DATA_admin', 'BASE_DATA_manager', 'BASE_DATA_staff',
  CACHE_KEYS.SHOP_LIST, CACHE_KEYS.VENDOR_LIST, CACHE_KEYS.ITEM_MAP, CACHE_KEYS.DASHBOARD,
  CACHE_KEYS.ITEM_INDEX
];

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
// [TASK-027] 최근 입출고 조회가 시트 끝에서 읽는 여유 행 수 — 빈 행이 섞여 있어도 한 블록으로 끝나게 한다
const RECENT_TX_READ_MARGIN = 20;

// [TASK-019] 웹앱 입출고 일괄 업로드(CSV/XLSX)
//   BULK_TX_CHUNK_SIZE — 서버가 한 번의 호출에서 저장하는 최대 행 수.
//     GAS 실행 제한(6분) 안에서 FIFO 분할 계산 + 1회 setValues가 넉넉히 끝나는 크기다.
//     클라이언트는 Index.html 템플릿이 이 값을 그대로 주입받아 같은 크기로 나눠 보낸다(양쪽이 어긋나지 않게 한 곳에만 둔다).
//   BULK_TX_MAX_ROWS   — 파일 1개에서 받아들이는 최대 행 수(사전 검증 호출의 상한).
const BULK_TX_CHUNK_SIZE = 100;
const BULK_TX_MAX_ROWS = 2000;

// [TASK-025] 웹앱 품목 관리 탭
//   품목 마스터는 4,300행 규모라 화면에 통째로 내리지 않는다(2MB 전송 2.6초 — TASK-027 실측). 서버가 인덱스(ITEM_INDEX 캐시)에서
//   검색·필터·정렬을 끝내고 한 페이지만 돌려준다(queryItems). 값은 Index.html이 getItemUiConfigJson()으로 주입해 양쪽이 같은 수를 본다.
const ITEM_QUERY_PAGE_SIZE = 25;      // 한 페이지 행 수 — 거래처 화면의 "25건 더 보기"와 같은 보폭
const ITEM_QUERY_MAX_PAGE_SIZE = 100; // 클라이언트가 요청할 수 있는 상한
const ITEM_CSV_MAX_ROWS = 1000;       // CSV 일괄 등록 1회 상한 — 검증·백업·서식·재계산이 GAS 실행 제한(6분) 안에 끝나는 크기

// ═══════════════════════════════════════════════════════════════════
//  [TASK-023] 시스템 작업 안내문 SSOT
//
//  스프레드시트 「🏨 관리자 도구」 대화상자(AdminActionDialog.html / UploadCsv.html)와
//  웹앱 안내 모달(JS_UI.html openForceRefreshModal · JS_Config.html doSystemCommand)이
//  같은 제목·설명·주의사항을 쓰도록 여기 한 곳에만 둔다. 문구를 고칠 때 다른 파일을 손대지 않는다.
//
//    scope        'both' | 'webapp' | 'sheet' — 어느 화면에서 노출되는가 (sheet 전용은 웹앱 버튼을 만들지 않는다)
//    requiresAdmin 웹앱에서 admin만 실행 가능한가 (forceRefresh는 staff/manager도 누른다)
//    btnClass     'btn-primary' | 'btn-danger' — 되돌릴 수 없는 작업만 danger (Docs/UIGuidelines.md §2)
//  본문에 이모지를 넣지 않는다 (§3). 실행 결과 문구는 각 본체 함수가 돌려준다.
// ═══════════════════════════════════════════════════════════════════
const SYSTEM_ACTIONS = {
  forceRefresh: {
    id: "forceRefresh",
    title: "시트 동기화",
    desc: "서버 캐시를 비우고 구글 시트에서 최신 데이터를 다시 읽어옵니다.",
    bullets: [
      "구글 시트의 원본 데이터는 변경되지 않습니다.",
      "최신 데이터를 다시 불러오므로 수 초 정도 소요될 수 있습니다."
    ],
    btnText: "동기화",
    btnClass: "btn-primary",
    requiresAdmin: false,
    scope: "webapp"
  },
  refreshDashboard: {
    id: "refreshDashboard",
    title: "통합 갱신",
    desc: "모든 업장 시트의 입출고를 통합 기록장으로 취합하고, 전 품목의 현재고·일평균·FIFO 평가액 재계산 및 대시보드를 갱신합니다.",
    bullets: [
      "품목 및 거래 내역 수에 따라 최대 수 분이 소요될 수 있습니다.",
      "실행 중에는 다른 사용자의 저장 작업이 잠시 대기할 수 있습니다.",
      "방금 입력한 내역을 즉시 반영해야 할 때만 사용하세요."
    ],
    btnText: "갱신",
    btnClass: "btn-primary",
    requiresAdmin: true,
    scope: "both"
  },
  incrementalSync: {
    id: "incrementalSync",
    title: "신규 내역 취합",
    desc: "각 업장 시트에 새롭게 입력된 최신 거래 내역만 메인으로 빠르게 취합합니다.",
    bullets: [
      "전체 재계산 대신 최신 변동 내역 위주로 신속하게 동기화합니다.",
      "수 초 내외로 빠르게 완료됩니다."
    ],
    btnText: "취합 시작",
    btnClass: "btn-primary",
    requiresAdmin: true,
    scope: "webapp"
  },
  syncPermissions: {
    id: "syncPermissions",
    title: "권한 재동기화",
    desc: "시스템 시트(품목 마스터, 통합 기록장 등)의 보호 규칙과 초기재고 보호 범위를 재설정합니다.",
    bullets: [
      "시트 데이터의 셀 값은 변경되지 않습니다.",
      "웹앱 로그인 계정 권한은 변경되지 않습니다(계정 관리 화면에서 관리)."
    ],
    btnText: "동기화",
    btnClass: "btn-primary",
    requiresAdmin: true,
    scope: "both"
  },
  validateSeason: {
    id: "validateSeason",
    title: "시즌 설정 검증",
    desc: "시즌설정 시트의 날짜 형식, 시작일/종료일 역전 여부, 기간 중복, 가중치 배수 값을 검사합니다.",
    bullets: [
      "설정값 검사만 수행하며 시트 데이터를 수정하지 않습니다.",
      "검증 결과와 오류 상세 내역을 즉시 표시합니다."
    ],
    btnText: "검증",
    btnClass: "btn-primary",
    requiresAdmin: true,
    scope: "both"
  },
  backupCSV: {
    id: "backupCSV",
    title: "CSV 백업 실행",
    desc: "통합 입출고 기록장과 품목 마스터 데이터를 CSV 파일로 추출하여 백업 폴더에 저장합니다.",
    bullets: [
      "현재 시트의 데이터는 변경되지 않습니다.",
      "실행할 때마다 구글 드라이브 '시스템_데이터_백업' 폴더에 새 파일이 생성됩니다."
    ],
    btnText: "백업 시작",
    btnClass: "btn-primary",
    requiresAdmin: true,
    scope: "both"
  },
  repairFormatting: {
    id: "repairFormatting",
    title: "시트 서식/검증 복구",
    desc: "마스터·기록장·템플릿·업장 시트의 서식, 드롭다운 데이터 검증, 시트 보호 범위를 현재 행 수에 맞춰 복구합니다.",
    bullets: [
      "셀의 데이터 값은 건드리지 않으므로 데이터 유실 위험이 없습니다.",
      "품목 마스터 거래처코드 엄격 검증 및 숨김 보조 열도 함께 재적용됩니다.",
      "시트 크기에 따라 1~2분 정도 소요될 수 있습니다."
    ],
    btnText: "복구 실행",
    btnClass: "btn-primary",
    requiresAdmin: true,
    scope: "sheet"
  },
  assignVendorCodes: {
    id: "assignVendorCodes",
    title: "거래처코드 일괄 부여",
    desc: "거래처관리 시트에서 거래처코드(A열)가 비어 있는 행을 찾아 VND-### 형태의 고유 코드를 순차 부여합니다.",
    bullets: [
      "이미 코드가 있는 행은 건드리지 않습니다.",
      "부여된 코드는 품목 마스터가 영구 참조하므로 이후 변경하거나 삭제할 수 없습니다."
    ],
    btnText: "코드 부여",
    btnClass: "btn-danger",
    requiresAdmin: true,
    scope: "sheet"
  },
  // [TASK-025] 시트 대화상자(UploadCsv.html)와 웹앱 품목 관리 탭이 같은 안내문을 쓴다 — scope both.
  //   웹앱에서는 구매팀(manager)도 실행하므로 requiresAdmin=false. 실행은 runSystemCommand가 아니라
  //   uploadItemMasterCSV를 직접 부른다(사전 검증 dryRun → 확인 → 등록).
  uploadItemCsv: {
    id: "uploadItemCsv",
    title: "품목마스터 CSV 업로드",
    desc: "CSV 파일을 업로드하여 품목 마스터에 새로운 품목을 일괄 등록합니다.",
    bullets: [
      "이미 존재하는 품목코드는 건너뛰고 신규 코드만 추가 등록합니다.",
      "저장 전에 파일 전체를 먼저 검증하며, 오류가 한 행이라도 있으면 아무것도 등록하지 않습니다.",
      "등록 직전 품목 마스터 스냅샷을 구글 드라이브 백업 폴더에 자동 저장합니다."
    ],
    btnText: "업로드 실행",
    btnClass: "btn-primary",
    requiresAdmin: false,
    scope: "both"
  }
};

/** 작업 정의 1건. 모르는 id면 null — 호출부가 "알 수 없는 작업"으로 처리한다. */
function getSystemAction(id) {
  return Object.prototype.hasOwnProperty.call(SYSTEM_ACTIONS, id) ? SYSTEM_ACTIONS[id] : null;
}

/**
 * 웹앱 Index.html 템플릿이 `var SYSTEM_ACTIONS = <?!= getSystemActionsJson() ?>;`로 주입한다.
 * `<` 를 이스케이프해 문구에 "</script>"가 들어가도 스크립트 블록이 깨지지 않게 한다.
 */
function getSystemActionsJson() {
  return JSON.stringify(SYSTEM_ACTIONS).replace(/</g, "\u003c");
}

/**
 * [TASK-025] 웹앱 품목 관리 탭이 쓰는 상수 묶음 — Index.html이 `var ITEM_UI = <?!= getItemUiConfigJson() ?>;`로 주입한다.
 *   필드 라벨(diff 표·이력), 숫자 기본값(플레이스홀더), 과세/사용유무 목록, 페이지 크기, CSV 상한을
 *   서버와 같은 값으로 보게 해서 화면과 검증이 어긋나지 않게 한다.
 */
function getItemUiConfigJson() {
  return JSON.stringify({
    fieldLabels: MASTER_FIELD_LABELS,
    numericDefaults: ITEM_NUMERIC_DEFAULTS,
    taxTypes: ITEM_TAX_TYPES,
    usageStatuses: ITEM_USAGE_STATUSES,
    pageSize: ITEM_QUERY_PAGE_SIZE,
    csvMaxRows: ITEM_CSV_MAX_ROWS
  }).replace(/</g, "\u003c");
}

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

// [TASK-024] 품목 마스터의 "사람이 고치는" 필드 — 웹앱 API(updateItem)와 시트 onEdit이 같은 목록·같은 이름으로 이력을 남긴다.
//   키는 API 필드명, 값은 MASTER_COLS 인덱스(0-based). 수식·계산 열(H·I·N~Q·V~X)은 여기 없다 — 사람이 고칠 수 없고 이력도 남기지 않는다.
const MASTER_FIELD_COLS = {
  name: MASTER_COLS.NAME, category: MASTER_COLS.CATEGORY, grade: MASTER_COLS.GRADE, unit: MASTER_COLS.UNIT,
  initStock: MASTER_COLS.INIT_STOCK, leadTime: MASTER_COLS.LEAD_TIME, safetyDays: MASTER_COLS.SAFETY_DAYS,
  targetDays: MASTER_COLS.TARGET_DAYS, vendorCode: MASTER_COLS.VENDOR_CODE, taxType: MASTER_COLS.TAX_TYPE,
  unitPrice: MASTER_COLS.UNIT_PRICE, usageStatus: MASTER_COLS.USAGE_STATUS
};
// 변경이력 E열(변경필드)에 적는 이름. 화면 라벨과도 같다.
const MASTER_FIELD_LABELS = {
  name: "품목명", category: "카테고리", grade: "규격", unit: "단위",
  initStock: "초기재고", leadTime: "리드타임", safetyDays: "안전재고일수", targetDays: "목표유지일수",
  vendorCode: "거래처", taxType: "과세구분", unitPrice: "매입단가", usageStatus: "사용유무"
};
// [TASK-024] 품목 필드 도메인 — 시트 드롭다운(SheetBuilder)과 API 검증(ItemService)이 같은 목록을 본다.
//   카테고리·단위는 📂 기초데이터, 거래처코드는 🤝 거래처관리에서 읽으므로 여기 없다.
const ITEM_TAX_TYPES = ["과세", "비과세"];
const ITEM_USAGE_STATUSES = ["사용", "미사용"];
const ITEM_NUMERIC_DEFAULTS = { initStock: 0, unitPrice: 0, leadTime: 3, safetyDays: 5, targetDays: 30 }; // 빈 값일 때
const CHANGELOG_NEW_ITEM_FIELD = "신규 등록"; // 등록 이력의 E열 값 — 필드가 아니라 사건이다

// [TASK-024] 📋 변경이력 시트 열 구조 — 9열 (v19에서 H 변경사유, I 경로 추가)
const CHANGELOG_COLS = { DATE: 0, USER: 1, CODE: 2, NAME: 3, FIELD: 4, OLD: 5, NEW: 6, REASON: 7, ROUTE: 8 };
const CHANGELOG_COL_COUNT = 9;
const CHANGELOG_HEADERS = ["변경일시", "변경자", "품목코드", "품목명", "변경필드", "변경 전", "변경 후", "변경사유", "경로"];
// I열(경로) 값 — 어느 문으로 들어온 변경인지. 감사 시 "웹앱 밖에서 바뀐 것"을 걸러내는 기준이 된다.
const CHANGELOG_ROUTES = { WEBAPP: "웹앱", CSV: "CSV", SHEET: "시트편집" };

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
