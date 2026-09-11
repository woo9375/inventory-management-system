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
