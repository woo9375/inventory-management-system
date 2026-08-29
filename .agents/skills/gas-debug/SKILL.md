---
name: gas-debug
description: >-
  Use this skill when the user reports a bug, error, or unexpected behavior
  in the GAS inventory system that needs investigation and fixing.
---

# GAS Debug Skill

## 목적
버그를 체계적으로 조사하고 수정하기 위한 절차.

## 사용 시점
- 사용자가 버그를 보고할 때
- 에러 메시지가 발생할 때
- 예상과 다른 동작이 관찰될 때

## 사전조건
- 에러 메시지 또는 재현 절차 확보
- 관련 모듈의 코드를 실제로 읽을 것

## 실행 절차

### Step 1: 증상 파악
1. 에러 메시지 / 스택 트레이스 확인
2. 재현 조건 파악 (어떤 역할, 어떤 업장, 어떤 데이터)
3. 발생 빈도 (항상 / 간헐적)

### Step 2: 원인 추적
1. 관련 `.gs` 모듈 코드 읽기
2. 데이터 흐름 추적 (입력 → 처리 → 출력)
3. GAS 환경 제약 위반 여부 확인 (`01_gas-environment.md`)
4. 최근 변경사항 (`git log`) 검토

### Step 3: 영향 분석
1. 동일 함수를 호출하는 다른 코드 검색
2. 데이터 무결성 영향 확인
3. 회귀 위험 평가

### Step 4: 수정 방안 제시
1. Root cause 설명
2. 수정 코드 제시
3. 부작용 분석

### Step 5: 검증
1. 원래 버그가 해결되었는지 확인
2. 관련 기능 회귀 테스트
3. 에러 핸들링 개선 여부

## 금지사항
- 증상만 보고 추측으로 수정
- 근본 원인 파악 없이 임시 방편 적용
- 다른 기능에 영향주는 변경을 검토 없이 진행

## 완료 조건
- Root cause가 명확히 식별됨
- 수정이 비즈니스 규칙에 부합
- 회귀 테스트 통과
