# /test Workflow

시스템의 정합성을 다층적으로 검증하는 워크플로우.

## 트리거
```
/test
/test [특정 영역]
```

---

## 검증 항목

### 1. Syntax Check
- `.gs` 파일의 V8 JavaScript 문법 오류
- `clasp push` 시 거부되지 않는지 확인

### 2. Unit Test (비즈니스 로직)
```
□ 재고 수량 계산 정확성 (초기재고 + 입고 - 출고 - 폐기)
□ 단가 스냅샷 정확성
□ FIFO 차감 순서
□ 시즌 배수 보정
□ 안전재고 / 발주점 / 적정발주량 수식
□ 거래ID 생성 형식
□ 비밀번호 해싱 / 검증
□ 품목코드 중복 검증
```

### 3. Integration Test
```
□ API 엔드포인트별 인증 검증
□ 역할별 권한 검증 (Admin/Manager/Staff)
□ 업장 스코프 검증 (Staff)
□ CacheManager 캐시/무효화 동작
□ LockService 동시성 제어
□ Migration 멱등성
```

### 4. Sheet Data Integrity
```
□ SHEET_MASTER 열 수 = MASTER_COL_COUNT (24)
□ TX_COLS = 9 (모든 업장 시트 + 통합 입출고)
□ USER_COLS 매핑 일치
□ ARRAYFORMULA 수식 정상 동작
□ 데이터 검증(Validation) 규칙 존재
□ 시트 보호(Protection) 설정
```

### 5. RBAC
```
□ Admin만 사용자 관리 가능
□ Admin만 시스템 명령 실행 가능
□ Staff는 담당 업장만 접근 가능
□ Manager는 품목 관리 가능
□ 미인증 요청 거부
□ 세션 만료 처리
```

### 6. Error Handling
```
□ 모든 API에 try-catch 포함
□ 사용자 친화적 에러 메시지 반환
□ 시스템 에러 로그 기록 (_logError)
□ LockService timeout 처리
```

### 7. Regression
```
□ 기존 기능 정상 동작
□ onEdit 가드레일 동작
□ 대시보드 갱신 정상
□ CSV 업로드 정상
□ 월마감 정상
```

### 8. E2E (Playwright, 추후)
```
□ 로그인 → 대시보드
□ 입출고 등록 → 확인
□ 품목 등록 → 검색
□ 역할 전환 → 접근 제어 확인
```

### 9. Deployment Readiness
```
□ Git clean state
□ clasp push 성공
□ 수식/구조 변경 시 Migration 포함
□ README/문서 업데이트
```

---

## 특별 주의 영역 (재고 시스템 핵심)

> 다음 항목은 금액/수량 오류가 자산 평가에 직결되므로 반드시 검증:
> - 재고 수량 계산
> - 단가 계산
> - FIFO 잔여 금액
> - 월마감 이월 금액
> - 안전재고/발주점
