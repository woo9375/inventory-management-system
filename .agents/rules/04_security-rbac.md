# Security & Role-Based Access Control (RBAC) Policy

The system has three distinct user roles. Always verify permissions before implementing new UI features or backend functions.

## 적용 범위
- 모든 API 엔드포인트 (WebApp.gs, *Service.gs)
- 프론트엔드 UI 요소 표시/숨김
- Sheet 보호 설정
- 시스템 관리 명령

## 왜 필요한가
재고 데이터는 자산 가치와 직결되며, 무분별한 접근은 데이터 무결성 훼손, 부정 사용, 감사 실패를 초래한다.

---

## Roles
Use the `ROLES` constant defined in `Config.gs`:
```javascript
const ROLES = { ADMIN: "admin", MANAGER: "manager", STAFF: "staff" };
```

1. **Admin (최고 관리자)**: Has full access. Can modify system settings, create users, grant permissions, create new branch sheets, execute manual backups, and run month-end closings.
2. **Manager (구매 총괄 / 매니저)**: Can manage the Item Master (register/edit items), view the integrated dashboard for all branches, perform bulk CSV uploads, and view full transaction histories.
3. **Staff (각 업장 담당자)**: Restricted access. Can only input and view transactions for their specific assigned branch. Cannot access system settings or modify the Item Master.

---

## 권한 매트릭스

| 기능 | Admin | Manager | Staff |
|------|-------|---------|-------|
| 대시보드 조회 | ✅ | ✅ | ❌ |
| 입출고 등록 | ✅ (전 업장) | ✅ (전 업장) | ✅ (담당 업장만) |
| 입출고 조회 | ✅ (전 업장) | ✅ (전 업장) | ✅ (담당 업장만) |
| 품목 등록/수정 | ✅ | ✅ | ❌ |
| 품목 비활성화 | ✅ | ✅ | ❌ |
| CSV 업로드 | ✅ | ✅ | ❌ |
| 사용자 관리 | ✅ | ❌ | ❌ |
| 업장 관리 | ✅ | ❌ | ❌ |
| 시즌 관리 | ✅ | ❌ | ❌ |
| 기초데이터 관리 | ✅ | ❌ | ❌ |
| 월마감 실행 | ✅ | ❌ | ❌ |
| 시스템 명령 | ✅ | ❌ | ❌ |
| 비밀번호 변경 (본인) | ✅ | ✅ | ✅ |
| 비밀번호 초기화 (타인) | ✅ | ❌ | ❌ |

---

## Implementation Details

### Permission Checks
- All authorization logic is implemented in `RBAC.gs`. When adding new permission checks, follow the existing patterns in that module.
- Whenever adding a new endpoint or feature, always implement a check against the user's role to ensure they are authorized to perform the action.
- 패턴: `const session = validateSession(token); if (!session) return { success: false, ... };`

### Authentication System
- **Password hashing**: SHA-256 + salt. Never store or compare plain-text passwords.
- **Session management**: Uses `CacheService` with a 6-hour timeout (`SESSION_TIMEOUT_SECONDS = 21600`). Session keys use the prefix `SESSION_PREFIX = "session_"`.
- **Login rate limiting**: `LOGIN_MAX_ATTEMPTS = 5`, `LOGIN_ATTEMPT_WINDOW_SECONDS = 900` (15분)
- **Minimum password length**: `MIN_PASSWORD_LENGTH = 8`

### User Data Schema
User records are stored in the `SHEET_USERS` sheet. Column mapping is defined by `USER_COLS` in `Config.gs`:
| Column | Constant | Content |
|--------|----------|---------|
| A (1) | `USER_COLS.USERNAME` | 아이디 (다우오피스 이메일) |
| B (2) | `USER_COLS.PASSHASH` | 비밀번호 해시 (SHA-256 + salt) |
| C (3) | `USER_COLS.NAME` | 성함 |
| D (4) | `USER_COLS.DEPT` | 부서 |
| E (5) | `USER_COLS.ROLE` | 역할 (admin/manager/staff) |
| F (6) | `USER_COLS.SHOPS` | 배정된 업장 (쉼표 구분) |

### 업장 스코프
- Staff는 `assignedShops`에 포함된 업장만 접근 가능
- Admin/Manager는 "생성완료" 상태의 모든 업장 접근 가능
- `_canAccessShop()` 함수로 검증

---

## 금지사항

| 금지 | 이유 |
|------|------|
| 비밀번호 평문 저장/비교 | 반드시 SHA-256 + salt 해싱 |
| 소스코드에 인증정보 포함 | Script Properties 사용 |
| GitHub에 `.clasprc.json` 커밋 | `.gitignore`에 포함됨 |
| API에서 권한 검증 누락 | 모든 엔드포인트에 `validateSession()` 필수 |
| Staff에게 타 업장 데이터 노출 | `_canAccessShop()` 검증 필수 |
| Production 데이터 직접 수정 | 반드시 API/UI를 통해 변경 |

---

## Credential 관리

### Script Properties (서버 측)
- `INITIAL_ADMIN_USERNAME` / `PASSWORD` / `NAME` / `DEPT`
- `SCHEMA_VERSION`
- `LAST_SYNC_TIMESTAMP`

### GitHub Secrets
- `CLASPRC_JSON`: Google OAuth 토큰 (CI/CD용)

### 절대 포함 금지 위치
- 소스코드 (`.gs`, `.html`)
- `README.md`
- Git 커밋 메시지
- 로그 출력

---

## 감사 이력 (Audit Trail)
- `SHEET_CHANGELOG`: 품목 마스터 변경 이력 (자동)
- `SHEET_SYSTEM_LOGS`: 시스템 에러 로그 (자동)
- 거래ID를 통한 입출고 추적 가능

---

## AI 작업 시 검증 체크리스트

```
□ 새 API에 validateSession() 포함
□ 권한 레벨 검증 (ADMIN/MANAGER/STAFF)
□ Staff의 업장 스코프 검증
□ 비밀번호 해싱 사용
□ 인증정보 소스코드 미포함
□ 에러 메시지에 민감정보 미포함
□ 프론트엔드에서 역할별 UI 분기
□ IDOR (Insecure Direct Object Reference) 방어
```
