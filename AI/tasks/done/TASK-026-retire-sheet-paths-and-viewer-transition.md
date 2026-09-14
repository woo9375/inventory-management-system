# TASK-026: 시트 경로 제거 · 뷰어 전환 마무리 · 문서 갱신

## Objective
TASK-025(웹앱 품목 관리 탭)의 구축 및 Human QA 검증이 완료된 후, 구글 스프레드시트에 남아 있던 구 경로(메뉴 "📤 품목마스터 CSV 업로드", `UploadCsv.html`, 백엔드 수신 함수)와 사장 파일(`src/JS_Master.html`)을 완전히 제거한다. 구매팀 담당자를 스프레드시트 '편집자'에서 '뷰어'로 전환하는 운영 정책을 확정하고, 관련 보안·업무규칙·아키텍처 문서를 일괄 갱신한다.

---

## Confirmed Facts
실제 코드를 읽어 확인된 사실과 라인 번호는 다음과 같다:

1. **스프레드시트 메뉴 및 레거시 모달 (`src/Code.gs`, `src/UploadCsv.html`)**:
   - `src/Code.gs:20`: `onOpen()`에 `.addItem("📤 품목마스터 CSV 업로드", "menuOpenCsvUploadModal")` 등록.
   - `src/Code.gs:83`: `runAdminAction()` 내 `// uploadItemCsv는 UploadCsv.html이 processCsvUploadFromSheet를 직접 부른다` 예외 주석.
   - `src/Code.gs:98-99`: `menuOpenCsvUploadModal()` 래퍼 함수 존재.
   - `src/Code.gs:150-155`: `openCsvUploadModal()` 함수가 `HtmlService.createTemplateFromFile("UploadCsv")`로 모달 생성.
   - `src/UploadCsv.html`: 시트 전용 대화상자 마크업 및 스크립트 (102줄).

2. **백엔드 수신 함수 (`src/ItemService.gs`)**:
   - `src/ItemService.gs:511-556`: `processCsvUploadFromSheet(csvString)` 함수가 `UploadCsv.html`의 유일한 서버 수신처로 동작하며, `"SHEET_UI"` 토큰으로 `uploadItemMasterCSV`를 호출함.

3. **사장 파일 (`src/JS_Master.html`)**:
   - `src/JS_Master.html`: 412줄의 사장된 구 품목 마스터 스크립트. `Index.html`에 include되지 않고, 런타임에 실행되지 않으며 워터마크 주석(1~18줄)이 붙어 보존되어 있음. TASK-025에서 `src/JS_Items.html`이 신설되므로 완전 삭제 대상임.

4. **시스템 작업 정의 및 테스트 (`src/Config.gs`, `tests/unit/`)**:
   - `src/Config.gs:260-273`: `SYSTEM_ACTIONS.uploadItemCsv`의 `scope`가 TASK-025를 거쳐 `"both"`로 되어 있으며, 시트 경로 제거 시 `"webapp"`으로 최종 전환되어야 함.
   - `tests/unit/admin-menu-confirm.test.js:25`: `EXPECTED.menuOpenCsvUploadModal` 정의.
   - `tests/unit/admin-menu-confirm.test.js:92`: `onOpen이 7개 항목을 모두 래퍼(menu*)에 묶는다` 단언.
   - `tests/unit/system-commands-config.test.js:24-27`: `EXPECTED_SCOPE.uploadItemCsv` 단언.

5. **시트 보호 및 권한 설정 (`src/RBAC.gs`)**:
   - `src/RBAC.gs:470-520`: `_protectSystemSheets()` 및 시트 보호 로직 존재. 본 Task에서는 운영 전제(소유자 1인 편집, 실무자 뷰어)에 따라 시트 보호 설정을 수정하지 않고 그대로 유지함.

6. **문서 현황 (`Docs/`)**:
   - `Docs/Security.md`: 구매팀의 시트 뷰어 전환 정책 및 드라이브 공유 권한 가이드라인이 명시되어 있지 않음.
   - `Docs/BusinessRules.md:221, 243`: 품목 마스터 수정 경로 및 변경이력에 대한 설명에 시트 직접 편집과 구 메뉴가 혼재되어 있음.
   - `Docs/Architecture.md:14-15`: 사장 파일 표에 `JS_Master.html`과 `UploadCsv.html`이 기술되어 있음.
   - `.agents/skills/gas-tasks/SKILL.md:74-82`: 사장 파일 표에 `JS_Master.html` 및 `UploadCsv.html`이 기록되어 있음.
   - `.agents/rules/00_roles-and-workflow.md:43`: 시스템 물리적 경계 표에 시트 메뉴 기반 품목 CSV 업로드가 기재되어 있음.

7. **선행 조건**:
   - **TASK-025의 웹앱 '품목 관리' 탭 구현 및 DEV 환경 Human QA 통과 필수**. 웹앱 경로의 안정성이 입증되기 전에는 시트 경로를 제거해서는 안 됨.

---

## Hypotheses
- 시트 메뉴 "📤 품목마스터 CSV 업로드"와 `UploadCsv.html`, `processCsvUploadFromSheet`를 제거하더라도, `uploadItemMasterCSV` 본체 함수는 웹앱 `JS_Items.html`이 직접 호출하므로 일괄 등록 기능에 결손이 발생하지 않는다.
- 구매팀 담당자를 스프레드시트 '뷰어'로 전환하면 소유자 계정 외에는 시트 수정이 불가능해지므로 셀 오염 위험이 원천 차단된다.

---

## Business Context
- 시스템 소유자(개발자/관리자 본인)는 유지보수 목적 외에는 시트를 직접 편집하지 않는다.
- 구매팀 실무자는 스프레드시트에 **뷰어(Viewer)**로만 공유받아 조회만 가능하며, 신규 등록·수정·비활성화·CSV 업로드 등 모든 실무 업무는 웹앱 `manager` 계정으로 수행한다.
- 스프레드시트 쓰기 경로는 오직 "웹앱 API(`USER_DEPLOYING` 배포자 권한)"와 "시스템 소유자의 비상 유지보수 편집" 둘뿐으로 압축된다.

---

## Current System
- 스프레드시트 상단 메뉴 "🏨 관리자 도구"에 "📤 품목마스터 CSV 업로드" 항목이 노출되어 있으며, 클릭 시 `UploadCsv.html` 모달이 뜬다.
- `src/JS_Master.html` 사장 파일이 코드베이스에 남아 있어 유지보수 혼선을 유발한다.
- 구매팀 담당자가 시트 편집자로 공유되어 있을 경우 시트 내 오입력 및 수식 훼손 위험이 잔존한다.

---

## Root Cause / Diagnostic Logic
- 해당 없음 (레거시 경로 및 데드 코드 은퇴, 운영 프로세스 전환 작업).

---

## Requirements

### Functional
- [ ] **스프레드시트 커스텀 메뉴 및 래퍼 함수 제거 (`src/Code.gs`)**:
  - `onOpen()`에서 `.addItem("📤 품목마스터 CSV 업로드", "menuOpenCsvUploadModal")` 제거 (관리자 도구 메뉴 항목 7개 → 6개로 축소).
  - `menuOpenCsvUploadModal()` 래퍼 함수 제거.
  - `openCsvUploadModal()` 모달 호출 함수 제거.
  - `runAdminAction(actionId)` 내 83행 `// uploadItemCsv는 UploadCsv.html이 processCsvUploadFromSheet를 직접 부른다` 예외 주석 및 분기 정리.
- [ ] **시트 전용 백엔드 핸들러 제거 (`src/ItemService.gs`)**:
  - `processCsvUploadFromSheet(csvString)` 함수(511~556행) 완전 삭제.
  - `uploadItemMasterCSV(token, dataRows)`는 웹앱 호출을 위해 반드시 보존.
- [ ] **파일 영구 삭제**:
  - `src/UploadCsv.html` 파일 삭제.
  - `src/JS_Master.html` 파일 삭제.
- [ ] **시스템 액션 설정 갱신 (`src/Config.gs`)**:
  - `SYSTEM_ACTIONS.uploadItemCsv.scope`를 `"both"`에서 `"webapp"`으로 변경. (시트 메뉴에서는 더 이상 뜨지 않고, 웹앱 모달의 안내 문구 SSOT로만 동작).
- [ ] **시트 보호 설정 불변 유지**:
  - `src/RBAC.gs`의 `_protectSystemSheets()` 및 시트 보호 설정은 수정하지 않음 (운영 전제에 따름).
- [ ] **참조 잔재 0건 검증**:
  - 전체 소스코드(`src/`, `tests/`)를 대상으로 `UploadCsv`, `processCsvUploadFromSheet`, `menuOpenCsvUploadModal`, `openCsvUploadModal`, `JS_Master` 검색 시 잔재 0건 확인.
- [ ] **단위 테스트 갱신 (`tests/unit/`)**:
  - `tests/unit/admin-menu-confirm.test.js`:
    - `EXPECTED` 객체에서 `menuOpenCsvUploadModal` 제거.
    - `onOpen` 메뉴 항목 수 단언: 7개 → 6개로 갱신 (`check('onOpen이 6개 항목을 모두 래퍼(menu*)에 묶는다', ...)`).
    - 템플릿 검사(`UploadCsv`) 분기 제거.
  - `tests/unit/system-commands-config.test.js`:
    - `EXPECTED_SCOPE.uploadItemCsv` 단언을 `'webapp'`으로 갱신.
- [ ] **문서 일괄 갱신**:
  - `Docs/Security.md`:
    - 구글 드라이브 공유 정책 추가: "구매팀 담당자는 스프레드시트 '뷰어' 권한으로만 공유, 모든 마스터 편집은 웹앱 `manager` 계정 사용, '편집자가 권한을 변경하고 공유할 수 있습니다' 옵션 해제(OFF)".
  - `Docs/BusinessRules.md`:
    - 221행: "품목 마스터 수정 경로는 웹앱 '품목 관리' 탭으로 일원화. 시트는 뷰어 전용".
    - 243행: "품목 변경이력은 웹앱 및 CSV 경로에서 `_appendChangelog`로 100% 기록. 시트 직접 편집(`onEdit`) 이력은 소유자 비상 유지보수용 안전망으로만 작동".
  - `Docs/Architecture.md`:
    - "SPA에 포함되지 않는 `src/` 파일" 표에서 `JS_Master.html` 및 `UploadCsv.html` 항목 제거.
    - 아키텍처 다이어그램 및 시트 메뉴 구조도 갱신.
  - `.agents/skills/gas-tasks/SKILL.md`:
    - 사장 파일 확인 표(74~82행)에서 `JS_Master.html` 및 `UploadCsv.html` 항목 정리.
  - `.agents/rules/00_roles-and-workflow.md`:
    - "3. 시스템 물리적 경계" 표에서 품목 CSV 업로드 진입점을 "웹앱 품목 관리 탭"으로 개정.

### Non-Functional
- [ ] 데드 코드 제거 후 빌드 및 단위 테스트 결함 0건 유지.
- [ ] Git 히스토리 추적을 위해 명확한 커밋 메시지 작성.

---

## Constraints
- **선행 조건 엄수**: TASK-025의 Human QA 승인 없이 착수하지 않는다.
- **시트 보호 설정 수정 금지**: `_protectSystemSheets`는 건드리지 않는다.
- **CLAUDE.md 절대 금지 수칙 준수**: 하드코딩 금지, 프로덕션 직접 쓰기 금지.

---

## Files to Inspect
- `src/Code.gs`: `onOpen`, `menuOpenCsvUploadModal`, `openCsvUploadModal`, `runAdminAction`.
- `src/ItemService.gs`: `processCsvUploadFromSheet`.
- `src/Config.gs`: `SYSTEM_ACTIONS.uploadItemCsv`.
- `tests/unit/admin-menu-confirm.test.js`: 관리자 메뉴 테스트.
- `tests/unit/system-commands-config.test.js`: 시스템 커맨드 테스트.
- `Docs/Security.md`, `Docs/BusinessRules.md`, `Docs/Architecture.md`.
- `.agents/skills/gas-tasks/SKILL.md`, `.agents/rules/00_roles-and-workflow.md`.

---

## Files to Modify
- `src/Code.gs`: `onOpen` 항목 제거, `menuOpenCsvUploadModal` 및 `openCsvUploadModal` 삭제, `runAdminAction` 정리.
- `src/ItemService.gs`: `processCsvUploadFromSheet` 함수 삭제.
- `src/Config.gs`: `SYSTEM_ACTIONS.uploadItemCsv.scope`를 `"webapp"`으로 변경.
- `tests/unit/admin-menu-confirm.test.js`: 메뉴 6개 및 항목 제거 반영.
- `tests/unit/system-commands-config.test.js`: scope `"webapp"` 단언 반영.
- `Docs/Security.md`: 구매팀 시트 뷰어 공유 정책 추가.
- `Docs/BusinessRules.md`: 품목 관리 경로 일원화 및 이력 정책 갱신.
- `Docs/Architecture.md`: 사장 파일 및 시트 메뉴 구조 갱신.
- `.agents/skills/gas-tasks/SKILL.md`: 사장 파일 표 정리.
- `.agents/rules/00_roles-and-workflow.md`: 시스템 물리적 경계 표 갱신.

---

## Files to Delete
- `src/UploadCsv.html`
- `src/JS_Master.html`

---

## Files to Create
- 없음

---

## Implementation Plan
1. **시트 메뉴 및 핸들러 정리 (`src/Code.gs`, `src/ItemService.gs`)**:
   - `src/Code.gs`: `onOpen`에서 `📤 품목마스터 CSV 업로드` 제거.
   - `src/Code.gs`: `menuOpenCsvUploadModal`, `openCsvUploadModal` 함수 삭제.
   - `src/Code.gs`: `runAdminAction` 내 불필요해진 주석/분기 정리.
   - `src/ItemService.gs`: `processCsvUploadFromSheet` 함수 삭제.
2. **레거시 및 사장 파일 삭제**:
   - `src/UploadCsv.html` 파일 삭제.
   - `src/JS_Master.html` 파일 삭제.
3. **설정 및 단위 테스트 동기화**:
   - `src/Config.gs`: `SYSTEM_ACTIONS.uploadItemCsv.scope`를 `"webapp"`으로 변경.
   - `tests/unit/admin-menu-confirm.test.js`: 6개 항목 단언 및 `uploadItemCsv` 템플릿 단언 정리.
   - `tests/unit/system-commands-config.test.js`: scope `'webapp'` 단언 갱신.
   - `npm run test:unit` 실행 및 전체 통과 검증.
4. **코드베이스 잔재 grep 검증**:
   - `grep_search`로 `UploadCsv`, `processCsvUploadFromSheet`, `menuOpenCsvUploadModal`, `openCsvUploadModal`, `JS_Master` 검색하여 잔재 0건 확인.
5. **문서 갱신**:
   - `Docs/Security.md`, `Docs/BusinessRules.md`, `Docs/Architecture.md`, `.agents/skills/gas-tasks/SKILL.md`, `.agents/rules/00_roles-and-workflow.md` 일괄 갱신.
6. **E2E 회귀 검증**:
   - `npm run test:e2e` 실행하여 기존 시나리오 및 TASK-025 품목 관리 시나리오 정상 동작 확인.

---

## Migration Plan
- 시트 구조 변경 없음 ("해당 없음").
- 데이터 마이그레이션 불필요.

---

## Test Plan

### Unit Test
- `tests/unit/admin-menu-confirm.test.js`:
  - `onOpen` 실행 시 메뉴 항목 수가 정확히 6개인지 검증.
  - 등록된 항목들이 모두 `menu*` 래퍼에 연결되어 있는지 검증.
- `tests/unit/system-commands-config.test.js`:
  - `uploadItemCsv`의 scope가 `"webapp"`인지 검증.
- `npm run test:unit` 전체 실행하여 기존 19개 이상 단위 테스트 100% 통과 확인.

### E2E Test (Playwright)
- `tests/e2e/items-management.spec.js` (TASK-025 구축분) 실행:
  - 웹앱을 통한 품목 관리 및 CSV 업로드 정상 동작 최종 확인.
- `npm run test:e2e` 전체 회귀 검증.

---

## Regression Risk
- 스프레드시트 메뉴에서 CSV 업로드 항목이 사라지므로, 기존에 시트 메뉴를 사용하던 사용자가 혼선을 겪을 수 있음:
  - 대응: 웹앱 품목 관리 탭에서 CSV 업로드를 수행하도록 사전 공지 및 교육 완료.
- `UploadCsv.html` 삭제로 인한 런타임 오류 위험:
  - 대응: `Code.gs`의 호출부와 `ItemService.gs`의 `processCsvUploadFromSheet`를 함께 제거하고 grep으로 잔재 0건을 확인하여 사전 차단.

---

## Acceptance Criteria
- [x] 스프레드시트 "🏨 관리자 도구" 메뉴에 "📤 품목마스터 CSV 업로드" 항목이 노출되지 않음 (항목 수 6개).
- [x] `src/UploadCsv.html` 및 `src/JS_Master.html` 파일이 코드베이스에서 완전히 삭제됨.
- [x] `src/ItemService.gs`에서 `processCsvUploadFromSheet`가 삭제되고, `uploadItemMasterCSV`는 보존됨.
- [x] `SYSTEM_ACTIONS.uploadItemCsv.scope`가 `"webapp"`으로 설정됨.
- [x] 소스코드 및 테스트 파일 전체에서 삭제 대상 심볼의 참조 잔재가 0건임.
- [x] `tests/unit/admin-menu-confirm.test.js` 및 `tests/unit/system-commands-config.test.js`를 포함한 모든 단위 테스트가 통과함.
- [x] `Docs/Security.md`, `Docs/BusinessRules.md`, `Docs/Architecture.md`, `SKILL.md`, `00_roles-and-workflow.md`가 갱신됨.

---

## Human Approval Required
- **운영 전환 (Production 배포 직후 사람이 직접 수행)**:
  1. 관리자 웹앱 '계정 관리' 탭에서 구매팀 담당자의 `manager` 계정 생성 및 로그인 확인.
  2. 구글 드라이브 공유 설정에서 구매팀 담당자를 **'편집자' → '뷰어'**로 변경.
  3. 구글 드라이브 공유 창의 톱니바퀴(고급 설정)에서 **"편집자가 권한을 변경하고 공유하도록 허용" 옵션을 체크 해제(OFF)**.

---

## Deployment Notes
- Production 배포 순서:
  1) `git push origin main` (GitHub Actions 자동 배포 또는 수동 배포).
  2) 배포 완료 후 웹앱 접속하여 구매팀 담당자 `manager` 계정 동작 확인.
  3) 구글 드라이브에서 구매팀 계정의 스프레드시트 공유 권한을 '뷰어'로 변경.

---

## Rollback Plan
- 코드 롤백: Git 커밋 되돌리기 (`git revert`) 및 clasp push.
- 운영 롤백: 구글 드라이브 공유 설정에서 구매팀 담당자의 권한을 '편집자'로 원복.

---

## Final Report
*(Claude Code · 2026-09-14 · DEV 배포 `npm run dev:push` 완료(삭제 파일도 DEV에서 제거됨), 로컬 커밋 · Production 미배포)*

선행 조건: TASK-025 DEV 검증(단위·E2E·스크린샷) 뒤 사용자가 "지금 구조면 구매팀이 시트도 볼 필요 없이 웹앱 안에서 전부 관리하면 된다 — 커밋 후 TASK-026 진행"으로 착수를 승인했다(2026-09-14).

### 1. 구현 요약

| 요구사항 | 구현 | 근거 |
|---|---|---|
| 시트 메뉴·래퍼·모달 제거 | `onOpen` 항목 7 → **6**(「📤 품목마스터 CSV 업로드」 삭제), `menuOpenCsvUploadModal`·`openCsvUploadModal` 삭제, `runAdminAction` default 분기 주석을 현재 사실(웹앱 전용)로 | `src/Code.gs` |
| 시트 전용 수신 함수 제거 | `processCsvUploadFromSheet` 삭제. `uploadItemMasterCSV`는 보존 — **시트 대화상자 우회 토큰(`'SHEET_UI'`) 분기도 함께 제거**해 세션(admin·manager)만 받는다(호출자가 사라진 인증 우회를 남기지 않기 위해) | `src/ItemService.gs` |
| 파일 삭제 | `src/UploadCsv.html`, `src/JS_Master.html` — `git rm`, DEV `clasp push`로 원격 프로젝트에서도 제거(`clasp files` 0건) | |
| SYSTEM_ACTIONS | `uploadItemCsv.scope` `both` → **`webapp`** (시트 `openAdminActionDialog`는 webapp scope를 거부하므로 메뉴가 남아 있어도 뜨지 않는 구조). 주석의 옛 파일명 언급 제거 | `src/Config.gs` |
| 시트 보호 | `_protectSystemSheets` 불변 | `src/RBAC.gs` (수정 없음) |
| 잔재 0건 | `grep -rn "UploadCsv|processCsvUploadFromSheet|menuOpenCsvUploadModal|openCsvUploadModal|JS_Master" src tests Docs .agents AGENTS.md CLAUDE.md` → **0건** (`AI/tasks`·`AI/audits`의 과거 기록만 남김). `tests/e2e/negative-stock.spec.js` 머리말의 옛 설명도 고침 | |
| 단위 테스트 | `admin-menu-confirm`: 6개 항목 + "CSV 업로드 메뉴 없음" 단언, 템플릿은 항상 `AdminActionDialog`. `system-commands-config`·`item-query`: scope `webapp`. `item-service`: SHEET_UI 토큰 **거부** 검증으로 교체. `migration-v16-formatting`: 세션 스텁으로 호출 | `tests/unit/*` |
| 문서 | `Docs/Security.md` **스프레드시트 공유 정책** 절(소유자 편집 / 구매팀 뷰어 또는 미공유 / 업장 직원 미공유, "편집자가 권한을 변경하고 공유" OFF, 쓰기 경로 2개). `Docs/BusinessRules.md` §12 manager·§15 품목 마스터 수정(웹앱 일원화·사유 필수·시트 뷰어)·§17 변경이력(웹앱·CSV 100% / onEdit 안전망). `Docs/Architecture.md` 사장 파일 표 → "사장 파일 없음 + AdminActionDialog", 메뉴 6개. `Docs/CodingRules.md` §4, `Docs/UIGuidelines.md`, `Docs/SheetSchema.md`(변경자 열 설명). `.agents/rules/00_roles-and-workflow.md` 물리적 경계 표(품목 마스터·CSV·거래처 행, SPA 구성 9탭/7스크립트). `.agents/skills/gas-tasks/SKILL.md` (4)절을 "SPA 밖 HTML" 표로. `AGENTS.md` 4항 | |

### 2. 검증

- `npm test` — **21개 파일 전체 통과**(변경 5파일 갱신 포함).
- Playwright 전체 회귀(DEV, 시트 경로 제거 후) — `npx playwright test` **23 passed / 5 failed / 5 skipped**(15.0분). **품목 관리 5건·관리자 도구·시트 동기화·거래처·기초데이터·smoke는 전부 통과.** 실패 5건(`fifo-split` 1 · `negative-stock` 2 · `transaction` 1 · `transaction-bulk-upload` 1)은 전부 같은 원인 — 서버가 거래 등록을 "**2026-09-30 이전은 이미 월마감된 기간입니다**"로 거절했다. 진단 호출 `getClosingCutoffInfo` → `cutoff 2026-09-30`, 업장 시트 최근 내역 비어 있음: DEV 스프레드시트에서 **2026-09 월마감이 실행된 상태**(직전 회귀 15:32~15:46에는 같은 5건이 통과했고, 이번 회귀 시작 16:41 사이에 마감됨). 이 Task는 시트 CSV 메뉴·대화상자·수신 함수만 지웠고 거래·마감 코드는 건드리지 않았다(`git diff` 범위). E2E의 실제 월마감 테스트는 `E2E_ALLOW_MONTHLY_CLOSING=1`이 없어 skip됐다(로그 #13·#17). 마감 상태를 되돌리기 전에는 거래를 쓰는 스펙 5건이 10월 1일까지 계속 실패한다 — Human 확인 필요(§6).
- DEV Apps Script 프로젝트 파일 목록: `UploadCsv`·`JS_Master` 0건(`clasp files`).

### 3. 명세와 다른 점 / 판단

- `uploadItemMasterCSV`의 `'SHEET_UI'` 우회 토큰을 제거했다(명세는 함수 보존만 요구). 호출자가 없어진 인증 우회 경로를 남기면 토큰 문자열만으로 세션 없이 마스터에 쓸 수 있으므로 지웠다. 변경이력 B열 "시트 CSV" 값은 과거 기록에만 남는다(`Docs/SheetSchema.md`에 명시).
- 공유 정책은 명세의 "구매팀 뷰어"에 더해 **"조회가 필요 없으면 공유하지 않는다"**를 기본으로 적었다 — 사용자 판단("시트도 볼 필요 없이 웹앱에서 전부").
- `AGENTS.md`·`Docs/SheetSchema.md`·`Docs/UIGuidelines.md`·`Docs/CodingRules.md`·`tests/e2e/negative-stock.spec.js`는 Files to Modify에 없었지만 옛 파일을 사실로 기술하고 있어 함께 고쳤다(잔재 0건 기준).

### 4. Human Approval — 운영 전환 (Production 배포 직후, 사람이 직접)

1. 웹앱 「계정 관리」에서 구매팀 담당자 `manager` 계정 생성 → 로그인해 「품목 관리」 탭 확인.
2. 구글 드라이브 공유에서 구매팀 담당자를 **편집자 → 뷰어**(조회가 필요 없으면 **공유 해제**).
3. 공유 창 톱니바퀴에서 **"편집자가 권한을 변경하고 공유할 수 있습니다" 해제(OFF)**.

### 5. 배포 메모

- 시트 구조 변경 없음. Production `clasp push`가 `UploadCsv.html`·`JS_Master.html`을 원격에서도 지운다(DEV에서 확인).
- 이 커밋은 TASK-024(`cf0c9a5`)·TASK-027(`875b8c9`)·TASK-025(`ed0b2e6`) 위에 쌓였다 — 함께 push한다(v19 마이그레이션은 TASK-024 절차대로).
- Human QA 전이라 **push하지 않았다**(로컬 커밋만).

### 6. DEV 환경 관찰 — 이 Task와 무관, Human 확인 필요

- DEV 스프레드시트에 **2026-09 월마감**(마감 기준일 2026-09-30)이 걸려 있다. E2E가 실행한 것이 아니다(실제 마감 테스트는 환경변수 게이트로 skip).
  거래 등록·일괄 업로드·FIFO·음수 재고 스펙이 이 때문에 실패하며, 되돌리려면 DEV 스프레드시트 버전 기록 복원(마감 전 시점) 또는
  `resetDevEnvironment()` + `LAST_CLOSED_CUTOFF` 스크립트 프로퍼티 삭제 + 통합 시트 `SYS-` 이월 행 정리가 필요하다 — 데이터 되돌림이므로 사람이 결정한다.
