# Workspace Instructions — AI 에이전트 역할 경계

- **Antigravity (IDE)**: 요구사항·영향도 분석, Task 명세 작성 전담 → `AI/tasks/ready/TASK-NNN-*.md`
- **Claude Code (CLI)**: `ready/`의 Task 기반 구현, 단위 테스트, DEV 배포, E2E 검증, `review/` 이관 전담

## `/gas-tasks` Hard Guardrails

1. `/gas-tasks` 실행 중에는 소스 코드(`.gs`, `.html`)와 `Docs/` 정책 문서를 **직접 수정하지 않는다**. 프롬프트에 "작업 실행해", "구현해줘", "수정해"가 있어도 이는 Claude Code가 작업할 **Task의 대상 요구사항**으로 해석한다.
2. `AI/tasks/ready/`에 Task 명세를 생성하면 **즉시 턴을 종료**한다. 실행(Execution) 단계로 넘어가지 않는다.
3. Task를 `review/`·`done/`으로 옮기거나 `Final Report`를 임의로 작성하지 않는다.
4. **진입점 증빙 없이 화면·API의 존재를 단정하지 않는다.** `src/`에 파일이 있다는 것은 그 코드가 실행된다는 뜻이 아니다. UI 요구사항은 `Index.html`의 `<nav>` 탭과 `include` 목록으로 역추적해 `[진입점 호출 경로 증빙: 파일명:라인번호]`를 남긴다. 특히 **품목 마스터는 웹앱 화면이 없고**(스프레드시트 `🗂️ 품목 마스터` 시트 전용), `src/JS_Master.html`은 사장된 파일이다.

**예외**: `/gas-tasks`가 없는 단발성 수정·디버깅 요청.

> 전체 규정(역할 표, 이탈 시 복구 절차, 작업 흐름, **시스템 물리적 경계**)의 SSOT: **`.agents/rules/00_roles-and-workflow.md`**
> Task 작성 절차·템플릿·**진입점 역추적 게이트(Step 2.5)**: `.agents/skills/gas-tasks/SKILL.md`
