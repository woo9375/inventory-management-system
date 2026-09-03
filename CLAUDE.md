# CLAUDE.md

> **호텔 재고 관리 시스템 AI 개발환경 진입점**

## 프로젝트
Google Apps Script(V8) + Google Sheets 기반 호텔 재고 관리 시스템.

## 핵심 스택
- **런타임**: Google Apps Script (V8 엔진)
- **데이터베이스**: Google Sheets (Batch I/O 필수)
- **프론트엔드**: HtmlService (SPA)
- **CI/CD**: `git push origin main` → GitHub Actions → `clasp push` + `clasp deploy` (코드 갱신과 릴리스는 별개 단계 — `Docs/Deployment.md`)

## 절대 금지
1. `import`, `export`, `require()` 사용 금지 (GAS 미지원)
2. 시크릿/상수 하드코딩 금지 (`Config.gs` / `ScriptProperties` 사용)
3. 로컬 `clasp push` Production 배포 금지 (GitHub Actions 위임)
4. 업무 규칙 임의 변경 금지 (`Docs/BusinessRules.md` 준수)
5. Production 데이터 쓰기/삭제/테스트 금지

## Task 시스템
```
AI/tasks/ready/    ← Antigravity가 생성. Claude Code 구현 대기
AI/tasks/review/   ← 구현 완료. Human QA 대기
AI/tasks/done/     ← Human QA + Production 배포 완료
```

**구현 착수 전 교차 검증**: `git status`로 작업 트리를 확인한다. Task가 `Files to Modify`로 명시한 파일이 이미 수정되어 있으면 Antigravity의 역할 이탈이므로, 구현을 중단하고 사용자에게 보고한다.

## DEV / Production 분리
| 환경 | clasp 설정 | 배포 방법 |
|------|-----------|-----------|
| DEV | `.clasp-dev.json` | `npm run dev:push` |
| Production | `.clasp.json` | `git push origin main` |

- DEV에서 구현/테스트/Playwright E2E 수행
- Production 배포는 Human 승인 후 `gas-deploy` Skill 사용

## Playwright E2E
- 설정: `playwright.config.js` (Production URL 자동 차단)
- 실행: `npm run test:e2e`
- 대상: DEV Web App만 (`.env`의 `PLAYWRIGHT_BASE_URL`)

## 참조
- **`AGENTS.md`** / **`.agents/rules/00_roles-and-workflow.md`**: 에이전트 역할 경계 (Antigravity ↔ Claude Code)
- **`.agents/rules/`**: 환경, 보안, 데이터 모델 제약 사항
- **`Docs/`**: 업무 규칙, 스키마, 아키텍처 상세
- **`AI/tasks/`**: 작업 명세서 (`TASK-NNN-*.md`)
- **`.agents/skills/`**: gas-tasks (Task 생성), gas-deploy (배포)
