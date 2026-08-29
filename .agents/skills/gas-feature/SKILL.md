---
name: gas-feature
description: >-
  Use this skill when the user asks to develop a new feature, add a new
  capability, or implement a new business requirement in the GAS inventory system.
---

# GAS Feature Development Skill

## 목적
새로운 기능을 체계적으로 개발하기 위한 절차.

## 사용 시점
- 사용자가 새 기능을 요청할 때
- 기존 기능에 새 요소를 추가할 때
- 비즈니스 요구사항이 새로 발생했을 때

## 사전조건
- `.agents/rules/` 전체 Rule을 읽었을 것
- `Docs/BusinessRules.md`, `Docs/Architecture.md` 확인
- 관련 소스 코드를 실제로 읽었을 것

## 실행 절차

### Step 1: 요구사항 분석
1. 사용자의 요구를 명확히 정리
2. 기존 비즈니스 규칙과의 충돌 여부 확인
3. 영향받는 모듈 식별

### Step 2: 설계
1. Data Model 변경 필요 여부 확인 (`Docs/DataModel.md`, `Docs/SheetSchema.md`)
2. Architecture 레이어 결정 (Frontend / API / Business Logic / Repository)
3. 보안/권한 요구사항 확인

### Step 3: Task 작성
1. `AI/tasks/TASK-NNN-description.md` 생성
2. 모든 섹션 채우기 (Objective ~ Acceptance Criteria)
3. 불확실한 부분은 `[검토 필요]` 표시

### Step 4: 구현 (Claude Code 단계)
1. Config.gs 상수 추가 (필요시)
2. Backend (.gs) 구현
3. Frontend (.html) 구현
4. Migration 스크립트 (필요시)

### Step 5: 검증
1. 비즈니스 규칙 일치 확인
2. 권한 검증
3. 에러 처리 확인
4. 기존 기능 회귀 테스트

## 금지사항
- 기존 API 시그니처 임의 변경
- Sheet 구조 변경 시 Migration 없이 진행
- 확인되지 않은 비즈니스 규칙 가정

## 검증 절차
- `02_business-rules.md` 체크리스트 실행
- `05_code-conventions.md` 체크리스트 실행
- `04_security-rbac.md` 체크리스트 실행

## 완료 조건
- `06_development-workflow.md`의 Definition of Done 충족
- Task 파일의 Final Report 작성
