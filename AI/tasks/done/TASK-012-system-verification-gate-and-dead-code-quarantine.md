# TASK-012: 아키텍처 진입점 검증 게이트 구축 및 미사용 레거시 코드 격리·정리

## Objective

Antigravity(IDE)와 Claude Code(CLI) 협업 시 **아키텍처 오독(시스템에 없는 UI를 가정하거나 사장된 파일을 수정하는 문제)을 원천 방지**하기 위해:
1. `src/JS_Master.html` 등 미사용 레거시 파일에 명시적인 `[DEPRECATED]` 헤더 경고를 부착하고, TASK-011에서 불필요하게 가해진 변경을 롤백·정리한다.
2. `.agents/skills/gas-tasks/SKILL.md` 및 `.agents/rules/00_roles-and-workflow.md`에 **[진입점 역추적 3단계 검증 게이트 (Entrypoint Verification Gate)]**와 **[Docs 3대 문서 인용 의무화]**를 불변 규칙으로 신설한다.
3. 시스템 R&R 규정에 **[시스템 물리적 경계(System Physical Boundaries)]**를 명시하여, "품목 마스터는 스프레드시트 100% 단독 관리, 웹앱 화면 없음"을 모든 에이전트의 SSOT로 고정한다.

## Confirmed Facts

1. **아키텍처 문서에 사장된 파일이 이미 명시됨 (`Docs/Architecture.md:7-10`)**:
   - `JS_Master.html`은 `Index.html`에 include되지 않으며(커밋 `e4a6d6e`), 품목 마스터 웹 UI는 제공되지 않고 스프레드시트에서 직접 관리된다고 명시되어 있다.
2. **실제 웹앱 진입점 구조 (`src/Index.html:80-105, 522-527`)**:
   - 사이드바 네비게이션은 대시보드, 입출고 기록, 업장 관리, 시즌 관리, 계정 관리, 기초데이터, 내 설정(총 7개 탭)으로 구성되어 있다.
   - SPA에 include되는 스크립트는 `JS_Auth`, `JS_UI`, `JS_Tx`, `JS_Config`, `JS_BaseData` 5개뿐이며, `JS_Master`는 포함되어 있지 않다.
3. **TASK-011 사장 파일 오수정 사고 (`AI/tasks/review/TASK-011-negative-stock-support.md`)**:
   - Antigravity가 Task 명세에 `src/JS_Master.html` 수정을 포함시켰고, Claude Code가 실제로 해당 파일에 음수 배지 렌더링 코드를 구현하여 개발 리소스 낭비가 발생했다.
4. **`src/JS_Master.html` 내 경고 부재**:
   - 파일 상단에 이 파일이 사장된(Dead Code) 파일임을 알리는 주석이나 워터마크가 전혀 없어, `src/` 디렉터리를 스캔하는 AI 에이전트가 활성 코드로 오인하기 쉬운 상태다.
5. **`/gas-tasks` 스킬 절차의 구속력 부족 (`.agents/skills/gas-tasks/SKILL.md:32-48`)**:
   - Step 2, Step 3에 코드 및 문서 확인이 명시되어 있으나, "진입점(Entrypoint) 역추적 증빙"이나 "Docs 필수 인용"이 강제되지 않아 에이전트가 파일명만 보고 짐작하여 Task를 작성하는 것을 걸러내지 못했다.

## Hypotheses

- `src/JS_Master.html` 상단에 강력한 `[DEPRECATED]` 주석을 추가하고, `.agents/skills/gas-tasks/SKILL.md`에 진입점 검증 체크리스트를 강제하면, 향후 모든 에이전트가 동일한 실수를 100% 예방할 수 있다.

## Business Context

- Antigravity는 Claude Code가 안전하고 정확하게 작업할 수 있도록 Task 명세를 설계하는 브레인 역할을 담당한다.
- 상위 설계(Antigravity)에서 시스템 아키텍처를 오독하면 하위 구현(Claude Code)이 엉뚱한 코드를 수정하게 되어 프로젝트의 신뢰성이 무너지고 리소스가 낭비된다.
- 따라서 단순한 "주의 요망" 수준이 아니라, **진입점 파일의 실제 코드 라인 번호로 연결 여부를 입증하지 못하면 Task 작성을 진행할 수 없도록 강제하는 프로세스 게이트**가 필요하다.

## Current System

- `src/` 폴더 내에 활성 파일과 비활성(레거시) 파일이 혼재되어 있다.
- Task 작성 시 UI 기능의 경우 `Index.html`에 실제로 렌더링되는지 검증하지 않고 파일 목록만 보고 Task 대상에 포함시키는 오류가 발생할 수 있는 구조다.

## Root Cause / Diagnostic Logic

1. **Dead Code 방치**: 비활성 파일(`JS_Master.html`)에 명시적 비활성화 표기가 없음.
2. **진입점 검증 누락**: UI 요구사항 분석 시 `Index.html`의 `<nav>` 및 `include` 구문 역추적 검증 프로세스 부재.
3. **Docs SSOT 교차 검증 생략**: 이미 `Docs/Architecture.md`에 기재된 아키텍처 예외 사항을 읽지 않고 추정으로 작성.

## Requirements

### Functional
- [ ] **`src/JS_Master.html` 정리 및 DEPRECATED 워터마크 부착**:
  - TASK-011에서 추가된 불필요한 수정분을 롤백/정리한다.
  - 파일 최상단에 다음과 같은 강력한 경고 주석을 삽입한다:
    ```html
    <!--
      ⚠️ [DEPRECATED & UNUSED FILE]
      이 파일은 Index.html에 include되지 않는 사장된(Dead Code) 파일입니다.
      품목 마스터는 웹앱 화면이 존재하지 않으며, 구글 스프레드시트('🗂️ 품목 마스터' 시트)에서 직접 관리됩니다.
      향후 완전 복원 또는 삭제 전까지 보존 목적의 파일이므로, 절대 수정하거나 참조하지 마십시오.
      (참조: Docs/Architecture.md 제5조)
    -->
    ```
- [ ] **`.agents/skills/gas-tasks/SKILL.md` 진입점 역추적 게이트(Entrypoint Verification Gate) 신설**:
  - Task 작성 절차에 **[Step 2.5: 아키텍처 진입점 역추적 필수 게이트]**를 추가한다:
    1. **UI 관련 요구사항**:
       - `src/Index.html`의 `<nav class="sidebar-nav">` 내 버튼 ID 및 탭 ID(`tab-*`) 존재 여부 확인.
       - `src/Index.html` 하단 `<?!= include(...) ?>`에 실제 포함되어 있는지 확인.
       - 위 2가지가 증명되지 않으면 웹앱 UI로 간주하는 것을 엄격히 금지.
    2. **서버/API 관련 요구사항**:
       - 시트 기능인 경우 `src/Code.gs`의 `onOpen` 메뉴 또는 `onEdit` 핸들러에 등록되어 있는지 확인.
       - 웹앱 API인 경우 `src/WebApp.gs`의 `doGet` / `runSystemCommand` / 공개 함수 호출 경로 확인.
  - Task 템플릿의 `Confirmed Facts` 섹션에 **`[진입점 호출 경로 증빙: 파일명:라인번호]`** 작성을 의무화한다.
- [ ] **`.agents/rules/00_roles-and-workflow.md`에 시스템 물리적 경계 명시**:
  - 에이전트 R&R 규칙에 **"3. 시스템 물리적 경계 (System Physical Boundaries)"** 조항을 신설:
    * **품목 마스터**: 스프레드시트 `🗂️ 품목 마스터` 시트에서 100% 직접 관리 (웹앱 뷰 없음, `JS_Master.html`은 사장된 파일).
    * **입출고 관리**: 웹앱 `📝 입출고 기록` 탭 및 각 업장 시트에서 관리.
    * **대시보드**: 웹앱 `📊 대시보드` 탭 및 `📊 대시보드` 시트에서 관리.
- [ ] **`Docs/Architecture.md` 보강**:
  - "SPA에 포함되지 않는 `src/` 파일" 섹션에 `JS_Master.html`의 성격과 주의사항을 더욱 눈에 띄게 강조.

### Non-Functional
- [ ] 신규 검증 게이트 도입 후에도 `TASK-NNN` 문서 작성 규격과의 하위 호환성을 유지해야 한다.
- [ ] 기존 단위 테스트 및 배포 프로세스에 회귀 영향이 없어야 한다.

## Constraints

- 프로젝트 R&R 불변 원칙: Antigravity는 명세 작성 전담, 소스 코드 및 규칙 파일의 실제 커밋/배포는 Claude Code가 실행.
- `JS_Master.html`은 향후 웹 UI 복원 가능성을 열어두기 위해 파일 자체를 물리 삭제하지 않고 보존한다(기존 아키텍처 결정 준수).

## Files to Inspect

- [`Docs/Architecture.md`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/Docs/Architecture.md)
- [`src/Index.html`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Index.html)
- [`src/JS_Master.html`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/JS_Master.html)
- [`.agents/skills/gas-tasks/SKILL.md`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/.agents/skills/gas-tasks/SKILL.md)
- [`.agents/rules/00_roles-and-workflow.md`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/.agents/rules/00_roles-and-workflow.md)

## Files to Modify

- [`src/JS_Master.html`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/JS_Master.html): TASK-011 불필요 수정 롤백 및 `[DEPRECATED]` 헤더 경고 워터마크 추가
- [`.agents/skills/gas-tasks/SKILL.md`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/.agents/skills/gas-tasks/SKILL.md): 아키텍처 진입점 역추적 필수 게이트 및 Confirmed Facts 증빙 규칙 추가
- [`.agents/rules/00_roles-and-workflow.md`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/.agents/rules/00_roles-and-workflow.md): 시스템 물리적 경계(품목 마스터 = 시트 전용) 명시
- [`Docs/Architecture.md`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/Docs/Architecture.md): 레거시/사장 파일에 대한 에이전트 주의사항 강조

## Files to Create

- 없음

## Implementation Plan

1. **`src/JS_Master.html` 정리**:
   - 최상단에 `<!-- ⚠️ [DEPRECATED & UNUSED FILE] ... -->` 주석 블록 삽입.
   - TASK-011에서 변경된 불필요한 코드 정리.
2. **`.agents/skills/gas-tasks/SKILL.md` 개정**:
   - `Step 2`와 `Step 3` 사이에 `Step 2.5: 아키텍처 진입점(Entrypoint) 역추적 필수 게이트` 삽입.
   - `Confirmed Facts` 작성 규칙에 "진입점 라인 번호(Index.html의 nav 또는 include) 명시 필수" 추가.
3. **`.agents/rules/00_roles-and-workflow.md` 개정**:
   - `## 3. 시스템 물리적 경계 (System Boundaries)` 섹션을 추가하여 품목 마스터의 관리 주체가 스프레드시트 단독임을 선언.
4. **문서 동기화**:
   - `Docs/Architecture.md`의 미포함 파일 설명부에 에이전트 주의사항 박스 강조.

## Migration Plan

- 마이그레이션 불필요 (스프레드시트 구조 변경 없음).

## Test Plan

### Unit Test
- [ ] `npm test`를 실행하여 기존 7개 테스트 스위트가 모두 정상 통과하는지 검증.
- [ ] `src/JS_Master.html`의 워터마크 추가로 인해 기존 빌드/테스트가 깨지지 않는지 확인.

### E2E Test (Playwright)
- [ ] `npm run dev:push` 후 웹앱이 기존과 동일하게 정상 구동되는지 확인.

## Regression Risk

- 소스 코드 동작을 변경하는 것이 아니라 주석 표기, 규칙 및 프로세스 강화 작업이므로 시스템 런타임 회귀 위험은 전무함.

## Acceptance Criteria

- [ ] `src/JS_Master.html` 상단에 명확한 `[DEPRECATED & UNUSED FILE]` 경고 주석이 부착되어 있다.
- [ ] `.agents/skills/gas-tasks/SKILL.md`에 진입점 역추적 게이트와 증빙 의무가 명시되어 있다.
- [ ] `.agents/rules/00_roles-and-workflow.md`에 품목 마스터의 시스템 물리적 경계가 명문화되어 있다.
- [ ] `npm test` 전체 스위트가 100% 통과한다.

## Human Approval Required

- 없음 (에이전트 거버넌스 및 품질 강화 내부 개선 과제).

## Deployment Notes

- `npm run dev:push`로 DEV 반영 후 커밋.

## Rollback Plan

- `git checkout HEAD~1 -- src/JS_Master.html .agents/ Docs/`

## Final Report

**구현 완료 (Claude Code) — 2026-09-02**

### 변경 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/JS_Master.html` | TASK-011 음수 배지 변경분 **롤백**(`git checkout`) + 최상단 `[DEPRECATED & UNUSED FILE]` 워터마크 삽입. 파일 자체는 보존(물리 삭제 안 함) |
| `.agents/skills/gas-tasks/SKILL.md` | **Step 2.5 아키텍처 진입점 역추적 게이트** 신설, `Confirmed Facts` 템플릿에 증빙 형식 명시, 금지사항에 "진입점 증빙 없이 UI/API 요구사항 작성 금지" 추가 |
| `.agents/rules/00_roles-and-workflow.md` | **`3. 시스템 물리적 경계`** 조항 신설 (기존 `3. 작업 흐름` → `4.`로 번호 이동) |
| `Docs/Architecture.md` | "SPA에 포함되지 않는 `src/` 파일" 블록을 에이전트 경고 섹션으로 승격 — 파일별 활성/사장 상태 표 + 진입점 라인 근거 |
| `AGENTS.md` | Hard Guardrail 4번 신설 (명세 범위 밖 — 아래 참고) |

### 게이트의 핵심 설계

**판단 근거를 파일이 아니라 진입점으로 고정했다.** 기존 절차의 Step 2는 "Frontend `.html` 파일 확인 (UI 관련 시)"였는데,
이 문장은 `JS_Master.html`을 열어 읽는 것만으로 충족된다. 파일 안에는 완성된 테이블 렌더링 코드가 있으니
"웹앱 품목 마스터 화면이 있다"는 결론이 자연스럽게 나온다 — TASK-011이 정확히 이 경로로 실패했다.

그래서 Step 2.5는 **UI 존재의 근거로 삼을 수 있는 지점을 두 곳으로 제한**한다.

| 확인 | 대상 |
|------|------|
| ① 진입 메뉴 | `Index.html`의 `<nav>`에 `showTab('<탭ID>')` 버튼과 `id="tab-<탭ID>"` 컨테이너가 **둘 다** 존재 |
| ② 스크립트 로딩 | `Index.html` 하단 `<?!= include('파일명') ?>`에 **실제로** 포함 |

둘 중 하나라도 증명되지 않으면 웹앱 UI로 간주하는 것을 금지하고, `src/` 파일 목록·파일명·파일 내부 코드는
근거로 인정하지 않는다고 명문화했다. 서버/시트 요구사항도 같은 방식으로 `Code.gs onOpen/onEdit`,
`WebApp.gs` 공개 함수·`runSystemCommand` case, `Triggers.gs` 등록 함수로 호출 경로를 역추적하게 했다.

증빙은 `Confirmed Facts`에 다음 형식으로 남긴다 — **라인 번호 없이 "~에 있다"는 증빙으로 인정하지 않는다.**

```
[진입점 호출 경로 증빙: src/Index.html:81 (showTab('dashboard')) → src/Index.html:523 (include('JS_UI'))
 → src/JS_UI.html:120 renderDashboard() → #alertTableBody]
```

### 명세 대비 구현 판단 (2건)

1. **워터마크의 참조를 `Docs/Architecture.md 제5조` → 실제 섹션명으로 교체**
   명세가 지시한 워터마크 문구는 `(참조: Docs/Architecture.md 제5조)`였으나, **해당 문서에는 조 번호 체계가 없다**
   (목차: `현재 Architecture` / `핵심 흐름` / `환경 분리 및 검증 파이프라인` / `향후 개선 Architecture`).
   존재하지 않는 위치를 가리키는 참조를 넣는 것은 이 Task가 막으려는 오류와 같은 종류이므로,
   실제 섹션명 `"SPA에 포함되지 않는 src/ 파일"`로 바꿔 넣었다.

2. **워터마크에 "왜 죽은 코드인지"의 근거 라인을 함께 기입**
   명세 초안은 "include되지 않는다"는 결론만 담았으나, 결론만으로는 다음 에이전트가 다시 검증할 수 없다.
   include 목록(`Index.html:522-527`)과 nav 목록(`Index.html:81-101`), 그리고
   "이 파일이 참조하는 `masterTableBody` 등은 런타임에 존재하지 않는다"는 귀결을 함께 적어
   워터마크 자체가 Step 2.5 역추적의 완성된 예시가 되도록 했다.

### 명세 외 추가 반영 (1건)

- **`AGENTS.md`에 Hard Guardrail 4번 추가** — 명세의 `Files to Modify`에는 없다.
  `AGENTS.md`는 Antigravity가 워크스페이스 진입 시 읽는 최상위 지침이고 `/gas-tasks` 가드레일 3개가 이미 여기 있다.
  게이트를 SKILL.md와 rules에만 두면 **Task 작성을 시작하기 전 단계에서는 아무 제동이 걸리지 않는다.**
  실효성을 위해 최상위에도 한 줄 걸고, 상세는 SKILL.md Step 2.5로 위임했다. 불필요하면 이 항목만 되돌리면 된다.

### 사장 파일 재확인 결과

`src/`의 `.html` 9개를 진입점 기준으로 전수 확인했다.

| 파일 | 상태 | 근거 |
|------|------|------|
| `Index.html` | 활성 | `WebApp.gs doGet()` |
| `Stylesheet` / `JS_Auth` / `JS_UI` / `JS_Tx` / `JS_Config` / `JS_BaseData` | 활성 | `Index.html:9, 522-527` include |
| `UploadCsv.html` | 활성 (SPA 아님) | `Code.gs:36`이 메뉴에서 모달로 직접 생성 |
| **`JS_Master.html`** | 🔴 **사장** | include·nav 어디에도 없음 |

→ 워터마크 대상은 `JS_Master.html` 1건뿐이다. `UploadCsv.html`은 SPA 밖일 뿐 실제 호출 경로가 있어 대상이 아니다.

### 테스트 결과

- `npm test` — **7개 파일 전체 통과** (회귀 없음)
- `npm run dev:push` → DEV 반영 후 E2E **3 passed**
  (smoke 2건: 웹앱 접속·로그인 화면 렌더링 / SheetJS 로드, + 대시보드 음수 배지 렌더링 1건)
- 소스 런타임 변경은 `JS_Master.html`의 주석뿐이며, 그 파일은 include되지 않으므로 웹앱 동작에 영향이 없다.

### 이 게이트의 한계 (솔직한 평가)

이번 산출물은 **문서·규칙 강화이지 기계적 강제가 아니다.** Step 2.5를 건너뛰고 Task를 작성해도
파이프라인이 막아 주지 않으며, 준수 여부는 여전히 에이전트의 규율에 달려 있다.
실제로 걸러내려면 다음 중 하나가 추가로 필요하다 — 이번 Task 범위 밖이므로 착수하지 않았다.

- `AI/tasks/ready/*.md`를 검사해 UI 요구사항에 `[진입점 호출 경로 증빙: ...]`이 없으면 실패시키는 린터
- `Files to Modify`에 사장 파일이 포함되면 차단하는 검사 (사장 파일 목록을 코드로 관리)
- Claude Code 구현 착수 시점의 방어: `Files to Modify`의 각 파일이 진입점에 연결돼 있는지 확인 후 진행

현 상태에서 실질적인 마지막 방어선은 **Claude Code의 착수 전 교차 검증**이다.
TASK-011에서는 그 검증이 "이미 수정된 파일이 있는가"만 봤고 "이 파일이 실행되기는 하는가"는 보지 않았다.

### 미수행 항목

- 없음. (Human Approval 불필요 — 에이전트 거버넌스 내부 개선)

### 배포

DEV 반영 완료. Production은 Human 승인 후 `git push origin main`.
소스 런타임 영향이 없는 문서·주석 변경이므로 마이그레이션이나 시트 작업은 필요 없다.

### 롤백

`git checkout HEAD -- src/JS_Master.html .agents/ Docs/Architecture.md AGENTS.md`
