# /task Workflow

사용자의 기능 요청을 체계적으로 분석하여 Claude Code가 구현할 수 있는 수준의 Task 문서를 생성하는 워크플로우.

## 트리거
```
/task [요구사항 설명]
```

예시:
```
/task 입고 취소 기능을 추가하고 싶다
/task 품목 마스터에 공급업체 필드를 추가해야 한다
/task 월마감 전에 미확정 거래 경고가 필요하다
```

---

## 실행 순서

### Step 1: 요구사항 파악
- 사용자의 요구를 명확한 목표로 정리
- 배경과 이유 파악

### Step 2: 현재 코드/문서 조사
- 관련 `.gs` 파일을 **실제로 읽기** (절대 추측하지 않음)
- `Docs/` 문서 참조
- `Config.gs` 상수 확인

### Step 3: Business Rule 확인
- `.agents/rules/02_business-rules.md` 참조
- `Docs/BusinessRules.md` 참조
- 충돌 여부 확인

### Step 4: Architecture / Data Model 확인
- `Docs/Architecture.md` 참조
- `Docs/DataModel.md`, `Docs/SheetSchema.md` 참조
- 영향받는 레이어 식별

### Step 5: 변경 범위 분석
- 수정/생성할 파일 목록
- Sheet 구조 변경 여부
- Migration 필요 여부
- 보안/권한 영향

### Step 6: 질문 (필요시만)
다음 경우에만 사용자에게 질문:
- 업무규칙이 결정되지 않았을 때
- 기존 정책과 충돌할 때
- 데이터 구조를 확정해야 할 때
- 보안상 승인이 필요한 변경일 때

### Step 7: Task 파일 생성
파일 위치: `AI/tasks/TASK-NNN-description.md`

---

## Task 문서 구조

```markdown
# TASK-NNN: [제목]

## Objective
[구현 목표]

## Business Context
[왜 필요한가, 업무적 배경]

## Current System
[현재 어떻게 동작하는가 — 코드에서 확인한 사실]

## Current Architecture
[영향받는 모듈과 흐름]

## Current Data Model
[관련 Entity와 Sheet]

## Current Sheet Schema
[관련 열 구조]

## Business Rules
[적용되는 업무 규칙]

## Requirements
### Functional
- [ ] ...
### Non-Functional
- [ ] ...

## Constraints
[GAS 환경 제약, 하위 호환성 등]

## Files to Inspect
[구현 전 반드시 읽어야 할 파일]

## Files to Create
[새로 만들 파일]

## Files to Modify
[수정할 파일과 변경 내용]

## GAS Implementation
[구현 방향과 핵심 로직]

## Sheet Changes
[Sheet 구조 변경 사항 — 없으면 "없음"]

## Security Considerations
[권한/인증 관련 고려사항]

## Migration Considerations
[Schema Migration 필요 여부]

## Unit Tests
[테스트 시나리오]

## E2E Tests
[E2E 테스트 시나리오]

## Acceptance Criteria
[완료 판단 기준]

## Deployment Requirements
[배포 시 주의사항]

## Final Report
[구현 완료 후 작성]
```
