# Data Model Rules

이 프로젝트에서 Google Sheets는 사실상 Database 역할을 한다. AI가 Sheet 구조를 임의로 추측하거나 변경하는 것을 방지하기 위한 규칙.

## 적용 범위
- Sheet 구조 변경이 포함된 모든 작업
- 새로운 데이터 필드 추가
- Migration 작성
- 쿼리(getValues/setValues) 범위 변경

## 왜 필요한가
Sheet 열 순서/개수가 코드 곳곳에 하드코딩되어 있으므로, 구조 변경 시 **모든 참조 코드를 동시에 업데이트**해야 한다. 1열이라도 어긋나면 데이터 오염이 발생한다.

---

## 핵심 원칙

### 1. 열 매핑은 반드시 Config.gs 상수 사용
- 품목 마스터: `MASTER_COLS` (0-based), `MASTER_COL_COUNT = 24`
- 입출고: `TX_COLS = 9`
- 사용자: `USER_COLS` (1-based)

### 2. Sheet 구조 변경 절차
```
1. Docs/SheetSchema.md 문서 먼저 업데이트
2. Config.gs 상수 업데이트
3. 관련 코드 전체 검색 및 수정
4. Migration 스크립트 작성 (멱등성 보장)
5. 테스트
```

### 3. 현재 Entity 목록 (코드에서 확인됨)

| Entity | Sheet | Key Column | Managed By |
|--------|-------|------------|------------|
| Item (품목) | SHEET_MASTER | 품목코드 (A열) | ItemService.gs |
| Transaction (입출고) | 업장별 시트 + SHEET_INOUT | 거래ID (I열) | TxService.gs, Code.gs |
| User (사용자) | SHEET_USERS | 아이디 (A열) | RBAC.gs |
| Shop (업장) | SHEET_SHOPS | 업장명 (B열) | ConfigService.gs, RBAC.gs |
| Season (시즌) | SHEET_SEASONS | 시즌명 (A열) | ConfigService.gs |
| BaseData (기초데이터) | SHEET_BASE_DATA | — | BaseDataService.gs |
| Changelog (변경이력) | SHEET_CHANGELOG | — | Code.gs, ItemService.gs |
| Dashboard (대시보드) | SHEET_DASHBOARD | — | Dashboard.gs |
| SystemLog (시스템로그) | SHEET_SYSTEM_LOGS | — | Code.gs |

---

## 금지사항

| 금지 | 이유 |
|------|------|
| 열 번호 직접 사용 (매직 넘버) | `MASTER_COLS.CODE` 등 상수 사용 |
| Sheet 열 순서 임의 변경 | Migration 없이 변경 불가 |
| 기존 열 삭제 | 하위 호환성 파괴 |
| ARRAYFORMULA 범위 임의 변경 | 수식 열(N,O,P,Q,U,V,W)은 자동 계산 |

---

## AI 작업 시 검증 체크리스트

```
□ Config.gs 상수를 통한 열 접근
□ getValues() 범위가 현재 열 수와 일치
□ Sheet 구조 변경 시 Migration 스크립트 포함
□ 변경 시 Docs/SheetSchema.md 동시 업데이트
□ ARRAYFORMULA 수식 열 보호
```
