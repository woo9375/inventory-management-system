# TASK-008: 레거시 월간 자동 아카이빙(archiveOldRecords) 제거 및 수동 월마감 일원화

## Objective
매월 1일 새벽 2시에 실행되던 레거시 자동 아카이빙(`archiveOldRecords()`, `setupArchiveTrigger()`)을 완전히 제거하고, Google Drive 전용 폴더 이관, FIFO 재고 이월, 초기재고(`INIT_STOCK`) 리셋 및 업장 시트 정리가 완벽히 통합된 '수동 월마감(`executeMonthlyClosing()`)' 단일 체계로 일원화한다. 아울러 기존 프로젝트에 등록되어 있을 수 있는 시간 기반 트리거를 해제하는 정리 유틸리티를 제공하고 관련 문서를 최신화한다.

---

## Confirmed Facts
- `src/Archive.gs:11-109`: `archiveOldRecords()` 함수는 매월 1일 기준 이전 달 데이터를 연도별 아카이브 스프레드시트(`[아카이브] 호텔덕구온천 입출고 기록 YYYY년`)로 복사만 하고 메인 시트의 원본을 유지함(`Archive.gs:102`).
- `src/Archive.gs:111-133`: `_getOrCreateArchiveSpreadsheet(name)`는 오직 `archiveOldRecords()`에서만 호출되는 전용 헬퍼 함수임.
- `src/Triggers.gs:14-26`: `setupArchiveTrigger()`는 매월 1일 새벽 2시에 `archiveOldRecords`를 실행하도록 시간 기반 트리거를 생성함.
- `src/Code.gs:12-21`: `onOpen()` 관리자 메뉴에 `setupArchiveTrigger`는 등록되어 있지 않음 (GAS 편집기에서 직접 실행해야만 등록되는 구조).
- `src/Archive.gs:197-441`: `executeMonthlyClosing(token, year, month)`는 관리자가 웹앱에서 마감 후 호출하며, Google Drive 아카이브 폴더(`ARCHIVE_FOLDER_ID`)로 데이터 이관, FIFO 로트별 이월 전표 생성, 마스터 초기재고 리셋, 통합 시트 및 업장 시트 정리까지 원자적으로 완결함.
- `Docs/BusinessRules.md:143`: "자동 아카이빙 | `archiveOldRecords()` — 매월 1일 트리거, 이전 달 데이터를 연도별 스프레드시트로 이관" 항목이 기술되어 있음.
- `tests/unit/monthly-closing.test.js`: 수동 월마감(`executeMonthlyClosing`) 단위 테스트는 정밀하게 작성되어 있으나, `archiveOldRecords`에 대한 테스트는 존재하지 않음.

---

## Hypotheses
- 기존 운영 환경(DEV/PROD)에 과거 수동으로 등록된 `archiveOldRecords` 시간 기반 트리거가 남아있을 가능성이 있다. 이를 안전하게 제거할 수 있는 트리거 정리 함수(`removeLegacyArchiveTrigger()`)를 제공하거나 `setupDailyTrigger()` 실행 시 함께 정리되도록 유도할 수 있다.
- `archiveOldRecords()`와 `_getOrCreateArchiveSpreadsheet()`를 제거하더라도 `executeMonthlyClosing()` 및 CSV 백업(`backupToCSV()`)의 동작에는 일체 부작용이 없다.

---

## Business Context
- 실제 호텔 및 업장의 재고 마감은 매월 말일 자정이 아니라, 월초 1~3일간 전표 누락분 입력, 오기입 수정 및 실사 재고 대사 작업을 거쳐 3~4일경에 확정된다.
- 매월 1일 새벽 2시 자동 아카이빙은 아직 검증되지 않은 불완전한 상태의 데이터를 복사하여 아카이브 데이터의 정합성을 훼손한다.
- 또한 원본 데이터를 삭제하지 않으므로 시트 용량 경량화 효과가 전혀 없으며, 3~4일경 수동 월마감 시 별도의 아카이브 파일(`[입출고마감]_YYYY_MM`)이 또 생성되어 보관 저장소가 이원화되는 혼란을 유발한다.
- 따라서 불완전한 자동 복사 기능을 폐기하고 검증 완료 후 실행하는 수동 월마감 단일 파이프라인으로 일원화하는 것이 비즈니스상 안전하고 명확하다.

---

## Current System
1. `src/Archive.gs` 상단에 `archiveOldRecords()` 및 `_getOrCreateArchiveSpreadsheet()` 함수가 잔존.
2. `src/Triggers.gs`에 `setupArchiveTrigger()` 함수가 존재.
3. `Docs/BusinessRules.md` 10장 표에 자동 아카이빙 규칙이 명시되어 있음.

---

## Root Cause / Diagnostic Logic
- 해당 없음 (레거시 중복 기능 폐기 및 아키텍처 단순화)

---

## Requirements

### Functional
- [x] **레거시 아카이빙 함수 제거**: `src/Archive.gs`에서 `archiveOldRecords()` 및 `_getOrCreateArchiveSpreadsheet()` 제거.
- [x] **레거시 트리거 생성 함수 제거 및 정리 함수 추가**: `src/Triggers.gs`에서 `setupArchiveTrigger()`를 제거하고, 기존에 걸려있는 `archiveOldRecords` 트리거를 삭제하는 `removeLegacyArchiveTrigger()` 함수 제공.
- [x] **자정 트리거 설정 시 잔여 레거시 트리거 자동 청소**: `setupDailyTrigger()` 실행 시 `archiveOldRecords` 핸들러를 가진 기존 트리거가 있다면 함께 자동 삭제하도록 보강.
- [x] **업무 규칙 및 아키텍처 문서 동기화**: `Docs/BusinessRules.md`에서 '자동 아카이빙' 항목을 제거하고 '수동 월마감 단일 체계'로 정리. `Docs/Architecture.md`의 모듈 설명 갱신.

### Non-Functional
- [x] **무결성 유지**: 수동 월마감(`executeMonthlyClosing`), CSV 백업(`backupToCSV`), 업장 시트 트림(`_trimShopSheetsForClosing`) 등 정상 운영 중인 핵심 기능 보존.
- [x] **단위 테스트 무결성**: 기존 단위 테스트 패키지(`npm run test:unit`)가 100% 통과할 것.

---

## Constraints
- 구글 스프레드시트의 9열 데이터 스키마(`TX_COLS = 9`) 및 기존 API 시그니처에 영향을 주지 말 것.
- `executeMonthlyClosing()` 로직 및 `backupToCSV()` 로직에 변경을 가하지 말 것.

---

## Files to Inspect
- `src/Archive.gs`
- `src/Triggers.gs`
- `src/Code.gs`
- `Docs/BusinessRules.md`
- `Docs/Architecture.md`
- `tests/unit/monthly-closing.test.js`

---

## Files to Modify
- `src/Archive.gs`:
  - `archiveOldRecords()` 제거
  - `_getOrCreateArchiveSpreadsheet()` 제거
- `src/Triggers.gs`:
  - `setupArchiveTrigger()` 제거
  - 기존 레거시 트리거 삭제 함수 `removeLegacyArchiveTrigger()` 추가
  - `setupDailyTrigger()`에 `archiveOldRecords` 트리거 정리 구문 추가
- `Docs/BusinessRules.md`:
  - 10. 월마감 표에서 '자동 아카이빙' 행 삭제 및 수동 월마감 단일화 설명 반영
- `Docs/Architecture.md`:
  - `Archive.gs (수동 월마감, 백업)` 역할 명시 최신화

---

## Files to Create
- 없음

---

## Implementation Plan
1. **`src/Archive.gs` 리팩토링**:
   - `archiveOldRecords()` 및 `_getOrCreateArchiveSpreadsheet()`를 안전하게 삭제.
   - 상단 주석 및 섹션 헤더 정리.
2. **`src/Triggers.gs` 리팩토링**:
   - `setupArchiveTrigger()` 제거.
   - `removeLegacyArchiveTrigger()` 함수 작성 및 `setupDailyTrigger()` 잔여 트리거 정리 로직 보강.
3. **문서 동기화**:
   - `Docs/BusinessRules.md`, `Docs/Architecture.md` 수정.
4. **검증**:
   - `npm run test:unit` 실행하여 문법 오류나 단위 테스트 실패가 없는지 확인.

---

## Migration Plan
- 시트 구조 변경 없음.
- 기존 GAS 프로젝트에 혹시 남아있을 수 있는 `archiveOldRecords` 시간 트리거는 Apps Script 대시보드에서 삭제하거나, 배포 후 `removeLegacyArchiveTrigger()`를 1회 실행하여 정리.

---

## Test Plan

### Unit Test
- `npm run test:unit` 실행:
  - `tests/unit/monthly-closing.test.js` 정상 통과 확인
  - 전체 단위 테스트 스위트 정상 통과 확인

### E2E Test (Playwright)
- 해당 없음 (자동 트리거 기능 삭제이므로 웹앱 UI 인터페이스 변경 없음). 기존 월마감 및 CSV 백업 정상 작동 확인.

---

## Regression Risk
- 없음. `archiveOldRecords`는 다른 서비스나 모듈에서 전혀 참조되지 않는 독립 실행 함수였으며, 수동 월마감(`executeMonthlyClosing`)과 완전히 분리되어 있음.

---

## Acceptance Criteria
- [x] `src/Archive.gs`에 `archiveOldRecords`, `_getOrCreateArchiveSpreadsheet`가 존재하지 않는다.
- [x] `src/Triggers.gs`에 `setupArchiveTrigger`가 존재하지 않고, `archiveOldRecords` 트리거를 정리하는 로직이 추가되어 있다.
- [x] `Docs/BusinessRules.md` 및 `Docs/Architecture.md`에서 자동 아카이빙 항목이 제거 및 정비되었다.
- [x] `npm run test:unit`이 에러 없이 모두 통과한다.

---

## Human Approval Required
- 없음 (순수 레거시 코드 제거 및 문서 정비).

---

## Deployment Notes
- 배포(`npm run dev:push` 또는 `git push origin main`) 후, 기존 GAS 프로젝트에 혹시 걸려있는 시간 트리거가 있다면 Apps Script 편집기의 [트리거]탭에서 확인 후 수동 삭제하거나 `removeLegacyArchiveTrigger()`를 1회 실행한다.

---

## Rollback Plan
- Git 커밋 롤백(`git revert`)을 통해 이전 상태로 복구 가능.

---

## Final Report

### 구현 요약 (2026-09-01)

| 파일 | 변경 내용 |
|------|-----------|
| `src/Archive.gs` | `archiveOldRecords()`, `_getOrCreateArchiveSpreadsheet()` 및 "자동 아카이빙 파이프라인" 섹션 헤더 제거 (129줄 삭제). 모듈 상단 주석을 "아카이빙 & 백업 모듈" → "월마감 & 백업 모듈"로 정정 |
| `src/Triggers.gs` | `setupArchiveTrigger()` 제거. `removeLegacyArchiveTrigger()`(1회 실행용 정리 유틸) 및 내부 헬퍼 `_deleteLegacyArchiveTriggers()` 추가. `setupDailyTrigger()`가 레거시 트리거를 함께 청소하고 삭제 건수를 알림에 표시하도록 보강 |
| `Docs/BusinessRules.md` | 10장 "자동 아카이빙" 행을 "아카이빙 단일화" 행으로 교체 — 아카이브는 수동 월마감 단일 경로로만 생성됨을 명시 |
| `Docs/Architecture.md` | 모듈 다이어그램 `Archive.gs (월마감, 아카이빙)` → `Archive.gs (수동 월마감, 백업)` |

### 설계 결정
- 트리거 삭제 로직을 `_deleteLegacyArchiveTriggers()` 헬퍼로 추출하여 `setupDailyTrigger()`와 `removeLegacyArchiveTrigger()`가 동일 로직을 공유하도록 함 (중복 제거).
- `removeLegacyArchiveTrigger()`는 정리 대상이 없을 때도 명시적으로 결과를 알려 관리자가 상태를 확인할 수 있게 함.
- `onOpen()` 관리자 메뉴에는 추가하지 않음 — `setupDailyTrigger()`도 메뉴에 없는 1회성 편집기 실행 함수이므로 기존 관례를 따름.

### 검증 결과
- `npm run test:unit`: **4개 테스트 파일 전체 통과** (monthly-closing 포함).
- `node --check` 문법 검사: `Archive.gs`, `Triggers.gs` 모두 통과.
- 잔여 참조 검사: `src/`, `Docs/` 내 `archiveOldRecords` 참조는 트리거 정리 로직/문서 설명용 문자열만 남음. `setupArchiveTrigger`, `_getOrCreateArchiveSpreadsheet` 참조 0건.
- `npm run dev:push`: DEV 프로젝트 26개 파일 푸시 성공.
- E2E: 해당 없음 (웹앱 UI 인터페이스 변경 없음).

### Human QA 체크리스트
1. DEV Apps Script 편집기 [트리거] 탭에서 `archiveOldRecords` 시간 트리거 잔존 여부 확인 → 있으면 `removeLegacyArchiveTrigger()` 1회 실행.
2. Production 배포 후 동일하게 트리거 탭 확인 및 필요 시 `removeLegacyArchiveTrigger()` 1회 실행.
3. 수동 월마감 및 CSV 백업 정상 동작 확인.
