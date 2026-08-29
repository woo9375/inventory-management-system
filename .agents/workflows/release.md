# /release Workflow (SSOT)

코드를 검증하고 안전하게 배포하기 위한 워크플로우입니다.
본 프로젝트는 **main 브랜치 병합 시 GitHub Actions를 통해 Production 자동 배포**되는 CI/CD 환경입니다.

## 트리거
```
/release
```

---

## 실행 순서 (필수 단계)

### Step 1: 선행 검증 (Code Review & Test)
- `/review` 워크플로우 실행 완료 및 Human Approval 획득 여부 확인
- `/test` 워크플로우 통과 여부 확인

### Step 2: Human Approval (휴먼 승인 경계)
> 🚨 **Critical:** AI는 단독으로 Production 배포(main 병합 및 푸시)를 결정할 수 없습니다.
- 사용자의 명시적인 승인(`"배포 승인"`, `"main 푸시 진행"` 등)을 반드시 확인합니다.

### Step 3: Git Status & Branch Check
- `git status` clean 확인
- 인증정보나 불필요한 파일이 포함되어 있지 않은지 `.gitignore` 및 `.claspignore` 패턴 검토

### Step 4: Commit & Push
- 지정된 커밋 컨벤션을 준수하여 커밋
- 원격 저장소(`origin main`)로 푸시하여 GitHub Actions 트리거

### Step 5: Deployment 확인
- GitHub Actions 워크플로우 성공(✅) 여부를 확인하여 보고
- (필요 시) 사용자에게 Web App '새 배포 버전' 생성을 안내
