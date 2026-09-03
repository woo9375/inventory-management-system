# TASK-014: UI 전면 개편 [Phase 1: B2B SaaS 디자인 시스템 구축 및 공통 쉘 리디자인]

## Objective
호텔덕구온천 재고 관리 시스템의 기존 어둡고 무거운 다크 네이비/골드 톤 디자인을 shadcn/ui와 토스(Toss) 스타일을 벤치마크한 현대적 B2B SaaS 테마('화이트 & 클린 블루')로 전면 전환한다. Phase 1에서는 전역 디자인 토큰(:root), Pretendard 웹폰트, 사이드바, 로그인 화면, 모달/토스트/로딩 오버레이 등의 공통 쉘 및 기본 컴포넌트를 개편한다.

## Confirmed Facts
- **전역 스타일시트 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:9` (`<?!= include('Stylesheet') ?>`) → `src/Stylesheet.html:1` (전역 스타일 선언)]
- **로그인 컨테이너 및 폼 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:15-40` (`#loginContainer`, `#loginUsername`, `#loginPassword`, `#rememberMe`, `#loginBtn`, `#loginError`) → `src/JS_Auth.html:22` (`submitLogin()`)]
- **모바일 헤더 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:43-47` (`.mobile-header`, `.hamburger`) → `src/JS_UI.html:45` (`toggleSidebar()`)]
- **로딩 오버레이 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:50-52` (`#loadingOverlay`) → `src/JS_UI.html:67-68` (`showLoading()`, `hideLoading()`)]
- **토스트 알림 컨테이너 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:54-56` (`#toastContainer`) → `src/JS_UI.html:70-89` (`showToast(message, type)`)]
- **공통 모달 팝업 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:58-67` (`#modalOverlay`, `#modalTitle`, `#modalBody`, `#modalFooter`) → `src/JS_UI.html:94-99` (`openModal()`, `closeModal()`)]
- **사이드바 네비게이션 진입점**:
  [진입점 호출 경로 증빙: `src/Index.html:73-114` (`#sidebar`, `.sidebar-nav`, `.nav-item`) → `src/JS_UI.html:5` (`showTab(tabId, navEl)`)]
  * 활성 탭 목록: `dashboard`(line 81), `transactions`(line 85), `shop`(line 89), `season`(line 92), `user`(line 95), `basedata`(line 98), `mysettings`(line 101)
  * 로그아웃 버튼: `src/Index.html:108` (`doLogout()`)
- **품목 마스터 웹 화면 없음 (사장 파일 주의)**:
  `src/JS_Master.html`은 `Index.html`에 include되지 않으며 `<nav>`에도 탭이 없다. 품목 마스터는 스프레드시트 `🗂️ 품목 마스터` 시트 전용이므로 웹 화면으로 개발하거나 수정하지 않는다.

## Hypotheses
- 기존 자바스크립트(`JS_Auth.html`, `JS_UI.html`)가 DOM 요소를 `document.getElementById` 또는 클래스 선택자로 직접 조작하고 있으므로, ID를 보존하고 CSS 클래스 명세를 하위 호환되도록 스타일링하면 기존 비즈니스 로직 및 서버 통신(`google.script.run`)에 결함이 발생하지 않을 것이다.

## Business Context
- 현장 직원과 관리자가 일상적으로 사용하는 호텔 재고 관리 시스템에서, 기존의 어두운 다크 네이비/골드 톤은 실내 및 모바일 환경에서 시각적 피로도를 유발하고 데이터 가독성이 떨어지는 한계가 있었다.
- 최신 B2B SaaS의 표준인 화이트 배경과 선명한 블루 액센트, 고해상도 한글 가독성을 보장하는 Pretendard 폰트를 도입하여 작업 효율성과 시스템의 시각적 완성도를 극대화한다.

## Current System
- `src/Stylesheet.html:7`에서 구글 폰트 `Noto Sans KR`을 로드하고 있으며, `:root` 변수에 다크 네이비(`--navy-900: #0a1628` ~ `--navy-500: #264a6e`), 골드(`--gold-400: #c9a84c` ~ `--gold-200: #e8d49b`), 상태색(`--risk: #c0392b`, `--order: #e67e22`, `--normal: #27ae60`)이 정의되어 있음.
- 사이드바(`aside#sidebar`)는 다크 그라데이션(`linear-gradient(180deg, var(--navy-900) 0%, var(--navy-800) 100%)`)으로 고정되어 무거운 느낌을 줌.
- 로그인 화면(`.login-container`) 역시 어두운 네이비 배경과 골드 액센트로 디자인되어 있음.

## Root Cause / Diagnostic Logic
해당 없음 (신규 UI 디자인 시스템 구축 및 리팩토링)

## Requirements
### Functional
- [ ] **Pretendard 웹폰트 적용**:
  - `src/Stylesheet.html` 상단의 `Noto Sans KR` `@import`를 제거하고 최신 Pretendard 웹폰트 CDN(`https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css`)으로 교체.
  - 전역 `font-family`에 `'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif` 선언.
- [ ] **전역 디자인 토큰(:root) 재정의 (`src/Stylesheet.html`)**:
  - **배경색**:
    - `--bg-primary`: `#f8fafc` (Slate-50, 앱 전체 기본 배경)
    - `--bg-card`: `#ffffff` (카드, 서피스, 패널 배경)
    - `--bg-sidebar`: `#ffffff` (화이트 미니멀 사이드바 배경)
    - `--bg-muted`: `#f1f5f9` (비활성/보조 영역 배경)
  - **브랜드/프라이머리 컬러 (클린 로열 블루)**:
    - `--primary`: `#2563eb` (Blue-600)
    - `--primary-hover`: `#1d4ed8` (Blue-700)
    - `--primary-light`: `#eff6ff` (Blue-50, 활성 탭 및 선택 배경)
    - `--primary-text`: `#ffffff`
  - **텍스트 및 그레이스케일**:
    - `--text-primary`: `#0f172a` (Slate-900, 고대비 본문)
    - `--text-secondary`: `#475569` (Slate-600, 부가 설명 및 라벨)
    - `--text-muted`: `#94a3b8` (Slate-400, 플레이스홀더 등)
    - `--border`: `#e2e8f0` (Slate-200, 1px 정갈한 테두리)
    - `--border-focus`: `#3b82f6` (Blue-500 포커스 링)
  - **상태 색상 (Toss/shadcn 스타일 정제)**:
    - `--risk`: `#ef4444` (Rose-500) / `--risk-light`: `#fef2f2` / `--risk-border`: `#fecaca`
    - `--order`: `#f59e0b` (Amber-500) / `--order-light`: `#fffbeb` / `--order-border`: `#fde68a`
    - `--normal`: `#10b981` (Emerald-500) / `--normal-light`: `#ecfdf5` / `--normal-border`: `#a7f3d0`
  - **다단계 은은한 레이어드 섀도우**:
    - `--shadow-sm`: `0 1px 2px 0 rgba(0, 0, 0, 0.05)`
    - `--shadow-md`: `0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)`
    - `--shadow-lg`: `0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)`
    - `--radius`: `12px` / `--radius-sm`: `8px`
- [ ] **사이드바(Sidebar) 쉘 모던화**:
  - `aside#sidebar`: 화이트 배경(`#ffffff`)과 우측 1px 경계선(`border-right: 1px solid var(--border)`), 부드러운 섀도우 적용.
  - 헤더 영역: 브랜드 로고 텍스트 색상을 다크 슬레이트(`#0f172a`)와 블루 액센트로 정돈.
  - 네비게이션 아이템(`.nav-item`):
    - 기본 상태: 부드러운 텍스트 색상(`var(--text-secondary)`), 투명 배경, 호버 시 연한 슬레이트 배경(`var(--bg-muted)`).
    - 활성 상태(`.nav-item.active`): 라운드 필(Pill) 스타일로 연한 블루 배경(`var(--primary-light)`) + 로열 블루 텍스트(`var(--primary)`) 및 볼드(600).
    - 알림 배지(`.nav-badge`): 둥근 코랄 칩 형태.
  - 하단 로그아웃 버튼: 모던 고스트/아웃라인 스타일로 개선.
- [ ] **로그인 화면(#loginContainer) 리프레시**:
  - 배경: 맑은 슬레이트 그라데이션(`linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)`).
  - 카드(`.login-card`): 화이트 서피스, 부드러운 섀도우(`--shadow-lg`), 섬세한 1px 보더.
  - 헤더(`.login-header`): 깔끔한 화이트/블루 타이포그래피.
  - 인풋 필드: 포커스 시 부드러운 블루 링(`box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15)`).
  - 버튼(`.login-btn`): 선명한 로열 블루 버튼 + 호버 인터랙션.
- [ ] **공통 컴포넌트 스타일링 현대화**:
  - 버튼: `.btn-primary`(로열 블루), `.btn-outline`(1px 슬레이트 보더 + 호버 슬레이트), `.btn-danger`(로즈), `.btn-gold`(보조 액센트).
  - 폼 컨트롤: 인풋, 셀렉트, 텍스트에어리어 기본 보더 및 포커스 링 개선.
  - 모달(`.modal`): 화이트 카드, 16px 라디우스, 부드러운 딤 오버레이(`rgba(15, 23, 42, 0.4)` + `backdrop-filter: blur(4px)`).
  - 토스트(`.toast`): 플로팅 라운드 카드, 타입별(success, error, warning, info) 세련된 파스텔 보더 및 배지.
  - 로딩 스피너(`.spinner`): 세련된 블루 스피너.

### Non-Functional
- [ ] **하위 호환성 (Zero Regression)**:
  - 기존 모든 DOM id(`loginContainer`, `loginUsername`, `loginPassword`, `rememberMe`, `loginBtn`, `loginError`, `sidebar`, `modalOverlay`, `modalTitle`, `modalBody`, `modalFooter`, `toastContainer`, `loadingOverlay`, 각 `tab-*` 컨테이너) 변경/삭제 절대 금지.
  - 인라인 `onclick`, `onkeypress` 이벤트 리스너 동작 유지.
- [ ] **순수 Vanilla CSS 유지**:
  - 외부 빌드 번들러(Tailwind CLI, PostCSS 등)를 추가하지 않고 `src/Stylesheet.html` 내 순수 CSS로 작성.

## Constraints
- Google Apps Script HTML Service 내에서 동작하므로 브라우저 표준 CSS3 및 CDN 링크 사용.
- 품목 마스터 웹 화면은 존재하지 않으므로 추가하거나 건드리지 말 것 (`src/JS_Master.html`은 사장된 코드).
- Phase 1에서는 대시보드 및 입출고 탭 내부의 복잡한 데이터 테이블 로직/마크업을 건드리지 않고, 공통 쉘과 스타일시트 기반을 완성한다.

## Files to Inspect
- `src/Stylesheet.html` (전역 스타일 및 디자인 토큰)
- `src/Index.html` (로그인 폼, 사이드바, 모달, 토스트 구조)
- `src/JS_Auth.html` (로그인 DOM 조작 핸들러)
- `src/JS_UI.html` (탭 전환, 모달, 토스트, 로딩 제어 핸들러)

## Files to Modify
- `src/Stylesheet.html`: `:root` 변수, Pretendard 웹폰트 CDN, 사이드바, 로그인, 버튼, 폼, 모달, 토스트 전역 CSS 모던화
- `src/Index.html`: 로그인 및 사이드바 영역의 인라인 스타일 정돈 및 필요한 경우 CSS 클래스 보완 (DOM ID는 100% 보존)

## Files to Create
없음

## Implementation Plan
1. **폰트 및 CSS Variables 재정비 (`src/Stylesheet.html`)**:
   - 상단 `@import`를 Pretendard 웹폰트로 교체.
   - `:root`에 화이트/클린 블루(Slate/Blue) 기반의 디자인 토큰 재정의.
2. **사이드바 스타일 교체 (`src/Stylesheet.html`)**:
   - 다크 테마 속성을 화이트 배경, 슬레이트 텍스트, 로열 블루 활성 필 스타일로 교체.
3. **로그인 화면 스타일 교체 (`src/Stylesheet.html`)**:
   - 다크 그라데이션 대신 밝고 세련된 B2B SaaS 카드 디자인 적용.
4. **공통 컴포넌트(버튼, 폼, 모달, 토스트, 스피너) 리팩토링 (`src/Stylesheet.html`)**:
   - 1px 슬레이트 보더, 블루 포커스 링, 현대적 그림자 스케일 적용.
5. **마크업 검토 및 호환성 점검 (`src/Index.html`)**:
   - 기존 ID와 이벤트 바인딩이 온전히 유지되었는지 확인.

## Migration Plan
없음 (시트 데이터 구조 및 서버 로직 변경 없음)

## Test Plan
### Unit Test
- 없음 (순수 CSS 및 HTML 프론트엔드 뷰 변경)

### E2E Test (Playwright)
1. **로그인 화면 검증**:
   - DEV 웹앱 접속 시 깨끗한 화이트/블루 톤의 모던 로그인 카드가 정상 표시되는지 확인.
   - 이메일/비밀번호 입력 필드 포커스 시 블루 링이 활성화되는지 확인.
2. **로그인 성공 및 사이드바 검증**:
   - 정상 로그인 후 `#appContainer`가 노출되고 화이트 미니멀 사이드바가 렌더링되는지 확인.
   - 각 탭(대시보드, 입출고 기록 등) 클릭 시 `showTab()` 동작 및 해당 `.nav-item.active`의 블루 필 스타일 활성화 확인.
3. **모달 및 토스트 동작 검증**:
   - 모달 열기/닫기 인터랙션 시 글래스모피즘 딤 오버레이 및 모달 카드가 정상 팝업되는지 확인.
   - 토스트 알림 발생 시 우측 상단에 정갈하게 노출된 후 페이드아웃되는지 확인.

## Regression Risk
- 색상 및 여백 변경으로 인해 특정 탭 내 인라인 스타일이 적용된 텍스트의 대비(Contrast)가 낮아질 가능성:
  -> 전역 `--text-primary`를 `#0f172a`로 높여 명도 대비 WCAG AA 기준 충족.
- 기존 JS 함수에서 특정 클래스명에 의존하는 토글(`active`, `open`, `hidden` 등)이 누락될 가능성:
  -> 기존에 사용되던 상태 클래스명(`.active`, `.open`, `.hidden` 등)을 그대로 유지.

## Acceptance Criteria
- [ ] Pretendard 웹폰트가 웹앱 전체에 로드되어 정상 적용된다.
- [ ] 시스템 전반의 톤앤매너가 다크 네이비/골드에서 화이트/클린 블루(B2B SaaS 테마)로 전환된다.
- [ ] 사이드바 네비게이션이 화이트 배경 + 블루 필 활성 상태로 깔끔하게 렌더링된다.
- [ ] 로그인 폼, 버튼, 인풋, 모달, 토스트가 현대적이고 일관된 디자인 시스템을 따른다.
- [ ] 기존 로그인, 탭 전환, 모달 팝업, 비밀번호 변경 등의 자바스크립트 기능이 100% 정상 작동한다.

## Human Approval Required
없음

## Deployment Notes
- `clasp push` 후 DEV 웹앱 URL에서 시각적 렌더링 및 기능 정상 여부를 즉시 검증한다.

## Rollback Plan
- `git checkout src/Stylesheet.html src/Index.html`로 롤백.

## Final Report

**구현 완료** (2026-09-02, Claude Code)

### 변경 파일
| 파일 | 내용 |
|---|---|
| `src/Stylesheet.html` | 전면 재작성 — Pretendard CDN, 화이트/클린 블루 디자인 토큰, 사이드바·로그인·버튼·폼·모달·토스트·스피너·드롭다운 현대화 |
| `src/Index.html` | 로그인 `로그인 상태 유지` 행 → `.login-remember` 클래스, 사이드바 로그아웃 래퍼 → `.sidebar-actions` 클래스 (인라인 스타일 제거, DOM ID 전량 보존) |

### 구현 상세
1. **폰트**: `Noto Sans KR` @import 제거 → Pretendard v1.3.9 CDN. `body` font-family를 `Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif`로 교체하고 안티에일리어싱 적용.
2. **디자인 토큰**: 명세대로 배경(`--bg-primary/card/sidebar/muted`), 프라이머리(`--primary` #2563eb 계열), 텍스트/그레이(`--text-primary` #0f172a ~ `--border-focus`), 상태 3종 × (base/light/border), 3단계 섀도우, `--radius` 12px/8px를 `:root`에 정의. 추가로 `--focus-ring`, 상태별 텍스트용 진한 톤(`--risk-text/--order-text/--normal-text`)을 파생 토큰으로 정의.
3. **사이드바**: 화이트 배경 + `border-right: 1px solid var(--border)` + soft shadow. `.nav-item`은 슬레이트 텍스트 → hover `--bg-muted` → active는 `--primary-light` 배경 + `--primary` 텍스트 + 600 웨이트의 라운드 필(10px). `.nav-badge`는 로즈 캡슐 칩.
4. **로그아웃 버튼**: 기존 `.logout-btn`은 `.sidebar-user .logout-btn`으로만 스타일이 있어 사이드바 하단 버튼(Index.html)이 무스타일 상태였다. 독립 `.logout-btn` 고스트/아웃라인 스타일을 신설하고 hover 시 로즈 톤으로 전환.
5. **로그인**: 슬레이트 그라데이션 배경 + 화이트 카드(`--shadow-lg`, 1px 보더), 헤더 화이트/블루 타이포, 인풋 포커스 시 `0 0 0 3px rgba(37,99,235,0.15)` 블루 링, CTA는 솔리드 로열 블루.
6. **공통 컴포넌트**: `.btn-primary`(블루) / `.btn-outline`(1px 슬레이트) / `.btn-danger`(로즈) / `.btn-gold`(앰버 보조 액센트, 어두운 텍스트로 대비 확보). 폼 컨트롤은 `.form-group` 한정에서 `input/select/textarea` 전역 규칙으로 확장(체크박스·라디오 제외)하여 기초데이터 탭의 무스타일 인풋까지 커버. 모달은 16px 라디우스 + `rgba(15,23,42,0.4)` + blur(4px), 토스트는 화이트/파스텔 카드 + 4px 컬러 좌측 보더, 스피너는 화이트/블루 톤.

### 하위 호환 조치 (중요)
`--navy-*`, `--gold*` 토큰은 `src/Index.html:127,209,273`, `src/JS_BaseData.html:128`, `src/JS_Master.html:173`의 인라인 스타일에서 여전히 참조된다. 토큰을 삭제하면 해당 선언이 무효화되어 색이 빠지므로, `:root`에 **레거시 별칭**으로 남기되 신규 팔레트(슬레이트/블루/앰버)로 재매핑했다. 결과적으로 인라인 스타일도 새 톤앤매너를 따른다. 신규 코드는 별칭 대신 신규 토큰을 사용할 것.

### 검증
- **로컬 렌더링 검증**: `src/Index.html` + 새 `Stylesheet.html`을 실제 마크업 그대로 정적 렌더(더미 데이터 주입)하여 로그인 화면 / 앱 쉘 / 모달 / 토스트 4종을 육안 확인.
  - 인풋 포커스 computed style: `box-shadow: rgba(37,99,235,0.15) 0 0 0 3px`, `border-color: rgb(59,130,246)` — 블루 링 정상.
  - `body` computed font-family에 Pretendard 적용 확인.
- **DOM 계약**: `loginContainer`, `loginUsername`, `loginPassword`, `rememberMe`, `loginBtn`, `loginError`, `sidebar`, `modalOverlay/Title/Body/Footer`, `toastContainer`, `loadingOverlay`, `tab-*`, `alertBadge` 전량 보존. 상태 클래스(`.active`, `.open`, `.hidden`)와 인라인 `onclick`/`onkeypress` 미변경.
- **DEV 배포**: `npm run dev:push` 완료 (26 files).
  - 검증 URL: https://script.google.com/macros/s/AKfycbz-0sbkngtuonF3m9SDu_J1JJF809ISze-Nxvf5La7S/exec (DEV @HEAD)

### 남은 확인 (Human QA)
- DEV 웹앱 실제 로그인 → 탭 전환 → 모달/토스트 동작 육안 확인.
- Phase 2(TASK-015)에서 대시보드 헤더·KPI·테이블을 이어서 리디자인한다.
