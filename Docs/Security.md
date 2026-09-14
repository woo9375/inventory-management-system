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

## 스프레드시트 공유 정책 (TASK-026)

품목 마스터를 포함한 모든 실무 데이터 관리는 **웹앱**에서 한다. 스프레드시트는 시스템 소유자의 유지보수 도구다.

| 대상 | 드라이브 권한 | 이유 |
|------|---------------|------|
| 시스템 소유자(관리자 1인) | 소유자 / 편집자 | 마이그레이션·서식 복구·비상 수정. 이 경로의 마스터 편집은 `onEdit`이 이력(경로 "시트편집")으로 남긴다 |
| 구매팀 담당자 | **뷰어** — 조회가 필요할 때만. 필요 없으면 **공유하지 않는다** | 신규 등록·수정·미사용 전환·CSV 일괄 등록은 웹앱 `품목 관리` 탭(`manager` 계정)에서 한다. 편집자 권한을 주면 수식 열·드롭다운 밖 값·중복 코드 같은 셀 오염이 검증 없이 들어간다 |
| 업장 직원 | 공유하지 않음 | 웹앱 `staff` 계정으로 담당 업장 입출고만 |

- 공유 창의 톱니바퀴(고급)에서 **"편집자가 권한을 변경하고 공유할 수 있습니다"를 해제(OFF)** 한다 — 편집자가 다른 사람을 편집자로 초대하는 경로를 막는다.
- 시트 쓰기 경로는 둘뿐이다: 웹앱 API(`USER_DEPLOYING` 배포자 권한으로 실행) · 소유자의 비상 유지보수 편집. 시트 메뉴의 품목 CSV 업로드 창은 TASK-026에서 제거됐다.
- 시트 보호(`_protectSystemSheets`)는 그대로 둔다 — 소유자 1인 편집 전제라 추가 잠금이 필요 없다.

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
