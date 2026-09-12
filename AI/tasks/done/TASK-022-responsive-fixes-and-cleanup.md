# TASK-022: 반응형 결함 및 잔여 정리 (Task D)

## Objective
`AI/audits/UI-AUDIT-001.md` 감사 보고서의 잔여 결함 항목 2·3·10·12·14·16·17을 일괄 정비하여 웹앱의 반응형 완성도를 확보하고 인라인 스타일 부채를 청산한다. (항목 1은 TASK-021 C-2에서 기해결)
- **태블릿 768px(세로) 환경에서의 결함 재현 및 해결 검증 필수**
- **모바일 내 설정 폼 잘림 결함 수정 (항목 2)**: 인라인 `span 2` 제거 및 `.form-group--wide` 적용
- **모바일 사이드바 z-index 및 백드롭 신설 (항목 3)**: 헤더 가림 해결 및 `rgba(15,23,42,0.4)` 오버레이 백드롭 추가
- **내 설정 카드 폭 일치 (항목 10)**: 계정 정보 카드와 비밀번호 변경 카드 너비를 `max-width: 600px`로 통일
- **인라인 style 잔여 정리 (항목 12)**: `Index.html` 및 `JS_*.html`에 산재한 인라인 스타일 90여 개를 `Stylesheet.html` 공통 토큰/클래스로 이관
- **모바일 대시보드 헤더 컴팩트화 (항목 14)**: 4줄로 늘어지는 헤더를 2줄 이내로 정리하여 KPI 카드가 768px 첫 화면에 즉시 노출되도록 개선
- **업장 선택 모달 빈 푸터 제거 (항목 16)**: 푸터 콘텐츠가 없을 때 회색 푸터 띠 숨김 (`.modal-footer:empty` 및 `JS_UI.html:openModal` 가드)
- **거래처 목록 대량 데이터 및 공백 처리 (항목 17)**: 빈 전화번호 셀에 `—` 표시 및 25건 단위 "더 보기" 점진적 렌더링 도입 (3600px 스크롤 방지)
- **기능 및 마크업 구조 변경 없음, DOM ID 전량 보존**
- **Final Report에 데스크톱 1440px 및 태블릿 768px(세로) DEV 실측 스크린샷 첨부**

---

## Confirmed Facts
1. **진입점 호출 경로 증빙**:
   - **내 설정 (`mysettings`)**:
     `[진입점 호출 경로 증빙: src/Index.html:104 (showTab('mysettings', this)) & src/Index.html:512 (id="tab-mysettings") → src/Index.html:586 (include('JS_Auth')) → src/JS_Auth.html:74]`
   - **모바일 사이드바 & 헤더**:
     `[진입점 호출 경로 증빙: src/Index.html:44 (toggleSidebar()) & src/Index.html:73 (id="sidebar") → src/Index.html:587 (include('JS_UI')) → src/JS_UI.html:46 toggleSidebar()]`
   - **대시보드 헤더 (`dashboard`)**:
     `[진입점 호출 경로 증빙: src/Index.html:81 (showTab('dashboard', this)) & src/Index.html:124 (class="page-header") → src/Index.html:587 (include('JS_UI')) → src/JS_UI.html:122 renderDashboard()]`
   - **모달 및 업장 선택 푸터**:
     `[진입점 호출 경로 증빙: src/Index.html:58 (id="modalOverlay") & src/JS_Tx.html:5 (openShopSelectionModal()) → src/JS_UI.html:95 openModal()]`
   - **거래처 관리 (`vendor`)**:
     `[진입점 호출 경로 증빙: src/Index.html:101 (showTab('vendor', this)) & src/Index.html:460 (id="tab-vendor") → src/Index.html:592 (include('JS_Vendor')) → src/JS_Vendor.html:42 renderVendors()]`

2. **항목별 소스 코드 현황**:
   - **항목 2 (내 설정 폼 잘림)**:
     `src/Index.html:539`에 `<div class="form-group" style="grid-column: span 2;">` 존재. 태블릿/모바일(768px)에서 `.form-grid`가 1열이 되지만, 이 `span 2` 때문에 2번째 열이 강제되어 폼 우측이 잘리고 저장 버튼이 화면 밖으로 벗어남 (`M09-mysettings.png`).
   - **항목 3 (사이드바 z-index 및 딤 부재)**:
     `src/Stylesheet.html:97`에서 `.sidebar { z-index: 100 }`인 반면, `src/Stylesheet.html:771`에서 `.mobile-header { z-index: 101 }`임. 열린 사이드바 상단(브랜드 아이콘)이 헤더에 가려지며 뒤 콘텐츠를 덮는 배경 딤(오버레이) 요소가 없음 (`M02s-sidebar-open.png`).
   - **항목 10 (내 설정 카드 폭 불일치)**:
     `src/Index.html:517`의 내 계정 정보 카드는 `max-width: 600px`, `src/Index.html:552`의 비밀번호 변경 카드는 `max-width: 500px`로 서로 어긋남 (`D09-mysettings.png`).
   - **항목 12 (인라인 style 90여 개 잔존)**:
     `Index.html` (31개), `JS_Tx.html` (24개), `JS_Config.html` (19개), `JS_BaseData.html` (12개), `JS_Vendor.html` (7개)에 인라인 스타일 산재.
   - **항목 14 (모바일 대시보드 헤더 4줄)**:
     `src/Index.html:124-146`에서 제목/갱신일, 버튼 3개, 시즌 pill이 각각 줄바꿈되어 모바일에서 약 180px을 차지, KPI 카드가 첫 뷰포트 아래로 밀려남 (`M02-dashboard.png`).
   - **항목 16 (업장 선택 모달 빈 푸터)**:
     `src/JS_Tx.html:13`에서 `openModal('작업 업장 선택', '<div id="shopSelectionList"></div>', '')` 호출 시 `footerHtml`이 빈 문자열임에도 `src/Stylesheet.html:668`의 `.modal-footer`에 `padding: 16px 24px; border-top: 1px solid var(--border);`가 지정되어 회색 빈 띠가 노출됨 (`D03a-transactions-shop-select-modal.png`).
   - **항목 17 (거래처 59건 단일 페이지 및 전화 공백)**:
     `src/JS_Vendor.html:75`에서 `[v.code, v.name, v.shortName, v.bizNo, v.ceo, v.phone]` 렌더 시 전화번호가 없으면 빈 문자열(`''`)로 출력되어 휑한 빈칸이 남고, 59개 전체 행이 한 번에 렌더링되어 페이지 높이가 3600px에 달함 (`D08-vendor.png`).

---

## Hypotheses
1. `src/Index.html:539`의 인라인 `span 2`를 `.form-group--wide`로 바꾸고 768px 미디어쿼리에서 `grid-column: 1 / -1;`을 적용하면 768px 태블릿 및 390px 모바일에서 `내 설정` 폼이 완벽하게 1열 컨테이너 안에 안착한다.
2. 768px 이하에서 `.sidebar`에 `z-index: 200;`을 부여하고 반투명 백드롭(`.sidebar-backdrop`)을 신설하면 사이드바가 모바일 헤더 위에 깨끗하게 안착하며 직관적인 외부 클릭 닫기가 가능해진다.
3. `.modal-footer:empty { display: none; }` CSS 가상 클래스 및 `openModal()` 내의 `display: none` 방어 코드를 적용하면 푸터가 없는 모든 모달에서 빈 띠가 완벽히 사라진다.
4. 거래처 테이블에 `PAGE_SIZE = 25` 점진적 "더 보기" 방식을 적용하면 초기 렌더링 높이가 800px 내외로 줄어들어 모바일/태블릿 탐색 편의성이 크게 향상된다.

---

## Business Context
- 태블릿(768px~1024px) 및 현장 모바일 단말기에서 직원이 재고 시스템을 조회하거나 개인 설정을 변경할 때 폼이 잘리거나 사이드바가 헤더 밑에 끼이는 결함은 시스템 신뢰도를 저해함.
- 핵심 대시보드 화면 진입 시 최상단에 재고 요약 KPI가 바로 보여야 신속한 의사결정이 가능하며, 모달의 빈 영역이나 무한 스크롤 등 디테일을 정돈하여 완성도 높은 엔터프라이즈 UX를 제공함.

---

## Current System
- 태블릿 768px 세로 화면에서 `내 설정` 탭 조회 시 입력창과 저장 버튼이 우측으로 잘려 스크롤해야만 보이는 레이아웃 파손 상태.
- 사이드바 열림 시 상단 햄버거 헤더가 사이드바를 가리고 배경에 딤 처리가 없어 콘텐츠가 중첩되어 보임.
- 대시보드 헤더가 여러 줄로 줄바꿈되어 KPI 카드가 화면 절반 이하로 밀려남.
- 업장 선택 모달 하단에 불필요한 빈 푸터 테두리 박스가 표시됨.
- 거래처 관리 화면이 3600px 이상의 장문 페이지로 노출됨.

---

## Root Cause / Diagnostic Logic
- CSS 그리드 사양상 상위 컨테이너가 1열(`grid-template-columns: 1fr`)이라도 자식 요소에 `grid-column: span 2`가 인라인으로 박혀 있으면 브라우저는 암시적 2번째 열을 생성하여 컨테이너 너비를 초과함.
- `z-index` 계층 구조 불일치 (`.mobile-header` 101 > `.sidebar` 100).
- 모달 푸터 컨테이너가 내용 유무와 상관없이 항상 고정 패딩과 상단 보더를 렌더링함.

---

## Requirements

### Functional
- [ ] **모바일 사이드바 백드롭 (항목 3)**:
  - 햄버거 버튼으로 사이드바 열릴 때 반투명 백드롭(`.sidebar-backdrop`)이 나타나 배경 콘텐츠를 딤 처리해야 함.
  - 백드롭 클릭 시 사이드바가 닫혀야 함 (`closeSidebar()`).
  - 메뉴 항목 클릭 시 사이드바와 백드롭이 함께 닫혀야 함.
- [ ] **모달 푸터 자동 숨김 (항목 16)**:
  - `footerHtml`이 전달되지 않거나 빈 문자열인 경우(업장 선택 모달 등) 모달 푸터 영역이 완전히 숨겨져야 함.
  - `footerHtml`이 존재하는 경우 기존과 동일하게 푸터가 정상 노출되어야 함.
- [ ] **거래처 더 보기 및 공백 표시 (항목 17)**:
  - `phone` 등 비어 있는 데이터 필드는 공백 대신 `—` (em-dash)로 렌더링.
  - 거래처 목록은 초기 25건을 먼저 노출하고, 25건 초과 시 하단에 `더 보기 (N건 더 보기 / 전체 M건)` 버튼을 제공하여 클릭 시 다음 25건을 순차 로드.
  - 검색어 입력 또는 사용여부 필터 변경 시 목록 및 카운트가 즉시 1페이지(25건)로 리셋되어 올바르게 필터링되어야 함.
- [ ] **모바일 대시보드 헤더 최적화 (항목 14)**:
  - 768px 이하 모바일/태블릿에서 `#dashSeason` 배지를 `page-title-group` 내부(제목/갱신일 옆)로 재배치.
  - 헤더 버튼 그룹(`header-meta`)을 컴팩트하게 정돈하여 768px 세로 화면에서 KPI 카드가 화면 상단(스크롤 없이)에 표시되도록 보장.

### Non-Functional
- [ ] **DOM ID 전량 보존**:
  - `sidebar`, `sidebarBackdrop`, `modalOverlay`, `modalFooter`, `mySettingsUsername`, `mySettingsName`, `mySettingsDept`, `mySettingsRole`, `mySettingsShops`, `myOldPw`, `myNewPw`, `dashDate`, `dashSeason`, `vendorCount`, `vendorTableBody` 등 모든 기존 ID 보존.
- [ ] **반응형 검증 (768px 세로)**:
  - 태블릿 세로(768 × 1024px) 환경에서 가로 오버플로우/가로 스크롤 0건.
  - `Index.html:539`의 인라인 `style="grid-column: span 2;"`를 제거하고 `.form-group--wide` 클래스로 대체하여 768px 이하에서 100% 폭 안착.
  - 내 설정 카드의 너비를 `max-width: 600px`로 통일 (항목 10).
- [ ] **인라인 style 정리 (항목 12)**:
  - `src/Index.html`, `src/JS_Tx.html`, `src/JS_Config.html`, `src/JS_BaseData.html`, `src/JS_Vendor.html` 내의 인라인 스타일을 `Stylesheet.html`의 CSS 클래스로 이관.
- [ ] **Final Report**:
  - 1440px 데스크톱 및 768px 태블릿(세로) 환경의 DEV Web App 실측 스크린샷 첨부.

---

## Constraints
> **규칙 준수**: 아래는 `Docs/UIGuidelines.md` 전문 인용이다.

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

---

## Files to Inspect
- `AI/audits/UI-AUDIT-001.md`: 항목 2, 3, 10, 12, 14, 16, 17 분석 내용
- `Docs/UIGuidelines.md`: 반응형 및 UI 규칙 SSOT
- `src/Index.html`: 내 설정 마크업, 대시보드 헤더, 모바일 헤더, 사이드바
- `src/Stylesheet.html`: z-index, 반응형 미디어쿼리, 모달 푸터, 카드 폭
- `src/JS_UI.html`: 사이드바 토글, 모달 열기/닫기
- `src/JS_Vendor.html`: 거래처 렌더링 및 페이지네이션/더보기
- `src/JS_Tx.html`: 업장 선택 모달 호출부 및 인라인 스타일

---

## Files to Modify
- `src/Index.html`:
  - `<body>` 하단에 `<div id="sidebarBackdrop" class="sidebar-backdrop" onclick="closeSidebar()"></div>` 추가
  - 대시보드 헤더(`#tab-dashboard .page-header`): `#dashSeason` 배지를 `page-title-group` 내부로 이동
  - 내 설정(`#tab-mysettings`): 카드 너비 `max-width: 600px` 통일, 인라인 `span 2`를 `.form-group--wide`로 교체
  - 산재된 인라인 `style=` 속성 정리
- `src/Stylesheet.html`:
  - `.sidebar-backdrop` 스타일 추가 (z-index 150, `rgba(15,23,42,0.4)`, transition)
  - 768px 미디어쿼리 내 `.sidebar { z-index: 200; }` 수정 (모바일 헤더 101보다 높임)
  - 768px 미디어쿼리 내 `.form-group--wide { grid-column: 1 / -1; }` 보강
  - `.modal-footer:empty { display: none; }` 추가
  - 내 설정 카드 공통 클래스(`.card--settings { max-width: 600px; width: 100%; margin-bottom: 24px; }`) 추가
  - 인라인 스타일 이관용 유틸리티 및 컴포넌트 클래스 보강
- `src/JS_UI.html`:
  - `toggleSidebar()` / `closeSidebar()` 함수: 백드롭 active 토글 연동
  - `showTab()` 호출 시 `closeSidebar()` 실행
  - `openModal(title, bodyHtml, footerHtml)`: `footerHtml` 유무에 따라 `modalFooter`의 `display: none` / `display: flex` 가드 추가
- `src/JS_Vendor.html`:
  - 빈 전화번호 및 빈 필드에 `—` 표시
  - `PAGE_SIZE = 25` 점진적 "더 보기" 로직 구현 (`vendorState.visibleCount`, `showMoreVendors()`)
  - 필터/검색 변경 시 `visibleCount` 리셋
- `src/JS_Tx.html`:
  - 업장 선택 모달 내부 및 일괄 업로드 모달 내부 인라인 스타일 정리

---

## Files to Create
- **없음**

---

## Implementation Plan

### Step 1. 모바일 사이드바 z-index 및 백드롭 신설 (항목 3)
1. `src/Index.html`:
   `<body>` 내에 백드롭 엘리먼트 추가:
   ```html
   <div id="sidebarBackdrop" class="sidebar-backdrop" onclick="closeSidebar()"></div>
   ```
2. `src/Stylesheet.html`:
   ```css
   .sidebar-backdrop {
     display: none;
     position: fixed;
     inset: 0;
     background: rgba(15, 23, 42, 0.4);
     z-index: 150;
     backdrop-filter: blur(2px);
     opacity: 0;
     transition: opacity 0.2s ease;
   }
   .sidebar-backdrop.active {
     display: block;
     opacity: 1;
   }
   @media (max-width: 768px) {
     .sidebar {
       z-index: 200; /* mobile-header(101)보다 상위 */
     }
   }
   ```
3. `src/JS_UI.html`:
   ```javascript
   function toggleSidebar() {
     var sidebar = document.getElementById('sidebar');
     var isOpen = sidebar.classList.toggle('open');
     var backdrop = document.getElementById('sidebarBackdrop');
     if (backdrop) backdrop.classList.toggle('active', isOpen);
   }
   function closeSidebar() {
     var sidebar = document.getElementById('sidebar');
     if (sidebar) sidebar.classList.remove('open');
     var backdrop = document.getElementById('sidebarBackdrop');
     if (backdrop) backdrop.classList.remove('active');
   }
   ```
   `showTab()` 내 `document.getElementById('sidebar').classList.remove('open');`을 `closeSidebar();`로 교체.

### Step 2. 내 설정 반응형 및 카드 폭 통일 (항목 2, 항목 10)
1. `src/Index.html`:
   - 첫 번째 카드: `<div class="card card--settings">` (`max-width: 600px` 인라인 제거)
   - 배정된 업장 form-group:
     ```html
     <!-- 변경 전: <div class="form-group" style="grid-column: span 2;"> -->
     <div class="form-group form-group--wide">
     ```
   - 두 번째 카드 (비밀번호 변경): `<div class="card card--settings">` (`max-width: 500px` 인라인 제거)
2. `src/Stylesheet.html`:
   ```css
   .card--settings {
     max-width: 600px;
     width: 100%;
     margin-bottom: 24px;
   }
   @media (max-width: 768px) {
     .form-group--wide {
       grid-column: 1 / -1;
     }
   }
   ```

### Step 3. 모달 빈 푸터 처리 (항목 16)
1. `src/Stylesheet.html`:
   ```css
   .modal-footer:empty {
     display: none;
     border-top: none;
     padding: 0;
   }
   ```
2. `src/JS_UI.html`:
   `openModal()` 수정:
   ```javascript
   function openModal(title, bodyHtml, footerHtml) {
     document.getElementById('modalTitle').textContent = title;
     document.getElementById('modalBody').innerHTML = bodyHtml;
     var footer = document.getElementById('modalFooter');
     if (footerHtml && footerHtml.trim()) {
       footer.innerHTML = footerHtml;
       footer.style.display = 'flex';
     } else {
       footer.innerHTML = '';
       footer.style.display = 'none';
     }
     document.getElementById('modalOverlay').classList.add('active');
   }
   ```

### Step 4. 모바일 대시보드 헤더 컴팩트화 (항목 14)
1. `src/Index.html`:
   대시보드 헤더의 `#dashSeason` 배지를 `page-title-group` 내부로 이동:
   ```html
   <div class="page-title-group">
     <h2><svg class="ico"><use href="#i-layout-dashboard"/></svg>대시보드</h2>
     <span id="dashSeason" class="season-badge">-</span>
     <span class="meta-badge">
       <span class="meta-icon">🕒</span>
       <span id="dashDate">-</span>
     </span>
   </div>
   ```
2. `src/Stylesheet.html`:
   768px 미디어쿼리 내 `.header-meta` 레이아웃 정돈:
   ```css
   @media (max-width: 768px) {
     .page-header {
       margin-bottom: 16px;
       gap: 10px;
     }
     .page-title-group {
       gap: 8px;
     }
     .header-meta {
       width: 100%;
       justify-content: flex-start;
       gap: 6px;
     }
   }
   ```

### Step 5. 거래처 더 보기 및 빈 셀 `—` 처리 (항목 17)
1. `src/JS_Vendor.html`:
   - 상태에 `pageSize: 25`, `visibleCount: 25` 추가.
   - `renderVendors()`:
     - 빈 값 체크: `(value == null || String(value).trim() === '') ? '—' : String(value)`
     - 슬라이스 렌더: `var visibleList = list.slice(0, vendorState.visibleCount);`
     - 카드 푸터 또는 테이블 하단에 "더 보기" 버튼 동적 제어:
       목록이 `visibleCount`보다 많으면 `<div id="vendorMoreWrap" class="card-footer" style="justify-content:center;"><button class="btn btn-outline btn-sm" onclick="showMoreVendors()">더 보기 (${Math.min(25, list.length - vendorState.visibleCount)}건 더보기 / 전체 ${list.length}건)</button></div>` 추가, 아니면 제거.
   - `showMoreVendors()` 함수: `vendorState.visibleCount += vendorState.pageSize; renderVendors();`
   - 검색/필터 핸들러(`oninput="resetAndRenderVendors()"`): `vendorState.visibleCount = vendorState.pageSize; renderVendors();`

### Step 6. 인라인 style 잔여 정리 (항목 12)
1. `Index.html`:
   - 모바일 헤더, 내 설정 카드, 기초데이터 칩 인풋 그룹의 인라인 여백/폭을 CSS 클래스로 교체.
2. `JS_*.html`:
   - JS에서 DOM 생성 시 지정하는 `style.cssText` 중 색상·여백을 표준 CSS 클래스로 대체.

---

## Migration Plan
- **해당 없음** (데이터베이스나 시트 스키마 변경 없음).

---

## Test Plan

### Unit Test
- `npm test`로 기존 비즈니스 로직(재고 계산, 월마감, 권한 등)의 무결성 검증.

### E2E Test (Playwright)
1. **태블릿 세로 768px 검증 (필수)**:
   - 뷰포트 `768 × 1024` 설정.
   - **사이드바**: 햄버거 클릭 → 사이드바가 모바일 헤더 위로 깔끔하게 열리는지 확인 → 어두운 백드롭 노출 확인 → 백드롭 클릭 시 사이드바 닫힘 확인.
   - **내 설정**: `tab-mysettings` 이동 → 폼 입력창과 배정된 업장 박스, 비밀번호 변경 카드가 1열 컨테이너 안에 꼭 맞게 들어가며 우측 잘림 및 가로 스크롤이 전혀 없는지 확인. 저장 버튼이 화면 내에 온전히 노출되는지 확인.
   - **대시보드**: 헤더가 컴팩트하게 배치되어 첫 화면 스크롤 없이 KPI 그리드가 즉시 눈에 들어오는지 확인.
2. **업장 선택 모달 빈 푸터 검증**:
   - 데스크톱(1440px) 및 태블릿(768px)에서 업장 선택 모달 오픈 → 하단에 불필요한 빈 회색 푸터 띠가 노출되지 않는지 확인.
3. **거래처 관리 검증**:
   - `tab-vendor` 이동 → 비어 있는 전화번호 셀이 `—`로 출력되는지 확인.
   - 25건 초과 시 "더 보기" 버튼 노출 확인 → 클릭 시 다음 목록이 부드럽게 추가 렌더링되는지 확인 → 검색어 입력 시 목록이 1페이지로 리셋되는지 확인.
4. **데스크톱 1440px 검증**:
   - 기존 레이아웃 회귀 없이 정상 정렬 상태 유지 확인.

---

## Regression Risk
- **위험**: 사이드바 백드롭 z-index가 모달 오버레이(z-index: 1000)보다 높아져 모달이 가려질 위험.
  - **대응**: `.sidebar-backdrop` z-index를 150으로 설정하여 `.sidebar`(200)보다는 낮고, `.modal-overlay`(1000)보다는 현저히 낮게 계층화.
- **위험**: 거래처 "더 보기" 도입으로 기존 검색/필터링 카운트가 어긋날 위험.
  - **대응**: 전체 필터링 결과 수(`list.length`)와 현재 표시 수(`visibleList.length`)를 명확히 구분하여 배지(`vendorCount`) 및 버튼 라벨에 표시.

---

## Acceptance Criteria
- [ ] 768px 세로 환경에서 가로 오버플로우 및 잘림 현상 0건.
- [ ] `M09-mysettings.png` 결함(내 설정 폼 잘림)이 768px에서 완벽히 해결됨.
- [ ] 내 설정 두 카드의 너비가 `max-width: 600px`로 완벽히 일치함.
- [ ] 모바일 사이드바가 모바일 헤더 위(z-index 200)에 표시되고 반투명 백드롭이 동작하며 외부 클릭 시 닫힘.
- [ ] 모바일 대시보드 헤더가 2줄 내로 정돈되어 KPI 카드가 첫 뷰포트에 안착함.
- [ ] 업장 선택 모달 오픈 시 빈 회색 푸터 띠가 표시되지 않음.
- [ ] 거래처 목록에서 빈 필드가 `—`로 표시되고 25건 단위 "더 보기"가 정상 동작함.
- [ ] 인라인 `style=` 속성이 대폭 정리되고 공통 클래스로 흡수됨.
- [ ] Final Report에 1440px 데스크톱 및 768px 태블릿(세로) 실측 스크린샷이 첨부됨.

---

## Human Approval Required
- **없음** (`AI/audits/UI-AUDIT-001.md` 승인 기준에 따른 잔여 결함 수정 작업임).

---

## Deployment Notes
- `npm run dev:push`로 DEV 환경에 배포 후 Playwright로 768px 및 1440px 환경을 실측함.

---

## Rollback Plan
- 변경 사항 롤백 후 재배포:
  ```bash
  git checkout HEAD~1 -- src/Index.html src/Stylesheet.html src/JS_UI.html src/JS_Vendor.html
  npm run dev:push
  ```

---

## Final Report
*(Claude Code가 구현 완료 후 작성)*
> 구현: Claude Code · 2026-09-11 · TASK-020·021 이후 진행 · DEV 배포 `npm run dev:push` 완료

### 구현 요약 (감사 항목별)
| 항목 | 구현 |
|---|---|
| #2 내 설정 폼 잘림 | `Index.html:539` 인라인 `span 2` → `.form-group--wide`. `.card--settings .form-grid` 2열, 768px 이하 1열(카드 규칙과 같은 특이도라 **뒤에** 선언). 768px 실측: wide 필드·저장 버튼 카드 안, 가로 스크롤 0 |
| #3 사이드바 | `#sidebarBackdrop.sidebar-backdrop`(z 150, `rgba(15,23,42,.4)`, blur) 신설, 768px `.sidebar z-index 200`(> mobile-header 101). `toggleSidebar()`가 백드롭 `active` 동기화, `closeSidebar()` 신설, `showTab()`이 `closeSidebar()` 호출. 실측: 열린 사이드바 상단(y=30) `elementFromPoint`가 사이드바, 백드롭 클릭·메뉴 클릭 시 닫힘 |
| #10 카드 폭 | 두 카드 `.card--settings`(max-width 600) — 실측 600 / 600 |
| #12 인라인 style | 정적 마크업(`Index.html`) + JS 생성 마크업 전부 클래스로 이관 — `style="` **0건**, `.style.`/`cssText` **1건**(진행률 바 `width` %, 동적 값). 표시/숨김 상태(`#appContainer` `#alertBadge` `#itemNameDropdown` `#modalFooter` `.modal-close` `.admin-only`)는 `hidden` 속성으로 통일하고 `.x[hidden]{display:none}`(admin-only는 `!important`)로 display 규칙을 덮음. 신설 클래스: `.callout .warn-text .modal-msg(--lg) .modal-title-danger .modal-help .scroll-box(--sm) .bulk-guide .progress(-bar) .shop-list .option-list .option-card .checkbox-group .chip-box .chip-input-group .filter-bar .form-help(.is-privileged) .form-grid--1col .form-group--full .req .text-secondary/.text-risk/.text-order/.text-normal/.text-sm/.text-lg .pre-wrap .mt-8/.mt-10/.mb-8/.mb-12 .toast.is-leaving .card-footer--center .data-table td.actions/.w-70` + 인쇄용 `.print-table .w-15/.w-20/.tl/.stock(.neg)` |
| #14 대시보드 헤더 | `#dashSeason`을 `.page-title-group`으로 이동. 768px: `.page-header` gap 10/margin 16, `.header-meta` 100%·좌측. 실측 헤더 높이 **76px**, KPI 그리드 하단 391px(첫 화면 1024 안) |
| #16 빈 푸터 | `openModal()`이 `footerHtml` 공백이면 `innerHTML=''` + `hidden`; CSS `.modal-footer:empty`·`[hidden]` 이중 방어. 업장 선택 모달 `display:none`, 일괄 업로드 모달(버튼 3개) 정상 |
| #17 거래처 | `cellText()`로 빈 값 `—`(전화 열 등). `VENDOR_PAGE_SIZE=25` 점진 렌더 + `#vendorMoreWrap`(`.card-footer--center`) 「더 보기 (n건 더보기 / 전체 m건)」, `resetAndRenderVendors()`가 검색·필터 변경 시 1페이지로 리셋, 건수 배지는 필터 결과 기준 |
| 기타 | 좁은 폭에서 액션 버튼이 세로로 쌓이지 않게 `td.actions { white-space: nowrap }` |

### E2E 스펙 동기화
- `vendor-management.spec.js`: 25건 점진 렌더에 맞춰 `expandAllVendors()` 헬퍼(더 보기 반복 클릭) — 코드로 행을 찾거나 건수를 셀 때 사용, 검색어 삭제 시 1페이지(≤25) 복귀 단정 추가.
- `basedata-excel.spec.js`: 인쇄 HTML의 음수 재고 강조가 인라인 `#dc2626` → `td.stock.neg` 클래스(색은 `@media print`).
- 실행: `smoke · vendor-management · monthly-closing · transaction · basedata-excel` → **16 passed, 2 skipped**(승인 게이트) — DEV에 입고 1건·거래처 등록/삭제 1회 발생.

### DEV 실측 — `AI/audits/UI-AUDIT-001/after/TASK-022/`
| 폭 | 캡처 |
|---|---|
| 1440 | `D10-mysettings-1440` `D12-bulk-upload-modal-1440` `D16-shop-select-modal-1440`(푸터 없음) `D17-vendor-1440-page1`(25건 + 더 보기, 4열 픽셀화) |
| 768 세로 | `D02-mysettings-768` `D03-sidebar-open-768`(백드롭) `D14-dashboard-768` `D17-vendor-768`(픽셀화) |
- `d-check.json`: 자동 검수 **16/16 PASS**, 콘솔 오류 0 — 인라인 0 / 푸터 숨김·노출 / 25→50→59·리셋·필터 배지 / 카드 600·600 / 768 내 설정 1열·잘림 0 / 헤더 76px·KPI 첫 화면 / z-index 200>150>101·백드롭 닫힘·메뉴 닫힘 / 768 8개 탭 `scrollWidth == clientWidth`.

### Acceptance Criteria 체크
- [x] 768 세로 가로 오버플로우·잘림 0 (8개 탭)
- [x] `M09-mysettings` 결함 해결
- [x] 내 설정 카드 600px 일치
- [x] 사이드바 z 200 + 백드롭, 외부 클릭 닫힘
- [x] 모바일 대시보드 헤더 2줄(76px), KPI 첫 화면
- [x] 업장 선택 모달 빈 푸터 없음
- [x] 거래처 `—` · 25건 더 보기
- [x] 인라인 `style=` 0건 (동적 width 1건 제외)
- [x] 1440 / 768 실측 스크린샷 첨부
