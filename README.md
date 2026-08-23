# 호텔 재고 관리 시스템 v1.0.0
> Google Apps Script 기반 통합 구매/재고 관리 웹 애플리케이션

---

## 📌 1. 프로그램 개요 및 목적
호텔업의 소모품 및 자재 입출고, 재고 관리, 자동 발주점 계산, 시즌별 안전재고 조절을 하나의 시스템으로 완벽하게 통합 관리하는 솔루션입니다. 웹앱(Frontend)과 구글 스프레드시트(Backend/DB)가 실시간으로 연동되어 정확한 재고 자산 평가와 선입선출(FIFO) 기반의 월 마감을 제공합니다.

---

## 🚀 2. 주요 기능 (Core Features)

1. **역할 기반 접근 제어 (RBAC)**: Admin(관리자), Manager(매니저), Staff(담당자) 3단계 권한 분리 및 업장별 접근 제어.
2. **시즌별 안전재고 자동 보정**: 성수기/비수기 시즌 설정에 따라 목표유지일수와 안전재고 수량이 배수(Multiplier)로 자동 상향 조정.
3. **선입선출(FIFO) 월 마감**: 월 마감 시 로트(Lot)별 고유 매입 단가를 유지한 채 잔여 재고를 이월하여 정확한 재고 자산 평가 지원.
4. **대량 CSV 업로드**: 신규 품목 마스터 등록 시 빠르고 안전한 일괄 업로드 기능 지원 (기초데이터 검증 포함).
5. **모바일 최적화 웹앱**: 각 업장 실무자들이 언제 어디서든 모바일로 입출고 기록을 간편하게 조회하고 등록할 수 있는 직관적인 UI 제공.

---

## 🔐 초기 관리자 설정

시스템 초기화(`createAll`) 전 Apps Script의 **Script Properties**에 아래 키를 설정해야 합니다. 자격증명은 소스 코드나 저장소에 기록하지 않습니다.

- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_PASSWORD` (8자 이상)
- `INITIAL_ADMIN_NAME`
- `INITIAL_ADMIN_DEPT`

설정이 누락되면 초기화는 기존 시트를 삭제하기 전에 중단됩니다.

---

## 📖 3. 상세 매뉴얼 및 기술 문서 안내
프로젝트의 세부적인 기능 설명, 구조, 에러 대처법, 그리고 관리자 가이드는 유지보수와 접근성을 위해 **GitHub Wiki**에서 통합 관리됩니다.

- 🔗 **[GitHub Wiki 바로가기](https://github.com/woo9375/inventory-management-system/wiki)**
  - 시스템 아키텍처 및 데이터베이스(시트) 구조 설명
  - 역할별(Admin/Staff) 사용 가이드 및 FAQ
  - 월 마감 및 CSV 업로드 상세 규칙
  - 에러 메시지별 문제 해결 가이드

---

## 💻 4. 개발 및 배포 환경 (CI/CD)
본 프로젝트는 GitHub Actions를 통한 **자동화된 CI/CD 파이프라인**으로 배포됩니다.

1. 로컬 환경에서 코드를 수정 후 `main` 브랜치에 `git push`를 수행합니다.
2. GitHub Actions가 변경 사항을 감지하여 `clasp push` 명령을 통해 Google Apps Script로 코드를 자동 배포합니다.
3. 소스 코드는 반드시 `src/` 디렉토리 내부에서 관리되어야 하며, Apps Script 환경에 맞춰 `.gs`, `.html` 확장자로 구성됩니다.

> **AI 코딩 어시스턴트(Antigravity) 가이드**: `.agents/` 디렉토리에 프로젝트 맞춤형 규칙(Rules)과 스킬(Skills)이 정의되어 있어, 어시스턴트가 프로젝트 컨텍스트를 유지하고 `gas-deploy` 등의 커스텀 명령을 수행할 수 있습니다.

---
© 2026 All rights reserved by the author.
