# TASK-027: 웹앱 응답 시간 개선 — 캐시 정비·중복 읽기 제거·왕복 축소

> 이 Task는 Antigravity 명세가 아니라 사용자의 직접 요청("전반적으로 속도가 느리다. 면밀하게 검토 후 개선해봐")으로
> Claude Code가 진단→구현까지 수행했다. 명세 역할을 하는 「진단」 절과 구현 결과인 「Final Report」를 함께 둔다.

## Objective
입출고 기록 1건 등록에 4~5초, 업장관리·시즌설정·입출고·사용자 관리 탭 진입에 2~3초가 걸리는 문제를,
업무 규칙과 화면 동작을 바꾸지 않고 서버·클라이언트 양쪽의 구조적 낭비를 제거해 줄인다.

---

## 진단 (DEV 실측, 2026-09-14)

측정 도구: `tests/e2e/perf-baseline.spec.js` (`E2E_PERF=1`) — 화면이 부르는 서버 함수를 그대로 호출해 콜드(캐시 비운 직후)/웜 응답 시간을 잰다.

### 사용자가 제안한 "비동기·수동 통합갱신 구조"에 대한 판단
**이미 그 구조다.** 재고·일평균·FIFO 평가액 계산(`recalcStockAndUsage`)은 거래 등록 시점에 돌지 않고,
자정 트리거와 「통합 갱신」이 부를 때만 돈다(`Dashboard.gs refreshDashboard`). 거래 등록(`addTransaction`)은
업장 시트에 행을 붙이고 끝난다. 따라서 느림의 원인은 **계산이 아니라 호출 구조**였다.

### 어디서 시간이 갔나 (작업 전 실측)

| 호출 | 콜드 | 웜 | 원인 |
|---|---|---|---|
| `getSessionUser` (시트를 읽지 않는 빈 함수) | – | **955ms** | `google.script.run` 왕복 바닥. 호출 수를 줄이는 것 외에 방법이 없다 |
| `addTransaction` 입고 | 4,913 | **4,625** | 업장관리 시트 3회 읽기(접근 검사 2 + 접두사 1) + 마감일 프로퍼티 + 품목맵 + 쓰기 5회 + **`invalidateAll` 28회 캐시 왕복** |
| `addTransaction` 출고(FIFO) | – | 5,070 | 위 + 업장 시트 전체 읽기 |
| `getRecentTransactions` (저장 직후 화면이 다시 부름) | 2,850 | 2,181 | 업장 시트 **전체**를 읽고 뒤집어 50건만 사용 |
| `getDashboardData` (로그인마다) | 4,099 | **3,236** | 캐시 없음 — 매번 마스터 4,292행 × 25열 스캔 |
| `getConfigData` (업장·시즌·사용자 탭) | 3,183 | 1,188 | 시트 4개 읽기. 캐시 TTL 60초라 실제 운영에선 거의 매번 콜드 |
| `getItemCodes` (로그인마다) | 4,109 | 1,439 | 4,292건·150KB — 서버 검색 실패 시 폴백에만 쓰이는데 매 로그인 선적재 |
| `getItemMasterData` | 5,385 | 2,515 | 4,292건·약 2MB 전송 (기초데이터 실사 다운로드 전용; TASK-025는 서버 페이징으로 설계 변경) |

체감으로 환산하면 **등록 1건 = addTransaction 4.6초 + 목록 재조회 2.4초 ≈ 7초**, 탭 진입 = 왕복 1초 + 콜드 미스 1~2초.

### 구조적 원인 4가지
1. **거래 등록마다 캐시 전체 삭제.** `addTransaction` 끝의 `CacheManager.invalidateAll()`은 마스터·업장·설정·거래처
   캐시를 전부 지웠다. 거래 행은 어떤 캐시에도 없으므로 지울 이유가 없었고, 지우는 데만 키 14개 × (get + removeAll) = 28회
   왕복이 들었다. 그 결과 다음 등록·다음 탭 열기는 항상 콜드 미스(마스터 4,300행 재조회).
2. **같은 시트를 한 요청 안에서 여러 번 읽음.** `_canAccessShop` → `_getActiveShopNames`(업장관리 시트 읽기)가 API마다
   불리고, `_getShopTxPrefix`가 같은 시트를 또 읽었다. 최근 기록 조회는 50건을 위해 업장 시트 전체를 읽었다.
3. **캐시 TTL 60초.** 사용자가 흩어져 접속하는 운영에서는 60초 안에 같은 데이터를 두 번 읽는 일이 드물어 캐시가 거의
   작동하지 않았다. 게다가 시트 직접 편집 시 캐시를 지우는 `onEdit` 코드는 함수 맨 아래에 있어 시스템 시트는 그 앞
   `return`에 걸려 **한 번도 실행되지 않았다** (시트에서 단가를 고쳐도 최대 10분간 옛 단가로 거래 기록 가능 — 잠복 결함).
4. **클라이언트가 왕복을 낭비함.** 저장 뒤 목록을 다시 조회(왕복 +1), 업장·시즌·사용자 탭이 같은 응답을 탭마다 재요청,
   로그인 직후 개별 호출 4개 + 품목 코드 150KB.

---

## 구현 내용

### 서버
| 파일 | 변경 |
|---|---|
| `Config.gs` | `CACHE_KEYS`에 `SHOP_LIST`·`DASHBOARD`·`CLOSING_CUTOFF_NONE`, `TTL.DEFAULT = 600`, `CACHE_INVALIDATE_KEYS`(무효화 대상 SSOT), `RECENT_TX_READ_MARGIN` |
| `CacheManager.gs` | 기본 TTL 10분(Config `TTL.DEFAULT`); `invalidateAll` = `getAll` 1회(청크 개수) + `removeAll` 1회 (28회 → 2회) + 요청 메모 초기화 |
| `TxService.gs` | `_getActiveShops(ss)` — 업장관리 시트를 읽는 유일한 경로(캐시 + 요청 단위 메모); `getShopList`·`_getShopTxPrefix`가 사용. `getRecentTransactions`는 시트 끝에서 `limit+20`행 블록만 읽는다(빈 행이 섞이면 위 블록 추가). `addTransaction`/`uploadBulkTransactions`는 **캐시를 지우지 않고**, `addTransaction`은 방금 쓴 행을 `records`로 돌려준다(`_txRowToRecord` 공용) |
| `RBAC.gs` | `_getActiveShopNames` → `_getActiveShops()` 사용 (시트 재조회 제거) |
| `Archive.gs` | `getLatestClosingCutoff` — 마감 이력이 없으면 `CLOSING_CUTOFF_NONE` 부정 캐시(10분)로 통합 시트 풀 스캔 억제. `setLatestClosingCutoff`가 부정 캐시를 지운다 |
| `WebApp.gs` | `getDashboardData` 결과 캐시(`DASHBOARD_DATA`); `getBootstrapData(token)` 신설 — 대시보드·업장·마감·동기화 시각 1회 응답 |
| `Code.gs` | `onEdit` 캐시 무효화를 함수 앞으로 이동(시스템 시트 `return` 앞) + 사용자관리·거래처관리 추가 |

### 클라이언트
| 파일 | 변경 |
|---|---|
| `JS_UI.html` | `loadWithTabCache(key, force, render, fetch)` — 탭 응답을 세션 동안 보관. 1분 안 재방문은 서버 호출 없음, 그 뒤는 먼저 그리고 뒤에서 조용히 갱신. 「시트 동기화」 성공 시 `clearTabData()` |
| `JS_Config.html` / `JS_BaseData.html` / `JS_Vendor.html` | 로더가 탭 캐시를 타고, 등록/수정/삭제 뒤에는 `loadXxx(true)` |
| `JS_Tx.html` | 저장 성공 시 응답 `records`를 목록 맨 위에 끼워 넣음(`prependTransactions`, 재조회 없음). 품목 코드 전체 목록은 서버 검색 실패 폴백 시점에 1회만 받음(`ensureItemCodes`). `applyShopList`/`applyClosingCutoff` 분리 |
| `JS_Auth.html` | 로그인 직후 `loadBootstrap()` 1회 호출(실패 시 개별 호출로 폴백). `applyLastSyncTime` 분리 |

### 테스트·문서
- `tests/unit/perf-cache-paths.test.js` (신규, 20건): 업장 캐시·메모, `invalidateAll` 왕복 2회·청크 삭제, 최근 기록 꼬리 읽기(빈 행·부족·권한), `addTransaction` 무효화 없음·`records`, 마감일 부정 캐시·해제, 대시보드 캐시·권한, `getBootstrapData`, **onEdit 설정 시트 편집 → 캐시 삭제**(전에 죽어 있던 경로), 마스터 단가 편집 → 새 단가 스냅샷
- `tests/unit/bulk-transactions.test.js`·`fifo-lot-splitting.test.js`·`closed-month-guardrail.test.js`: 키별 `CacheManager.get` 스텁, `CacheService` 스텁; "저장 시 캐시 무효화" 단정을 "지우지 않는다"로 뒤집음
- `tests/unit/lib/gas-sheet-mock.js`: `Range.getBackgrounds`/`setBackgrounds`
- `tests/e2e/perf-baseline.spec.js` (신규, `E2E_PERF=1` 전용): 전/후 비교 벤치마크. `perf-server-ops.spec.js` + `DevTools.gs devProfileServerOps`(DEV 가드): 연산별 소요 시간
- `Docs/Architecture.md`(입출고 흐름·캐시 계층), `Docs/CodingRules.md` §10, `tests/e2e/README.md`

---

## Final Report

### 1. 결과 (DEV 실측, 같은 벤치마크 — 작업 전 1회, 작업 후 3회 중앙값 범위)

| 호출 | 작업 전 웜 | 작업 후 웜 | 비고 |
|---|---|---|---|
| `getSessionUser` (왕복 바닥) | 955 | 1,070~1,210 | 플랫폼 비용. 이날 후반 측정이 전반보다 200ms쯤 느렸다 |
| **`addTransaction` 입고** | **4,625** | **2,530~2,880** | 업장관리 재조회 3회 제거 · 캐시 삭제 제거 · 요청 메모 |
| **`addTransaction` 출고(FIFO)** | **5,070** | **2,270~3,300** | 위 + 업장 시트 읽기는 FIFO에 필요해 그대로 |
| **등록 체감 (저장 + 목록 재조회)** | **≈ 7,060** | **≈ 2,600** | 재조회 왕복(2,439ms) 자체를 없앴다 — 응답 `records`를 바로 그린다 |
| `getRecentTransactions` | 2,181 | 1,670~1,790 | 시트 끝 70행만 읽음 |
| `getDashboardData` (로그인마다) | 3,236 | 1,050~1,230 | 캐시. 마스터 4,292행 스캔(실측 1.8초)이 10분에 1회로 |
| `getConfigData` (업장·시즌·사용자 탭) | 1,188 | 1,160~1,400 | 서버는 같음. **탭 재방문은 클라이언트 캐시로 0ms**, 콜드 미스는 10분에 1회 |
| `getVendors` / `getBaseData` | 1,105 / 1,213 | 1,010~1,310 / 1,000~1,100 | 위와 같은 탭 캐시 |
| 콜드 미스 빈도 | 거래 등록마다 전부 | 쓰기 API·시트 편집·통합 갱신 뒤 또는 10분마다 | |
| 로그인 직후 왕복 | 5회(대시보드·업장·마감·동기화 시각 + 품목 코드 150KB) | 1회(`getBootstrapData`) | 품목 코드는 서버 검색 실패 시에만 |

남은 시간의 정체 (DevTools `devProfileServerOps`, DEV 3회 중앙값): 왕복 바닥 ~1.1초 · `getSheetByName` 229ms ·
`getLastRow` 113ms · `setValues` 1행 326ms · 락 135ms · 캐시 읽기 20~70ms · 프로퍼티 32ms. 거래 1건이 시트에 닿는 데
필요한 최소 연산이 이것이고, 쓰기 서식 호출(정렬·배경 3회)은 플랫폼이 묶어 주어 추가 비용이 없다(347 vs 326ms).
마스터 전체 읽기(4,292×25)는 1.8초 — 이것을 요청마다 하지 않게 만든 것이 이번 작업의 핵심이다.

### 2. 검증
- 단위 테스트: `node tests/unit/run-all.js` — 19개 파일 전체 통과 (신규 20건 포함)
- E2E: `npx playwright test` — 22 passed / 1 failed / 4 skipped(마감 승인 2 + 거래처 삭제 1 + 벤치마크 1). 실패 1건은 FIFO 분할행 표시 순서가
  뒤집힌 것(`prependTransactions`가 두 번 뒤집음) → 수정 후 `fifo-split.spec.js`·`transaction.spec.js` 재실행 통과.
  E2E가 새 UI 경로(저장 응답을 바로 그림)를 실제로 검증했다.
- 벤치마크: `E2E_PERF=1 E2E_PERF_REPEAT=5 npx playwright test tests/e2e/perf-baseline.spec.js` 3회, `perf-server-ops.spec.js` 1회

### 3. 바꾸지 않은 것 / 남은 것
- 업무 규칙·화면 구성·API 계약은 그대로다. `addTransaction` 응답에 `records`가 **추가**됐을 뿐이며 기존 필드는 유지된다.
- `google.script.run` 왕복 바닥(약 1초)은 플랫폼 비용이다. 이제 대부분의 호출이 이 바닥 근처에 있다.
- `getItemMasterData`(2MB)는 기초데이터 실사 다운로드가 그대로 쓴다. TASK-025 품목 관리 탭은 이 API를 쓰지 않고 서버 페이징(`queryItems`)으로 간다(사용자 합의).
- 통합 갱신(`refreshDashboard`) 자체의 소요 시간은 이 Task 범위 밖이다.

### 4. Human QA 체크리스트 (DEV)
- [ ] 입출고 기록: 입고/출고 저장 → 토스트 직후 목록 맨 위에 새 행(들)이 바로 보인다(FIFO 분할이면 여러 행). 건수 표시가 맞다
- [ ] 업장 선택을 바꾼 뒤 저장해도 목록이 그 업장 것이다
- [ ] 업장관리 → 시즌설정 → 사용자 관리 탭을 오가면 두 번째부터 즉시 그려진다. 시즌을 추가/수정하면 바로 반영된다
- [ ] 기초데이터·거래처 탭도 같다(추가/삭제 직후 반영)
- [ ] 대시보드: 통합 갱신 뒤 KPI/알림이 새 값이다
- [ ] 시트에서 직접 시즌설정/업장관리/기초데이터/품목 마스터를 고치면 웹앱에 곧 반영된다(10분 기다리지 않아도)
- [ ] staff 계정 로그인이 정상이고 배정 업장만 보인다

### 5. 배포 시 주의
- 마이그레이션 없음. 코드만 배포하면 된다.
- 배포 직후 첫 요청들은 콜드(캐시 없음)라 전과 같은 속도이며, 이후부터 빨라진다.
