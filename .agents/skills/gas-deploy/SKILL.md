---
name: gas-deploy
description: >-
  Use this skill when the user asks to deploy the code to Google Apps Script,
  push changes using clasp, or if they want to build and release a new version.
---

# Google Apps Script Deployment (CI/CD via GitHub Actions)

This project uses a **fully automated CI/CD pipeline**. Code is deployed to Google Apps Script automatically when changes are pushed to the `main` branch on GitHub.

> ⚠️ **Do NOT run `clasp push` locally.** All deployments go through GitHub Actions to avoid conflicts with the CI/CD pipeline.

## Pipeline Overview

```
Local edit → git commit → git push origin main → GitHub Actions → clasp push --force → Apps Script updated
```

The workflow is defined in `.github/workflows/clasp.yml`. It uses the `CLASPRC_JSON` GitHub Secret for authentication.

## Deployment Steps

1.  **Stage Changes**: Add modified files to git.
    ```bash
    git add src/
    ```
2.  **Commit**: Write a descriptive commit message following the project convention.
    ```bash
    git commit -m "[feat] 시즌 관리 UI 개선"
    ```
3.  **Push to Main**: Push the commit to the `main` branch to trigger automatic deployment.
    ```bash
    git push origin main
    ```
4.  **Verify Deployment**: Check the GitHub repository's **Actions** tab to confirm the workflow succeeded.
    - ✅ Green check = deployment successful.
    - ❌ Red X = deployment failed. Check the workflow logs for error details.

## Failure Handling

If the GitHub Actions workflow fails:
1.  Open the failed workflow run in the Actions tab and inspect the logs.
2.  Common causes:
    - **Syntax errors** in `.gs` or `.html` files that the V8 engine rejects.
    - **Expired `CLASPRC_JSON` secret** — the Google OAuth token may need to be refreshed by the repository admin.
3.  Fix the issue locally, commit, and push again.

## Important Notes

- The `.clasp.json` sets `rootDir` to `src/`, so only files inside `src/` are pushed to Apps Script.
- The `.claspignore` excludes `*.md`, `backup/**`, `node_modules/**`, etc.
- Changes to files outside `src/` (e.g., `README.md`, `.agents/` rules) do NOT trigger an Apps Script update, even though the GitHub Actions workflow runs.
- After the code is pushed to Apps Script, the user may still need to create a **new Web App deployment version** via the Apps Script UI for end-users to see the changes.
