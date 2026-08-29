# .claude/ Directory

이 디렉터리는 향후 **Claude Code** 도입 시 프로젝트별 설정, 세션 컨텍스트, 프롬프트 템플릿 등을 관리하기 위한 준비 공간입니다.

## 역할 및 사용 원칙
1. **설정 관리**: Claude Code CLI 실행 시 필요한 권한 설정, 무시 패턴 등을 구성할 수 있습니다.
2. **규칙 참조**: Claude Code는 프로젝트 루트의 `CLAUDE.md`, `Docs/`, `.agents/rules/`를 단일 진실 공급원(SSOT)으로 참조합니다.
3. **독립성 유지**: Antigravity의 설계 결과물(`AI/tasks/TASK-NNN-*.md`)을 입력받아 구현을 수행하는 역할을 보조합니다.
