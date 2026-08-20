---
name: git-workflow
description: >-
  Use this skill when the user asks about git workflow, branching strategy,
  commit conventions, or the CI/CD deployment pipeline.
---

# Git Workflow & CI/CD Pipeline Guide

This project follows a simple trunk-based workflow where the `main` branch is the production branch.

## Deployment Pipeline

Pushing to `main` triggers the GitHub Actions workflow (`.github/workflows/clasp.yml`) which automatically runs `clasp push --force` to deploy to Google Apps Script.

```
main branch push → GitHub Actions → clasp push --force → Apps Script updated
```

## Commit Message Convention

Use the following format for commit messages:

```
[타입] 간결한 설명
```

### Types
| Type | Usage |
|------|-------|
| `[feat]` | New feature or functionality |
| `[fix]` | Bug fix |
| `[refactor]` | Code restructuring without behavior change |
| `[style]` | UI/CSS changes |
| `[docs]` | Documentation changes (README, comments) |
| `[chore]` | Build, config, or maintenance tasks |

### Examples
```bash
git commit -m "[feat] 시즌 관리 UI 추가"
git commit -m "[fix] FIFO 마감 시 로트 단가 누락 수정"
git commit -m "[refactor] WebApp.gs API 핸들러 모듈 분리"
git commit -m "[docs] README 배포 가이드 업데이트"
```

## Important Notes

- `.claspignore` excludes `*.md`, `backup/**`, `node_modules/**` from Apps Script uploads. Commits that only change these files will trigger the workflow but will NOT change the deployed Apps Script code.
- The GitHub Secret `CLASPRC_JSON` contains the Google OAuth credentials for `clasp`. If deployments fail with auth errors, the repository admin needs to refresh this secret.
- Do NOT run `clasp push` locally — always deploy through the CI/CD pipeline via `git push`.
