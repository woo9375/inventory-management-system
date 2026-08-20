# Role-Based Access Control (RBAC) Policy

The system has three distinct user roles. Always verify permissions before implementing new UI features or backend functions.

## Roles
Use the `ROLES` constant defined in `Config.gs`:
```javascript
const ROLES = { ADMIN: "admin", MANAGER: "manager", STAFF: "staff" };
```

1. **Admin (최고 관리자)**: Has full access. Can modify system settings, create users, grant permissions, create new branch sheets, execute manual backups, and run month-end closings.
2. **Manager (구매 총괄 / 매니저)**: Can manage the Item Master (register/edit items), view the integrated dashboard for all branches, perform bulk CSV uploads, and view full transaction histories.
3. **Staff (각 업장 담당자)**: Restricted access. Can only input and view transactions for their specific assigned branch. Cannot access system settings or modify the Item Master.

## Implementation Details

### Permission Checks
- All authorization logic is implemented in `RBAC.gs`. When adding new permission checks, follow the existing patterns in that module.
- Whenever adding a new endpoint or feature, always implement a check against the user's role to ensure they are authorized to perform the action.

### Authentication System
- **Password hashing**: SHA-256 + salt. Never store or compare plain-text passwords.
- **Session management**: Uses `CacheService` with a 6-hour timeout (`SESSION_TIMEOUT_SECONDS = 21600`). Session keys use the prefix `SESSION_PREFIX = "session_"`.

### User Data Schema
User records are stored in the `SHEET_USERS` sheet. Column mapping is defined by `USER_COLS` in `Config.gs`:
| Column | Constant | Content |
|--------|----------|---------|
| A (1) | `USER_COLS.USERNAME` | 아이디 (다우오피스 이메일) |
| B (2) | `USER_COLS.PASSHASH` | 비밀번호 해시 (SHA-256 + salt) |
| C (3) | `USER_COLS.NAME` | 성함 |
| D (4) | `USER_COLS.DEPT` | 부서 |
| E (5) | `USER_COLS.ROLE` | 역할 (admin/manager/staff) |
