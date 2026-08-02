# 🏨 호텔덕구온천 인벤토리 시스템

> **(주)호텔덕구온천 통합 구매 재고 관리 시스템 v6.8**  
> Google Apps Script + CLASP 기반 웹앱

---

## 📌 프로젝트 소개

호텔 운영에 필요한 소모품/자재의 **입출고, 재고 관리, 자동 발주점 계산, 시즌별 안전재고 조절**을 하나의 시스템으로 통합 관리합니다.

### 주요 기능

| 기능 | 설명 |
|------|------|
| 📊 대시보드 | KPI 카드 (위험/발주필요/정상), 알림 품목 리스트 |
| 📝 입출고 기록 | 업장별 입고/출고/폐기 기록, 거래ID 자동 생성 |
| 🗂️ 품목 마스터 | 품목 등록/수정, 자동 재고·발주점·안전재고 계산 |
| ⚙️ 설정 | 업장 관리, 시즌 설정, RBAC 권한, 시스템 명령 |
| 🔄 자동 동기화 | 증분 동기화, 일일 배치, 월간 아카이빙 |
| 💾 백업 | CSV 자동 백업, 마이그레이션 프레임워크 |

---

## 📁 프로젝트 구조

```
inventory_management_system/
├── .clasp.json              ← CLASP 연결 정보 (스크립트 ID)
├── .claspignore             ← CLASP 업로드 제외 파일
├── .gitignore               ← Git 추적 제외 파일
├── README.md                ← 이 파일
│
└── src/                     ← GAS에 올라가는 소스 코드
    ├── appsscript.json      ← GAS 프로젝트 설정 (타임존, 웹앱, OAuth)
    │
    │── Config.gs            ← 상수, 색상, 시트명 정의
    │── Code.gs              ← 진입점 (onOpen, onEdit, createAll)
    │── SheetBuilder.gs      ← 시트 초기 생성 (설정, 마스터, 대시보드 등)
    │── Dashboard.gs         ← 대시보드 갱신, 통합 데이터 집계
    │── StockEngine.gs       ← 재고 계산 엔진 (일평균, 시즌 보정)
    │── RBAC.gs              ← 역할 기반 권한 관리
    │── Migration.gs         ← 스키마 마이그레이션 프레임워크
    │── Archive.gs           ← 아카이빙, 증분 동기화, CSV 백업
    │── Triggers.gs          ← 트리거 설정 (자정 동기화, 월간 아카이브)
    │── WebApp.gs            ← 웹앱 서버 API (doGet + API 엔드포인트)
    │
    │── Index.html           ← 웹앱 메인 페이지 (HTML 구조)
    │── Stylesheet.html      ← CSS 스타일시트
    └── JavaScript.html      ← 클라이언트 JavaScript
```

---

## 🚀 설치 및 설정

### 사전 요구사항

- [Node.js](https://nodejs.org/) (v18+)
- Google 계정
- 기존 GAS 프로젝트의 스크립트 ID

### 1단계: CLASP 설치 및 로그인

```bash
# CLASP 전역 설치
npm install -g @google/clasp

# Google 계정 로그인
clasp login
```

### 2단계: 프로젝트 연결

```bash
# 프로젝트 폴더로 이동
cd c:\Users\덕구온천호텔\Desktop\gas_apps\inventory_management_system

# .clasp.json 파일 생성 (스크립트 ID 입력)
# 이미 생성되어 있다면 scriptId 값을 확인하세요
```

`.clasp.json` 파일 내용:
```json
{
  "scriptId": "여기에_스크립트_ID_입력",
  "rootDir": "src"
}
```

> 💡 스크립트 ID 확인 방법:  
> 스프레드시트 → 확장 프로그램 → Apps Script → 설정(⚙️) → 스크립트 ID 복사

### 3단계: 코드 업로드 (Push)

```bash
clasp push
```

### 4단계: 웹앱 배포

```bash
# 새 배포 생성
clasp deploy --description "v6.8 웹앱 배포"

# 또는 GAS 에디터에서:
# 배포 → 새 배포 → 웹 앱 → 배포
```

---

## 🔄 코드 수정 → 배포 워크플로우

```
1. 로컬에서 코드 수정 (src/ 폴더 안의 파일)
2. clasp push          ← GAS에 코드 업로드
3. clasp deploy        ← 새 버전 배포 (또는 기존 배포 업데이트)
4. 웹앱 URL 접속하여 테스트
```

### 유용한 CLASP 명령어

| 명령어 | 설명 |
|--------|------|
| `clasp push` | 로컬 → GAS 업로드 |
| `clasp pull` | GAS → 로컬 다운로드 |
| `clasp deploy` | 새 배포 생성 |
| `clasp deployments` | 배포 목록 확인 |
| `clasp open` | GAS 에디터 열기 |
| `clasp open --webapp` | 웹앱 URL 열기 |

---

## 📐 비즈니스 로직

### 재고 계산 공식

| 항목 | 공식 |
|------|------|
| 현재고 | 초기재고 + Σ입고 − Σ출고 − Σ폐기 |
| 안전재고 | 일평균사용량 × 안전재고일수 × 시즌배수 |
| 발주점 (ROP) | (일평균 × 리드타임) + 안전재고 |
| 적정발주량 | (일평균 × 목표유지일수) − 현재고 |

### 상태 판정

| 상태 | 조건 |
|------|------|
| 🚨 위험 | 현재고 ≤ 안전재고 |
| ⚠️ 발주필요 | 안전재고 < 현재고 ≤ 발주점 |
| ✅ 정상 | 현재고 > 발주점 |

---

## 🛠️ 트러블슈팅

| 문제 | 해결 방법 |
|------|-----------|
| `clasp push` 에러 | `clasp login`으로 재인증 |
| 웹앱이 안 열림 | 배포 → "누구나" 접근 허용 확인 |
| 권한 에러 | 설정 탭 → "권한 재동기화" 실행 |
| 데이터 안 보임 | 대시보드 → "대시보드 및 재고 갱신" 실행 |

---

## 📄 라이선스

(주)호텔덕구온천 사내 전용 시스템
