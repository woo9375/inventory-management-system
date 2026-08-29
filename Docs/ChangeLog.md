# Change Log — 호텔 재고 관리 시스템

> Git history 기반 버전 이력

---

## v10 — 매직넘버 상수화 / 배치 쓰기 / LockService 확대

### [refactor] Phase 2
- WebApp.gs 분리
- System_Logs 시트 추가
- CacheManager 최적화
- `Logger.log` → `console.error` 전환

### [refactor] Phase 1
- 매직 넘버 상수화 (`MASTER_COL_COUNT`, `MASTER_COLS`)
- 배치 쓰기 통합 (`setValues()`)
- LockService 확대 적용

---

## v9 — 미사용 품목 필터링 / 서버 검색 / 소프트 삭제

- 미사용 품목 대시보드/검색에서 제외
- `searchItemCodes()` 서버사이드 검색
- 태그 ID 유효성 검사 (`/^[A-Z]{2,3}$/`)
- 업장 소프트 삭제 (시트 숨김 + 상태 변경)
- 품목 마스터 사용/미사용 정렬

---

## v8 — 품목 인덱스 맵 캐시

- `buildItemMapCache()` 추가
- `CACHE_KEYS.ITEM_MAP` 캐시 키

---

## v7 — 업장 관리 / 시즌 / 9열 구조

- 업장관리 시트 + 자동 시트 생성
- 시즌설정 + 안전재고 배수
- 9열 입출고 구조 (단가 스냅샷, 거래ID 추가)
- 변경이력 시트 + 자동 기록
- 기초데이터 관리 (카테고리/단위)
- CSV 업로드 기능

---

## v1 — Initial Release

- 기본 재고관리
- 입출고 기록
- 대시보드
- RBAC 3단계

---

## Recent Commits

```
cd36a0d [fix] 기초데이터 단위 '단' 추가 및 CSV 업로드 시 규격 기본값 제거
7fd5c28 [fix] CSV 업로드 시 배열 수식으로 인한 빈 행 삽입 버그 수정
808b4c0 [fix] 시트 UI CSV 업로드 시 따옴표 내 쉼표 파싱 오류 수정
6c05f74 [fix] 대시보드 갱신일시 포맷 변경 및 시트 커스텀 메뉴에 CSV 업로드 복구
a34284c [refactor] 불필요한 스크립트 정리 및 시트 UI용 CSV 업로드 기능 추가
d205d15 deploy: update gas code
6e7b613 Refactor Phase 2
07ba46b [refactor] 1단계: 매직 넘버 상수화, 배치 쓰기, LockService 확대
5231fc9 [fix] 사이드바 사용자 정보 복구, README 정리
83d3007 [fix] 사이드바 레이아웃 정리, 모달 텍스트 수정
e7368ca [fix] 텍스트 수정, 규격 컬럼 유효성 제거
bd1e56f [feat] 대시보드 UIUX 개선 및 업장 선택 강제 모달 적용
e4a6d6e [fix] UI 버튼 배치 및 계정관리 액션 버그 해결
e01a533 [fix] CSV 업로드 시 따옴표 안의 쉼표 처리 오류 수정
0e5552f [fix] 버그 수정, 동시성 제어 및 캐시 최적화 적용
82490e1 chore: rename refresh button
de743a1 feat: UI refresh sync, CSV upload strict validation
13706c7 Initial commit v1.0.0
```
