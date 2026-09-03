---
name: gas-deploy
description: >-
  Use this skill when the user asks to deploy code to Google Apps Script,
  push changes using clasp, commit changes with conventions, or release a new version.
---

# Google Apps Script Deployment

## 배포 환경

| 환경 | clasp 설정 | Script ID | 배포 방법 |
|------|-----------|-----------|-----------|
| **DEV** | `.clasp-dev.json` | `1oPmA-pzD_m1c4nXgjfF7RHzKHYm-KOQIwwrppUIR55XPk4byxFW_SdAY` | `npm run dev:push` (로컬) |
| **Production** | `.clasp.json` | `1TKJb8HXschFgu257XGoHOhohogyAvleagnuHbdLRathBu1ueiMWAAbvO` | `git push origin main` → GitHub Actions |

> 위는 **스크립트 ID**(프로젝트 식별자)다. 사용자가 접속하는 **웹앱 URL·배포 ID**는 별개이며
> `Docs/Deployment.md`의 "웹앱 URL" 표가 SSOT다.

---

## DEV 배포 (개발/테스트)

개발 중 코드를 DEV 환경에 배포하여 Playwright E2E 검증을 수행한다.

```bash
# DEV에 코드 푸시
npm run dev:push

# DEV 배포 상태 확인
npm run dev:status
```

DEV 배포 후:
1. Playwright E2E 실행: `npm run test:e2e`
2. 결과 확인
3. Task 파일을 `AI/tasks/review/`로 이동

> ⚠️ DEV 배포는 로컬에서 직접 수행한다. GitHub Actions가 아닌 clasp CLI를 사용한다.

---

## Production 배포 (CI/CD via GitHub Actions)

Production 배포는 **완전 자동화 CI/CD 파이프라인**을 사용한다.

> ⚠️ **Do NOT run `clasp push` locally for Production.** 모든 Production 배포는 GitHub Actions를 통한다.

### 배포 흐름

```
Claude Code → 구현 → DEV test → Playwright E2E
→ Task review → Human approval
→ git commit → git push origin main → GitHub Actions
     → clasp push --force   (HEAD 코드 갱신)
     → clasp deploy -i …    (새 버전 + 상시 URL 연결)  ← 이 단계에서 사용자에게 반영
```

### 배포 단계

1. **Human 승인 확인**: 사용자의 명시적 배포 승인 필요
2. **Stage Changes**: `git add src/`
3. **Commit**: 커밋 컨벤션 준수
   ```bash
   git commit -m "[feat] 시즌 관리 UI 개선"
   ```
4. **Push**: `git push origin main` → GitHub Actions 자동 트리거
5. **Verify**: GitHub Actions 워크플로우 성공(✅) 확인

### Commit Message Convention

```
[타입] 간결한 설명
```

| Type | Usage | Example |
|------|-------|---------|
| `[feat]` | 새 기능 또는 기능 추가 | `[feat] 시즌 관리 UI 추가` |
| `[fix]` | 버그 수정 | `[fix] FIFO 마감 시 로트 단가 누락 수정` |
| `[refactor]` | 동작 변경 없는 코드 구조 개선 | `[refactor] WebApp.gs API 핸들러 분리` |
| `[style]` | UI/CSS 스타일 변경 | `[style] 테이블 패딩 및 폰트 크기 조정` |
| `[docs]` | 문서 수정 | `[docs] README 배포 가이드 업데이트` |
| `[chore]` | 빌드, 설정, 패키지 관리 | `[chore] clasp 설정 및 의존성 정리` |

---

## 절대 금지

- Human 승인 없이 Production 배포 (`git push origin main`)
- 로컬에서 `clasp push` (Production)
- DEV 스프레드시트 / DEV Script에 Production 코드 혼합

---

## Failure Handling

GitHub Actions 실패 시:
1. Actions 탭에서 로그 확인
2. 일반적 원인:
   - `.gs` / `.html` 문법 오류 (V8 거부)
   - `CLASPRC_JSON` 시크릿 만료
3. 수정 후 다시 commit & push

---

## Important Notes

- `.clasp.json`의 `rootDir`는 `src/` — `src/` 내 파일만 Apps Script에 업로드됨
- `.claspignore`가 `*.md`, `backup/**`, `node_modules/**` 등을 제외
- `src/` 외 파일 변경은 Apps Script에 영향 없음
- **웹앱 URL·버전·배포 개념의 SSOT는 `Docs/Deployment.md`다.** 배포가 반영되지 않는 것 같으면
  그 문서의 "문제 해결" 절을 따른다 (대부분 코드가 아니라 보고 있는 URL의 문제다)
- 확인용이라도 `clasp deploy`를 `-i` 없이 실행하지 말 것 — 새 URL이 생겨 배포가 증식한다.
  환경당 배포는 **1개**로 유지한다 (DEV `@HEAD`, Production 버전 배포 1개)
