# /release Workflow

코드를 검증하고 안전하게 배포하기 위한 워크플로우.

## 트리거
```
/release
```

---

## 실행 순서

### Step 1: Code Review
```
□ 변경된 파일 확인 (git diff)
□ /review 워크플로우 실행
□ Critical/High 이슈 없음 확인
```

### Step 2: Test
```
□ /test 워크플로우 실행
□ 모든 필수 검증 항목 통과
```

### Step 3: Git Status
```
□ git status clean (불필요한 파일 없음)
□ .gitignore 확인
□ 인증정보 포함 파일 없음
```

### Step 4: Branch Check
```
□ 현재 브랜치 확인
□ feature branch인 경우 PR 준비
□ main 직접 push인 경우 변경 규모 확인
```

### Step 5: Commit 준비
```bash
git add src/
git add .agents/ Docs/ AI/ CLAUDE.md  # 필요시
git commit -m "[타입] 변경 설명"
```

### Step 6: Push 준비
```
□ 커밋 메시지 규약 준수
□ 변경 파일 최종 확인
□ src/ 외 파일은 GAS에 영향 없음 확인
```

### Step 7: Push & CI/CD
```bash
git push origin main  # 또는 feature branch
```
- GitHub Actions 자동 실행
- `clasp push --force` → GAS 코드 업데이트

### Step 8: Deployment 확인
```
□ GitHub Actions 워크플로우 성공 (✅ Green check)
□ Apps Script 편집기에서 코드 확인
□ Web App 새 배포 버전 생성 (필요시)
□ 실제 동작 테스트
```

---

## Failure Handling

### GitHub Actions 실패 시
1. Actions 탭에서 로그 확인
2. 일반적 원인:
   - `.gs`/`.html` 구문 오류
   - `CLASPRC_JSON` Secret 만료
3. 수정 후 재push

### 롤백 필요 시
```bash
git revert HEAD
git push origin main
```

---

## 주의사항

> ⚠️ **이 프로젝트는 main push = 자동 GAS 배포**
> Push 전에 반드시 충분한 검증을 수행하세요.

> ⚠️ **Web App 배포 버전**
> `clasp push`는 코드만 업데이트합니다.
> 사용자가 접근하는 Web App URL은 별도의 "새 배포" 생성이 필요할 수 있습니다.
> Apps Script 편집기 → 배포 → 새 배포 에서 수행합니다.
