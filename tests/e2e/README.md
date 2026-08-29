# End-to-End (E2E) Tests (`tests/e2e/`)

Playwright를 활용한 GAS Web App의 사용자 인터페이스 및 통합 워크플로우 테스트 디렉터리입니다.

## 테스트 대상
1. **입출고 등록 및 검증 흐름**: 폼 입력, 필수값 검증, 제출 후 UI 업데이트 확인
2. **권한 및 업장별 격리**: 역할(Admin vs User) 및 업장 선택에 따른 화면 접근 권한 확인
3. **월마감 및 이월 데이터 조회**: 월마감 상태에서의 입력 차단 및 마감 보고서 UI 확인

## 실행 사전 조건
- DEV 환경에 배포된 GAS Web App URL 필요 (`DEV_WEB_APP_URL`)
- Playwright 설치 (`npm install -D @playwright/test && npx playwright install`)
