# TASK-021: 입출고 기록 탭 리디자인 (Task C)

## Objective
`AI/audits/UI-AUDIT-001.md`의 「승인된 목업 → Task C 스펙」 표 C-1 ~ C-7(C-6 세그먼트 포함)과 승인 목업 `AI/audits/UI-AUDIT-001/mockup-transactions.html`에 따라 입출고 기록(`tab-transactions`) 탭을 전면 리디자인한다.
- 선행 조건: **TASK-020 (Task B: 디자인 시스템 통일) 완료**
- `#btnShopSelectModal`을 제목 옆의 세련된 업장 컨텍스트 칩(`.shop-chip`)으로 변경 (C-1)
- `.form-grid` PC 4열 고정 및 넓은 필드(`.form-group--wide`) 적용으로 반응형 및 자동완성 가독성 개선 (C-2, P0 결함 #1 해결)
- 카드 하단 `.card-footer`를 신설하여 주 액션(블루 단일 `btn-primary` + `save` 아이콘) 및 `btn-outline` 초기화 버튼 배치 (C-3)
- 상시 안내 배너 div를 제거하고 카드 헤더 캡션(`.cap`)으로 간결화 (C-4)
- 최근 입출고 내역 테이블에 통일된 정렬 클래스(`.num`, `.ctr`, `.mono`, `.muted`) 및 `.status-badge` 적용 (C-5)
- `#txType` select를 hidden으로 두고 1클릭 `.segmented` 버튼 연동 (C-6)
- 헤더 우측 5개 버튼을 2개 outline 버튼 + 1개 관리자 전용 드롭다운(「관리 ▾」)으로 정돈 (C-7)
- 목업 원본 `mockup-transactions.html`의 제안 CSS 블록을 `src/Stylesheet.html`에 이식
- **모든 기존 DOM ID 전량 보존 및 기능·비즈니스 로직 100% 유지**
- **Final Report에 `mockup-transactions-approved.png`와 DEV 구현 화면을 나란히 비교하는 스크린샷 첨부**

---

## Confirmed Facts
1. **진입점 호출 경로 증빙**:
   - `[진입점 호출 경로 증빙: src/Index.html:85 (showTab('transactions', this)) & src/Index.html:200 (id="tab-transactions") → src/Index.html:588 (include('JS_Tx')) → src/JS_Tx.html:177 loadTransactions() / src/JS_Tx.html:211 saveTransaction()]`
2. **승인된 목업 및 기준 자료**:
   - `AI/audits/UI-AUDIT-001.md`: 사장님 확정 결정 ④ (`mockup-transactions.html` 승인 상태 채택, C-1 ~ C-7 전부 채택)
   - `AI/audits/UI-AUDIT-001/mockup-transactions-approved.png`: 시각적 합격 기준 스냅샷
   - `AI/audits/UI-AUDIT-001/mockup-transactions.html`: 런타임 동작 및 스타일 SSOT
3. **현재 소스 코드 현황**:
   - `src/Index.html:200-308`: 입출고 기록 탭 마크업
     - 헤더에 5개 버튼 난립: `시트 동기화`, `신규 내역 취합`, `수동 월마감`, `일괄 업로드`, `업장 선택...`
     - `Index.html:215`: `#btnShopSelectModal`이 거대한 2px 블루 보더 버튼으로 되어 있어 주 액션보다 눈에 띔.
     - `Index.html:229-265`: `.form-grid`에 인라인 `style="grid-column: span 2"`(비고)가 있어 768px 모바일에서 2번째 열을 생성해 폼이 카드 밖으로 잘림(UI-AUDIT-001 P0 결함 #1).
     - `Index.html:267`: 저장 버튼이 `.card-body` 안쪽에 앰버 색상(`btn-gold`)으로 위치.
     - `Index.html:279-282`: 네이비 그라데이션 안내 배너 상시 표시.
     - `Index.html:284-296`: 테이블 `<th>`에 정렬 클래스 미부여.
   - `src/JS_Tx.html`:
     - `JS_Tx.html:31-38`: `selectShopFromModal()`이 `btn.textContent = '🏪 업장 선택: ' + text + ' ▼'`로 텍스트를 직접 덮어씀.
     - `JS_Tx.html:188-209`: `renderTransactions()`에서 `<td>`에 클래스 없이 인라인 `td.style`로 색상 처리.
     - `JS_Tx.html:211-247`: `saveTransaction()`이 성공 후 입력 필드를 하나씩 수동 리셋함.
4. **사장된 코드 배제**:
   - `src/JS_Master.html`은 웹앱 진입점이 없는 사장된 코드이므로 절대 수정하지 않음.

---

## Hypotheses
1. `.form-grid`를 PC 4열(`repeat(4, minmax(0, 1fr))`), 태블릿 2열, 모바일 1열로 변경하고 `품목명 검색`에 `.form-group--wide`, 비고의 인라인 span을 제거하면 P0 #1 결함(모바일 폼 잘림)이 완벽하게 해결된다.
2. `#txType` select 태그를 `hidden` 속성으로 숨기고 `.segmented` 버튼이 `select.value`를 변경하도록 연결하면, 기존 `saveTransaction()` 등 `document.getElementById('txType').value`를 참조하는 모든 로직이 코드 변경 없이 100% 정상 작동한다.
3. `#btnShopSelectModal`의 ID와 `onclick="openShopSelectionModal()"`을 그대로 유지하면서 내부 구조만 칩 형태로 변경하고 `selectShopFromModal`의 텍스트 갱신부만 수정하면 기존 모달 선택 기능이 완벽히 유지된다.

---

## Business Context
- 입출고 기록 화면은 현장 직원과 관리자가 일상 업무에서 가장 빈번하게 사용하는 핵심 화면이다.
- 화면 진입 시 작업할 업장(컨텍스트)이 명확히 인지되어야 하고, 폼 입력 동선(날짜 → 품목 검색 → 수량 → 구분 등)이 4열 그리드로 정돈되어 시선 이동을 최소화해야 한다.
- 또한 실수로 잘못 누를 수 있는 관리자 전용 액션(수동 월마감, 신규 내역 취합)을 드롭다운으로 분리하여 안전성과 심미성을 동시에 확보한다.

---

## Current System
- 헤더에 기능별 위계 없이 5개 버튼이 혼재되어 있어, 정작 작업 대상 업장 선택 버튼이 화면에서 가장 큰 버튼으로 돋보이고 주 저장 버튼은 묻히는 위계 역전이 발생함.
- 폼 그리드가 불규칙하여 모바일 및 좁은 화면에서 가로 스크롤/잘림 현상이 일어남.
- 최근 내역에 불필요한 배너가 자리를 차지하고 테이블 셀이 텍스트까지 중앙 정렬되어 가독성이 떨어짐.

---

## Root Cause / Diagnostic Logic
- **P0 결함 #1 원인**: `Stylesheet.html`의 미디어쿼리(`@media (max-width: 768px) { .form-grid { grid-template-columns: 1fr; } }`)에서 1열로 축소되나, 자식 요소의 인라인 `style="grid-column: span 2"`(비고)가 암시적(implicit) 2번째 열을 생성하여 컨테이너 너비를 초과함.
- **해결책**: 인라인 `span 2`를 제거하고, 확장 필드 클래스(`.form-group--wide`)를 도입하여 미디어쿼리에서 `grid-column: 1 / -1` 또는 `auto`로 제어함.

---

## Requirements

### Functional
- [ ] **업장 선택 (C-1)**:
  - `#btnShopSelectModal` 클릭 시 기존 `openShopSelectionModal()` 모달 정상 오픈.
  - 모달에서 업장 선택 시 칩 내부 텍스트가 해당 업장명으로 정상 갱신.
  - 업장 선택 후 기존 `loadTransactions()` 정상 호출.
- [ ] **폼 그리드 및 입력 (C-2, C-6)**:
  - 품목명 검색 input focus 시 자동완성 드롭다운 정상 노출 및 품목 선택 시 품목코드 자동 입력 유지.
  - 구분 선택: `.segmented` 버튼(입고 | 출고 | 폐기) 클릭 시 `#txType` select의 값이 동기화되고 `aria-pressed="true"`가 토글되어야 함.
  - 기존 `#txType` select는 `hidden`으로 유지되어 form submit 시 올바른 구분을 제공해야 함.
- [ ] **저장 및 초기화 (C-3)**:
  - `.card-footer`의 `기록 저장`(`.btn-primary`) 클릭 시 `saveTransaction()` 정상 실행.
  - `초기화`(`.btn-outline`) 버튼 클릭 시 폼 필드 리셋 함수(`resetTransactionForm()`) 실행:
    - 품목명 검색, 품목코드, 수량, 비고 초기화.
    - 구분 세그먼트 선택 해제 (`#txType.value = ''` 및 `aria-pressed` 초기화).
    - 날짜와 담당자는 작업 연속성을 위해 보존.
  - `saveTransaction()` 저장 성공 시에도 동일하게 폼 초기화 수행.
- [ ] **헤더 관리 액션 (C-7)**:
  - `시트 동기화`: 기존 `doForceRefresh(loadTransactions)` 동작.
  - `일괄 업로드`: 기존 `openBulkUploadModal()` 동작 및 `#txBulkFile` 파일 인풋 보존.
  - 「관리 ▾」 드롭다운:
    - 관리자 계정(`admin-only`)에게만 노출.
    - 클릭 시 드롭다운 메뉴 토글, 바깥 클릭 시 닫힘.
    - `신규 내역 취합`: 기존 `doSystemCommand('incrementalSync')` 호출 후 메뉴 닫힘.
    - `수동 월마감`: 기존 `openMonthlyClosingModal()` 호출 후 메뉴 닫힘 (`class="danger"` 적용).
- [ ] **최근 내역 목록 (C-4, C-5)**:
  - 상시 안내 배너 삭제.
  - 카드 헤더에 `<span class="cap">최근 50건 · 최신순</span>` 캡션 표시 및 `#txCount` 건수 표시(`.count`).
  - 테이블 렌더링 시:
    - 날짜: `.muted`
    - 품목코드, 거래ID: `.mono`
    - 구분: `.ctr` 열 내 `<span class="status-badge normal">입고</span>`, `<span class="status-badge primary">출고</span>`, `<span class="status-badge risk">폐기</span>`
    - 수량: `.num` (우측 정렬)
    - 비고 빈 값은 `—` 표시

### Non-Functional
- [ ] **DOM ID 전량 보존**:
  - `txShopSelect`, `btnShopSelectModal`, `txDate`, `txItemNameSearch`, `itemNameDropdown`, `txItemCode`, `txType`, `txQty`, `txPerson`, `txNote`, `txCount`, `txTableBody`, `txBulkFile`, `btnTxBulkUpload` 등 기존 스크립트/E2E에서 참조하는 모든 ID를 100% 보존.
- [ ] **스타일시트 이식**:
  - `mockup-transactions.html`의 `/* ═ 제안 ═ */` CSS 블록을 `src/Stylesheet.html`에 완전 이식.
- [ ] **반응형 보장**:
  - 데스크톱(1440px): 폼 4열 고정, 테이블 가독성 극대화.
  - 태블릿(1024px): 폼 2열.
  - 모바일(768px): 폼 1열, 가로 잘림/오버플로우 0건 (P0 결함 #1 완전 해소).
- [ ] **Final Report**:
  - `mockup-transactions-approved.png`와 DEV 배포 화면의 1:1 비교 스크린샷을 Final Report에 첨부.

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
- `AI/audits/UI-AUDIT-001.md`: 입출고 탭 스펙 (C-1 ~ C-7)
- `AI/audits/UI-AUDIT-001/mockup-transactions.html`: 승인된 목업 HTML/CSS/JS 원본
- `AI/audits/UI-AUDIT-001/mockup-transactions-approved.png`: 시각적 합격 기준 스크린샷
- `Docs/UIGuidelines.md`: UI 가이드라인 SSOT
- `src/Index.html`: `tab-transactions` 마크업 (lines 200-308)
- `src/Stylesheet.html`: 스타일시트 추가 영역
- `src/JS_Tx.html`: 입출고 JS 로직 및 렌더링 함수

---

## Files to Modify
- `src/Index.html`:
  - `tab-transactions` 영역 전체를 목업 스펙에 맞추어 개편 (C-1 ~ C-7 반영, 모든 기존 DOM ID 보존).
  - `h2`에 `<svg class="ico"><use href="#i-clipboard-list"/></svg>` 적용, `h3` 이모지 제거.
  - `#btnShopSelectModal`을 `.shop-chip`으로 변경.
  - 헤더 관리자 액션을 `.dropdown` (「관리 ▾」)으로 통합.
  - `.form-grid`에 `.form-group--wide` 적용, 비고 인라인 span 제거.
  - `.segmented` 추가 및 `#txType` hidden 유지.
  - `.card-footer` 신설 및 `btn-primary` 저장 + `btn-outline` 초기화 배치.
  - 최근 내역 카드 헤더 캡션 추가 및 배너 div 삭제.
  - 테이블 헤더 `<th>` 정렬 클래스 적용.
- `src/Stylesheet.html`:
  - `mockup-transactions.html`의 `/* ═ 제안 ═ */` CSS 블록 이식:
    - `.shop-chip`, `.shop-chip:hover`, `.shop-chip .k`, `.shop-chip .ico`
    - `.form-grid` (4열), `.form-group--wide`, `.form-group .hint`
    - `.card-footer`
    - `.card-header .cap`, `.card-header .count`
    - `.segmented`, `.segmented button`, `.segmented button[aria-pressed="true"]`
    - `.dropdown`, `.dropdown-menu`, `.dropdown-menu button`, `.dropdown-menu .sep`
    - 반응형 미디어쿼리 (1024px 2열, 768px 1열)
- `src/JS_Tx.html`:
  - `selectShopFromModal`: `#btnShopSelectModal` 내부 텍스트 갱신 방식을 칩 구조 유지형으로 업데이트.
  - 구분 세그먼트 초기화 및 클릭 이벤트 바인딩 로직 추가.
  - `resetTransactionForm()` 함수 구현 및 초기화 버튼/저장 성공 시 연결.
  - `renderTransactions()`: 테이블 행 생성 시 `.muted`, `.mono`, `.num`, `.ctr`, `<span class="status-badge ...">` 적용 및 빈 값 `—` 처리.
  - 관리 드롭다운 열기/닫기 토글 함수 (`toggleTxAdminMenu`, `closeTxAdminMenu`).

---

## Files to Create
- **없음**

---

## Implementation Plan

### Step 1. `src/Stylesheet.html`에 스타일 이식
`mockup-transactions.html`에 정의된 C-1 ~ C-7 관련 CSS를 `Stylesheet.html`에 이식한다:
```css
/* ═════════ [TASK-021] 입출고 화면 리디자인 (Task C) ═════════ */
.shop-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px 0 14px;
  border: 1px solid var(--border);
  border-radius: 9999px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}
.shop-chip:hover {
  background: var(--bg-muted);
  border-color: #cbd5e1;
}
.shop-chip .k {
  color: var(--text-muted);
  font-weight: 500;
}
.shop-chip .ico {
  color: var(--text-muted);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px 20px;
}
.form-group--wide {
  grid-column: span 2;
}
.form-group .hint {
  font-size: 0.76rem;
  color: var(--text-muted);
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px;
  border-top: 1px solid var(--border);
  background: #fbfcfd;
}

.card-header .cap {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 400;
  margin-left: 10px;
}
.card-header .count {
  font-size: 0.82rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  height: 40px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-card);
}
.segmented button {
  border: 0;
  background: none;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  border-right: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition);
}
.segmented button:last-child {
  border-right: 0;
}
.segmented button[aria-pressed="true"] {
  background: var(--primary-light);
  color: var(--primary);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px #bfdbfe;
}
.segmented button:hover:not([aria-pressed="true"]) {
  background: var(--bg-muted);
}

.dropdown {
  position: relative;
}
.dropdown-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 200px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  padding: 6px;
  z-index: 20;
}
.dropdown-menu button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 0;
  background: none;
  border-radius: 6px;
  font-size: 0.86rem;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}
.dropdown-menu button:hover {
  background: var(--bg-muted);
}
.dropdown-menu button.danger {
  color: var(--risk-text);
}
.dropdown-menu .sep {
  height: 1px;
  background: var(--border);
  margin: 4px 2px;
}

@media (max-width: 1024px) {
  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .form-group--wide {
    grid-column: 1 / -1;
  }
}
```

### Step 2. `src/Index.html` 마크업 개편
`#tab-transactions` 내부 마크업을 승인된 목업 구조로 수정한다:
1. **페이지 헤더**:
   - `page-title-group`: `h2` + `#btnShopSelectModal` (`class="shop-chip"`) + `#txShopSelect` (`style="display:none;"`).
   - `header-meta`: `시트 동기화`(`.btn-outline btn-sm`), `일괄 업로드`(`.btn-outline btn-sm`), `#txBulkFile`, 관리자 전용 드롭다운(`.dropdown.admin-only`).
2. **입력 카드**:
   - `card-header`: `<h3>새 입출고 기록</h3>`.
   - `card-body`:
     - `.form-grid`: 날짜, 품목명 검색(`.form-group--wide`), 품목코드 / 구분(hidden `#txType` + `.segmented`), 수량, 담당자, 비고.
   - `card-footer`:
     - `초기화`(`.btn-outline`) + `기록 저장`(`.btn-primary` + `i-save` 아이콘).
3. **최근 내역 카드**:
   - `card-header`: `<h3>최근 입출고 내역 <span class="cap">최근 50건 · 최신순</span></h3>` + `<span id="txCount" class="count">0건</span>`.
   - `card-body`: 상시 배너 완전 삭제, 테이블만 배치.
   - `table.data-table`: `<thead>`에 `<tr><th>날짜</th><th class="mono">품목코드</th><th>품목명</th><th class="ctr">구분</th><th class="num">수량</th><th>담당자</th><th>비고</th><th class="mono">거래ID</th></tr>`.

### Step 3. `src/JS_Tx.html` 스크립트 수정
1. **업장 칩 갱신**:
   - `selectShopFromModal(value, text)` 수정:
     `btn.innerHTML = '<span class="k">업장</span>' + escapeHtml(text) + '<svg class="ico"><use href="#i-chevron-down"/></svg>';`
2. **세그먼트 연동**:
   - 탭 초기화 또는 DOM 로드 시 세그먼트 버튼 클릭 이벤트 연결:
     - 클릭된 버튼의 `data-type`을 `#txType.value`에 할당.
     - 다른 버튼의 `aria-pressed="false"`, 클릭된 버튼에 `aria-pressed="true"`.
3. **폼 리셋 (`resetTransactionForm`)**:
   - 품목명, 품목코드, 수량, 비고 빈 문자열.
   - `#txType.value = ''` 및 세그먼트 버튼 `aria-pressed` 속성 제거.
   - `saveTransaction()` 성공 핸들러에서도 `resetTransactionForm()` 호출.
4. **테이블 렌더링 (`renderTransactions`)**:
   - 행 생성 시:
     - 날짜 td: `class="muted"`
     - 품목코드 td: `class="mono"`
     - 품목명 td: 일반 텍스트
     - 구분 td: `class="ctr"`, 내부에 `<span class="status-badge {normal|primary|risk}">{type}</span>`
     - 수량 td: `class="num"`
     - 담당자 td: 일반 텍스트
     - 비고 td: `class="muted"`, 없을 경우 `—`
     - 거래ID td: `class="mono"`
5. **관리 드롭다운 핸들러**:
   - `toggleTxAdminMenu(e)`, `closeTxAdminMenu()` 구현 및 외부 클릭 시 닫기 리스너 등록.

---

## Migration Plan
- **해당 없음** (데이터베이스나 시트 스키마 변경 없음).

---

## Test Plan

### Unit Test
- `npm test`를 실행하여 기존 데이터 단위 테스트 전건 통과 확인.

### E2E Test (Playwright)
1. **DEV 배포 후 접속**:
   - 로그인 후 입출고 기록(`tab-transactions`) 탭 이동.
2. **업장 칩 검증**:
   - `#btnShopSelectModal` 클릭 → 업장 선택 모달 오픈 → 업장 선택 → 칩 텍스트가 `업장 {업장명} ▾`로 갱신되고 테이블 로드 확인.
3. **세그먼트 및 입력 검증**:
   - '출고' 세그먼트 버튼 클릭 → `#txType`의 값이 '출고'로 설정되고 버튼이 하이라이트되는지 확인.
   - 품목 검색 자동완성 정상 동작 및 품목코드 자동 바인딩 확인.
   - '초기화' 버튼 클릭 → 입력 내용 및 세그먼트 선택 리셋 확인.
4. **저장 및 테이블 검증**:
   - 정상 데이터 입력 후 `기록 저장` 클릭 → 성공 토스트 확인 및 최근 내역 테이블 상단에 새 기록 렌더링 확인.
   - 구분이 올바른 색상 배지(`normal`/`primary`/`risk`)로 중앙에 표시되는지, 수량이 우측 정렬되는지 확인.
5. **관리 드롭다운 검증**:
   - admin 계정으로 「관리 ▾」 클릭 → 메뉴 열림 → 바깥 클릭 시 닫힘 확인.
   - `신규 내역 취합` 클릭 시 정상 실행 확인.
6. **반응형 검증 (1440px / 768px)**:
   - 1440px: 4열 그리드 및 헤더 정렬 상태 캡처.
   - 768px: 1열 그리드로 전환되어 우측 잘림 현상 없는지 캡처.

---

## Regression Risk
- **위험**: 세그먼트 버튼 전환 시 `#txType`의 값이 비어 있어 저장 검증(`!txData.type`)에 걸릴 수 있음.
  - **대응**: 세그먼트 버튼 클릭 시 즉시 `#txType.value`를 동기화하고 change 이벤트를 디스패치하여 호환성 보장.
- **위험**: 업장 선택 모달 텍스트 갱신 시 `selectShopFromModal`이 ID를 찾지 못해 JS 에러가 발생할 위험.
  - **대응**: `#btnShopSelectModal` ID를 엄격히 보존하고 DOM 요소 유무를 방어 코드로 체크.

---

## Acceptance Criteria
- [ ] 입출고 화면이 `mockup-transactions-approved.png`와 시각적·구조적으로 1:1 일치함.
- [ ] C-1 ~ C-7 모든 항목이 구현됨:
  - C-1: `.shop-chip` 적용 및 업장명 갱신 정상 동작
  - C-2: `.form-grid` 4열 고정, `.form-group--wide`, 768px 1열 변환 정상
  - C-3: `.card-footer` 주 액션 블루 버튼 및 초기화 버튼 정상 동작
  - C-4: 배너 완전 삭제, 캡션 및 건수 정상 표기
  - C-5: 테이블 셀 정렬(`.num`, `.ctr`, `.mono`, `.muted`) 및 배지 정상
  - C-6: `.segmented` 1클릭 구분 선택 및 리셋 정상
  - C-7: 관리 드롭다운 정상 동작 (관리자 전용)
- [ ] 기존 DOM ID 일체 보존.
- [ ] 1440px 및 768px에서 레이아웃 깨짐이나 가로 오버플로우가 전혀 없음.
- [ ] 콘솔 오류 0건 및 기존 기능 무결성 유지.
- [ ] Final Report에 `mockup-transactions-approved.png`와 DEV 구현 화면을 나란히 비교하는 스크린샷 첨부.

---

## Human Approval Required
- **없음** (사장님 확정 결정 ④에 의해 승인된 목업을 구현하는 Task임).

---

## Deployment Notes
- 반드시 `TASK-020` 완료 후 진행해야 함.
- 코드 수정 후 `npm run dev:push`로 DEV 환경에 반영하고 E2E 실측을 수행함.

---

## Rollback Plan
- 결함 발생 시 이전 커밋으로 롤백 후 재배포:
  ```bash
  git checkout HEAD~1 -- src/Index.html src/Stylesheet.html src/JS_Tx.html
  npm run dev:push
  ```

---

## Final Report
*(Claude Code가 구현 완료 후 작성)*
> 구현: Claude Code · 2026-09-11 · 선행 TASK-020 완료 후 진행 · DEV 배포 `npm run dev:push` 완료

### 구현 요약 (C-1 ~ C-7)
| # | 구현 | 위치 |
|---|---|---|
| C-1 | `#btnShopSelectModal`을 `.shop-chip`(`.k` 라벨 · `.v` 업장명 · chevron 아이콘)으로. `selectShopFromModal()`은 `.v`만 갱신(구조 유지, 없으면 폴백 생성). `#txShopSelect`는 `hidden`으로 유지 | `Index.html` page-title-group · `JS_Tx.html` |
| C-2 | `.form-grid` PC `repeat(4, minmax(0,1fr))` / 1024px 2열 / 768px 1열, `.form-group--wide { span 2 }`(768px `1 / -1`). 품목명 검색 wide, 비고 인라인 `span 2` 삭제. 모달 안은 `.modal .form-grid` 2열(폭 640px) | `Stylesheet.html` 폼 · 미디어쿼리 |
| C-3 | `.card-footer` 신설 — outline **초기화**(`resetTransactionForm()`) + `btn-primary` **기록 저장**(save 아이콘). 저장 성공 시에도 같은 함수로 초기화(날짜·담당자 보존). 탭 내 솔리드 블루 **1개** | `Index.html` · `JS_Tx.html` |
| C-4 | 네이비 배너 삭제. `<h3>최근 입출고 내역 <span class="cap">최근 50건 · 최신순</span></h3>` + `#txCount.count` | `Index.html` · `Stylesheet.html` |
| C-5 | 셀 클래스 `muted|mono||ctr|num||muted|mono`, 구분 `.status-badge normal/primary/risk`, 빈 값 `—`, 인라인 스타일 0 (TASK-020에서 선반영, 본 Task에서 실측 확인) | `JS_Tx.html renderTransactions` |
| C-6 | `#txType` select `hidden` 유지 + `#txTypeSeg .segmented` 3버튼(`data-type`, `aria-pressed`). `setTxType()`이 select 값 + change 이벤트, `syncTxTypeSegment()`가 select→세그먼트 역동기화 | `JS_Tx.html` |
| C-7 | 헤더 = 시트 동기화 · 일괄 업로드(outline) + `.dropdown.admin-only` 「관리 ▾」(`#btnTxAdminMenu` → `#txAdminMenu[role=menu]`): 신규 내역 취합 / `.danger` 수동 월마감…. 바깥 클릭·Esc 닫힘, `aria-expanded` 토글 | `Index.html` · `JS_Tx.html` · `Stylesheet.html` |
- 목업의 제안 CSS 블록(`.shop-chip` `.form-group--wide` `.form-group .hint` `.card-footer` `.card-header .cap/.count` `.segmented` `.dropdown-menu`)을 `Stylesheet.html`에 이식. `.dropdown`은 기존 규칙(`position: relative`) 재사용.
- 스펙과 다르게 한 것: 목업 푸터의 `Enter 저장 · Esc 초기화` 힌트는 실제 단축키가 없어 표시하지 않음(UIGuidelines §6). 신규 ID `txTypeSeg` `btnTxAdminMenu` `txAdminMenu` 추가(기존 ID 삭제·변경 없음).

### E2E 스펙 동기화
- `transaction.spec.js` `negative-stock.spec.js` `fifo-split.spec.js`: `#txType.selectOption()` → `#txTypeSeg button[data-type=…]` 클릭 (숨긴 select는 Playwright 가시성 검사에 걸림). `transaction.spec.js`는 클릭 후 `#txType` 값까지 단정.
- `monthly-closing.spec.js`: 월마감 항목이 「관리 ▾」 안으로 들어가 `openClosingMenu()` 헬퍼로 메뉴를 연 뒤 접근. staff 전환 시 「관리」 버튼·항목 모두 hidden 확인.
- 실행 결과: `playwright test transaction.spec.js monthly-closing.spec.js` → **3 passed, 1 skipped**(실제 월마감 게이트) — DEV에 입고 1건(`playwright-e2e`) 기록됨.

### DEV 실측 — `AI/audits/UI-AUDIT-001/after/TASK-021/`
- `compare-mockup-vs-dev-1440.png` — **승인 목업(좌) vs DEV(우, 관리 메뉴 열림)** 나란히 비교
- `C03d-transactions-1440-admin-menu.png` `C03-transactions-1440-autocomplete.png` `C03-transactions-1024.png`(2열) `C03-transactions-768.png`(1열, 잘림 없음)
- `tx-check.json` — 자동 검수 **16/16 PASS**, 콘솔 오류 0: 칩 구조·값 / 4열·wide·인라인 0 / 세그먼트↔select 양방향 / 초기화 보존 규칙 / 블루 1개 / 배너 0·캡션 / 셀 클래스·pill / 헤더 3개 / 메뉴 열림·바깥 클릭·Esc / 1024 2열·768 1열 `scrollWidth == clientWidth`, 카드 밖 필드 0

### Acceptance Criteria 체크
- [x] 승인 목업과 구조·시각 1:1 (비교 이미지 첨부)
- [x] C-1 ~ C-7 전부 구현 (위 표)
- [x] 기존 DOM ID 전량 보존 (`txShopSelect` `btnShopSelectModal` `txDate` `txItemNameSearch` `itemNameDropdown` `txItemCode` `txType` `txQty` `txPerson` `txNote` `txCount` `txTableBody` `txBulkFile` `btnTxBulkUpload`)
- [x] 1440 / 768 가로 오버플로우 0 (P0 #1 해소)
- [x] 콘솔 오류 0, 기존 기능 무결성 (E2E 통과)
- [x] 목업 vs DEV 비교 스크린샷 첨부
