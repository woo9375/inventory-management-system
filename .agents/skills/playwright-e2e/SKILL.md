---
name: playwright-e2e
description: >-
  Use this skill when the user asks to set up, write, or run end-to-end tests
  using Playwright for the GAS web app.
---

# Playwright E2E Testing Skill

## 목적
Web App의 사용자 시나리오를 자동으로 검증하는 E2E 테스트 관리.

## 사용 시점
- E2E 테스트 환경 구축
- 새 E2E 테스트 작성
- 배포 전 E2E 검증

## 사전조건

### ⚠️ 설치 필요 (미설치 상태)
현재 프로젝트에는 Playwright가 설치되어 있지 않습니다.

```bash
# 1. package.json 초기화
npm init -y

# 2. Playwright 설치
npm install -D @playwright/test

# 3. 브라우저 다운로드
npx playwright install

# 4. .gitignore에 추가
echo "node_modules/" >> .gitignore
echo "test-results/" >> .gitignore
echo "playwright-report/" >> .gitignore
```

> 실제 설치는 사용자 승인 후 진행합니다.

## E2E 테스트 구조

```
tests/
├── e2e/
│   ├── auth.spec.js       # 로그인/로그아웃
│   ├── dashboard.spec.js  # 대시보드
│   ├── transaction.spec.js # 입출고
│   ├── item-master.spec.js # 품목 마스터
│   ├── settings.spec.js   # 설정 관리
│   └── fixtures/
│       └── test-data.js   # 테스트 데이터
```

## 테스트 흐름

```
Claude Code
  ↓
Implementation
  ↓
Deploy to DEV (clasp push → DEV GAS)
  ↓
Playwright E2E (DEV Web App URL)
  ↓
Result
  ↓
Human QA
```

## GAS Web App 특수 사항
- Web App URL은 `https://script.google.com/macros/s/{deploymentId}/exec` 형식
- `google.script.run`은 비동기 — `waitForResponse` 패턴 필요
- 세션은 CacheService 기반 — 테스트 간 독립성 주의
- 테스트 계정은 Script Properties에 별도 설정 필요

## 금지사항
- Production Web App URL로 자동 테스트 실행 금지
- 테스트에서 실제 데이터 삭제/월마감 실행 금지
- 테스트 인증정보 소스코드 포함 금지

## 완료 조건
- 핵심 사용자 시나리오 커버
- 모든 테스트 통과
- 테스트 결과 리포트 생성
