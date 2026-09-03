# Deployment — 호텔 재고 관리 시스템

---

## 환경별 배포 경로 (TASK-004)

| 환경 | clasp 설정 | 배포 방법 | 승인 |
|---|---|---|---|
| **DEV** | `.clasp-dev.json` | 로컬 `npm run dev:push` | 불필요 |
| **Production** | `.clasp.json` | `git push origin main` → GitHub Actions | **Human 승인 필수** |

> 로컬에서 Production으로 push하는 npm 스크립트는 **의도적으로 제공하지 않는다.**
> DEV/Production 리소스 ID는 `.clasp.json` / `.clasp-dev.json`, 환경변수는 `.env.example` 참고.

### 웹앱 URL (2026-09-02 정리 — 환경당 하나로 고정)

| 환경 | 배포 | 배포 ID | 갱신 방식 |
|---|---|---|---|
| **DEV** | `@HEAD` | `AKfycbz-0sbkngtuonF3m9SDu_J1JJF809ISze-Nxvf5La7S` | `npm run dev:push` 즉시 반영 |
| **Production** | `@버전` (상시 배포) | `AKfycbyjoryKydzwRJoLzzgzgcgmLZYASjTjWyl8fidtJhXikudFnlqCb1-4j-zPdlwRZ7Y9hA` | `git push origin main` → CI가 새 버전 생성 후 이 배포에 연결 |

URL 형식: `https://script.google.com/macros/s/{배포ID}/exec`

> **왜 환경당 하나인가**: 이전에는 DEV 4개·Production 18개의 배포가 난립했다.
> 버전 배포는 만들어진 시점 코드로 **동결**되므로 `clasp push`를 해도 갱신되지 않는데,
> 그 사실을 모른 채 옛 URL을 보고 "반영이 안 됐다"고 판단하는 사고가 실제로 반복됐다
> (TASK-005 리포트의 DEV @2, 그리고 TASK-013 확인 중 DEV @3).
> 지금은 **환경당 배포 1개**만 두고, Production은 CI가 자동으로 최신 버전에 연결한다.
>
> **DEV는 HEAD, Production은 버전 배포**인 이유: DEV는 push 즉시 확인이 목적이고,
> Production은 릴리스 시점 통제와 롤백 지점이 필요하기 때문이다.
> 배포를 삭제해도 **버전은 보존**되므로 과거 어느 버전으로든 다시 배포할 수 있다.

---

## 배포 개념 — HEAD · 버전 · 배포

Apps Script는 이 셋이 **따로 논다.** 이걸 혼동하면 "push했는데 반영이 안 된다"는 오진이 나온다.

| 개념 | 뜻 | 누가 바꾸나 |
|---|---|---|
| **코드(HEAD)** | 스크립트 프로젝트에 지금 저장돼 있는 코드 한 벌 | `clasp push`가 **여기만** 갱신 |
| **버전(Version)** | 특정 시점 코드의 **스냅샷**. 한 번 만들면 불변 | `clasp deploy` 또는 편집기의 "새 버전" |
| **배포(Deployment)** | **URL 하나.** 각 배포는 어느 버전을 서빙할지 고정돼 있다 | 그 배포를 갱신할 때만 |

핵심: **URL은 "어느 코드 버전으로 이 시트를 열 것인가"를 고르는 스위치**다.
같은 프로젝트의 배포들은 전부 **같은 스프레드시트(같은 데이터)**를 읽고 쓴다. 다른 것은 코드뿐이다.

### `@HEAD` 배포

프로젝트마다 **자동으로 하나씩 존재**하는 테스트 배포다. 만들지도, 지우지도 않는다.
항상 최신 저장 코드를 서빙하며, 편집기에서는 `배포 > **배포 테스트**`로 접근한다.
**`배포 관리` 목록에는 나타나지 않는다** — 거기엔 버전 배포만 나온다.

### 왜 DEV는 HEAD, Production은 버전 배포인가

| | DEV | Production |
|---|---|---|
| 목적 | push한 걸 **즉시** 확인 | 릴리스 시점 통제 + 롤백 지점 |
| 쓰는 배포 | `@HEAD` (기본 제공) | 버전 배포 1개 (CI가 갱신) |
| 추가 단계 | 없음 | CI의 `clasp deploy` |

Production을 HEAD로 두면 CI가 push하는 순간 사용자 화면이 바뀌고, 나쁜 커밋이 들어가도
되돌리려면 **또 커밋해야** 한다. 버전 배포면 이전 버전으로 재배포만 하면 수초 만에 복구된다.

> **배포를 지워도 버전은 남는다.** 그래서 배포 목록을 정리해도 과거 어느 버전으로든 다시 배포할 수 있다.
> 유일한 실질 위험은 **살아있는 URL의 배포를 지우는 것**이다.

### 과거 사고 기록

배포가 환경당 여러 개 난립하면서 같은 오진이 두 번 났다.

- **TASK-005** — DEV `@2` 배포가 버전 고정이라 `clasp push` 후에도 새 코드가 안 보였다.
- **TASK-013** — 사용자가 DEV `@3` URL을 쓰고 있어서, 구현·E2E가 모두 통과했는데도
  "기존이랑 똑같다"는 상황이 발생했다. E2E는 `@HEAD`를 보고 있었다.

그래서 2026-09-02에 **환경당 배포 1개**로 정리하고, Production은 CI가 자동 갱신하도록 바꿨다.

---

## 현재 배포 파이프라인 (Production)

```
Local edit → git commit → git push origin main → GitHub Actions
   → clasp push --force   (HEAD 코드 갱신)
   → clasp deploy -i …    (새 버전 생성 + 상시 배포 URL을 그 버전에 연결)
   → 사용자에게 반영
```

### 상세 단계

1. **코드 수정**: `src/` 디렉토리 내 `.gs`/`.html` 파일 수정
2. **Git Add**: `git add src/`
3. **Git Commit**: `git commit -m "[타입] 설명"`
4. **Git Push**: `git push origin main`
5. **GitHub Actions**: `.github/workflows/clasp.yml` 자동 실행
6. **clasp push**: `--force` 플래그로 GAS에 코드 업로드 (HEAD 코드만 갱신)
7. **clasp deploy**: 새 버전을 만들어 상시 배포 URL이 그 버전을 가리키게 함 (사용자 반영은 이 단계에서 일어남)
8. **검증**: GitHub Actions 탭에서 ✅/❌ 확인

### ⚠️ push와 deploy는 다른 단계다
`clasp push`는 **코드만** 올린다. 웹앱 URL은 버전 배포에 고정돼 있어 push만으로는 바뀌지 않는다.
그래서 워크플로에 `clasp deploy` 단계가 함께 있어야 한다 (`.github/workflows/clasp.yml`).

**`-i`로 배포 ID를 반드시 고정할 것.** 생략하면 실행할 때마다 새 URL이 생성되어 배포가 무한 증식한다
— Production에 배포가 17개까지 쌓였던 원인이 이것이다.

---

## GitHub Actions 워크플로우

**파일**: [`.github/workflows/clasp.yml`](../.github/workflows/clasp.yml) — 실제 내용은 파일을 볼 것.
여기에 YAML 사본을 두지 않는다. 사본은 반드시 낡고, 실제로 낡아 있었다
(clasp 버전 고정과 `clasp deploy` 단계가 사본에는 빠져 있었다).

`main` 브랜치 push를 트리거로 다음 순서를 수행한다.

1. checkout → Node 20 설치
2. `clasp@2.5.0` 설치 — **버전 고정 필수**. clasp 3.x는 `.clasprc.json` 인증 형식이 달라 `CLASPRC_JSON`(v2 형식)과 호환되지 않는다
3. `CLASPRC_JSON` 시크릿을 `~/.clasprc.json`으로 기록
4. `clasp push --force` — HEAD 코드 갱신
5. `clasp deploy -i <Production 배포 ID>` — 새 버전 생성 + 상시 URL 연결

### GitHub Secrets
- `CLASPRC_JSON`: Google OAuth refresh token (clasp 인증용)
- 만료 시 로컬에서 `clasp login` → `.clasprc.json` 재생성 → Secrets 업데이트

---

## clasp 설정

- `.clasp.json`: `{ "scriptId": "...", "rootDir": "src" }`
- `.claspignore`: `*.md`, `backup/**`, `node_modules/**` 등 제외

---

## ⚠️ 주의사항

1. **로컬 clasp push 금지**: CI/CD 파이프라인(`GitHub Actions`)이 구축되어 있으므로, 로컬에서 수동으로 `clasp push`를 실행하지 마십시오. `gas-deploy` Skill 참조.
2. **src/ 외 파일**: `.agents/`, `Docs/`, `AI/`, `README.md` 등은 GAS에 업로드되지 않음
3. **Schema Migration**: 코드 배포 후 Migration 실행이 필요한 경우, Apps Script 편집기에서 수동 실행 (`runMigrations()`는 `SpreadsheetApp.getUi()`를 쓰므로 CI에서 실행할 수 없다)
4. **배포를 새로 만들지 말 것**: 확인용이라도 `clasp deploy`를 `-i` 없이 실행하면 새 URL이 생긴다. 환경당 배포는 1개로 유지한다

### 배포 ID를 바꿔야 할 때 (드묾 — 함께 고칠 곳)

배포 ID는 `clasp deploy -i`로 **고정**되어 있어 정상 운영에서는 바뀌지 않는다. 버전만 뒤에서 갱신된다.
배포를 삭제·재생성하는 예외 상황에서만 아래를 **한 번에** 고친다. 하나라도 빠지면 조용히 어긋난다.

| 대상 | 파일 | 빠뜨렸을 때 증상 |
|---|---|---|
| Production 배포 ID | `.github/workflows/clasp.yml` (`clasp deploy -i`) | CI가 없는 배포에 릴리스 시도 → 배포 단계 실패 |
| Production 배포 ID | `tests/e2e/fixtures/production-guard.js` | **가드가 무력화되어 E2E가 Production 데이터에 붙을 수 있음** |
| Production / DEV URL | `Docs/Deployment.md` (위 "웹앱 URL" 표) | 사람이 옛 URL을 보고 "반영이 안 됐다"고 오진 |
| DEV 웹앱 URL | `.env`의 `PLAYWRIGHT_BASE_URL` | E2E가 옛 배포를 검증 → 통과해도 의미 없음 |

현재 목록은 `npm run prod:status` / `npm run dev:status`로 확인한다.

---

## 문제 해결 — "배포했는데 반영이 안 돼요"

대부분 **코드가 아니라 보고 있는 URL의 문제**다. 순서대로 확인한다.

1. **어느 URL을 보고 있나** — 위 "웹앱 URL" 표의 주소가 맞는지 확인한다.
   특히 예전 북마크가 삭제되거나 동결된 배포를 가리키고 있을 수 있다.
2. **배포가 1개인가** — `npm run dev:status` / `npm run prod:status`.
   버전 배포가 여러 개면 어느 것을 보는지 알 수 없다.
3. **DEV라면**: `npm run dev:push`가 성공했는가. `@HEAD`는 push 즉시 반영된다.
4. **Production이라면**: GitHub Actions에서 **`Deploy to Production web app` 단계까지** 성공했는가.
   `clasp push`만 성공하고 이 단계가 실패하면 코드는 올라갔지만 사용자에게는 반영되지 않는다.
5. **브라우저 캐시** — GAS 웹앱은 iframe 캐시가 남는다. `Ctrl+Shift+R`.
6. 그래도 안 되면 실제로 서빙되는 내용을 확인한다 — 웹앱을 열고 콘솔에서
   바뀐 함수가 존재하는지(`typeof 함수명`) 보면 코드 도달 여부가 즉시 판별된다.

> 보고할 때는 **"반영 완료"만 쓰지 말고 검증에 사용한 URL을 함께 적는다.**
> 이 한 줄이 없어서 TASK-013에서 서로 다른 URL을 보며 원인을 찾는 데 시간을 썼다.

---

## 롤백

**① 즉시 롤백 (코드 변경 없음)** — 배포 URL을 이전 버전으로 되돌린다. 수초면 끝난다.

```bash
npx clasp deploy -i AKfycbyjoryKydzwRJoLzzgzgcgmLZYASjTjWyl8fidtJhXikudFnlqCb1-4j-zPdlwRZ7Y9hA -V <이전_버전번호> -d "rollback"
```

버전 목록은 `npx clasp versions`로 확인한다. 배포를 정리해도 버전은 남으므로 과거 어느 버전으로든 돌아갈 수 있다.

**② 코드까지 되돌리기** — 저장소와 배포를 함께 맞춘다.

```bash
git revert HEAD
git push origin main
# → GitHub Actions가 push + deploy를 다시 수행
```

①로 사용자 영향을 먼저 끊고, ②로 저장소를 정리하는 순서를 권장한다.
