# Development Workflow Rules

## 적용 범위
모든 개발 작업에 적용되는 워크플로우 규칙.

## 왜 필요한가
이 프로젝트는 "1인 AI 개발팀" 체제로 운영된다. Human, Antigravity, Claude Code 각각의 역할과 책임이 명확해야 일관된 품질을 유지할 수 있다.

---

## 역할 분리

### Human (사용자)
- 업무 방향 / 요구사항 / 우선순위 / 최종 승인
- 실제 업무 적합성 판단 / 최종 QA

### Antigravity (설계/관리)
- 요구사항 분석 / Business Analysis
- 업무 규칙 정리 / Data Model 설계
- Architecture 설계 / 코드 분석
- 작업 분해 / Claude Code 실행 명세 작성
- 코드/설계 Review

### Claude Code (구현, 추후 도입)
- 코드 구현 / 수정 / 리팩토링
- 디버깅 / 테스트 / E2E
- clasp 기반 배포 / Git 작업

---

## 작업 흐름

```
Human → 요구사항
  ↓
Antigravity → 분석 → Task 작성 (AI/tasks/TASK-NNN-*.md)
  ↓
Claude Code → 구현 → 테스트
  ↓
clasp/Git → 배포
  ↓
Human → QA → 승인
  ↓
GitHub → GitHub Actions → Production GAS
```

---

## Task 파일 규칙

### 파일 위치
```
AI/tasks/TASK-NNN-description.md
```

### 번호 부여
- 순차 번호 (TASK-001, TASK-002, ...)
- 중복 금지

### Task 작성 전 필수 확인
1. 관련 코드를 **실제로 읽을 것** (추측 금지)
2. 관련 Business Rule 확인
3. 현재 Architecture/Data Model 확인
4. 변경 범위 분석

### 사용자 질문 기준
다음 경우에만 사용자에게 질문:
- 업무규칙이 결정되지 않았을 때
- 기존 정책과 충돌할 때
- 데이터 구조를 확정해야 할 때
- 보안상 승인 필요한 변경일 때

단순 구현 판단은 AI가 스스로 결정.

---

## Definition of Done

모든 정식 Task에는 다음 완료조건 적용:

```
□ 요구사항 구현
□ Business Rule 일치
□ Data Model 일치
□ Sheet Schema 일치
□ 코드 검증
□ 테스트 통과
□ 권한 검증
□ 회귀 검증
□ 오류 처리 확인
□ 변경 파일 확인
□ 문서 업데이트
□ Git 상태 확인
□ 최종 보고
```

---

## Git 규칙

### 브랜치 전략
```
main ← 안정 버전 (자동 배포 대상)
  ├── feature/*  ← 신규 기능
  ├── fix/*      ← 버그 수정
  └── refactor/* ← 리팩토링
```

### 커밋 메시지
```
[타입] 간결한 설명

타입: feat, fix, refactor, style, docs, chore
```

### PR 규칙
- 규모 있는 변경 = feature branch → PR → Human Review → Merge
- 단순 수정 = 상황에 따라 main 직접 커밋 가능
- AI가 생성한 대규모 변경 = 반드시 Diff Review

---

## 금지사항

| 금지 | 이유 |
|------|------|
| 기존 기능 임의 삭제 | 업무 중단 위험 |
| 기존 Sheet 구조 임의 변경 | 데이터 오염 |
| 기존 업무규칙 임의 변경 | 사용자 승인 필요 |
| Production 데이터 임의 수정 | 자산 관련 데이터 |
| 인증정보 노출 | 보안 |
| 실제 운영 배포 (검증 없이) | QA 필수 |
| 확인되지 않은 업무규칙 사실처럼 작성 | `[검토 필요]` 표시 |

---

## 문서 참조 경로

| 문서 | 위치 |
|------|------|
| 환경 규칙 | `.agents/rules/01_gas-environment.md` |
| 업무 규칙 | `.agents/rules/02_business-rules.md` + `Docs/BusinessRules.md` |
| 데이터 모델 | `.agents/rules/03_data-model.md` + `Docs/DataModel.md` |
| 보안/RBAC | `.agents/rules/04_security-rbac.md` + `Docs/Security.md` |
| 코드 규약 | `.agents/rules/05_code-conventions.md` + `Docs/CodingRules.md` |
| Sheet 스키마 | `Docs/SheetSchema.md` |
| 아키텍처 | `Docs/Architecture.md` |
| 테스트 전략 | `Docs/TestStrategy.md` |
| 배포 | `Docs/Deployment.md` |
