# TASK-019: 기타 편의성 및 업장 갱신 (Miscellaneous Updates)

## Objective
1. 품목마스터 S열 거래처코드 유효성 검사(엄격한 일치) 적용 점검 및 보완
2. 웹앱 내 '시즌관리' 명칭을 '시즌설정'으로 모두 통일
3. 웹앱 입출고 기록에 일괄 업로드(CSV 등) 기능 추가 및 사용 전 안내문 표시
4. 구글 시트 커스텀 메뉴(관리자 도구) 항목 실행 전 확인 모달(안내문) 추가
5. 기존 업장 시트 삭제 및 신규 전체 업장 목록(23개)으로 갱신

## Confirmed Facts
- [진입점 호출 경로 증빙: src/Index.html:92 (showTab('season')) -> src/Index.html:337 (tab-season)] 웹앱 시즌 관리 UI 진입점.
- [진입점 호출 경로 증빙: src/Index.html:85 (showTab('transactions')) -> src/Index.html:200 (tab-transactions)] 웹앱 입출고 기록 UI 진입점.
- [진입점 호출 경로 증빙: src/Code.gs:12 (onOpen)] 구글 시트 상단 "🏨 관리자 도구" 메뉴. `refreshDashboard`, `syncPermissions`, `validateSeasonSettings`, `backupCSV`, `openCsvUploadModal`, `repairAllSheetFormatting`, `assignMissingVendorCodes` 바인딩 됨.
- `SheetBuilder.gs`의 `applyItemMasterFormatting` 164줄에서 거래처코드(S열) 데이터 유효성 검증을 이미 `setAllowInvalid(false)`로 설정하고 있음. (코드상에는 존재하나, 실제 시트 서식에 소급 적용이 안 되었을 가능성).

## Hypotheses
- 입출고 기록 업로드는 기존 `UploadCsv.html` 구조를 참조하여, 웹앱(`JS_Tx.html`)에 클라이언트 측 파일 파싱(e.g., FileReader) 및 서버(`TxService.gs`) 일괄 전송 로직을 추가하여 구현할 수 있다.
- 기존 업장 시트 삭제 및 새 23개 업장 생성은 1회성 마이그레이션 스크립트를 통해 `SHEET_SHOPS`를 비우고 신규 목록으로 대체한 뒤 `generateNewShops()`를 재호출하면 완수할 수 있다.

## Business Context
- 거래처코드의 정확한 참조를 강제하여 발주 및 정산 데이터의 무결성 확보.
- 일관된 명칭('시즌설정') 사용으로 시스템과 문서 간 혼선 방지.
- 관리자 기능 실수 클릭으로 인한 구글 쿼터 소진 및 무거운 스크립트 실행 방지.
- 조직 개편에 따른 전체 23개 부서/업장의 재고 분리 관리 체계 수립.

## Current System
- 품목 마스터의 S열 데이터 유효성 검사는 스크립트(`SheetBuilder.gs`) 상으론 엄격히 구현되어 있으나 일부 사용자 시트에 적용되지 않은 상태일 수 있음.
- '시즌설정' 시트를 웹앱에서는 '시즌 관리'로 혼용하여 부르고 있음.
- 입출고 기록은 웹앱에서 개별 건 단위로 폼 입력을 해야 함.
- 시트 상단의 커스텀 메뉴(통합 갱신 등) 클릭 시 즉시 스크립트가 실행됨 (의사 확인 과정 부재).
- 4개의 초기 업장(맛다락, 술다락, 남탕, 여탕)이 하드코딩되어 초기화됨.

## Root Cause / Diagnostic Logic
해당 없음

## Requirements
### Functional
- [ ] 품목 마스터 S열 드롭다운 텍스트 직접 입력 시 차단되도록 유효성 검사를 시트에 재반영(Task 완료 후 `repairAllSheetFormatting` 실행 요망).
- [ ] `Index.html` 및 관련 JS에서 "시즌 관리"라는 텍스트를 "시즌 설정"으로 일괄 수정.
- [ ] `Index.html` 입출고 기록 탭에 "일괄 업로드" 버튼 추가. 버튼 클릭 시 안내문 모달 표시 후, "시작(업로드)"을 누르면 CSV 파일 선택창 호출.
- [ ] 파일 파싱 결과를 순회하여 입출고 데이터를 일괄 저장하는 `uploadTransactions(data)` 백엔드 API를 `TxService.gs` 등에 신설.
- [ ] `Code.gs`의 `onOpen`에 등록된 관리자 메뉴 함수들 최상단에 `SpreadsheetApp.getUi().alert('...', ui.ButtonSet.YES_NO)`로 사용자 확인 모달 로직 추가.
- [ ] `Migration.gs`에 일회성 스크립트(`migrateShops_TASK019`)를 작성하여 `SHEET_SHOPS` 목록을 신규 23개 업장으로 대체, 기존 업장 시트 삭제 및 `generateNewShops()` 호출.

### Non-Functional
- [ ] 일괄 업로드 처리 시 `StockEngine.gs`의 기존 재고 갱신 API 흐름 및 유효성 검사를 동일하게 타도록 구현.

## Constraints
- 입출고 업로드 시 대량 데이터 인서트로 인한 구글 앱스 스크립트 Time-Out(6분)을 방지하기 위해 파일 파싱 후 100~200건 단위 청크 처리 혹은 경고 로직 도입 필요.
- 기존 업장 시트 삭제 시 해당 시트 안의 과거 데이터는 시트와 함께 소멸하므로, 사전 고지 및 ` backupCSV` 권장.

## Files to Inspect
- `src/Code.gs` (관리자 도구 핸들러)
- `src/Index.html` (시즌 관리 UI, 입출고 탭 UI)
- `src/JS_Tx.html` (업로드 프론트엔드 로직 추가)
- `src/TxService.gs` (업로드 백엔드 엔드포인트)
- `src/SheetBuilder.gs` (기존 업장 목록 확인용)

## Files to Modify
- `src/Code.gs`: 각 관리자 도구 핸들러 함수 최상단에 `ui.alert` 로직 추가.
- `src/Index.html`: '시즌 관리' 텍스트 변경 및 입출고 탭 상단 액션바에 일괄 업로드 버튼 추가.
- `src/JS_Tx.html`: 일괄 업로드 버튼 클릭 시 사용법 모달 노출 및 파일 업로드(FileReader) 처리 기능 추가.
- `src/TxService.gs`: 대량 입출고 처리 서버 함수(e.g., `uploadBulkTransactions`) 추가.
- `src/Migration.gs`: 업장 목록 교체용 마이그레이션 스크립트 작성.

## Files to Create
없음

## Implementation Plan
1. **유효성 검사**: 코드에는 반영되어 있으므로 Claude Code는 추가 수정 없이 마이그레이션/배포 후 관리자에게 `repairAllSheetFormatting()` 실행을 지시한다.
2. **명칭 통일**: `Index.html` 내 "시즌 관리" 문자열 치환.
3. **입출고 업로드**: 
   - `JS_Tx.html`에 안내문 모달 HTML을 동적으로 삽입하거나 `Index.html` 모달 컨테이너를 재활용하여 사용법 렌더링.
   - 엑셀/CSV 파서(이미 삽입된 `xlsx.full.min.js`)를 이용하여 클라이언트에서 배열 변환 후 `google.script.run` 호출.
4. **메뉴 안내문**: `Code.gs`의 함수들(`refreshDashboard`, `syncPermissions` 등)을 감싸서 `ui.alert("... 실행하시겠습니까?", ui.ButtonSet.YES_NO)` 조건 분기 추가.
5. **업장 갱신**: `Migration.gs` 내 `migrateShops_TASK019()` 함수 작성. 신규 23개 업장의 '분류'와 '태그'는 적당한 값으로 임의 부여하되 중복이 없도록 한다. 기존 업장 시트는 `SpreadsheetApp.getActive().deleteSheet()`로 제거.

## Migration Plan
1. DEV/PROD 배포 직후 `Migration.gs`의 `migrateShops_TASK019()`를 수동 실행.
2. 기존 운영 데이터 보호를 위해 실행 전 백업 수행 필수.

## Test Plan
### Unit Test
- `uploadBulkTransactions` 함수가 빈 필수 필드나 유효하지 않은 품목을 거부하는지 mock 시트 테스트.
### E2E Test (Playwright)
- 웹앱 로그인 후 입출고 탭 진입 -> 일괄 업로드 클릭 -> 안내 모달 확인 -> 취소 / 업로드 테스트.
- 시트 환경에서 관리자 도구 클릭 시 취소 버튼 동작 확인.

## Regression Risk
- `Migration` 스크립의 기존 업장 시트(맛다락 등) 강제 삭제 시 오류 발생 가능성(예: 존재하지 않거나 보호된 시트). `try-catch`로 안전하게 무시/삭제 처리 필요.
- 클라이언트 측 CSV 파일 파싱 중 인코딩 문제(한글 깨짐). FileReader 설정 유의 요망.

## Acceptance Criteria
- 품목 마스터의 거래처코드 유효성 검사 엄격 작동 (기존 코드 확인 및 배포 후 포맷 복구).
- 웹앱 메뉴와 타이틀에서 '시즌설정' 명칭 사용.
- 입출고 일괄 업로드 기능이 정상 동작하며, 실행 전 안내문이 노출됨.
- 관리자 도구 실행 시 사전 확인 알림창이 나타남.
- 지정된 23개 업장 시트가 모두 생성되어 있음.

## Human Approval Required
- [ ] 업장 목록 갱신을 위해 기존 업장 시트가 영구 삭제됩니다. 진행 전 반드시 `CSV 백업`을 수행하고 시트를 수동 롤백할 수 있는 스냅샷을 챙겨주세요.
- [ ] 신규 업장들의 '분류' 및 '거래ID 태그'는 프롬프트에 명시되지 않아 Claude Code가 임의로 자동 생성합니다. 마이그레이션 후 업장관리 시트에서 태그 등을 원하시는 대로 수정하실 수 있습니다 (최초 입출고 기록 전).

## Deployment Notes
- 배포 후 시트의 "관리자 도구 > 🎨 시트 서식/검증 복구"를 1회 실행하여 거래처코드 유효성 검사를 전체 행에 강제 적용해야 합니다.
- 배포 후 Apps Script 편집기에서 `migrateShops_TASK019()` 함수를 수동으로 1회 실행하여 업장 시트들을 개편해야 합니다.

## Rollback Plan
- 시트 구조 파손 시 백업된 CSV 스냅샷과 `restore` 기능을 통해 원복 가능.
- 웹앱/구글스크립트 코드는 Git 이전 커밋으로 Revert.

## Final Report

### 명세에 대한 피드백 (구현 전 검토)

**1. 23개 업장 목록이 명세 어디에도 없었다 (차단 항목 — 사용자 확인으로 해소)**
5번 항목은 "신규 23개 업장 시트 생성"인데 업장명 목록이 Task 문서·레포 어디에도 없었다.
업장명은 시트 이름이자 거래ID 접두사의 근거이고 `생성완료` 후에는 변경이 차단되므로 임의로 지을 수 없어
착수 전 사용자에게 물어 아래 23개를 받았다. 분류·태그는 명세대로 임의 배정했다(중복 없음, `TASK019_NEW_SHOPS`).

| 분류 | 업장 (태그) |
|------|-------------|
| 관리 | 관리팀(ADM) · 기전실(ENG) · 영선(MNT) |
| 구매 | 구매팀(PUR) |
| 판촉 | 예약홍보팀(MKT) |
| 호텔 | 호텔프론트(HFD) · 호텔객실(HRM) · 호텔 세탁실(HLD) |
| 콘도 | 콘도프론트(CFD) · 콘도객실(CRM) · 콘도 세탁실(CLD) |
| 식음 | 식음료(FNB) · 로봇커피(RBC) · 달콤덕구(DKD) · 카페테리아(CAF) · 맛다락(TX) · 술다락(AX) |
| 조리 | 조리팀(KIT) · 직원식당(STF) |
| 스파월드 | 매표소(TKT) · 가족실(FMB) · 남탕(MB) · 여탕(WB) |

기존 4개 업장의 태그(TX·AX·MB·WB)는 그대로 두어 거래ID 체계가 이어지게 했다.
분류는 🏢 업장관리 A열 드롭다운(엄격 검증) 목록 안의 값만 썼다 — 목록 밖 값은 `setValues` 자체가 거부된다.

**2. "핸들러 함수 최상단에 ui.alert"는 그대로 따르면 자동 실행 경로가 깨진다**
`refreshDashboard(true)`는 자정 트리거·웹앱(`runSystemCommand`)·`createAll`이 대화상자 없이 부른다.
`backupToCSV()`는 `runMigrations()`와 웹앱이 부른다. 본체 최상단에 확인창을 넣으면 그 경로들이 멈춘다.
확인창은 **메뉴 전용 래퍼**(`menuRefreshDashboard` 등 7개, `Code.gs`)에만 두고 `onOpen`이 래퍼를 바인딩한다.
본체 함수의 시그니처·동작은 그대로다. (테스트가 "NO면 본체 미호출 / YES면 1회 호출 / 직접 호출엔 확인창 없음"을 못 박는다)

**3. 일괄 업로드가 "같은 검증·재고 흐름"을 타려면 `addTransaction`을 쪼개야 했다**
검증·FIFO 분할·행 생성·저장이 한 함수 안에 있어 복제하지 않고는 재사용할 수 없었다.
`_normalizeTxInput` / `_validateTxAgainstMaster` / `_loadItemInfoMap` / `_getShopTxPrefix` / `_buildTxRows` / `_appendTxRows`로
분리하고 `addTransaction`이 그것을 쓰게 했다. 검증 순서·오류 문구·반환 형태는 분리 전과 동일하다
(기존 `fifo-lot-splitting` 7건 + 회귀 테스트로 확인). 규칙이 두 벌로 갈라질 길을 남기지 않았다.

**4. 청크 저장은 "앞 청크는 저장되고 뒤 청크는 실패"를 낳는다 — 사전 검증을 앞세웠다**
명세의 100~200건 청크 처리를 그대로 하면 3번째 청크의 오류가 앞 200건이 저장된 뒤에 드러난다.
`uploadBulkTransactions(…, {dryRun:true})`로 **파일 전체를 먼저 검증**(쓰기 없음, 최대 2,000행)하고,
오류가 하나라도 있으면 행 번호별 오류를 보여 주고 아무것도 저장하지 않는다. 통과했을 때만 100건씩 저장한다.
청크 안도 all-or-nothing이다.

**5. 행마다 마감 기준일을 조회하면 마감 이력이 없는 환경에서 통합 시트를 행 수만큼 풀 스캔한다**
`validateNotClosedMonth`는 `getLatestClosingCutoff`를 매번 부르고, 이력이 없으면(null) 캐시되지 않아 매번 시트를 훑는다.
비교부를 `evaluateClosingCutoff(dateText, cutoff)`로 분리해(`Archive.gs`) 일괄 업로드는 기준일을 1회만 조회한다.
`validateNotClosedMonth`의 인자 수(≤2)를 고정한 기존 가드레일 테스트(역할 예외 경로 방지)는 그대로 통과한다.

**6. 같은 파일 안의 입고→출고 순서가 FIFO에 반영돼야 한다**
행마다 시트를 다시 읽으면 100행 × 풀 스캔이다. `_calculateFifoOutboundSplitsFromRows(rows, …)`를 분리해
시트를 1회 읽고 그 청크에서 이미 만든 행(pending)을 이어 붙여 계산한다. 단건 등록을 순서대로 100번 한 것과 결과가 같다(테스트).

**7. 한글 CSV 인코딩** — `FileReader.readAsText(UTF-8)`만 쓰면 엑셀 저장본(EUC-KR)이 깨진다.
`ArrayBuffer`로 읽어 `TextDecoder('utf-8',{fatal:true})`가 실패하면 `euc-kr`로 다시 디코딩한다. XLSX는 SheetJS `cellDates`로 날짜 셀을 받는다.

**8. 업장 개편은 `MIGRATIONS` 레지스트리에 넣지 않았다**
스키마 마이그레이션은 데이터를 보존하는 멱등 작업이고 `runMigrations()`가 버전 순서로 자동 실행한다.
이것은 시트를 **영구 삭제**하는 운영 작업이라 그 흐름에 끼어서는 안 된다. 편집기에서 직접 고르는 독립 함수로 두고
YES/NO 확인창(삭제될 시트 목록 표시)을 거친다. 순서는 **되돌릴 수 있는 단계(업장관리 갱신)를 되돌릴 수 없는 단계(시트 삭제)보다 먼저** —
업장관리 쓰기가 실패하면 이전 목록을 복원하고 시트는 하나도 지우지 않는다. 시스템 시트는 업장관리에 이름이 섞여 있어도 지우지 않는다.
끝에 `refreshDashboard(true)`를 불러 통합 기록장에서 사라진 업장의 행을 걷어내고 재고를 재계산한다 — 다음 자정까지 유령 행이 남지 않게.

**9. 항목 1(거래처코드 S열 엄격 검증)은 코드 변경이 없다 — 명세의 판단이 맞다**
`applyItemMasterFormatting`이 이미 `setAllowInvalid(false)`이고 `reapplyAllSheetFormatting` 경로에 포함돼 있다.
배포 후 `🎨 시트 서식/검증 복구` 1회 실행이 필요하며, 이 사실을 해당 메뉴의 확인 안내문에도 적어 두었다.

**10. `Files to Modify` 밖의 수정**
- `src/Config.gs`: `BULK_TX_CHUNK_SIZE`(100) / `BULK_TX_MAX_ROWS`(2000) — "상수 하드코딩 금지" 규칙에 따라 Config로. `Index.html`이 템플릿으로 주입해 클라이언트·서버가 같은 값을 쓴다.
- `src/Archive.gs`: 5번의 `evaluateClosingCutoff` 분리(동작 불변).
- 명칭 통일에서 `<h3>시즌 설정</h3>` 카드 제목이 `<h2>📅 시즌 설정</h2>`와 겹치게 되어 카드 제목은 `시즌 목록`으로 했다(업장 목록·거래처 목록과 같은 꼴).
- `tests/unit/lib/gas-sheet-mock.js`: `copyTo`/`setName`/고유 `getSheetId` 추가(템플릿 복사 재현). `migration-v16` 테스트의 메뉴 등록 검사를 래퍼 기준으로 갱신.

### 구현 내용

**`src/TxService.gs`**
- 공용 헬퍼 6개로 분리(위 3번). `addTransaction`은 결과·문구 동일.
- `uploadBulkTransactions(token, shopName, rows, {dryRun})` 신설 — 접근 제어는 `addTransaction`과 동일(`_canAccessShop`), 담당자=로그인 사용자,
  dryRun 상한 2,000 / 저장 상한 100, 행별 `{row, message}` 오류, 청크 1회 `setValues`, 락 실패는 `⏳` 문구(클라이언트 재시도 신호).
- `_calculateFifoOutboundSplits`는 시트를 읽어 `_calculateFifoOutboundSplitsFromRows`에 위임(계산 규칙 동일).

**`src/JS_Tx.html`** — `openBulkUploadModal`(안내문·양식 다운로드) → `startBulkFileSelect` → `onBulkFileSelected`(파싱·1차 검사·서버 dryRun)
→ `showBulkConfirm`(미리보기 20행) → `runBulkUpload`(진행률, 닫기 버튼 숨김, `⏳` 2회 재시도, 통신 오류는 중복 방지를 위해 재시도 없이 "N행부터 확인" 안내) → 완료 모달 + 목록 새로고침.
제목 행은 이름으로 열을 찾고(순서 무관) 없으면 고정 순서. 날짜는 `YYYY-MM-DD`·`2026/9/1`·`20260901`·엑셀 날짜 셀을 모두 정규화한다.

**`src/Index.html`** — 사이드바/탭 제목 `시즌 관리 → 시즌 설정`, 입출고 탭 액션바에 `📤 일괄 업로드` 버튼 + 숨김 `<input type=file id="txBulkFile">`, 청크 상수 주입 스크립틀릿.

**`src/Code.gs`** — `onOpen` 7개 항목 → `menu*` 래퍼. `_confirmAdminAction(title, guide)`가 YES/NO 확인창을 띄우고 NO면 토스트로 "실행하지 않았습니다".
안내문에는 무엇을 하는지·데이터를 바꾸는지·얼마나 걸리는지를 적었다.

**`src/Migration.gs`** — `TASK019_NEW_SHOPS`(23개), `migrateShops_TASK019()` + 헬퍼 4개(목록 검증 / 옛 시트 탐색(GID→이름, 시스템 시트 제외) / 업장관리 행 교체(회색 처리된 '삭제됨' 행 색 복원 포함) / UI 획득).

**`Docs/`** — BusinessRules 1-1(일괄 업로드 규칙)·13(업장 개편), Architecture(일괄 업로드 흐름), Deployment(배포 후 수동 절차 5번).

### 테스트

**단위 (`npm run test:unit`) — 16개 파일 전부 통과** (신규 3개)
- `bulk-transactions.test.js` 10건: dryRun 무쓰기·행별 오류 문구, all-or-nothing, 담당자/단가/1회 setValues/캐시 무효화, 같은 청크 입고→출고 FIFO(4@1000 + 3@1500), 초과출고, 청크/최대 상한, 마감 기간 행 거부 + 기준일 1회 조회, 접근 제어/락 실패, `addTransaction` 회귀.
- `admin-menu-confirm.test.js` 17건: 7개 항목 모두 래퍼 바인딩, NO→본체 미호출(YES_NO 확인창 1회), YES→본체 1회, 통합 갱신은 대화형 호출, 본체 직접 호출엔 확인창 없음.
- `migration-task019-shops.test.js` 16건: 목록 23개·중복 없음·분류 유효, 옛 시트(생성완료 4 + 삭제됨/숨김 1) GID로 삭제, 시스템 시트 보존, 23개 생성(헤더 복제·데이터 없음), 이름 겹침(맛다락) 새 시트 교체, 업장관리 23행 생성완료+GID 일치+담당자 비움, 백업 1회/통합 갱신 1회, 확인창 내용, 멱등, **NO→무변경**, **쓰기 실패→복원+무삭제**, 시스템 시트가 업장으로 적혀 있어도 무삭제.

**E2E (DEV, `npx playwright test`) — 통과**
- `transaction-bulk-upload.spec.js` 3건: 안내 모달 표시·취소, 오류 CSV → 검증 실패 모달("아무것도 저장하지 않았습니다", 행 번호), 정상 CSV 1건 → 확인 → 저장 완료 → 최근 내역에 비고·거래ID 표시.
- 회귀: `smoke.spec.js` 2건, `transaction.spec.js`(단건 등록) 1건 통과 — 리팩터링된 `addTransaction`과 템플릿 스크립틀릿이 실제 GAS 런타임에서 정상.

**수행하지 않은 것**
- `migrateShops_TASK019()`는 DEV에서도 실행하지 않았다 — 시트를 영구 삭제하는 작업이라 사람이 확인창을 보고 실행해야 한다(단위 테스트로 전 경로 검증).
- 시트 메뉴 확인창의 취소 동작은 Sheets UI라 Playwright로 닿지 않는다 — Human QA 항목(단위 테스트로 NO/YES 분기 검증).

### 배포 후 절차 (Docs/Deployment.md 주의사항 5번)
1. `🏨 관리자 도구 > 🎨 시트 서식/검증 복구` 1회 (거래처코드 S열 엄격 검증 소급 적용)
2. Apps Script 편집기에서 `migrateShops_TASK019()` 1회 — **실행 전 `파일 > 사본 만들기`로 스냅샷 확보**
3. 👤 사용자관리의 옛 업장명 배정을 웹앱 `계정 관리`에서 재배정

### Human Approval Required (재확인)
- [ ] 기존 업장 시트 5종 이하(맛다락·술다락·남탕·여탕 + 삭제됨 상태 업장)가 **영구 삭제**된다. 확인창에 삭제 목록이 표시된다.
- [ ] 위 표의 분류·태그는 임의 배정이다. 첫 입출고 기록 전 🏢 업장관리에서 수정 가능.
