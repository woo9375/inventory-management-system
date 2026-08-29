# Security — 호텔 재고 관리 시스템

> 상세 보안 정책. `.agents/rules/04_security-rbac.md` 참조.

---

## Authentication

| 항목 | 구현 |
|------|------|
| 방식 | Username + Password 기반 |
| 해싱 | SHA-256 + Random Salt (16자) |
| 세션 | CacheService, 6시간 TTL |
| 토큰 | UUID, `session_` 접두사로 캐시 저장 |
| Rate Limiting | 5회 실패 시 15분 잠금 |
| 초기 관리자 | Script Properties에서 읽기 |

## Authorization (RBAC)

3단계 역할: admin > manager > staff

상세 권한 매트릭스는 `.agents/rules/04_security-rbac.md` 참조.

## Credential 관리

### 저장 위치
- 비밀번호 해시: `SHEET_USERS` B열 (salt:hash 형식)
- 초기 관리자: Script Properties
- CI/CD 토큰: GitHub Secrets (`CLASPRC_JSON`)

### 금지 저장 위치
- 소스코드 (`.gs`, `.html`)
- README.md
- Git 커밋 메시지
- 콘솔/로그 출력

## 데이터 보호

| 대상 | 보호 방식 |
|------|-----------|
| 시스템 시트 | Sheet Protection (경고 모드) |
| 업장 시트 | Sheet Protection (편집 가능 영역 제한) |
| 자동 계산 열 | onEdit 가드레일로 편집 차단 |
| 생성완료 업장 | onEdit 가드레일로 명칭 변경 차단 |
| 확정 거래 | 거래ID 발급 후 구분 변경 차단 |

## Web App 보안

| 항목 | 설정 |
|------|------|
| 실행 권한 | `USER_DEPLOYING` (배포자 권한으로 실행) |
| 접근 범위 | `ANYONE` (URL 접근 가능, 인증은 앱 내부) |
| XFrame | `ALLOWALL` |

## 감사 이력

- `SHEET_CHANGELOG`: 품목 마스터 변경 자동 기록
- `SHEET_SYSTEM_LOGS`: 시스템 에러 자동 기록
- 거래ID를 통한 입출고 추적
