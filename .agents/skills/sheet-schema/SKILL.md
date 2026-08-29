---
name: sheet-schema
description: >-
  Use this skill when the user asks to modify, add, or inspect the Google Sheets
  structure (columns, validations, formulas, data types) used as the database.
---

# Sheet Schema Management Skill

## 목적
Google Sheets의 물리적 구조(열, 검증, 수식)를 안전하게 변경하는 절차.

## 사용 시점
- 새 열 추가 필요
- 데이터 검증 규칙 변경
- 수식(ARRAYFORMULA) 수정
- Sheet 구조 확인/문서화

## 사전조건
- `Docs/SheetSchema.md` 읽기
- `.agents/rules/03_data-model.md` 읽기
- `Config.gs`의 현재 상수 확인

## 실행 절차

### Step 1: 현재 구조 확인
1. `Config.gs`에서 `MASTER_COLS`, `TX_COLS`, `USER_COLS` 확인
2. `SheetBuilder.gs`에서 시트 생성 코드 확인
3. `Docs/SheetSchema.md`에서 문서화된 구조 확인

### Step 2: 변경 영향 분석
1. 변경할 열을 참조하는 모든 코드 검색 (grep)
2. ARRAYFORMULA 영향 확인
3. CacheManager 캐시 키 영향 확인
4. Migration 필요 여부 판단

### Step 3: Migration 작성
1. `Migration.gs`에 새 버전 함수 추가
2. `CURRENT_SCHEMA_VERSION` 증가
3. 멱등성 보장 (두 번 실행해도 안전)
4. 사전 백업 코드 포함

### Step 4: 코드 업데이트
1. `Config.gs` 상수 업데이트
2. 관련 Service 코드 업데이트
3. Frontend 코드 업데이트 (필요시)

### Step 5: 문서 업데이트
1. `Docs/SheetSchema.md` 동기화
2. `Docs/DataModel.md` 동기화 (필요시)

## 금지사항
- Migration 없이 Sheet 구조 변경
- 기존 열 삭제 (비활성화만 허용)
- ARRAYFORMULA 범위를 축소
- Production에서 직접 열 추가/삭제

## 완료 조건
- Migration 스크립트 작성 및 테스트
- Config.gs 상수 업데이트
- SheetSchema.md 문서 동기화
- 관련 코드 전체 업데이트
