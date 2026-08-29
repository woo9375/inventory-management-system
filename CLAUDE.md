# CLAUDE.md — 호텔 재고 관리 시스템 (Claude Code 가이드)

> 이 파일은 Claude Code가 이 프로젝트에서 작업을 시작할 때 **가장 먼저 읽는 문서**입니다.

---

## 프로젝트 개요

호텔 재고 관리 시스템. Google Apps Script (V8) + Google Sheets 기반.

- **런타임**: Google Apps Script (V8 엔진)
- **데이터**: Google Sheets (DB 역할)
- **프론트엔드**: HtmlService (SPA)
- **배포**: clasp + GitHub Actions (main push → 자동 배포)

---

## 필수 읽기 순서

### 1단계: Rules (반드시 먼저 읽기)
```
.agents/rules/01_gas-environment.md    ← GAS 환경 제약 (import 금지, 6분 제한 등)
.agents/rules/02_business-rules.md     ← 업무 규칙 (FIFO, 재고 계산, 입출고)
.agents/rules/03_data-model.md         ← 데이터 모델 규칙 (Sheet 구조 변경 절차)
.agents/rules/04_security-rbac.md      ← 보안/권한 (3단계 RBAC)
.agents/rules/05_code-conventions.md   ← 코드 규약 (네이밍, 패턴)
.agents/rules/06_development-workflow.md ← 개발 워크플로우
```

### 2단계: Docs (작업 관련 부분만)
```
Docs/SheetSchema.md    ← Sheet 물리 구조 (열 매핑)
Docs/DataModel.md      ← Entity 정의
Docs/Architecture.md   ← 시스템 아키텍처
Docs/BusinessRules.md  ← 업무 규칙 상세
```

### 3단계: Task 확인
```
AI/tasks/TASK-NNN-*.md  ← Antigravity가 작성한 구현 명세서
```

---

## 절대 하지 말 것

1. `import` / `export` / `require()` 사용 금지
2. 시트명 하드코딩 금지 → `Config.gs` 상수 사용
3. 열 번호 매직넘버 금지 → `MASTER_COLS.*` 등 사용
4. 기존 비즈니스 규칙 임의 변경 금지
5. 기존 Sheet 구조 Migration 없이 변경 금지
6. Production 데이터 임의 수정 금지
7. 인증정보 소스코드 포함 금지

---

## 코드 변경 시 필수 사항

1. **Config.gs 상수 사용**: 새 상수 필요 시 Config.gs에 추가
2. **배치 처리**: `getValues()`/`setValues()` 사용 (개별 셀 루프 금지)
3. **에러 처리**: try-catch + 사용자 친화적 메시지 반환
4. **LockService**: 데이터 변경 시 `try { lock.waitLock() } ... finally { lock.releaseLock() }`
5. **CacheManager**: 데이터 변경 후 `CacheManager.invalidateAll()` 호출
6. **권한 검증**: 모든 API에 `validateSession(token)` 포함
7. **변경이력**: 품목 마스터 수정 시 SHEET_CHANGELOG에 기록

---

## Skills 참조

| 작업 유형 | Skill |
|-----------|-------|
| 새 기능 개발 | `.agents/skills/gas-feature/SKILL.md` |
| 버그 수정 | `.agents/skills/gas-debug/SKILL.md` |
| 테스트 | `.agents/skills/gas-test/SKILL.md` |
| Sheet 구조 변경 | `.agents/skills/sheet-schema/SKILL.md` |
| 배포 & Git | `.agents/skills/gas-deploy/SKILL.md` |

---

## Workflows 참조

| 워크플로우 | 파일 |
|------------|------|
| /task | `.agents/workflows/task.md` |
| /review | `.agents/workflows/review.md` |
| /test | `.agents/workflows/test.md` |
| /release | `.agents/workflows/release.md` |
