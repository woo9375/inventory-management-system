# UI-AUDIT-001: 웹앱 시각 감사 (Phase 3 UI 개선 입력 자료)

- **일시**: 2026-09-11 · DEV @HEAD · admin 계정 · 콘솔 오류 0건
- **캡처**: 데스크톱 1440px 23장 + 모바일 390px 10장 → `AI/audits/UI-AUDIT-001/*.png`
- **스크립트**: 읽기 전용 (저장·삭제 없음). 계산 스타일 실측값은 `probe.json`
- **목적**: TASK-014/015가 공통 쉘 + 대시보드만 리디자인하고 멈춘 상태에서, 나머지 6개 탭과 모달을 "화면 기준"으로 점검해 Antigravity가 Phase 3 Task를 쓸 때 쓸 punch list를 만든다.

> 모든 항목은 `파일:라인` 근거를 붙였다. 라인 번호는 감사 시점 기준이며 구현 전 재확인한다.

---

## 확정 결정 (사장님, 2026-09-11) — Task 작성 시 이 절을 원칙으로 삼는다

| # | 결정 | 내용 | 영향 |
|---|---|---|---|
| ① | **주 액션 = 블루 하나** | `btn-gold` 전량 `btn-primary`로 치환하고 클래스 폐기. 한 화면(카드)에 솔리드 블루는 하나. 나머지는 `btn-outline`. 파괴적 액션만 `btn-danger` | 항목 4·5 |
| ② | **이모지 → Lucide 아이콘** | 처음 결정은 "제목·메뉴에만 이모지 유지"였으나 목업 비교 후 **Lucide 선형 아이콘으로 전면 교체** 확정. 이모지는 UI 어디에도 쓰지 않는다 (토스트·KPI 라벨·엠프티 스테이트 포함). 매핑은 `Docs/UIGuidelines.md` §3 | 항목 15 + 대시보드·토스트 아이콘 교체 |
| ③ | **PC 우선, 태블릿 확장 예정, 폰 후순위** | 레이아웃 기준 1280~1440px. 태블릿(768~1024px)은 깨지지 않게만. P0 모바일 결함 3건은 **태블릿 세로 768px에서도 재현**되므로 태블릿 확장 전 필수, 우선순위는 D(잔여 정리)와 함께 | 항목 1·2·3·14 |
| ④ | **입출고 PC 목업 v1 승인** | `UI-AUDIT-001/mockup-transactions.html` (승인 상태 캡처: `mockup-transactions-approved.png`). C-1 ~ C-7 전부 채택, **C-6 세그먼트 포함** | Task C 스펙 |

> **UI 원칙은 `Docs/UIGuidelines.md`로 승격했다.** 이후 UI Task는 그 문서를 `Constraints`에 인용한다. 아래는 요약.
> 블루 하나 · 이모지 금지/Lucide · 텍스트 좌/숫자 우/상태 가운데 · `.status-badge` 단일 · 인라인 style 금지 · 컨트롤 40px · 배너 금지 · Final Report에 DEV 스크린샷.

### 승인된 목업 → Task C 스펙 (입출고 탭)
목업 파일의 `/* ═ 제안 ═ */` CSS 블록이 곧 `Stylesheet.html` 추가분이다. 마크업/JS 변경점:

| # | 변경 | 파일 | 비고 |
|---|---|---|---|
| C-1 | `#btnShopSelectModal`을 `.shop-chip`으로 (제목 옆, `업장 · 관리팀 (관리) ▾`). 인라인 스타일 전부 제거. `onclick="openShopSelectionModal()"` 유지, 선택 결과 텍스트 갱신부는 [JS_Tx.html](../../src/JS_Tx.html) `openShopSelectionModal` 주변 확인 | Index.html:215 | ID 보존 |
| C-2 | `.form-grid` → PC 4열 고정, `품목명 검색` 그룹에 `.form-group--wide`, 비고의 `style="grid-column: span 2"` 제거. 순서: 날짜 · 품목명(2열) · 품목코드 / 구분 · 수량 · 담당자 · 비고 | Index.html:229-266, Stylesheet.html:444 | 768px 이하 1열 → P0 #1 해결 |
| C-3 | 저장 버튼을 `.card-body` 밖 `.card-footer`로 이동, `btn-gold` → `btn-primary` + `save` 아이콘. 옆에 `btn-outline` **초기화**(폼 리셋 JS 소량). `Enter`/`Esc` 힌트는 실제 키 핸들러가 있을 때만 | Index.html:267 | 카드당 블루 1개 |
| C-4 | 안내 배너 div 삭제, 캡션 `<span class="cap">최근 50건 · 최신순</span>`을 h3 옆에. `#txCount`는 인라인 style 제거 후 `.count` | Index.html:277-281 | |
| C-5 | `JS_Tx.html` 테이블 렌더: 날짜 `.muted`, 품목코드·거래ID `.mono`, 구분 → `<span class="status-badge {normal|primary|risk}">`, 수량 `.num`. `thead th`에도 같은 정렬 클래스 | JS_Tx.html 렌더부, Index.html:283-297 | 입고 normal / 출고 primary / 폐기 risk |
| C-6 | `#txType` select를 `hidden`으로 두고 `.segmented` 버튼 3개가 `select.value`를 설정 + `aria-pressed` 토글. 저장 후 리셋 시 세그먼트도 초기화 | Index.html:245-251, JS_Tx.html | JS ~10줄 |
| C-7 | 헤더 우측: `시트 동기화`·`일괄 업로드`는 `btn-outline btn-sm` + 아이콘, `신규 내역 취합`·`수동 월마감`은 `.dropdown` 「관리 ▾」(admin-only) 안으로. 기존 `onclick` 그대로. `#txBulkFile` hidden input 유지 | Index.html:203-214 | 5버튼 → 3 |
| 공통 | h2 이모지 → `<svg class="ico"><use href="#i-tx"/></svg>`, h3 이모지 제거 | Index.html:202,224,275 | 아이콘 스프라이트는 Task B에서 도입 |

### 조정된 Task 순서
| 순서 | 범위 | 항목 | 비고 |
|---|---|---|---|
| **B** | 디자인 시스템 통일: 버튼(`btn-gold` 폐기) · `.status-badge` 단일 · 테이블 정렬 · 컨트롤 40px · **Lucide 스프라이트 `src/Icons.html` 도입 + 사이드바/제목/토스트/KPI/엠프티 이모지 교체** · 레거시 토큰 삭제 | 4·8·9·11·13·15 + 7 | 결정 ①② 확정 → 바로 착수. 모든 탭을 훑되 *스타일·아이콘만* 바꾼다 (기능 변경 없음) |
| **C** | 입출고 탭 리디자인 (위 스펙) | 5·6 | B 완료 후. 목업 = 스펙 |
| **D** | 반응형 결함 + 잔여 정리 | 1·2·3·10·12·14·16·17 | 태블릿 확장 전. C-2가 #1을 이미 해결하므로 #2·#3 위주 |

---

## P0 — 실제 결함 (레이아웃 깨짐, 즉시 수정)

### 1. 모바일 입출고 폼 우측 열이 카드 밖으로 잘림 · `M03-transactions.png`
- **증상**: 390px에서 `품목명 검색`·`구분`·`담당자` 입력이 카드 오른쪽 경계 밖으로 넘쳐 반만 보인다. 업장 직원이 가장 많이 쓸 화면.
- **원인**: [src/Index.html:261](../../src/Index.html#L261) `<div class="form-group" style="grid-column: span 2">`(비고). 768px 이하에서 `.form-grid { grid-template-columns: 1fr }`([src/Stylesheet.html:804](../../src/Stylesheet.html#L804))로 1열이 되지만, `span 2` 아이템이 **암시적 2번째 열**을 만들어 그리드가 컨테이너보다 넓어진다.
- **수정 방향**: 모바일 미디어쿼리에서 `.form-grid > [style*="span"] { grid-column: auto }` 또는 인라인 span을 클래스(`.form-group--wide`)로 옮기고 768px 이하에서 `grid-column: 1 / -1`.

### 2. 모바일 내 설정 동일 결함 · `M09-mysettings.png`
- **증상**: `성함`·`부서` 입력 잘림, `저장` 버튼이 화면 밖.
- **원인**: [src/Index.html:539](../../src/Index.html#L539) 동일한 `style="grid-column: span 2;"`.
- 1번과 같은 수정으로 함께 해결.

### 3. 모바일 사이드바 상단이 헤더에 가려지고 배경 딤이 없음 · `M02s-sidebar-open.png`
- **증상**: 햄버거로 사이드바를 열면 브랜드 아이콘이 절반 잘린다. 뒤 콘텐츠가 그대로 보여 "열렸다"는 느낌이 약하다.
- **원인**: `.sidebar { z-index: 100 }`([src/Stylesheet.html:97](../../src/Stylesheet.html#L97)) < `.mobile-header { z-index: 101 }`([src/Stylesheet.html:771](../../src/Stylesheet.html#L771)). 배경 오버레이 요소 없음.
- **수정 방향**: 열린 사이드바 z-index를 헤더 위로, `.sidebar.open` 시 반투명 백드롭(`rgba(15,23,42,.4)`) 추가 + 백드롭 탭으로 닫기.

---

## P1 — 첫인상 (일관성 · 위계)

### 4. 주 액션 색이 두 개 — 앰버 `btn-gold` vs 블루 `btn-primary`
- **실측**: 런타임 DOM에 `.btn-gold` 11개 / `.btn-primary` 1개. 소스 기준 `btn-gold` 27곳, `btn-primary` 6곳.
- **문제**: 저장·추가·등록·생성·저장 등 **모든 확정 액션이 앰버**인데, 대시보드에서 유일한 블루 버튼은 `인쇄/다운로드`([src/Index.html](../../src/Index.html) 대시보드 헤더). 사용자가 배우는 규칙("노란 버튼 = 저장")이 첫 화면(대시보드)과 어긋난다. "화이트 & 클린 블루" 시스템에서 주 액션은 블루 하나여야 한다.
- **교체 대상 (소스)**: Index.html 208·267·320·353·388·424·439·452·471·568 / JS_Tx.html 309·500·532·600·613 / JS_Config.html 93·149·168·203·251·302·420·432 / JS_Vendor.html 209·220·282 / JS_BaseData.html 147
- **결정 필요**: `btn-gold`를 (a) 전량 `btn-primary`로 치환하고 클래스 폐기, 또는 (b) "보조 강조"로 남기되 CTA에서는 금지. 권장 (a).

### 5. 입출고 헤더 — 버튼 5개에 스타일 3종, 위계 역전 · `D03-transactions.png`
- outline 3개 + 골드 아웃라인 혼합([src/Index.html:208-209](../../src/Index.html#L208) 인라인 `border:1px solid var(--gold); background:#fffdf5`) + 2px 블루 대형([src/Index.html:215](../../src/Index.html#L215) 인라인, 구 `--navy-600/800` 토큰).
- 화면에서 **가장 눈에 띄는 버튼이 "업장 선택"(필터)** 이고 실제 주 액션 `기록 저장`은 아래쪽 앰버. 업장 선택은 상태 표시(현재: 관리팀)로 격을 낮추고, 관리자 전용 3개(신규 내역 취합·수동 월마감·일괄 업로드)는 ⋯ 메뉴나 2차 툴바로 분리.

### 6. 안내 배너 잔존 — 구 네이비 그라데이션 인라인
- [src/Index.html:279](../../src/Index.html#L279) (`최근 입출고 내역` 카드 상단 "📌 표시 건수: 업장별 최대 50건…"), [src/JS_Tx.html:284](../../src/JS_Tx.html#L284) (일괄 업로드 모달 내부).
- 경고처럼 보이는 상시 배너. 정보 자체는 카드 헤더의 `0건` 옆 캡션("최근 50건 · 최신순")으로 충분.

### 7. 로그인 체크박스 이중 표시 · `D01-login.png`
- [src/Index.html:34](../../src/Index.html#L34) `<label for="rememberMe">✅ 로그인 상태 유지</label>` — 네이티브 체크박스 옆에 ✅ 이모지가 하나 더 있어 "☐ ✅ 로그인 상태 유지"로 보인다. 첫 화면에서 가장 먼저 눈에 걸리는 어색함. 이모지 제거.

### 8. 상태 표기 3가지 — 같은 의미, 다른 모양
- 업장관리 `생성완료`: 초록 **텍스트** (`D04-shop.png`) / 거래처관리 `사용`: 초록 **pill** (`D08-vendor.png`) / 계정관리 `admin`: 파란 **pill** (`D06-user.png`).
- 대시보드에서 확정한 `.status-badge` pill 하나로 통일. 렌더 위치: [src/JS_Config.html](../../src/JS_Config.html) (업장·계정), [src/JS_Vendor.html](../../src/JS_Vendor.html).

### 9. 테이블 전 컬럼 중앙 정렬
- 업장명·거래처명·품목명·약어명 등 **텍스트 열이 중앙 정렬**이라 눈이 열의 시작점을 못 찾는다 (`D04`, `D08`). 규칙: 텍스트 좌측 / 숫자 우측(`tabular-nums`) / 상태·액션 중앙. `.data-table` 기본을 좌측으로 바꾸고 숫자 열에 `.num` 클래스.

### 10. 내 설정 카드 폭 불일치 · `D09-mysettings.png`
- [src/Index.html:517](../../src/Index.html#L517) `max-width: 600px` vs [src/Index.html:552](../../src/Index.html#L552) `max-width: 500px` → 두 카드 오른쪽 모서리가 어긋난다. 같은 폭으로.

### 11. 기초데이터 `추가` 버튼이 입력창보다 큼 · `D07-basedata.png`
- 버튼 높이가 인풋보다 커서 행 기준선이 어긋난다. `.btn`과 `input` 높이를 동일 토큰(예: 40px)으로.

---

## P2 — 정리 (첫인상 영향은 작지만 다음 작업의 발목)

### 12. 인라인 `style=` 90개 (런타임 DOM 실측)
- 소스: `Index.html` 31 / `JS_Tx.html` 24 / `JS_Config.html` 19 / `JS_BaseData.html` 12 / `JS_Vendor.html` 7. 색·여백·폭이 스타일시트 밖에 흩어져 있어 토큰을 바꿔도 안 따라온다.

### 13. 레거시 토큰 참조 잔존 (`--navy-*`, `--gold`)
- TASK-014가 별칭으로 살려둔 덕에 색은 나오지만, 신규 코드가 계속 별칭을 쓴다 ([src/JS_Config.html:273](../../src/JS_Config.html#L273), [src/JS_Tx.html:573](../../src/JS_Tx.html#L573), [src/JS_BaseData.html:128](../../src/JS_BaseData.html#L128)). 참조를 신규 토큰으로 바꾸고 별칭을 삭제해야 재발을 막는다.

### 14. 모바일 대시보드 헤더가 4줄 · `M02-dashboard.png`
- 제목·갱신일 / 버튼 3개 / 시즌 pill 이 각각 줄바꿈되어 KPI가 화면 중간에서 시작. 모바일에서는 admin 액션(시트 동기화·통합갱신)을 ⋯ 메뉴로 접고 시즌 pill은 제목 줄에 붙인다.

### 15. 이모지 사용 범위 — 결정 사항
- h2/h3 22개 중 12개, 사이드바 메뉴 8개 전부, 버튼 다수가 이모지로 시작. 현장 친화적이라는 장점도 있으니 **제거가 아니라 규칙화**를 제안: 사이드바·페이지 제목은 유지, 버튼·테이블 셀·라벨에서는 제거. (사장님 결정)

### 16. 업장 선택 모달의 빈 푸터 · `D03a-transactions-shop-select-modal.png`
- 버튼이 없는데 회색 푸터 띠가 남는다. 푸터 비었을 때 숨김 ([src/JS_UI.html:95](../../src/JS_UI.html#L95) `openModal`).

### 17. 거래처 59건 단일 페이지, `전화` 열 전부 공백 · `D08-vendor.png`
- 3600px 넘는 페이지. 페이지네이션 또는 "더 보기". 값이 전부 없는 열은 `-` 표시.

---

## 데이터 상태 (UI 아님, 하지만 첫인상에 영향)

### 18. 대시보드 KPI: 전체 4292 / 위험 0 / 발주 0 / 정상 0
- `normalCount`는 `STATUS === STATUS_OK`인 행만 센다 ([src/WebApp.gs:88-90](../../src/WebApp.gs#L88)). DEV 품목 마스터의 상태 열이 비어 있어 0. Production은 다를 수 있으나, 합이 안 맞는 숫자는 처음 보는 사람에게 "고장"으로 읽힌다. Production 값 확인 권장.

## 통제 불가
- 상단 "이 애플리케이션은 Google Apps Script 사용자가 만들었습니다" 배너 — 모바일에서 약 90px. GAS 웹앱 배포 형태상 제거 불가. 사용자에게 X로 닫을 수 있음을 안내하는 정도.

## 잘 된 것 (건드리지 말 것)
로그인 카드 · 대시보드 KPI/테이블/엠프티 스테이트 · 토스트 4종 · 로딩 오버레이 · 일괄 업로드 안내 모달 구조 · 월마감 모달의 danger 처리 · 기초데이터 칩 UI · 거래처 검색/필터 · 모달 공통 쉘.

> 단, 결정 ②(이모지 → Lucide)에 따라 KPI 라벨(🚨/⚠️/✅)·토스트 아이콘·엠프티 스테이트(🎉/📝)·로그인 ✅는 **아이콘만** 교체한다 (Task B). 레이아웃·색·동작은 그대로.

---

## 권장 태스크 분할 (Antigravity 입력용)
상단 **「확정 결정」 절의 「조정된 Task 순서」(B → C → D)** 를 따른다. 결정 3가지는 모두 확정되었다.

## 캡처 목록
| 파일 | 화면 |
|---|---|
| D01-login · D01b-login-empty-error | 로그인 · 빈 입력 오류 |
| D02-dashboard · D02m-physical-check-modal | 대시보드 · 실사 다운로드 모달 |
| D03-transactions · D03a/D03m-shop-select · D03b-autocomplete · D03m-bulk-upload · D03m-monthly-closing | 입출고 + 모달 4종 |
| D04-shop · D04m-add-shop-modal | 업장 관리 |
| D05-season · D05m-add-season-modal | 시즌 설정 |
| D06-user · D06m-create-user-modal | 계정 관리 |
| D07-basedata | 기초데이터 |
| D08-vendor · D08m-add-vendor-modal | 거래처 관리 |
| D09-mysettings | 내 설정 |
| D10-toasts · D11-loading-overlay | 토스트 4종 · 로딩 |
| M01 ~ M09 | 위 화면의 390px 모바일 |
| mockup-transactions.html · mockup-transactions-approved.png | **승인된 입출고 PC 목업** (브라우저로 열면 현재/제안 토글) |
