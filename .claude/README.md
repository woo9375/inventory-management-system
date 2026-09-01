# .claude/ Directory

Claude Code 전용 설정 디렉터리.

- **SSOT**: Claude Code는 프로젝트 루트의 `CLAUDE.md`를 진입점으로, `.agents/rules/`와 `Docs/`를
  단일 진실 공급원으로 참조한다. 규칙을 이 디렉터리에 중복 기록하지 않는다.
- **역할**: Antigravity가 `AI/tasks/ready/`에 생성한 Task 명세를 입력받아 구현·테스트를 수행한다.
- 이 디렉터리에는 권한 설정 등 Claude Code CLI 동작에 관한 파일만 둔다.
