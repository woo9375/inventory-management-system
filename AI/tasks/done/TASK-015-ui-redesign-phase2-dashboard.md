# TASK-015: UI 전면 개편 [Phase 2: 대시보드 KPI 카드 및 재고 테이블 집중 리디자인]

## Objective
TASK-014(Phase 1: 디자인 시스템 및 공통 쉘)에서 구축된 화이트 & 클린 블루(Pretendard 폰트, :root 디자인 토큰) 환경을 바탕으로, 메인 대시보드 탭(`#tab-dashboard`)의 상단 헤더, KPI 요약 통계 카드 4종, 위험·발주필요 품목 데이터 테이블을 토스(Toss) 및 Stripe 벤치마크 스타일로 집중 리디자인한다.

## Confirmed Facts
- **대시보드 탭 진입 메뉴 및 컨테이너**:
  [진입점 호출 경로 증빙: `src/Index.html:81` (`showTab('dashboard', this)`) → `src/Index.html:120` (`<div id="tab-dashboard" class="tab-content active">`)]
- **대시보드 렌더링 스크립트 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:523` (`<?!= include('JS_UI') ?>`) → `src/JS_UI.html:121` (`renderDashboard(data)`)]
- **대시보드 헤더 및 메타/액션 버튼 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:121-144` (`.page-header`, `#dashDate`, `#dashSeason`, `doForceRefresh(loadDashboard)`, `doSystemCommand('refreshDashboard')`, `openPhysicalCheckModal('pdf')`, `openPhysicalCheckModal('excel')`)]
- **KPI 요약 카드 및 DOM ID 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:146-163` (`.kpi-grid`, `.kpi-card`, `#kpiTotal`, `#kpiRisk`, `#kpiOrder`, `#kpiNormal`) → `src/JS_UI.html:124-127`]
- **사이드바 알림 배지 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:83` (`#alertBadge`) → `src/JS_UI.html:130-132`]
- **위험 · 발주필요 품목 테이블 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:165-194` (`.card`, `.data-table-wrapper`, `table.data-table`, `tbody#alertTableBody`) → `src/JS_UI.html:134-166`]
  * 테이블 행 동적 생성: `src/JS_UI.html:143-164`에서 컬럼 순서 `[item.code, item.name, item.grade, item.currentStock, item.safetyStock, item.rop, item.orderQty, statusCell]` 순으로 `tr > td`를 생성하여 주입함.
  * 음수 재고 강조: `src/JS_UI.html:149-153` (TASK-011)에서 `index === 3` 음수일 때 `color:#c53929; background:#fce8e6` 인라인 스타일 부여.
  * 상태 배지 클래스: `src/JS_UI.html:159`에서 `.status-badge.risk`, `.status-badge.order` 부여.
- **품목 마스터 웹 화면 없음 (Dead Code 주의)**:
  `src/JS_Master.html`은 사장된 코드이며 웹앱 화면이 없다. 품목 마스터는 스프레드시트 `🗂️ 품목 마스터` 전용이므로 대시보드 리디자인 시 절대 관여하거나 추가하지 않는다.

## Hypotheses
- `JS_UI.html`의 `renderDashboard(data)` 함수는 `#alertTableBody`의 `tr > td` 구조와 `.status-badge` 클래스를 동적으로 생성하므로, CSS에서 해당 클래스(`.data-table`, `.status-badge`, `.kpi-card` 등)를 모던하게 재정의하면 JS 로직 수정 없이 완벽한 시각적 개선이 가능하다.

## Business Context
- 대시보드는 호텔덕구온천 전 업장(본관, 스파월드 등)의 총괄 관리자 및 현장 담당자가 시스템 접속 시 가장 먼저 마주하는 핵심 업무 화면이다.
- 현재 대시보드는 어두운 네이비색 테이블 헤더(`.data-table thead th`), 다소 투박한 KPI 카드 테두리로 인해 가독성이 제한적이다.
- 토스 스타일의 굵고 시원한 KPI 통계 수치와 Stripe 스타일의 정갈한 화이트 테이블을 적용하여 재고 위험/발주필요 상태를 1초 만에 인지할 수 있도록 업무 가독성을 극대화한다.

## Current System
- `src/Index.html:121-144`: `.page-header` 내부에 인라인 스타일(`style="display: flex; ..."`)이 혼재되어 있으며, 날짜 뱃지와 시즌 뱃지가 산발적으로 배치되어 있음.
- `src/Stylesheet.html:199-240`: `.kpi-grid` 및 `.kpi-card`는 상단 4px 컬러 바(`.kpi-card::before`)에 의존하며, 카드 폰트 계층이 다소 작고 밋밋함.
- `src/Stylesheet.html:270-316`: `.data-table thead th`가 다크 네이비(`var(--navy-800)`) 배경으로 어둡고 무거우며, 본문 행(td)의 상하 여백이 11px로 좁아 데이터 시인성이 낮음.

## Root Cause / Diagnostic Logic
해당 없음 (UI/UX 뷰 리디자인)

## Requirements
### Functional
- [ ] **페이지 헤더 모던화 (`src/Index.html:121-144`, `src/Stylesheet.html`)**:
  - 대시보드 제목(`📊 대시보드`), 최신 갱신일 배지(`#dashDate`), 시즌 배지(`#dashSeason`)를 정갈한 인라인 플렉스 툴바로 정돈.
  - 액션 버튼 그룹(🔄 시트 동기화, 🔄 통합갱신, 🖨️ 인쇄/다운로드 드롭다운)의 여백과 호버 스타일을 통일된 B2B 버튼 컴포넌트로 정리.
  - 인라인 스타일을 정리하고 의미 있는 CSS 클래스 적용.
- [ ] **KPI 통계 카드 리디자인 (토스 스타일 - `src/Stylesheet.html`)**:
  - 카드 컨테이너(`.kpi-card`):
    - 슬림한 1px 보더(`border: 1px solid var(--border)`), 부드러운 라운드(`border-radius: 12px`), 화이트 서피스(`var(--bg-card)`).
    - 상단 투박한 4px 바 대신, 카드 배경에 각 상태별 아주 은은한 틴트(Tint) 또는 좌측 미세 액센트 및 호버 시 부드러운 리프트 효과(`transform: translateY(-2px); box-shadow: var(--shadow-md);`).
  - 폰트 계층 (Toss 벤치마크):
    - 라벨(`.kpi-label`): `font-size: 0.85rem`, `font-weight: 500`, 차분한 슬레이트 그레이(`var(--text-secondary)`).
    - 수치(`.kpi-value`): `font-size: 2.25rem ~ 2.5rem`, `font-weight: 700`, Pretendard의 선명한 숫자 볼드 적용.
    - 단위(`.kpi-unit`): `font-size: 0.9rem`, 은은한 보조 텍스트 색상.
  - 상태별 시각적 강조:
    - `.kpi-card.risk`: 🚨 위험 수치에 로즈(#EF4444) 색상과 연한 파스텔 배경(#FEF2F2).
    - `.kpi-card.order`: ⚠️ 발주필요 수치에 앰버(#F59E0B) 색상과 연한 파스텔 배경(#FFFBEB).
    - `.kpi-card.normal`: ✅ 정상 수치에 에메랄드(#10B981) 색상.
    - `.kpi-card.total`: 전체 품목 수치에 슬레이트(#0F172A) 색상.
- [ ] **위험 · 발주필요 품목 테이블 리디자인 (Stripe 스타일 - `src/Stylesheet.html`)**:
  - 카드 래퍼(`.card`): 화이트 서피스, 1px 보더, 깔끔한 카드 헤더(`h3` 타이틀과 아이콘 정렬).
  - 테이블 헤더(`.data-table thead th`):
    - 기존의 어두운 네이비 배경을 완전히 제거하고, 세련된 소프트 슬레이트(#F8FAFC) 배경 및 하단 1px 보더(#E2E8F0) 적용.
    - 텍스트: 슬레이트 그레이(#475569), `font-size: 0.82rem`, `font-weight: 600`, 중앙/좌측 정렬 최적화.
  - 테이블 본문(`.data-table tbody td`):
    - 행 상하 패딩을 충분히 확보(`padding: 14px 16px`)하여 행간 가독성 대폭 향상.
    - 호버 효과: 마우스 오버 시 아주 은은한 블루 그레이(#F1F5F9) 하이라이트.
    - 숫자 컬럼(현재고, 안전재고, 발주점, 적정발주량): 시각적으로 정돈되도록 Pretendard 숫자 고정폭/우측 정렬 친화적 렌더링.
  - 상태 배지(`.status-badge`):
    - 둥근 캡슐형 라운드 필(Pill) 형태 (`border-radius: 9999px`, `padding: 4px 10px`, `font-size: 0.75rem`, `font-weight: 600`).
    - `.status-badge.risk`: 배경 `#FEF2F2`, 텍스트 `#DC2626`, 미세 보더 `1px solid #FECACA`.
    - `.status-badge.order`: 배경 `#FFFBEB`, 텍스트 `#D97706`, 미세 보더 `1px solid #FDE68A`.
  - 데이터 없는 상태(`.empty-state`):
    - 정갈한 패딩과 축하/안내 아이콘(🎉)이 돋보이는 모던 엠프티 스테이트 스타일.

### Non-Functional
- [ ] **자바스크립트 바인딩 100% 보존**:
  - `dashDate`, `dashSeason`, `kpiTotal`, `kpiRisk`, `kpiOrder`, `kpiNormal`, `alertBadge`, `alertTableBody` 등 모든 DOM ID 보존.
  - `JS_UI.html`의 `renderDashboard(data)`가 innerHTML 및 createElement로 생성하는 노드들이 정확히 스타일링되도록 CSS 셀렉터 연계.
- [ ] **반응형 가독성 유지**:
  - 태블릿 및 모바일 환경에서 `.kpi-grid`가 자연스럽게 2열 또는 1열로 래핑되도록 미디어 쿼리 최적화.
  - 테이블 가로 스크롤(`.data-table-wrapper`) 부드러운 스크롤바 스타일 적용.

## Constraints
- Google Apps Script 환경에서 순수 CSS(`src/Stylesheet.html`) 및 `src/Index.html` 마크업으로만 구현.
- 서버단 함수(`Dashboard.gs`, `WebApp.gs`) 및 데이터 포맷은 일체 변경하지 않는다.

## Files to Inspect
- `src/Index.html` (대시보드 탭 마크업: 라인 120~195)
- `src/Stylesheet.html` (KPI 카드 및 테이블 스타일: 라인 168~316)
- `src/JS_UI.html` (대시보드 렌더링 함수: 라인 120~166)

## Files to Modify
- `src/Stylesheet.html`: 대시보드 헤더, KPI 카드 그리드, 테이블 thead/tbody, 상태 배지, 엠프티 스테이트 CSS 전면 현대화
- `src/Index.html`: `#tab-dashboard` 내부의 인라인 스타일 정리 및 클래스 구조 보완 (DOM ID는 100% 보존)

## Files to Create
없음

## Implementation Plan
1. **대시보드 페이지 헤더 정돈 (`src/Index.html`, `src/Stylesheet.html`)**:
   - 인라인 스타일을 정리하고, 날짜 배지 및 시즌 배지와 우측 버튼 그룹을 깔끔한 flex 툴바로 정의.
2. **KPI 요약 카드 컴포넌트 리팩토링 (`src/Stylesheet.html`)**:
   - `.kpi-grid`를 반응형 그리드로 정비.
   - `.kpi-card`의 배경, 보더, 호버 효과, 큰 볼드 숫자 타이포그래피(2.25rem) 적용.
   - `total`, `risk`, `order`, `normal` 4개 상태별 테마 색상 정밀 매핑.
3. **데이터 테이블 컴포넌트 모던화 (`src/Stylesheet.html`)**:
   - `table.data-table thead th`를 어두운 네이비에서 밝은 슬레이트 톤(#F8FAFC)으로 교체.
   - 행(`tbody tr`) 호버 트랜지션 및 `td` 여백(14px 16px) 최적화.
   - `.status-badge`를 1px 보더가 들어간 토스/shadcn형 라운드 필 배지로 리디자인.
4. **JS 렌더링 호환성 검증**:
   - `JS_UI.html`의 `renderDashboard()` 호출 시 생성되는 동적 DOM 노드가 새 스타일에 정확히 안착하는지 확인.

## Migration Plan
없음

## Test Plan
### Unit Test
- 없음 (순수 프론트엔드 UI 뷰 변경)

### E2E Test (Playwright)
1. **대시보드 탭 로딩 및 데이터 바인딩 검증**:
   - 로그인 후 대시보드 진입 시 `dashDate`, `dashSeason`, KPI 4종 수치가 정확히 노출되는지 확인.
2. **KPI 카드 렌더링 검증**:
   - 전체/위험/발주필요/정상 4개 카드가 선명한 볼드 숫자와 상태별 파스텔 배경으로 깔끔하게 표시되는지 확인.
   - 카드 호버 시 부드러운 리프트 효과 동작 확인.
3. **위험·발주필요 테이블 렌더링 검증**:
   - 밝은 슬레이트 톤의 thead와 여백이 넓어진 행(tr)들이 정상 렌더링되는지 확인.
   - 행 호버 시 하이라이트가 동작하는지 확인.
   - 상태 컬럼에 '🚨 위험', '⚠️ 발주필요' 라운드 필 배지가 시각적으로 명확히 표시되는지 확인.
   - [TASK-011] 음수 현재고(초과출고) 품목이 있는 경우 적색 하이라이트가 유지되는지 확인.
4. **헤더 액션 버튼 검증**:
   - '🔄 시트 동기화', '🖨️ 인쇄/다운로드' 버튼 클릭 및 드롭다운 메뉴가 정상 작동하는지 확인.

## Regression Risk
- `JS_UI.html:149`의 음수 재고 강조 인라인 스타일(`color:#c53929; background:#fce8e6;`)과 새 테이블 스타일 간의 시각적 충돌 여부:
  -> 새 테이블 배경 및 폰트 크기와 자연스럽게 어우러지도록 검증.
- `alertTableBody` 내 데이터가 없을 때의 `empty-state`가 어색하게 깨지지 않도록 `.empty-state` 스타일 보존.

## Acceptance Criteria
- [ ] 대시보드 상단 헤더(제목, 날짜, 시즌 배지, 액션 버튼)가 깔끔한 SaaS 툴바로 정돈된다.
- [ ] KPI 카드 4종이 토스 스타일의 크고 선명한 숫자 폰트와 상태별 파스텔 톤으로 리디자인된다.
- [ ] 데이터 테이블의 어두운 헤더가 제거되고, Stripe 스타일의 밝은 슬레이트 헤더 및 여유로운 행 패딩이 적용된다.
- [ ] 상태 배지가 둥근 캡슐형 칩 형태로 가독성 높게 표시된다.
- [ ] 대시보드의 모든 데이터 바인딩 및 버튼 클릭 기능이 100% 정상 작동한다.

## Human Approval Required
없음

## Deployment Notes
- `clasp push` 후 DEV 웹앱에서 실제 시트 데이터가 바인딩된 대시보드 화면을 확인한다.

## Rollback Plan
- `git checkout src/Stylesheet.html src/Index.html`로 롤백.

## Final Report

**구현 완료** (2026-09-02, Claude Code)

### 변경 파일
| 파일 | 내용 |
|---|---|
| `src/Index.html` | `#tab-dashboard` 페이지 헤더 마크업 정리 — 인라인 스타일 전량 제거, `.page-title-group` / `.meta-badge` 클래스 도입 (DOM ID·onclick 100% 보존) |
| `src/Stylesheet.html` | 페이지 헤더 툴바, KPI 카드, 데이터 테이블, 상태 배지, 엠프티 스테이트, 반응형 CSS 현대화 |

### 구현 상세
1. **페이지 헤더**: 제목 + 갱신일 배지를 `.page-title-group`(flex, wrap)으로, 액션 버튼과 시즌 배지를 `.header-meta`(flex-wrap, gap 8px, 우측 정렬)로 묶었다. 기존 `style="margin-right:4px"` 등 개별 여백 인라인 스타일은 gap으로 대체. 갱신일 칩은 `.meta-badge`(슬레이트 pill + 🕒 아이콘)로 컴포넌트화.
2. **KPI 카드 (토스 스타일)**: 상단 4px 바를 좌측 3px 액센트로 교체하고, 위험/발주필요 카드에 파스텔 틴트(#FEF2F2 / #FFFBEB)와 대응 보더를 적용. 수치는 2.25rem / 700 / `letter-spacing:-0.03em` / `tabular-nums`, 라벨 0.85rem·500 슬레이트, 단위 0.9rem. 색상 매핑은 total=슬레이트(#0F172A), risk=#EF4444, order=#F59E0B, normal=#10B981. 호버 시 `translateY(-2px)` + `--shadow-md` 리프트 유지.
3. **데이터 테이블 (Stripe 스타일)**: `thead th`의 다크 네이비 배경을 제거하고 `#F8FAFC` 배경 + `#E2E8F0` 하단 보더 + `#475569` 0.82rem/600 텍스트로 교체. `tbody td`는 패딩 14px 16px, 0.87rem, `tabular-nums`(숫자 컬럼 자릿수 정렬), 호버 시 `#F1F5F9` 하이라이트.
4. **상태 배지**: `border-radius: 9999px`, `padding: 4px 10px`, 0.75rem/600에 1px 보더를 더한 캡슐 필. risk=#FEF2F2/#DC2626/#FECACA, order=#FFFBEB/#D97706/#FDE68A (Phase 1에서 도입한 토큰 그대로 사용).
5. **엠프티 스테이트**: 패딩 52px, 아이콘 2.6rem, 문구 0.92rem/500으로 정돈. 빈 상태 행은 hover 하이라이트에서 제외해 클릭 가능한 행처럼 보이지 않게 했다.
6. **반응형**: `.kpi-grid`는 1000px 이하 2열, 480px 이하 2열(축소 타이포). `.data-table-wrapper`의 가로 스크롤을 미디어쿼리 밖으로 올려 상시 적용.

### 함께 고친 반응형 결함 (Phase 2 요구사항 "반응형 가독성 유지" 범위)
모바일 폭(375px)에서 8열 테이블의 min-content(581px)가 `.main-content`(flex item, `min-width:auto`)를 밀어내 **페이지 전체가 663px로 가로 오버플로**되고 KPI 카드가 화면 밖으로 잘려 나갔다. `.main-content`에 `min-width: 0`을 지정해 자동 최소 크기를 해제, 넓은 테이블이 `.data-table-wrapper` 내부에서만 가로 스크롤되도록 했다 (375px 기준 body scrollWidth 663 → 375, KPI 2열 167px 정상).

### 검증
**1) DEV 실측 (E2E, 임시 스펙으로 검증 후 삭제)** — 로그인 → 대시보드 렌더링 → 탭 전환까지 통과.
```
[dashboard] {"date":"최신 갱신일: 2026-09-02 16:25","season":"가을 (×1)","total":"4292","risk":"0","order":"0","normal":"0","rows":1}
[styles]    {"kpiValueSize":"31.5px","kpiValueWeight":"700","kpiRiskBg":"rgb(254,242,242)","kpiOrderBg":"rgb(255,251,235)",
             "theadBg":"rgb(248,250,252)","theadColor":"rgb(71,85,105)","tdPadding":"14px 16px","bodyOverflowX":true}
```
- 검증 URL: https://script.google.com/macros/s/AKfycbz-0sbkngtuonF3m9SDu_J1JJF809ISze-Nxvf5La7S/exec (DEV @HEAD)
- 데이터 바인딩(`dashDate`/`dashSeason`/KPI 4종) 정상, 사이드바 활성 필 이동 정상.
**2) 로컬 정적 렌더링** — 실제 `Index.html` 마크업 + 더미 데이터로 데스크톱(1280) / 태블릿(1000) / 모바일(375), 그리고 데이터 있음/없음 두 상태를 육안 확인. 음수 현재고(-3)의 TASK-011 인라인 붉은 배지가 새 테이블 스타일과 충돌 없이 표시됨을 확인.
**3) 회귀** — `npm run test:unit` 8개 파일 전체 통과, `smoke.spec.js` 2건 통과.

### 한계 (Human QA 필요)
현재 DEV 데이터는 위험·발주필요 품목이 0건이라 알림 테이블이 엠프티 스테이트(🎉)로만 렌더링됐다. 따라서 **실데이터 기준의 상태 배지·행 호버·음수 재고 강조는 DEV에서 실측하지 못했고**, 동일 CSS를 로컬 렌더링으로만 확인했다. 위험 품목이 발생한 시점 또는 `negative-stock.spec.js` 실행 시 한 번 더 육안 확인이 필요하다.
