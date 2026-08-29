# CLAUDE.md

> **호텔 재고 관리 시스템 AI 개발환경 진입점 (SSOT)**

본 프로젝트는 Google Apps Script(V8) + Google Sheets를 기반으로 동작하며, "Antigravity가 설계하고, Claude Code가 구현한다"는 철학으로 운영됩니다.

## 1. 프로젝트 핵심 스택
- **런타임**: Google Apps Script (V8 엔진)
- **데이터베이스**: Google Sheets (Batch I/O 필수)
- **프론트엔드**: HtmlService (SPA)
- **CI/CD**: `git push origin main` → GitHub Actions 자동 배포 (clasp)

## 2. 절대 규칙 (Never Do)
1. **Node.js/ES6 모듈 사용 금지**: `import`, `export`, `require()`를 사용하지 마십시오.
2. **시크릿/상수 하드코딩 금지**: 모든 환경 상수 및 열 매핑은 `Config.gs`를, 시크릿은 `ScriptProperties`를 사용합니다.
3. **로컬 배포 금지**: `clasp push` 명령을 수동으로 실행하지 마십시오. GitHub Actions에 위임합니다.
4. **업무 규칙 임의 변경 금지**: 모든 비즈니스 로직(FIFO, 안전재고 등)은 `Docs/BusinessRules.md`를 엄격히 준수합니다.

## 3. 참조 문서 및 절차 안내
자세한 개발 가이드라인과 절차는 다음 디렉터리의 규칙을 단일 진실 공급원(SSOT)으로 삼아 참조하십시오.

- **`.agents/rules/`**: 절대로 어겨선 안 되는 환경, 보안, 데이터 모델에 대한 불변의 제약 사항을 담고 있습니다. 코딩 전 반드시 확인하십시오.
- **`Docs/`**: 현재 시스템의 업무 규칙(`BusinessRules.md`), 데이터 스키마(`SheetSchema.md`), 아키텍처(`Architecture.md`)의 상세 내역이 기록되어 있습니다.
- **`AI/tasks/`**: 작업에 착수하기 전 Antigravity가 작성한 작업 명세서(`TASK-NNN-*.md`)를 확인하고 구현을 시작하십시오.
- **`.agents/skills/`**: 작업 중 필요한 특정 절차(배포, 테스트, 디버깅 등)는 이 폴더 내의 스킬을 참조하십시오.
