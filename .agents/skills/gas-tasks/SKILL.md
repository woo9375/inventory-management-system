---
name: gas-tasks
description: >-
  Use this skill when the user asks to create a new feature, fix a bug, or make
  any change to the GAS inventory system. Analyzes requirements, inspects current
  code, and generates a Task specification that Claude Code can implement.
---

# /gas-tasks — 요구사항 → Task 명세 생성

## 목적

사용자의 자연어 요구사항을 분석하여 Claude Code가 바로 구현할 수 있는 **Task 문서**를 생성한다.

## 사용법

```
/gas-tasks 입고 취소 기능 추가
/gas-tasks 품목마스터 변경이력을 개선해줘
/gas-tasks 로그인 화면에 비밀번호 찾기 추가
```

---

## 실행 절차

### Step 1: 요구사항 파악
1. 사용자 요구를 명확한 **목표**로 정리
2. 배경과 이유 파악
3. 기능 요청 / 버그 수정 / 리팩토링 구분

### Step 2: 현재 코드 확인
- 관련 `.gs` 파일을 **실제로 읽기** (절대 추측하지 않음)
- `Config.gs` 상수 확인
- Frontend `.html` 파일 확인 (UI 관련 시)

### Step 3: 관련 문서 확인
- `Docs/BusinessRules.md` — 업무 규칙
- `Docs/DataModel.md` — 데이터 모델
- `Docs/SheetSchema.md` — 시트 구조
- `Docs/Architecture.md` — 아키텍처
- `Docs/Security.md` — 보안/RBAC

### Step 4: Business Rule 확인
- `.agents/rules/02_business-rules.md` 참조
- 충돌 여부 확인
- 불확실한 규칙은 `[검토 필요]` 표시

### Step 5: 영향 범위 분석
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

단순 구현 판단은 AI가 스스로 결정한다.

### Step 7: Task 파일 생성
- 파일명: `TASK-NNN-short-description.md`
- 위치: `AI/tasks/ready/`
- 번호: 기존 TASK 번호에 이어 순차 부여

---

## Task 문서 표준

```markdown
# TASK-XXX: 제목

## Objective
[구현 목표]

## Current System
[현재 어떻게 동작하는가 — 코드에서 확인한 사실]

## Confirmed Facts
[실제 코드를 읽어서 확인된 사실]

## Hypotheses
[아직 확인되지 않은 추정 — Claude Code가 구현 전 반드시 검증할 것]

## Requirements
### Functional
- [ ] ...
### Non-Functional
- [ ] ...

## Business Rules
[적용되는 핵심 업무 규칙 요약. 상세는 Docs/BusinessRules.md 참조]

## Files to Inspect
[구현 전 반드시 읽어야 할 파일]

## Files to Modify
[수정할 파일과 변경 내용]

## Implementation Plan
[구현 방향과 핵심 로직]

## Test Plan
### Unit Test
[단위 테스트 시나리오]
### E2E Test (Playwright)
[E2E 검증 시나리오 — DEV Web App 대상]

## Playwright E2E
[구체적인 Playwright 테스트 시나리오]
- DEV Web App 접속 → 로그인 → 기능 실행 → 결과 확인
- 가능한 경우 DEV Spreadsheet까지 데이터 검증

## Acceptance Criteria
[완료 판단 기준]

## Migration / Data Risk
[Sheet 구조 변경, 데이터 이관 위험. 없으면 "없음"]

## Deployment Notes
[배포 시 주의사항. 없으면 "없음"]

## Human Approval Required
[Human 확인/승인이 필요한 항목. 없으면 "없음"]
```

---

## 핵심 원칙

### Confirmed Facts vs Hypotheses
- **Confirmed Facts**: 실제 코드를 읽어서 확인된 사실만 기록
- **Hypotheses**: 아직 확인되지 않은 추정은 반드시 분리 표기
- Claude Code가 추정을 사실로 오인하지 않도록 명확히 구분

### Business Rule 참조
- Task마다 Business Rule 전문을 복붙하지 않는다
- 해당 Task에 적용되는 핵심 내용만 요약한다
- 상세는 `Docs/BusinessRules.md`를 참조하도록 안내한다

### 장황한 일반론 금지
- 실제로 Claude Code가 작업하는 데 필요한 정보만 포함
- 일반적인 소프트웨어 개발 원칙을 반복하지 않는다

---

## Task 상태 관리

```
AI/tasks/
├── ready/    ← Antigravity가 생성. Claude Code 구현 대기
├── review/   ← Claude Code 구현 완료. Human QA 대기
└── done/     ← Human QA + Production 배포 완료
```

Claude Code 구현 흐름:
```
Task 읽기 → 관련 Rule/Docs 확인 → 현재 코드 확인
→ Implementation → Unit Test → DEV 배포 (npm run dev:push)
→ Playwright E2E → Task → review/
```

---

## 금지사항
- 업무 규칙 임의 결정
- 확인되지 않은 사실을 Confirmed Facts에 기록
- 기존 API 시그니처 임의 변경 설계
- Sheet 구조 변경 시 Migration 절차 누락

## 완료 조건
- `AI/tasks/ready/`에 실행 가능한 수준의 상세 Task 문서 1부 완성
