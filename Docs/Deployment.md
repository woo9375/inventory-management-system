# Deployment — 호텔 재고 관리 시스템

---

## 현재 배포 파이프라인

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

1. **로컬 clasp push 금지**: `.agent/hooks.json`에 post_task로 `clasp push`가 설정되어 있으나, CI/CD 파이프라인과 충돌 가능. `gas-deploy` Skill 참조.
2. **src/ 외 파일**: `.agents/`, `Docs/`, `AI/`, `README.md` 등은 GAS에 업로드되지 않음
3. **Schema Migration**: 코드 배포 후 Migration 실행이 필요한 경우, Apps Script 편집기에서 수동 실행

---

## DEV/PROD 환경 분리

### 현재 상태
- 단일 Apps Script 프로젝트 (Production)
- DEV 환경 없음

### 권장 구조 (향후)
```
[검토 필요]

.clasp-dev.json → DEV Apps Script Project
.clasp-prod.json → PROD Apps Script Project

GitHub Actions:
  - feature/* → DEV 배포
  - main → PROD 배포
```

---

## 롤백

```bash
# 최신 커밋 되돌리기
git revert HEAD
git push origin main
# → GitHub Actions가 이전 코드로 재배포
```
