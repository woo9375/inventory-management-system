# TASK-020: UI 디자인 시스템 통일 (Task B)

## Objective
`AI/audits/UI-AUDIT-001.md` 시각 감사 결과 및 확정 결정(2026-09-11), `Docs/UIGuidelines.md`에 의거하여 웹앱 전반의 UI 디자인 시스템을 통일한다.
- `btn-gold` 전량 `btn-primary` 치환 후 클래스 폐기 (주 액션은 블루 하나)
- `.status-badge` 단일화 (업장관리 생성완료, 계정관리 역할, 거래처 사용여부)
- `.data-table` 정렬 규칙 통일 (텍스트 좌측, 숫자 우측 `.num`, 상태/액션 중앙 `.ctr`, 코드/ID `.mono`)
- 컨트롤 높이 40px 통일 (`input`, `select`, `.btn`), `.btn-sm` 32px
- `src/Icons.html` Lucide 인라인 SVG 스프라이트 신설 (`Docs/UIGuidelines.md §3` 매핑표 기준) 및 `src/Index.html`에 인클루드
- 사이드바 메뉴, 페이지 제목 `h2`, 토스트 알림, 대시보드 KPI 라벨, 엠프티 스테이트, 로그인 화면의 이모지 전량 교체
- 레거시 `--navy-*`, `--gold*` 토큰 참조 제거 후 별칭 삭제
- **기능 및 마크업 구조 변경 없음, DOM ID 전량 보존**
- **Final Report에 1440px 및 768px DEV 실측 스크린샷 첨부**

---

## Confirmed Facts
1. **활성 UI 진입점 및 스크립트 호출 경로 증빙**:
   - **대시보드 (`dashboard`)**:
     `[진입점 호출 경로 증빙: src/Index.html:81 (showTab('dashboard', this)) & src/Index.html:123 (id="tab-dashboard") → src/Index.html:587 (include('JS_UI')) → src/JS_UI.html:110 loadDashboard()]`
   - **입출고 기록 (`transactions`)**:
     `[진입점 호출 경로 증빙: src/Index.html:85 (showTab('transactions', this)) & src/Index.html:200 (id="tab-transactions") → src/Index.html:588 (include('JS_Tx')) → src/JS_Tx.html:1 loadTransactions()]`
   - **업장 관리 (`shop`)**:
     `[진입점 호출 경로 증빙: src/Index.html:89 (showTab('shop', this)) & src/Index.html:313 (id="tab-shop") → src/Index.html:590 (include('JS_Config')) → src/JS_Config.html:7 loadConfig()]`
   - **시즌 설정 (`season`)**:
     `[진입점 호출 경로 증빙: src/Index.html:92 (showTab('season', this)) & src/Index.html:342 (id="tab-season") → src/Index.html:590 (include('JS_Config')) → src/JS_Config.html:7 loadConfig()]`
   - **계정 관리 (`user`)**:
     `[진입점 호출 경로 증빙: src/Index.html:95 (showTab('user', this)) & src/Index.html:375 (id="tab-user") → src/Index.html:590 (include('JS_Config')) → src/JS_Config.html:7 loadConfig()]`
   - **기초데이터 (`basedata`)**:
     `[진입점 호출 경로 증빙: src/Index.html:98 (showTab('basedata', this)) & src/Index.html:412 (id="tab-basedata") → src/Index.html:591 (include('JS_BaseData')) → src/JS_BaseData.html:8 loadBaseData()]`
   - **거래처 관리 (`vendor`)**:
     `[진입점 호출 경로 증빙: src/Index.html:101 (showTab('vendor', this)) & src/Index.html:460 (id="tab-vendor") → src/Index.html:592 (include('JS_Vendor')) → src/JS_Vendor.html:7 loadVendors()]`
   - **내 설정 (`mysettings`)**:
     `[진입점 호출 경로 증빙: src/Index.html:104 (showTab('mysettings', this)) & src/Index.html:512 (id="tab-mysettings") → src/Index.html:586 (include('JS_Auth')) → src/JS_Auth.html:74]`
   - **로그인 (`loginContainer`)**:
     `[진입점 호출 경로 증빙: src/Index.html:15 (id="loginContainer") → src/Index.html:586 (include('JS_Auth')) → src/JS_Auth.html:35 submitLogin()]`
   - **품목 마스터 (`src/JS_Master.html`)**:
     `src/Index.html`에 nav 탭 없음, `tab-master` 컨테이너 없음, `include('JS_Master')` 없음. **사장된 코드**이며 스프레드시트 `🗂️ 품목 마스터` 시트 전용임. 수정 대상에서 엄격히 배제함.

2. **`btn-gold` 실측 위치 (전량 `btn-primary` 치환 대상)**:
   - `src/Index.html`: 208 (`openMonthlyClosingModal()`), 267 (`saveTransaction()`), 320 (`openAddShopModal()`), 353 (`openAddSeasonModal()`), 388 (`openCreateUserModal()`), 424 (`addBaseDataItem('mainCategory')`), 439 (`addBaseDataItem('unit')`), 452 (`addBaseDataItem('itemCategory')`), 471 (`openAddVendorModal()`), 568 (`submitMyPasswordChange()`)
   - `src/JS_Tx.html`: 309 (`btnBulkStart`), 500 (`startBulkFileSelect()`), 532 (`btnBulkRun`), 600 (`closeModal()`), 613 (`closeModal()`)
   - `src/JS_Config.html`: 93 (`submitNewShop()`), 149 (`submitNewSeason()`), 168 (`submitEditSeason()`), 203 (`submitCreateUser()`), 251 (`submitEditUser()`), 302 (`submitResetPassword()`), 420 (`syncPermissions` 설정 버튼), 432 (`backupCSV` 설정 버튼)
   - `src/JS_Vendor.html`: 209 (`submitVendor()`), 220 (`submitVendor()`), 282 (`markVendorUnused()`)
   - `src/JS_BaseData.html`: 147 (`openPhysicalCheckModal()`의 `excelClass`)
   - `src/Stylesheet.html`: 520-527 (`.btn-gold`, `.btn-gold:hover` 정의 삭제)

3. **레거시 `--navy-*`, `--gold*` 토큰 참조 현황**:
   - `src/Stylesheet.html:56-64`: 레거시 별칭 9개(`--navy-900` ~ `--navy-500`, `--gold`, `--gold-400` ~ `--gold-200`) 정의 잔존.
   - `src/Index.html:209`: `border: 1px solid var(--gold); background: #fffdf5;`
   - `src/Index.html:215`: `border: 2px solid var(--navy-600); ... color: var(--navy-800);`
   - `src/Index.html:279`: `border-left:4px solid var(--navy-600,#1e3a5f); ... color:var(--navy-800,#0f2033);`
   - `src/JS_Tx.html:284`: `border-left:4px solid var(--navy-600,#1e3a5f);`
   - `src/JS_Tx.html:573`: `background:var(--gold,#d4af37);`
   - `src/JS_Config.html:273`: `helpText.style.color = "var(--gold)";`
   - `src/JS_BaseData.html:128`: `color:var(--navy-800);`

4. **상태 배지 표기 불일치 현황**:
   - `src/Stylesheet.html:427-441`: `.status-badge`에 `.risk`, `.order`, `.normal`만 정의되어 있으며 `.primary`, `.muted` 부재.
   - `src/Stylesheet.html:1013-1025`: `.role-badge` (`.admin`, `.manager`, `.staff`)가 별도 클래스로 중복 정의되어 있음.
   - `src/JS_Config.html:30`: 업장 상태 '생성완료'가 텍스트 색상(`td.style.cssText = s.status === '생성완료' ? 'color:var(--normal);font-weight:600' : 'color:var(--order)';`)으로만 출력됨.
   - `src/JS_Config.html:66`: 계정 역할에 `.role-badge` 사용.
   - `src/JS_Vendor.html:86-88`: 거래처 사용여부 '미사용' 시 인라인 스타일(`style="background:#f0f0f0;color:#999;border-color:#ddd;"`) 사용.
   - `src/JS_Auth.html:86, 92`: `.status-badge status-normal` 및 인라인 스타일 사용.

5. **테이블 정렬 현황**:
   - `src/Stylesheet.html:404, 416`: `.data-table thead th`, `.data-table tbody td`가 모두 `text-align: center;`로 강제되어 텍스트 열 시작점이 어긋남.

6. **컨트롤 높이 현황**:
   - `src/Stylesheet.html:462-473, 492-507`: `input`, `select`, `.btn`에 고정 `height: 40px;` 미지정으로 인해 행 기준선 불일치(UI-AUDIT-001 #11).

7. **이모지 사용 현황**:
   - 로그인: `Index.html:18` (`🏨`), `Index.html:34` (`✅ 로그인 상태 유지`)
   - 모바일 헤더: `Index.html:45` (`🏨`)
   - 사이드바: `Index.html:75` (`🏨`), `Index.html:82-105` (`📊`, `📝`, `🏪`, `📅`, `👥`, `📂`, `🤝`, `⚙️`), `Index.html:111` (`🚪 로그아웃`)
   - 페이지 제목 `h2`: `Index.html:126` (`📊`), `202` (`📝`), `315` (`🏪`), `344` (`📅`), `377` (`👥`), `414` (`📂`), `462` (`🤝`), `514` (`⚙️`)
   - 대시보드 KPI 라벨: `Index.html:154-162` (`🚨 위험`, `⚠️ 발주필요`, `✅ 정상`)
   - 엠프티 스테이트: `Index.html:188` (`📋`), `299` (`📝`), `JS_UI.html:137` (`🎉`)
   - 토스트 알림: `JS_UI.html:74` (`icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }`)

---

## Hypotheses
1. `input`, `select`, `.btn`에 `height: 40px; box-sizing: border-box;`를 부여하고 `.btn-sm`에 `height: 32px; box-sizing: border-box;`를 부여해도 기존 flex/grid 레이아웃이 깨지지 않는다. (E2E 실측 검증 필요)
2. `.data-table th, .data-table td` 기본값을 `text-align: left;`로 변경하고 수치 열에 `.num`, 상태/액션 열에 `.ctr`, 코드/ID 열에 `.mono`를 적용하면 가독성이 비약적으로 개선되며 기존 레이아웃이 안정적으로 유지된다.
3. `src/Icons.html`을 `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>...</defs></svg>` 형태로 `src/Index.html`에 `<?!= include('Icons') ?>`로 삽입하고 `<svg class="ico"><use href="#i-..."></use></svg>` 형태로 호출하면 외부 리소스 요청 없이 완벽히 동작한다.

---

## Business Context
- 호텔덕구온천 재고관리 시스템의 사용자가 일상 업무(입출고 기록, 대시보드 모니터링, 거래처 및 업장 관리)를 수행할 때 시각적 일관성과 조작 명확성이 필수적이다.
- 주 액션(Primary CTA)에 솔리드 블루를 단일화하고, OS 종속적인 이모지를 정돈된 Lucide 선형 아이콘으로 전면 통일하여 전문적이고 신뢰도 높은 화면을 구축한다.

---

## Current System
- 버튼 액션 색상이 블루(`.btn-primary`)와 앰버(`.btn-gold`)로 양분되어 있어 첫인상과 인지 흐름에 혼란을 초래함.
- 테이블 텍스트 열이 중앙 정렬되어 눈이 데이터 시작점을 찾지 못함.
- 상태 배지가 `status-badge`, `role-badge`, 인라인 스타일로 제각각 렌더링됨.
- 이모지가 제목, 사이드바, 토스트, 버튼, KPI 라벨에 혼용되어 디바이스마다 상이하게 렌더링됨.
- 레거시 토큰 `--navy-*`, `--gold*` 별칭이 유지되어 신규 코드에서 잘못 참조되고 있음.

---

## Root Cause / Diagnostic Logic
- **해당 없음** (버그 수정이 아닌 디자인 시스템 통일 및 리팩토링).

---

## Requirements

### Functional
- [ ] 기존 비즈니스 로직(입출고 저장, 검색, 필터링, 모달 열기/닫기, 동기화, 사용자 및 업장 관리 등)의 동작이 100% 동일하게 유지되어야 함.
- [ ] 모든 버튼 클릭 이벤트 및 form submit 핸들러가 기존과 동일하게 동작해야 함.

### Non-Functional
- [ ] **DOM ID 전량 보존**: HTML 내의 모든 `id="..."` 속성은 하나도 변경되거나 삭제되어서는 안 됨.
- [ ] **버튼 단일화**:
  - `btn-gold`를 전량 `btn-primary`로 치환.
  - `src/Stylesheet.html`에서 `.btn-gold` 및 `.btn-gold:hover` 클래스 선언 삭제.
- [ ] **배지 단일화 (`.status-badge`)**:
  - `src/Stylesheet.html`에 `.status-badge.primary` (블루/admin), `.status-badge.muted` (그레이/미사용/staff) 추가.
  - `src/JS_Config.html`: 업장 상태 '생성완료'를 `<span class="status-badge normal">생성완료</span>`로 렌더링 (아닐 경우 `order`).
  - `src/JS_Config.html`: 계정 역할(`role`)을 `.role-badge` 대신 `.status-badge`로 변경 (`admin` → `status-badge primary`, `manager` → `status-badge order`, `staff` → `status-badge muted`).
  - `src/JS_Vendor.html`: 거래처 사용여부 렌더링 시 인라인 스타일 제거하고 `status-badge normal` (사용), `status-badge muted` (미사용) 적용.
  - `src/JS_Auth.html`: 인라인 스타일 및 `status-normal` 제거하고 표준 `.status-badge` 클래스 사용.
  - `src/Stylesheet.html`의 `.role-badge` 레거시 스타일 삭제 또는 `.status-badge`와 통합.
- [ ] **테이블 정렬 규칙 통일**:
  - `src/Stylesheet.html`: `.data-table thead th`, `.data-table tbody td` 기본 정렬을 `text-align: left;`로 변경.
  - `src/Stylesheet.html`: 유틸리티 클래스 신설/보강:
    - `.data-table th.num, .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }`
    - `.data-table th.ctr, .data-table td.ctr { text-align: center; }`
    - `.data-table th.mono, .data-table td.mono { font-family: var(--font-mono, monospace); font-size: 0.84rem; color: var(--text-secondary); }`
  - 각 화면의 `Index.html` 테이블 헤더(`<th>`) 및 렌더링 JS(`JS_UI.html`, `JS_Tx.html`, `JS_Config.html`, `JS_Vendor.html`)의 셀(`<td>`)에 알맞은 정렬 클래스 적용:
    - 텍스트 열(품목명, 업장명, 거래처명 등): 기본(좌측)
    - 숫자 열(수량, 재고, 배수 등): `.num` (우측)
    - 상태/액션/체크 열: `.ctr` (중앙)
    - 코드/ID 열: `.mono`
- [ ] **컨트롤 높이 통일 (40px)**:
  - `src/Stylesheet.html`: `input:not([type="checkbox"]):not([type="radio"])`, `select`, `.btn`에 `height: 40px; box-sizing: border-box;` 적용.
  - `.btn-sm`에 `height: 32px; box-sizing: border-box;` 적용.
  - `.btn` 수직 중앙 정렬 (`display: inline-flex; align-items: center; justify-content: center;`) 유지.
- [ ] **Lucide 아이콘 스프라이트 (`src/Icons.html`) 신설**:
  - `AI/audits/UI-AUDIT-001/mockup-transactions.html`의 검증된 SVG symbol 및 `Docs/UIGuidelines.md §3` 매핑표를 기반으로 `src/Icons.html` 생성.
  - 포함할 심볼 목록:
    - `i-building-2`: 브랜드 / 호텔
    - `i-layout-dashboard`: 대시보드
    - `i-clipboard-list`: 입출고 기록
    - `i-store`: 업장 관리
    - `i-calendar`: 시즌 설정
    - `i-users`: 계정 관리
    - `i-folder`: 기초데이터
    - `i-handshake`: 거래처 관리
    - `i-settings`: 내 설정
    - `i-log-out`: 로그아웃
    - `i-refresh-cw`: 시트 동기화 / 갱신
    - `i-upload`: 일괄 업로드
    - `i-sliders-horizontal`: 관리 드롭다운
    - `i-save`: 저장
    - `i-search`: 검색
    - `i-check-circle-2`: 토스트 success
    - `i-x-circle`: 토스트 error
    - `i-alert-triangle`: 토스트 warning
    - `i-info`: 토스트 info
    - `i-inbox`: 엠프티 스테이트 (없음)
    - `i-party-popper`: 엠프티 스테이트 (정상 / 축하)
    - `i-chevron-down`: 드롭다운 / 선택 화살표
  - `src/Stylesheet.html`에 `.ico` 공통 클래스 정의:
    ```css
    .ico {
      width: 1.15em;
      height: 1.15em;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      display: inline-block;
      vertical-align: -0.18em;
      flex-shrink: 0;
    }
    ```
  - `src/Index.html`의 `<body>` 시작 직후 `<?!= include('Icons') ?>` 삽입.
- [ ] **이모지 전량 교체 / 제거**:
  - 로그인: `Index.html:18` (`🏨` → `<svg class="ico"><use href="#i-building-2"/></svg>`), `Index.html:34` (`✅ 로그인 상태 유지` → `로그인 상태 유지`)
  - 모바일 헤더: `Index.html:45` (`🏨 호텔덕구온천` → `<svg class="ico"><use href="#i-building-2"/></svg> 호텔덕구온천`)
  - 사이드바: 브랜드 아이콘 및 메뉴 8개, 로그아웃 버튼의 이모지를 Lucide SVG 아이콘으로 교체.
  - 페이지 헤더 `h2` 8개: 이모지를 `<svg class="ico"><use href="#i-..."></use></svg>`로 교체.
  - 대시보드 KPI 카드 라벨: `Index.html:154-162`에서 `🚨 `, `⚠️ `, `✅ ` 이모지 제거 (텍스트 `위험`, `발주필요`, `정상`만 유지).
  - 엠프티 스테이트: `Index.html:188`, `299`, `JS_UI.html:137`의 이모지를 `i-party-popper` 또는 `i-inbox` SVG로 교체.
  - 토스트: `src/JS_UI.html:74`의 이모지 딕셔너리를 Lucide SVG 렌더링으로 변경 (`i-check-circle-2`, `i-x-circle`, `i-alert-triangle`, `i-info`).
  - 헤더 버튼 및 액션 버튼 텍스트의 이모지 정리: 버튼 이모지는 제거하거나 Lucide 아이콘으로 교체.
- [ ] **레거시 토큰 정리**:
  - `src/Index.html`, `src/JS_Tx.html`, `src/JS_Config.html`, `src/JS_BaseData.html`에 잔존하는 `var(--navy-*)`, `var(--gold*)` 인라인 참조를 신규 토큰(`var(--primary)`, `var(--text-primary)`, `var(--order)` 등)으로 교체.
  - `src/Stylesheet.html:56-64`의 레거시 별칭 변수 정의부 완전 삭제.
- [ ] **Final Report**:
  - 1440px 데스크톱 및 768px 태블릿 해상도에서의 DEV Web App 실측 스크린샷을 첨부할 것.

---

## Constraints
> **규칙 준수**: 아래는 `Docs/UIGuidelines.md` 전문 인용이다. 본 작업은 본 규정을 철저히 준수해야 한다.

```markdown
# UI Guidelines (SSOT)

> 웹앱(`src/Index.html` + `src/Stylesheet.html` + `JS_*.html`) 화면 규칙의 단일 진실 공급원.
> 근거: `AI/audits/UI-AUDIT-001.md` 시각 감사 + 사장님 확정 결정 (2026-09-11).
> UI를 건드리는 Task는 이 문서를 `Constraints`에 인용한다. 규칙 변경은 이 문서를 먼저 고친다.

## 1. 대상 기기
- **PC 우선** (1280~1440px 기준으로 설계·검증). **태블릿(768~1024px)** 은 깨지지 않게. **폰**은 후순위 (깨지지만 않으면 됨).
- 반응형 검증은 1440 / 1024 / 768 세 폭에서 한다. 768px에서 `.form-grid` 인라인 `grid-column: span` 이 암시적 열을 만들지 않게 할 것 (UI-AUDIT-001 #1·#2).

## 2. 색 — 주 액션은 블루 하나
- **한 화면(카드)에 솔리드 블루(`.btn-primary`) 버튼은 하나** — 그 화면의 주 액션. 카드 푸터 우측 정렬.
- 보조 액션은 `.btn-outline`. 파괴적 액션(삭제·월마감·초기화 등 되돌릴 수 없는 것)만 `.btn-danger`.
- **`.btn-gold` 사용 금지** (폐기 대상). 앰버(`--order`)는 "발주필요" 상태색으로만 쓴다.
- 레거시 토큰 `--navy-*`, `--gold*` 참조 금지. 별칭은 정리 후 삭제한다.

## 3. 그림 — 이모지 금지, Lucide 아이콘
- UI 텍스트(제목·메뉴·버튼·라벨·테이블·토스트·엠프티 스테이트)에 **이모지를 쓰지 않는다.** 이모지 모양은 OS가 정하므로 기기마다 다르게 보인다.
- 아이콘은 **Lucide** 선형 아이콘(24px viewBox, `stroke: currentColor`, `stroke-width: 2`)을 인라인 SVG 스프라이트(`src/Icons.html`, `<symbol id="i-…">`)로 싣고 `<svg class="ico"><use href="#i-…"/></svg>`로 쓴다. 외부 아이콘 CDN 사용 금지.
- 아이콘 위치: 사이드바 메뉴·페이지 제목(h2)에는 **필수**, 버튼에는 인식에 도움될 때만(저장·업로드·동기화·검색), 카드 제목(h3)·라벨·테이블 셀에는 **쓰지 않는다.**
- 상태 표현에는 아이콘 대신 **색 + 텍스트 pill**을 쓴다 (아래 5절).

### 아이콘 매핑 (사이드바 = 페이지 제목)
| 화면 | Lucide | 기타 | Lucide |
|---|---|---|---|
| 브랜드 | `building-2` | 로그아웃 | `log-out` |
| 대시보드 | `layout-dashboard` | 시트 동기화 | `refresh-cw` |
| 입출고 기록 | `clipboard-list` | 일괄 업로드 | `upload` |
| 업장 관리 | `store` | 관리(드롭다운) | `sliders-horizontal` |
| 시즌 설정 | `calendar` | 저장 | `save` |
| 계정 관리 | `users` | 검색 | `search` |
| 기초데이터 | `folder` | 토스트 success/error/warning/info | `check-circle-2` / `x-circle` / `alert-triangle` / `info` |
| 거래처 관리 | `handshake` | 엠프티 스테이트 | `inbox` (없음) / `party-popper` (정상) |
| 내 설정 | `settings` | KPI 위험/발주/정상 | 아이콘 없음 — 색 액센트로 충분 |

## 4. 레이아웃 · 컨트롤
- **컨트롤 높이 통일**: `input`, `select`, `.btn`, `.segmented` = **40px**; `.btn-sm` = 32px. 버튼이 인풋보다 커지지 않게.
- **폼 그리드**: PC `repeat(4, minmax(0,1fr))` 고정. 넓은 필드는 인라인 `style="grid-column: span 2"` 대신 `.form-group--wide`. 1024px 이하 2열, 768px 이하 1열(wide는 `1 / -1`).
- **인라인 `style=` 금지.** 색·여백·폭은 `Stylesheet.html`의 토큰/클래스로. 예외 없음 (JS가 생성하는 마크업 포함).
- **상시 안내 배너 금지.** 정보는 카드 헤더 캡션(`.card-header .cap`)으로. 경고 톤은 실제 경고(월마감 등)에만.
- 헤더 액션은 **outline 2~3개까지**. 관리자 전용·드문 액션은 「관리 ▾」 드롭다운에 넣는다.
- 페이지의 컨텍스트(현재 업장 등)는 제목 옆 **칩**(`.shop-chip`)으로, 버튼 위계에서 뺀다.
- 카드 폭은 같은 탭 안에서 통일한다.

## 5. 테이블 · 상태
- 정렬: **텍스트 좌측 · 숫자 우측(`.num`, `tabular-nums`) · 상태/액션 가운데(`.ctr`)**. 코드·ID는 `.mono` (모노스페이스, muted).
- 상태는 **`.status-badge` pill 하나**로, 색만 다르게: `normal`(초록) · `order`(앰버) · `risk`(로즈) · `primary`(블루). 초록 텍스트만 쓰거나 별도 pill 클래스를 만들지 않는다.
- 입출고 구분: 입고 `normal`, 출고 `primary`, 폐기 `risk`.
- 값이 전부 비는 열은 `—`. 50건 초과 목록은 페이지네이션 또는 "더 보기".
- 엠프티 스테이트 행은 hover 하이라이트 제외.

## 6. 폼 입력 (입출고)
- 구분은 **세그먼트 버튼**(`.segmented`, 입고 | 출고 | 폐기). 기존 `#txType` select는 숨긴 채 유지하고 세그먼트가 값을 넣는다 (JS 호환).
- 주 액션 옆에 outline **초기화**. 단축키 힌트는 실제로 동작할 때만 표시.

## 7. 검수
- UI Task의 Final Report에는 **DEV 실측 스크린샷**(1440 / 768)을 첨부한다. "정상 작동" 체크만으로는 완료로 보지 않는다.
- 감사 기준선: `AI/audits/UI-AUDIT-001/` (before) · `mockup-transactions-approved.png` (승인된 목표).
```

- **기타 제약사항**:
  - 외부 아이콘 라이브러리(FontAwesome, Google Icons 등) CDN 로드 금지. 오직 `src/Icons.html` 내 인라인 SVG 심볼만 사용.
  - `src/JS_Master.html`은 사장된 코드이므로 절대 수정하지 않는다.
  - 마크업 구조나 DOM ID를 삭제/변경하여 기존 E2E 테스트나 스크립트 바인딩이 깨지지 않도록 보존한다.

---

## Files to Inspect
- `AI/audits/UI-AUDIT-001.md`: 시각 감사 원본 및 사장님 확정 결정
- `Docs/UIGuidelines.md`: UI 지침 SSOT
- `AI/audits/UI-AUDIT-001/mockup-transactions.html`: 검증된 Lucide SVG 심볼 및 레이아웃 목업
- `src/Index.html`: 공통 쉘, 사이드바, 헤더, 각 탭 마크업
- `src/Stylesheet.html`: 스타일시트 및 CSS 변수
- `src/JS_UI.html`: 토스트, 모달, 대시보드 렌더링
- `src/JS_Tx.html`: 입출고 화면 및 일괄 업로드 모달
- `src/JS_Config.html`: 업장, 시즌, 계정 테이블 렌더링
- `src/JS_Vendor.html`: 거래처 테이블 렌더링
- `src/JS_BaseData.html`: 기초데이터 렌더링 및 실사 모달
- `src/JS_Auth.html`: 로그인 및 내 설정 바인딩

---

## Files to Modify
- `src/Index.html`:
  - `<?!= include('Icons') ?>` 추가
  - 로그인 카드, 모바일 헤더, 사이드바, 헤더 `h2`, 버튼의 이모지 교체/제거
  - `btn-gold` → `btn-primary` 치환
  - 대시보드 KPI 라벨 이모지 제거
  - 테이블 헤더 `<th>` 정렬 클래스(`.num`, `.ctr`, `.mono`) 추가
  - 인라인 레거시 `--navy-*`, `--gold*` 토큰 교체
- `src/Stylesheet.html`:
  - 레거시 토큰 별칭 9개 삭제 (`--navy-900`~`500`, `--gold*`)
  - `.btn-gold` 스타일 완전 삭제
  - `input`, `select`, `.btn`의 `height: 40px; box-sizing: border-box;` 지정 및 `.btn-sm`의 `height: 32px;` 지정
  - `.data-table th, .data-table td` 기본 text-align `left`로 변경
  - `.data-table .num`, `.data-table .ctr`, `.data-table .mono` 클래스 추가
  - `.status-badge.primary`, `.status-badge.muted` 스타일 추가 및 `.role-badge` 통합/제거
  - `.ico` 공통 SVG 아이콘 클래스 정의
- `src/JS_UI.html`:
  - `showToast` 아이콘을 Lucide SVG 스프라이트 참조로 변경
  - 대시보드 테이블 엠프티 스테이트 이모지를 SVG 심볼(`i-party-popper`)로 변경
  - 대시보드 상태 배지에서 이모지 제거 (`🚨 위험` → `위험`, `⚠️ 발주필요` → `발주필요`)
- `src/JS_Tx.html`:
  - `btn-gold` → `btn-primary` 치환
  - 버튼 및 모달 타이틀의 이모지 제거/정리
  - 프로그레스바 및 배너의 레거시 토큰(`--gold`, `--navy-600`) 교체
  - 테이블 셀 정렬 클래스 적용
- `src/JS_Config.html`:
  - `btn-gold` → `btn-primary` 치환
  - 업장 상태를 `.status-badge normal` (생성완료) 및 `order`로 렌더링
  - 사용자 역할을 `.role-badge` 대신 `.status-badge primary/order/muted`로 렌더링
  - `cmdConfig` 내의 `btn: 'btn-gold'` 및 타이틀 이모지 정리
  - 레거시 토큰(`var(--gold)`) 교체
- `src/JS_Vendor.html`:
  - `btn-gold` → `btn-primary` 치환
  - 거래처 사용여부 렌더링 시 인라인 스타일 제거 및 `.status-badge normal` (사용) / `.status-badge muted` (미사용) 적용
  - 테이블 셀 정렬 클래스 적용
- `src/JS_BaseData.html`:
  - `openPhysicalCheckModal` 내의 `excelClass`에서 `btn-gold` 제거 (`btn-outline` 또는 `btn-primary`로 상호 배타적 적용)
  - 모달 타이틀 및 버튼 텍스트의 이모지 정리
  - 레거시 토큰(`var(--navy-800)`) 교체
- `src/JS_Auth.html`:
  - 내 설정 업장 배지 인라인 스타일 제거 및 표준 `.status-badge` 적용

---

## Files to Create
- `src/Icons.html`: Lucide SVG 심볼 스프라이트 정의 파일 (`<symbol id="i-...">` 모음)

---

## Implementation Plan
1. **`src/Icons.html` 생성**:
   - `AI/audits/UI-AUDIT-001/mockup-transactions.html`에 정의된 심볼들을 추출하고, `Docs/UIGuidelines.md §3` 매핑표에 필요한 모든 심볼(`i-building-2`, `i-layout-dashboard`, `i-clipboard-list`, `i-store`, `i-calendar`, `i-users`, `i-folder`, `i-handshake`, `i-settings`, `i-log-out`, `i-refresh-cw`, `i-upload`, `i-sliders-horizontal`, `i-save`, `i-search`, `i-check-circle-2`, `i-x-circle`, `i-alert-triangle`, `i-info`, `i-inbox`, `i-party-popper`, `i-chevron-down` 등)을 `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>...</defs></svg>` 구조로 작성.
2. **`src/Stylesheet.html` 업데이트**:
   - `--navy-*` 및 `--gold*` 별칭 9개 제거.
   - `.ico` 스타일 추가.
   - `.btn-gold` 제거, `.btn-primary` 유지.
   - `input:not([type="checkbox"]):not([type="radio"])`, `select`, `.btn` 높이 `40px` 지정 (`box-sizing: border-box;`). `.btn-sm` 높이 `32px` 지정.
   - `.status-badge.primary` (배경 `#eff6ff`, 텍스트 `#1d4ed8`, 테두리 `#bfdbfe`), `.status-badge.muted` (배경 `var(--bg-muted)`, 텍스트 `var(--text-secondary)`, 테두리 `var(--border)`) 추가.
   - `.data-table` 기본 `text-align: left;` 지정 및 `.data-table .num`, `.ctr`, `.mono` 유틸리티 추가.
3. **`src/Index.html` 업데이트**:
   - `<body>` 직후 `<?!= include('Icons') ?>` 삽입.
   - 로그인 화면, 사이드바, 모바일 헤더, `h2` 헤더 이모지를 `<svg class="ico"><use href="#i-..."></use></svg>`로 교체.
   - `btn-gold` 10곳을 `btn-primary`로 교체.
   - `th` 요소들에 `.num`, `.ctr`, `.mono` 적용.
   - 대시보드 KPI 라벨에서 이모지 제거.
   - 인라인 `--navy-*` 및 `--gold` 토큰 참조를 신규 변수로 교체.
4. **JS 파일들 업데이트 (`JS_UI`, `JS_Tx`, `JS_Config`, `JS_Vendor`, `JS_BaseData`, `JS_Auth`)**:
   - 토스트 및 엠프티 스테이트의 이모지 교체.
   - 모든 JS 내 `btn-gold` 문자열을 `btn-primary`로 교체.
   - 상태 배지 렌더링 로직을 표준 `.status-badge` 클래스로 통일 (인라인 스타일 완전 제거).
   - 테이블 행 렌더링 시 셀에 `.num`, `.ctr`, `.mono` 클래스 부여.
   - 모달 타이틀 및 안내문구 내 불필요한 이모지 제거.
5. **검증 및 스크린샷 캡처**:
   - 단위 테스트 실행 (`npm test`).
   - DEV 배포 (`npm run dev:push`).
   - Playwright를 통해 1440px 및 768px 화면을 검증하고 스크린샷 캡처.

---

## Migration Plan
- **해당 없음** (스프레드시트 구조나 영구 저장 데이터 변경 없음).

---

## Test Plan

### Unit Test
- `npm test`를 실행하여 기존 데이터 처리 및 계산 로직(FIFO 분할, 안전재고 계산, 월마감 검증 등)의 무결성을 확인.

### E2E Test (Playwright)
- DEV Web App 대상 E2E 검증:
  - 1440px 데스크톱: 대시보드, 입출고, 업장관리, 시즌설정, 계정관리, 기초데이터, 거래처관리, 내설정 탭 순회 및 스크린샷 캡처.
  - 768px 태블릿: 동일 탭 순회 및 깨짐 없는지 확인, 스크린샷 캡처.
  - 콘솔 오류(Console Error) 0건 확인.
  - Lucide SVG 아이콘이 깨지지 않고 모든 탭 및 사이드바에서 정상 표시되는지 확인.
  - 모든 `btn-primary` 버튼의 스타일과 동작 검증.
  - 업장관리, 계정관리, 거래처관리의 `.status-badge` 스타일 확인.

---

## Regression Risk
- **위험**: CSS 높이 40px 통일로 인해 모달 또는 좁은 화면의 폼 그리드 줄바꿈이 의도치 않게 일어날 수 있음.
  - **대응**: 768px 및 1440px 화면에서 모달 및 폼을 실측하여 오버플로우 발생 여부 확인.
- **위험**: 마크업 수정 중 JavaScript 바인딩용 ID가 유실되어 버튼 클릭이나 데이터 렌더링이 중단될 위험.
  - **대응**: DOM ID는 일체 변경하거나 삭제하지 않고 유지하며, 오직 클래스(`btn-gold` → `btn-primary`) 및 내부 텍스트/SVG만 변경.

---

## Acceptance Criteria
- [ ] `src/Icons.html`이 신설되고 `Index.html`에 정상 include됨.
- [ ] 소스 코드 전체에서 `btn-gold` 클래스 사용이 0건이며, `Stylesheet.html`에서 정의가 제거됨.
- [ ] 소스 코드 전체에서 `--navy-*`, `--gold*` 레거시 변수 참조 및 별칭 정의가 0건임.
- [ ] 사이드바, `h2`, 토스트, KPI 라벨, 엠프티스테이트, 로그인 화면에서 이모지가 전량 제거/교체됨.
- [ ] 업장관리(생성완료), 계정관리(역할), 거래처관리(사용/미사용)가 모두 단일화된 `.status-badge`로 렌더링되고 인라인 스타일이 제거됨.
- [ ] 모든 데이터 테이블의 텍스트가 좌측, 숫자가 우측(`.num`), 상태/액션이 중앙(`.ctr`) 정렬됨.
- [ ] `input`, `select`, `.btn` 높이가 40px로 통일됨 (`.btn-sm`은 32px).
- [ ] 모든 기존 기능(로그인, 데이터 조회, 모달 팝업, CRUD 등)이 정상 작동하고 콘솔 오류가 0건임.
- [ ] Final Report에 1440px / 768px DEV 스크린샷이 첨부됨.

---

## Human Approval Required
- **없음** (이미 `AI/audits/UI-AUDIT-001.md`에서 사장님 결정 ①②③으로 승인 완료된 사항임).

---

## Deployment Notes
- 소스 수정 후 `npm test`로 검증하고 `npm run dev:push`로 DEV 환경에 배포하여 E2E 및 시각적 검증을 수행한다.

---

## Rollback Plan
- 배포 후 치명적 결함 발생 시 git을 통해 변경 사항을 롤백하고 DEV 환경에 재배포한다:
  ```bash
  git checkout HEAD~1 -- src/
  npm run dev:push
  ```

---

## Final Report
*(Claude Code가 구현 완료 후 작성)*
> 구현: Claude Code · 2026-09-11 · DEV 배포 `npm run dev:push` 완료 · `npm test` 16개 파일 전체 통과

### 구현 요약
| 항목 | 결과 |
|---|---|
| `src/Icons.html` 신설 | Lucide 심볼 36개 (`i-building-2` … `i-party-popper` + 액션용 `i-plus`·`i-pencil`·`i-trash-2`·`i-key-round`·`i-printer`·`i-download`·`i-clock`·`i-menu`·`i-x`·`i-calendar-check`·`i-zap`·`i-lock`). `Index.html` `<body>` 직후 `<?!= include('Icons') ?>`. 외부 CDN 없음. |
| `btn-gold` | 소스 전체 **0건** (`Index` 10 · `JS_Tx` 5 · `JS_Config` 8 · `JS_Vendor` 3 · `JS_BaseData` 1 치환, `Stylesheet` 정의 삭제). DEV DOM 실측 `.btn-gold` 0 / `.btn-primary` 10 |
| 레거시 토큰 | `--navy-*`·`--gold*` 정의 9개 삭제, 참조 7곳 → `--primary`/`--text-primary`/`--order-text` 로 교체. 소스 전체 0건 |
| `.status-badge` 단일화 | `.primary`·`.muted` 추가, `.role-badge` 삭제. 업장 상태(생성완료 normal / 그 외 order), 계정 역할(admin primary / manager order / staff muted), 거래처 사용여부(사용 normal / 미사용 muted), 내 설정 배정 업장(normal, 전체 접근 primary) — 인라인 스타일 0 |
| 테이블 정렬 | `th/td` 기본 좌측, `.num`(우측·tabular) `.ctr`(가운데) `.mono`(코드) `.muted` 유틸 신설. 8개 테이블 `<th>` + 렌더러(`JS_UI`·`JS_Tx`·`JS_Config`·`JS_Vendor`) `<td>` 클래스 부여. 빈 상태 행은 `td.empty-state` 가운데 유지 |
| 컨트롤 높이 | `--control-h: 40px` / `--control-h-sm: 32px`. `input`(checkbox·radio·file 제외)·`select`·`.btn` = 40px, `.btn-sm` = 32px, 모두 `box-sizing: border-box`. 로그인 인풋 패딩 `0 16px`로 정리 |
| 이모지 | 로그인·모바일 헤더·사이드바(브랜드+메뉴 8+로그아웃)·h2 8개·KPI 라벨·엠프티 스테이트·토스트·헤더/모달 버튼·모달 제목·액션 버튼(✏️🗑️🔑 → pencil/trash-2/key-round) 전량 교체. **UI 소스 잔존 0건** (유일한 예외: `JS_Tx.html` 서버 응답 `⏳` 판별 정규식 — 서버 메시지이므로 유지) |
| 음수 재고 강조 | `🚨` 접두 + 인라인 색 → `.stock-neg` pill 클래스 (`--risk-text`) |

### 스펙과 다르게 한 것 (사유)
- **헤더 「수동 월마감」**: 스펙은 `btn-gold → btn-primary`이나, 파괴적 액션을 헤더에서 솔리드 블루로 띄우면 UIGuidelines §2(카드당 블루 하나·파괴적 액션 구분)와 충돌 → `btn-outline btn-sm`으로 두었음. TASK-021(C-7)에서 「관리 ▾」 드롭다운 `.danger` 항목으로 이동함.
- **실사 양식 모달 Excel 버튼**: 스펙의 "`btn-outline` 또는 `btn-primary` 상호 배타" 대로, 사용자가 드롭다운에서 고른 방식만 `btn-primary`, 나머지는 `btn-outline`.
- **액션 버튼 아이콘**: §3은 "테이블 셀에 아이콘 금지"이나 28px 아이콘 전용 버튼(`.action-btn`)은 셀 장식이 아닌 컨트롤이므로 Lucide로 교체하고 `title`·`aria-label`로 이름을 제공함.

### E2E 스펙 동기화 (이모지 제거에 따른 단정문 변경, 동작 변경 없음)
- `negative-stock.spec.js`: `🚨` 텍스트 → `.stock-neg` 클래스 + 색 `rgb(220, 38, 38)`(`--risk-text`)
- `monthly-closing.spec.js`: `'⚠️ 경고'` → `'경고'`
- `transaction.spec.js`·`transaction-bulk-upload.spec.js`: 빈 거래ID 플레이스홀더가 `-` → `—`(em dash)로 바뀌어 `not.toHaveText(/^[-—]$/)`

### DEV 실측 (Playwright, 헤드리스 Chrome) — `AI/audits/UI-AUDIT-001/after/TASK-020/`
| 폭 | 캡처 |
|---|---|
| 1440 | `A01-login` `A02-dashboard` `A03-transactions` `A04-shop` `A06-user` `A08-vendor`(거래처 4열 픽셀화 — public 저장소) `A09-mysettings` `A10-toasts` |
| 768 (세로) | `T02-dashboard` `T03-transactions` `T06-user` `T09-mysettings` |
- `probe.json`: `svg.ico use` 36개 중 **미해결 심볼 0**, 토스트 4종 SVG 아이콘 4/4, `.btn-gold` 0, `.role-badge` 0, `th` 정렬 `left`, `.btn-sm` 32px, 768px 7개 탭 `scrollWidth == clientWidth`(가로 오버플로우 0).
- **콘솔 오류**: 우리 프레임(`userHtmlFrame`) 0건. `pageerror "Tr"` 2건은 CDP로 추적 결과 Google Apps Script 호스트 스크립트(`mae_html_user_bin_i18n_mae_html_user__ko.js:275`)에서 로그인 시 던지는 것으로 우리 코드 밖(통제 불가, 기존에도 발생).
- 알려진 잔여(범위 밖): 768px 내 설정 폼 `span 2` 잘림·사이드바 z-index·빈 모달 푸터·거래처 59건 단일 페이지는 TASK-022, 입출고 탭 4열 그리드·배너·세그먼트는 TASK-021.

### Acceptance Criteria 체크
- [x] `src/Icons.html` 신설·include
- [x] `btn-gold` 0건 + 정의 삭제
- [x] `--navy-*`·`--gold*` 0건
- [x] 사이드바·h2·토스트·KPI·엠프티·로그인 이모지 전량 교체
- [x] 업장/계정/거래처 `.status-badge` 단일화, 인라인 스타일 제거
- [x] 텍스트 좌측·숫자 우측·상태/액션 가운데
- [x] input/select/.btn 40px, `.btn-sm` 32px
- [x] 기존 기능 유지 (단위 테스트 통과, DOM ID 변경 없음 — `git diff`에 `id=` 변경 없음), 우리 코드 콘솔 오류 0
- [x] 1440/768 DEV 스크린샷 첨부
