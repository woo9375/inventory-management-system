---
name: gas-feature
description: >-
  Use this skill when the user asks to develop a new feature, add a new
  capability, or implement a new business requirement in the GAS inventory system.
---

# GAS Feature Development Skill

## 목적
새로운 기능을 체계적으로 개발하기 위한 **설계 및 명세 작성** 절차. (실제 코드 구현은 본 명세를 바탕으로 추후 Claude Code가 수행합니다.)

## 사용 시점
- 사용자가 새 기능을 요청할 때
- 비즈니스 요구사항이 새로 발생했을 때

## 사전조건
- `.agents/rules/` 및 `Docs/` 내 관련 문서를 확인했을 것
- 관련 소스 코드를 실제로 읽고 분석했을 것

## 실행 절차

### Step 1: 요구사항 분석
1. 사용자의 요구를 명확히 정리
2. 기존 비즈니스 규칙과의 충돌 여부 확인 (`Docs/BusinessRules.md`)
3. 영향받는 모듈 식별

### Step 2: 설계
1. Data Model 변경 필요 여부 확인 (`Docs/DataModel.md`, `Docs/SheetSchema.md`)
2. Architecture 레이어 결정 (Frontend / API / Business Logic / Repository)
3. 보안/권한 요구사항 설계 (`Docs/Security.md`)

### Step 3: Task 명세 작성 (Antigravity의 최종 산출물)
1. `AI/tasks/TASK-NNN-[설명].md` 생성
2. 목표, 아키텍처, 구현 지침(GAS 제약 포함), 테스트 방안 등 작성
3. **불확실한 부분은 사용자에게 질문하여 해결하거나 `[검토 필요]` 표시**

### Step 4: (참고) 실제 구현 및 검증
> Antigravity는 본 단계를 직접 수행하지 않고, 작성된 Task 명세를 바탕으로 Claude Code가 수행하도록 안내합니다.

## 금지사항
- 기존 API 시그니처 임의 변경 설계
- Sheet 구조 변경 시 Migration 절차 누락
- 코드를 직접 광범위하게 수정하려는 시도 (설계 명세 작성에 집중)

## 완료 조건
- `AI/tasks/` 하위에 실행 가능한 수준의 상세 명세서 1부가 완성되어야 함.
