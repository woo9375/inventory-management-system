---
name: gas-test
description: >-
  Use this skill when the user asks to test the system, validate business logic,
  verify data integrity, or run quality checks on the GAS inventory system.
---

# GAS Test Skill

## 목적
재고 관리 시스템의 데이터 무결성과 비즈니스 로직을 검증하는 절차.

## 사용 시점
- 새 기능 구현 후 검증이 필요할 때
- 비즈니스 규칙 변경 후 회귀 테스트가 필요할 때
- 배포 전 최종 검증이 필요할 때

## 사전조건
- 테스트 대상 코드가 완성되어 있을 것
- `Docs/TestStrategy.md` 읽기

## 테스트 레이어

### 1. Syntax Check
- `.gs` 파일 문법 오류 확인
- `clasp push` 시 V8 엔진 거부 여부

### 2. Unit Test (비즈니스 로직)
```
□ FIFO 차감 순서 정확성
□ 재고 계산: 초기재고 + 입고 - 출고 - 폐기
□ 시즌 배수 보정
□ 안전재고/발주점 수식
□ 비밀번호 해싱/검증
□ 거래ID 생성 형식
```

### 3. Integration Test (API 레이어)
```
□ 각 API 엔드포인트의 인증 검증
□ 권한별 접근 제어
□ CacheManager 캐시 무효화
□ LockService 동시성 처리
```

### 4. Data Integrity Test
```
□ 품목코드 유일성
□ 거래ID 유일성
□ Sheet 열 수 일치 (TX_COLS, MASTER_COL_COUNT)
□ ARRAYFORMULA 수식 정상 동작
□ 미사용 품목 필터링
```

### 5. E2E Test (Playwright, 추후)
```
□ 로그인/로그아웃
□ 입출고 등록
□ 품목 마스터 CRUD
□ 대시보드 표시
□ 설정 관리
□ 역할별 UI 접근 제어
```

## 금지사항
- Production 데이터로 테스트 금지
- 테스트 중 실제 월마감 실행 금지
- 테스트 데이터를 Production에 남기지 말 것

## 완료 조건
- 모든 해당 레이어의 체크리스트 통과
- 실패 항목에 대한 원인 분석 완료
