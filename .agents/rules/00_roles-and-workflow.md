# Agent Roles & Workflow Rules (SSOT)

이 문서는 이 프로젝트에서 협업하는 AI 에이전트(**Antigravity**, **Claude Code**)의 역할 경계에 대한 **불변의 제약 사항**만 정의합니다.

> **Task 문서 작성 절차와 템플릿은 `.agents/skills/gas-tasks/SKILL.md`를 참조하십시오.**
> **배포 경로와 `clasp` 설정은 `.agents/skills/gas-deploy/SKILL.md` 및 `Docs/Deployment.md`를 참조하십시오.**

---

## 1. 역할 경계 (R&R)

| 에이전트 | 담당 | 산출물 |
|---------|------|--------|
| **Antigravity** (IDE) | 요구사항 분석, 영향도 검토, 아키텍처·업무규칙 자문, Task 명세 작성 | `AI/tasks/ready/TASK-NNN-*.md` |
| **Claude Code** (CLI) | 소스 구현, 단위 테스트, DEV 배포(`npm run dev:push`), E2E 검증, Final Report 작성 및 `review/` 이관, **Human 승인 후** Production 배포 실행 | 소스·테스트 변경, `AI/tasks/review/TASK-NNN-*.md` |
| **Human** | Task 검토·QA, Production 배포 승인, `done/` 이관 | 승인 |

---

## 2. 절대 금지 및 필수 원칙

1. **`/gas-tasks` 실행 중 소스 코드 변경 금지**: Antigravity는 `src/`의 `.gs`·`.html`이나 `Docs/`의 정책 문서를 수정·삭제·추가하지 않는다. 프롬프트에 "구현해줘", "수정해줘", "작업 실행해"가 포함되어 있어도 이는 **Claude Code가 수행할 Task의 목표 서술**로 해석한다.
2. **실행 단계(Execution) 진입 금지**: `implementation_plan.md` 등을 통해 스스로 구현 단계로 넘어가지 않는다. `AI/tasks/ready/`에 Task를 생성하면 사용자에게 간결히 알리고 **즉시 턴을 종료**한다.
3. **태스크 상태 임의 전이 금지**: Antigravity는 Task를 `ready/`에만 생성하며, `Final Report`를 작성하거나 파일을 `review/`·`done/`으로 이동하지 않는다.
4. **이탈 시 원상 복구**: `/gas-tasks` 수행 중 이미 소스를 수정했다면 즉시 중단하고, 변경분을 되돌린 뒤(`git checkout -- <path>`) 그 내용을 Task 명세로 옮겨 적고 사용자에게 보고한다.
5. **Claude Code 측 교차 검증**: Task 구현에 착수하기 전 `git status`로 작업 트리를 확인한다. Task가 `Files to Modify`로 명시한 파일이 **이미 수정되어 있으면** 역할 이탈이므로, 구현을 중단하고 사용자에게 보고한다.

**예외**: `/gas-tasks` 명령이 없는 단발성 수정·디버깅 요청에 한해 Antigravity의 직접 코드 수정을 허용한다.

---

## 3. 시스템 물리적 경계 (System Physical Boundaries)

각 도메인이 **어디에서 관리되는가**에 대한 SSOT다. 요구사항을 설계할 때 이 표에 없는 화면을 가정하지 않는다.
`src/`에 파일이 존재한다는 사실은 그 화면이 존재한다는 뜻이 아니다 (검증 절차: `gas-tasks` SKILL의 **Step 2.5 진입점 역추적 게이트**).

| 도메인 | 웹앱 화면 | 스프레드시트 | 비고 |
|--------|-----------|--------------|------|
| **품목 마스터** | **없음** | `🗂️ 품목 마스터` 시트에서 **100% 직접 관리** | `src/JS_Master.html`은 **사장된 파일** — `Index.html`에 include되지 않음. 수정 금지 |
| **입출고** | `입출고 기록` 탭 (`showTab('transactions')`) | `📝 통합 입출고 기록장` + 업장별 시트 | 통합 시트는 업장 시트로부터 재구성되는 파생 뷰 |
| **대시보드** | `대시보드` 탭 (`showTab('dashboard')`) | `📊 대시보드` 시트 | 웹앱에서 품목 현재고가 보이는 **유일한 화면**이 이 탭의 '위험·발주필요 품목' 테이블(`JS_UI.html`)이다 |
| **업장 / 시즌 / 계정 / 기초데이터** | 각 탭 (`shop` / `season` / `user` / `basedata`) | `🏢 업장관리` / `📅 시즌설정` / `👤 사용자관리` / `📂 기초데이터` | — |
| **품목 CSV 업로드** | 없음 (SPA 아님) | 스프레드시트 메뉴 → 모달 | `Code.gs:36`이 `UploadCsv.html`을 직접 띄운다 |

**웹앱 SPA의 실제 구성 (근거: `src/Index.html`)**
- 사이드바 탭 7개: `dashboard` / `transactions` / `shop` / `season` / `user` / `basedata` / `mysettings` (Index.html:81-101)
- include되는 스크립트 5개: `JS_Auth` / `JS_UI` / `JS_Tx` / `JS_Config` / `JS_BaseData` (Index.html:522-527)
- **`JS_Master`는 포함되어 있지 않다.**

> 이 경계를 어기고 작성된 대표 사고: TASK-011이 "웹앱 품목 마스터 테이블에 음수 배지 추가"를 요구사항에 넣어
> 사장된 파일을 수정하게 만들었다. 라인 번호 증빙 없이 화면 존재를 단정한 것이 원인이다.

---

## 4. 작업 흐름

```
[사용자 요구사항]
  → [Antigravity /gas-tasks]  Task 명세 작성 → AI/tasks/ready/   (코드 수정 일체 금지)
  → [Claude Code]             구현 → 단위 테스트 → DEV 배포 → E2E → AI/tasks/review/
  → [Human]                   QA 및 Production 배포 승인
  → [Claude Code gas-deploy]  git push origin main → GitHub Actions → AI/tasks/done/
```
