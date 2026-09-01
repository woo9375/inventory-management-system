# Deployment — 호텔 재고 관리 시스템

---

## 환경별 배포 경로 (TASK-004)

| 환경 | clasp 설정 | 배포 방법 | 승인 |
|---|---|---|---|
| **DEV** | `.clasp-dev.json` | 로컬 `npm run dev:push` | 불필요 |
| **Production** | `.clasp.json` | `git push origin main` → GitHub Actions | **Human 승인 필수** |

> 로컬에서 Production으로 push하는 npm 스크립트는 **의도적으로 제공하지 않는다.**
> DEV/Production 리소스 ID는 `.clasp.json` / `.clasp-dev.json`, 환경변수는 `.env.example` 참고.

---

## 현재 배포 파이프라인 (Production)

```
Local edit → git commit → git push origin main → GitHub Actions → clasp push --force → GAS 업데이트
```

### 상세 단계

1. **코드 수정**: `src/` 디렉토리 내 `.gs`/`.html` 파일 수정
2. **Git Add**: `git add src/`
3. **Git Commit**: `git commit -m "[타입] 설명"`
4. **Git Push**: `git push origin main`
5. **GitHub Actions**: `.github/workflows/clasp.yml` 자동 실행
6. **clasp push**: `--force` 플래그로 GAS에 코드 업로드
7. **검증**: GitHub Actions 탭에서 ✅/❌ 확인

### ⚠️ Web App 배포 버전
`clasp push`는 코드만 업데이트합니다. 사용자가 접근하는 Web App URL의 실제 동작을 변경하려면:
- Apps Script 편집기 → 배포 → 배포 관리 → 새 버전 생성
- 또는 기존 배포를 "최신 코드" 버전으로 업데이트

---

## GitHub Actions 워크플로우

**파일**: `.github/workflows/clasp.yml`

```yaml
name: Deploy to Google Apps Script
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g @google/clasp
      - run: echo '${{ secrets.CLASPRC_JSON }}' > ~/.clasprc.json
      - run: clasp push --force
```

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
3. **Schema Migration**: 코드 배포 후 Migration 실행이 필요한 경우, Apps Script 편집기에서 수동 실행

---

## 롤백

```bash
# 최신 커밋 되돌리기
git revert HEAD
git push origin main
# → GitHub Actions가 이전 코드로 재배포
```
