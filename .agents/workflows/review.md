# /review Workflow

현재 구현이 요구사항, 비즈니스 규칙, 아키텍처, 보안 정책에 부합하는지 체계적으로 검토하는 워크플로우.

## 트리거
```
/review
/review [파일명 또는 기능명]
```

---

## 검토 순서

### 1. Requirement Review
- 원래 요구사항(Task 문서)과 구현 비교
- 누락된 요구사항 식별
- 과잉 구현 식별

### 2. Business Rule Review
- `.agents/rules/02_business-rules.md` 체크리스트 실행
- `Docs/BusinessRules.md`와 일치 여부
- FIFO, 재고 계산, 시즌 배수 등 핵심 규칙 위반 여부

### 3. Architecture Review
- 올바른 모듈에 코드가 배치되었는가
- 레이어 분리가 유지되는가 (Frontend / API / Business Logic / Repository)
- 의존성 방향이 올바른가

### 4. Implementation Review
- `05_code-conventions.md` 체크리스트 실행
- 배치 처리 사용 여부
- 에러 핸들링 적절성
- LockService/CacheManager 패턴 준수

### 5. Data Review
- `03_data-model.md` 체크리스트 실행
- Sheet 구조 변경이 있으면 Migration 포함 여부
- Config.gs 상수 사용 여부

### 6. Security Review
- `04_security-rbac.md` 체크리스트 실행
- 새 API의 인증/권한 검증
- 민감정보 노출 여부

### 7. Test Review
- 테스트 커버리지 적절성
- 엣지 케이스 포함 여부
- 회귀 위험 평가

---

## 문제 분류

| 심각도 | 설명 | 조치 |
|--------|------|------|
| **Critical** | 데이터 손실, 보안 취약점, 비즈니스 규칙 위반 | 즉시 수정 필수 |
| **High** | 기능 오류, 성능 문제, 회귀 위험 | 배포 전 수정 필요 |
| **Medium** | 코드 규약 위반, 문서 미비 | 권장 수정 |
| **Low** | 스타일, 최적화 기회 | 선택적 개선 |

---

## 출력 형식

```markdown
# Review Report

## Summary
- 검토 대상: [파일/기능]
- 검토일: [날짜]
- 결과: [PASS / PASS WITH NOTES / FAIL]

## Findings

### Critical
- ...

### High
- ...

### Medium
- ...

### Low
- ...

## Recommendations
- ...
```
