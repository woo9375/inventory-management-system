# Unit Tests (`tests/unit/`)

Google Apps Script 시스템의 비즈니스 로직 및 계산 함수(재고 수량 산정, FIFO 출고 원가 계산, 월마감 검증 등)에 대한 단위 테스트 디렉터리입니다.

## 테스트 원칙
- GAS 내장 객체(`SpreadsheetApp`, `CacheService`, `LockService` 등)는 Mocking 또는 인메모리 스텁을 활용하여 로컬 단위 테스트를 수행합니다.
- 복잡한 비즈니스 규칙 및 유효성 검사 로직을 우선적으로 검증합니다.
