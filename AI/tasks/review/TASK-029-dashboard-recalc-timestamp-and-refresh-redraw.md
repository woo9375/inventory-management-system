# TASK-029: 대시보드 「최신 갱신일」을 재고 재계산 시각으로 전환 및 통합 갱신 직후 자동 재조회

## Objective
1. 웹앱 대시보드 헤더의 날짜 표기(`최신 갱신일`)가 현재 "서버가 시트를 읽어 캐시한 시점(로그인 시점)"을 표시하고 있어, 실제 재고 수치(현재고 H열·상태 Q열)가 언제 계산되었는지 알 수 없던 문제를 해결한다.
2. 재고 재계산 시각(`LAST_SYNC_TIMESTAMP`)의 기록 주체를 `refreshDashboard`에서 실제 계산을 수행하는 `recalcStockAndUsage(ss)` 끝으로 이전하여, 자정 트리거뿐만 아니라 월마감·품목 수정·초기재고 변경 등으로 재고가 바뀐 시점도 정확히 반영되도록 한다.
3. 대시보드 헤더 라벨을 `재고 계산 기준: YYYY-MM-DD HH:mm`(기록 없으면 `기록 없음`)으로 명확화하고, 24시간 이상 재계산되지 않은 경우 경고 배지(`⚠️ 하루 이상 지난 계산`)를 노출하여 자정 트리거 장애를 인지할 수 있게 한다.
4. 웹앱에서 관리자가 「통합갱신」(`refreshDashboard`) 또는 「신규 내역 취합」(`incrementalSync`)을 실행한 직후, 화면 캐시를 비우고 대시보드를 자동 재조회(`loadDashboard`)하여 갱신된 KPI와 재계산 시각이 즉시 화면에 반영되도록 한다.

---

## Confirmed Facts
실제 코드를 읽어 확인된 사실과 라인 번호는 다음과 같다:

1. **대시보드 헤더 시각 렌더링 경로 (Step 2.5 진입점 역추적 통과)**:
   - [진입점 호출 경로 증빙: `src/Index.html:42` (사이드바 `data-tab="dashboard"`) → `src/Index.html:132` (`div id="tab-dashboard"`) → `src/Index.html:139` (`<span id="dashDate">-</span>`)]
   - [스크립트 로딩 증빙: `src/Index.html:686` (`<?!= include('JS_UI') ?>`)]
   - `src/JS_UI.html:218`: `renderDashboard(data)` 함수 내 `document.getElementById('dashDate').textContent = '최신 갱신일: ' + data.date;`
   - `src/WebApp.gs:104`: `data.date`는 `Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")`로 생성된 **단순 조회 시점의 현재 시각**임.
   - `src/WebApp.gs:53-58`: `getDashboardData` 결과 전체가 `CACHE_KEYS.DASHBOARD`에 10분간 캐시되며, 주석에 `"date는 캐시 시점의 값이 그대로 남는데... 캐시 시점을 보여 주는 것이 맞다"`라고 기재되어 있음 (이번 Task에서 뒤집는 판단).

2. **재고 수치와 재계산(`recalcStockAndUsage`) 종속 관계**:
   - `src/Index.html:157-169`: 대시보드 KPI 카드(전체 품목, 위험 품목, 발주필요, 정상).
   - `src/SheetBuilder.gs:737`: 품목마스터 Q열(상태) 수식 `=ARRAYFORMULA(IF(H<=N,"🚨 위험",IF(H<=O,"⚠️ 발주필요","✅ 정상")))`은 H열(현재고)에 종속됨.
   - `src/StockEngine.gs:19`: H열(현재고) 및 I열(일평균), W/X열(합계금액)은 오직 `recalcStockAndUsage(ss)`에 의해서만 일괄 계산되어 시트에 기록됨.
   - `src/TxService.gs:310` 주석: 입출고 거래 등록(`addTransaction`)은 업장 시트에 행만 추가할 뿐 H열을 실시간 갱신하지 않음.
   - `recalcStockAndUsage` 호출처:
     - 통합 갱신: `src/Dashboard.gs:84`
     - 수동 월마감: `src/Archive.gs:351` (TASK-028 반영 후 351행)
     - 품목 수정 / 초기재고 변경: `src/ItemService.gs:756`, `src/ItemService.gs:866`
     - 마이그레이션: `src/Migration.gs:759`, `src/Migration.gs:926`

3. **`LAST_SYNC_TIMESTAMP` 현황 및 조회**:
   - `src/Dashboard.gs:103`: `PropertiesService.getScriptProperties().setProperty("LAST_SYNC_TIMESTAMP", new Date().toISOString());` — 오직 `refreshDashboard`에서만 기록하고 있음 (월마감이나 품목 수정의 recalc는 미기록).
   - `src/WebApp.gs:182-188`: `getLastSyncTime(token)`에서 `LAST_SYNC_TIMESTAMP`를 읽어 반환.
   - 2026-09-15 핫픽스(0c30e1f): 클라이언트 사이드바에서 과거 동기화 시각 표시가 제거되었고, `getBootstrapData`(`src/WebApp.gs:196-204`)에서도 `lastSync` 호출이 제거되어 클라이언트에서 실질적으로 호출되지 않고 있음.

4. **통합 갱신 UI 진입점 및 실행 후 화면 미갱신 문제 (Step 2.5 진입점 역추적 통과)**:
   - [진입점 호출 경로 증빙: `src/Index.html:145` (대시보드 헤더 버튼 `onclick="doSystemCommand('refreshDashboard')"`), `src/Index.html:234` (입출고 탭 관리 메뉴 `onclick="closeTxAdminMenu(); doSystemCommand('incrementalSync')"`)]
   - [스크립트 로딩 증빙: `src/Index.html:689` (`<?!= include('JS_Config') ?>`)]
   - `src/JS_Config.html:489`: `doSystemCommand(command)`
   - `src/JS_Config.html:500-519`: `submitSystemCommand(command)` 성공 핸들러(508-510행):
     ```javascript
     if (res.success) {
       showToast(res.message, 'success');
     }
     ```
     토스트만 노출할 뿐, `clearTabData()` 또는 `loadDashboard()`를 호출하지 않음.
   - 서버 캐시는 `Dashboard.gs:100`의 `CacheManager.invalidateAll()`로 비워졌으나, 클라이언트 화면의 KPI·알림 테이블·헤더 시각은 수동으로 「시트 동기화」를 누르기 전까지 갱신 전 상태로 동결됨.

5. **캐시 무효화 정합성**:
   - `recalcStockAndUsage`를 호출하는 모든 정상적인 서버 트랜잭션(`refreshDashboard`, `executeMonthlyClosing`, `updateItemRecord`, `uploadItemMasterCSV`)은 작업 완료 시점에 `CacheManager.invalidateAll()`을 호출함.
   - 따라서 `getDashboardData` 응답에 `LAST_SYNC_TIMESTAMP` 기반 시각을 포함하더라도 캐시 무효화 정합성이 깨지지 않음.

6. **기존 테스트 및 단언**:
   - `tests/unit/perf-cache-paths.test.js:266-285`: `getDashboardData` 캐시 적중 및 무효화 검증.
   - `tests/e2e/login-bootstrap.spec.js:37`: `await expect(app.locator('#dashDate')).toContainText('최신 갱신일: ' + dash.date);` 단언 (응답 구조 변경 시 수정 필요).
   - `tests/e2e/sheet-sync-modal.spec.js:119`: `await expect(app.locator('#dashDate')).not.toHaveText('-');`
   - `tests/unit/system-commands-config.test.js`: `SYSTEM_ACTIONS` 정의 검증 (변경 없음).

---

## Hypotheses
- `PropertiesService.setProperty("LAST_SYNC_TIMESTAMP", ...)`를 `recalcStockAndUsage(ss)` 끝으로 옮기더라도, 마스터 시트 수천 행 쓰기 작업에 비해 스크립트 속성 쓰기 1회의 오버헤드는 측정 불가능한 수준(수 밀리초)이므로 성능에 영향이 없다.
- `submitSystemCommand`에서 `command === 'refreshDashboard' || command === 'incrementalSync'`인 경우에 한해 `clearTabData()`와 `loadDashboard()`를 호출하면, 사용자가 대시보드 탭에 머물러 있는 상태에서 즉시 새 KPI와 시각이 렌더링되고, 다른 탭으로 이동했을 때도 신선한 데이터가 보장된다.
- 헤더 시각 옆에 24시간 초과 경과를 알리는 배지를 배치하면 시스템 관리자가 스프레드시트 로그를 뒤지지 않고도 Apps Script 시간 기반 트리거 장애를 웹앱에서 즉각 파악할 수 있다.

---

## Business Context
- 대시보드의 '위험 품목' 및 '발주필요 품목' 통계는 호텔 식음/시설 자재의 발주 의사결정에 직결된다.
- 현재고(H열)는 매일 자정 자동 트리거 또는 관리자의 수동 통합갱신 시점에만 재계산된다.
- 사용자는 화면 상단의 "최신 갱신일: 2026-09-15 14:30"을 보고 "오후 2시 30분 기준 실시간 재고"로 오인할 위험이 크며, 실제 재고 계산은 전일 자정에 멈춰 있을 수 있다.
- 헤더 문구를 `재고 계산 기준: YYYY-MM-DD HH:mm`으로 수정하고 실제 계산 완료 시각을 표시함으로써 현업 실무자에게 데이터의 실제 기준 시점을 정확하게 전달해야 한다.

---

## Current System
- `getDashboardData`는 현재 시간(`new Date()`)을 포맷하여 `date` 필드에 담아 캐시하고 클라이언트에 전달한다.
- `recalcStockAndUsage`는 재계산 완료 시각을 별도로 기록하지 않으며, `refreshDashboard`만이 완료 시점에 `LAST_SYNC_TIMESTAMP`를 기록한다.
- 웹앱에서 「통합갱신」 또는 「신규 내역 취합」을 실행하면 서버에서 취합 및 재계산이 완료되고 서버 캐시가 삭제되지만, 클라이언트는 성공 토스트만 띄우고 화면 데이터를 다시 요청하지 않아 이전 상태가 유지된다.

---

## Root Cause / Diagnostic Logic
- **시각 표시의 정의 오류**: 데이터 생성 시각(재고 재계산 시점)이 아닌 데이터 인출 시각(대시보드 조회 시점)을 표시함.
- **기록 주체 분리 오류**: 재고를 실제로 계산하는 `recalcStockAndUsage`가 아닌 래퍼 함수 `refreshDashboard`에서만 속성을 기록하여, 다른 경로(월마감, 품목 수정 등)로 재고가 갱신된 시점이 누락됨.
- **클라이언트 후속 조치 부재**: `submitSystemCommand`에 통합 갱신 완료 후 탭 캐시 무효화 및 대시보드 재조회 콜백 연계가 누락됨.

---

## Requirements

### Functional
- [x] **1. 재고 재계산 시각 기록 이전 (`src/StockEngine.gs`, `src/Dashboard.gs`)**:
  - `src/StockEngine.gs` 내 `recalcStockAndUsage(ss)` 함수의 정상 실행 완료 지점(마스터 시트 쓰기 직후)에 `PropertiesService.getScriptProperties().setProperty("LAST_SYNC_TIMESTAMP", new Date().toISOString());` 기록 추가.
  - 스키마 검증 실패로 인한 조기 반환(`!_isMasterSchemaCurrent(masterSheet)`) 시에는 시각을 갱신하지 않음.
  - `src/Dashboard.gs:103`에 위치한 기존 `LAST_SYNC_TIMESTAMP` 기록 코드는 중복이므로 제거.
- [x] **2. `getDashboardData` 응답 구조 개편 (`src/WebApp.gs`)**:
  - `PropertiesService.getScriptProperties().getProperty("LAST_SYNC_TIMESTAMP")`를 조회.
  - 기존 `date` 필드는 **제거** (클라이언트 `renderDashboard` 외 사용하는 곳 없음).
  - 신규 필드 추가:
    - `recalcAt`: ISO 문자열 (`"2026-09-15T00:02:15.123Z"`) 또는 기록이 없으면 `null`.
    - `recalcAtText`: 스크립트 타임존(`Session.getScriptTimeZone()`) 기준 `"yyyy-MM-dd HH:mm"` 포맷 문자열 또는 기록이 없으면 `null`.
  - `src/WebApp.gs:53-58` 주석을 새 의미("재고가 마지막으로 재계산된 시각을 반환")로 갱신.
- [x] **3. 대시보드 헤더 렌더링 및 24시간 경과 경고 배지 (`src/Index.html`, `src/JS_UI.html`)**:
  - `src/Index.html:137-141`: `<span class="meta-badge">` 내 `#dashDate` 옆에 경고 배지 엘리먼트 추가:
    ```html
    <span id="dashStaleBadge" class="status-badge order" hidden title="마지막 재고 계산 후 24시간이 경과했습니다. 자정 트리거 상태를 확인하거나 통합 갱신을 실행하세요.">⚠️ 하루 이상 지난 계산</span>
    ```
  - `src/JS_UI.html:218`: `renderDashboard(data)` 개편:
    - `data.recalcAtText`가 존재하면: `document.getElementById('dashDate').textContent = '재고 계산 기준: ' + data.recalcAtText;`
    - 없으면: `document.getElementById('dashDate').textContent = '재고 계산 기준: 기록 없음';`
    - 경고 배지 판정:
      - `data.recalcAt`이 존재하고, `(Date.now() - new Date(data.recalcAt).getTime()) > 24 * 60 * 60 * 1000`인 경우 `#dashStaleBadge` 표시 (`hidden = false`).
      - 24시간 이내이거나 `recalcAt`이 없으면 숨김 (`hidden = true`).
- [x] **4. 통합 갱신 성공 후 대시보드 자동 재조회 (`src/JS_Config.html`)**:
  - `submitSystemCommand(command)` 내 `res.success` 처리 블록(508행)에 후처리 추가:
    ```javascript
    if (res.success) {
      showToast(res.message, 'success');
      if (command === 'refreshDashboard' || command === 'incrementalSync') {
        clearTabData();
        loadDashboard();
      }
    }
    ```
  - `clearTabData()`로 클라이언트의 모든 탭 캐시를 비우고, `loadDashboard()`를 즉시 호출하여 화면의 KPI, 알림 표, 헤더 시각을 최신 상태로 다시 그린다.
  - 다른 시스템 명령(권한 동기화, 시즌 검증, 백업 등) 실행 시에는 대시보드를 불필요하게 재조회하지 않는다.
- [x] **5. 기존 엔드포인트 및 시트 보존**:
  - `src/WebApp.gs:182` `getLastSyncTime(token)` 엔드포인트는 변경 없이 보존.
  - 스프레드시트 대시보드 시트의 C2 셀(`=TODAY()`, `SheetBuilder.gs:825-826`)은 건드리지 않음.
- [x] **6. 문서 갱신**:
  - `Docs/Architecture.md`: 캐시 계층 설명 및 대시보드 갱신 흐름 다이어그램 갱신.
  - `Docs/UIGuidelines.md`: 대시보드 헤더 시각 표기 표준 및 경고 배지 규칙 반영.

### Non-Functional
- [x] **성능 유지 (TASK-027 원칙)**:
  - 부트스트랩(`getBootstrapData`) 및 대시보드 조회 시 추가적인 스프레드시트 스캔 없이 `ScriptProperties` 단일 키 읽기(수 밀리초)만 수행.
  - `CACHE_KEYS.DASHBOARD` 캐시(TTL 10분) 구조 유지.
- [x] **타임존 일관성**:
  - 날짜 문자열 포맷팅은 서버(`Session.getScriptTimeZone()`, Asia/Seoul)에서 수행하여 클라이언트 기기의 현지 시간대 차이로 인한 표기 왜곡 방지.

---

## Constraints
- **Antigravity `/gas-tasks` 가드레일**: 본 Task 파일 생성 후 즉시 턴을 종료하며, 소스 코드(`.gs`, `.html`) 및 `Docs/` 문서를 직접 수정하지 않는다.
- **재고 엔진 불변**:
  - 재고 계산식, 안전재고/ROP 수식, FIFO 평가액 로직, 음수 재고 가드레일(TASK-011) 등 코어 알고리즘 변경 금지.
- **시트 구조 불변**: 시트 열 추가/삭제 없음. 마이그레이션 없음.

---

## Files to Inspect
- `src/Index.html`: 133-145행 대시보드 헤더 마크업
- `src/JS_UI.html`: 205-240행 `loadDashboard` 및 `renderDashboard`
- `src/JS_Config.html`: 500-519행 `submitSystemCommand`
- `src/WebApp.gs`: 50-110행 `getDashboardData`, 182-188행 `getLastSyncTime`
- `src/StockEngine.gs`: 19-210행 `recalcStockAndUsage`
- `src/Dashboard.gs`: 67-108행 `refreshDashboard`
- `tests/unit/perf-cache-paths.test.js`: `getDashboardData` 캐시 및 속성 테스트
- `tests/unit/bootstrap-client-logic.test.js`: 부트스트랩 클라이언트 로직
- `tests/e2e/login-bootstrap.spec.js`: 로그인 직후 대시보드 단언
- `tests/e2e/sheet-sync-modal.spec.js`: 시트 동기화 E2E

---

## Files to Modify
1. `src/StockEngine.gs`
   - `recalcStockAndUsage(ss)` 끝에 `LAST_SYNC_TIMESTAMP` 기록 추가
2. `src/Dashboard.gs`
   - `refreshDashboard` 103행의 중복 `LAST_SYNC_TIMESTAMP` 기록 제거
3. `src/WebApp.gs`
   - `getDashboardData`에서 `LAST_SYNC_TIMESTAMP` 읽어 `recalcAt`, `recalcAtText` 반환 및 기존 `date` 필드 제거
   - 주석 갱신
4. `src/Index.html`
   - 대시보드 헤더에 `#dashStaleBadge` 추가
5. `src/JS_UI.html`
   - `renderDashboard`에서 `recalcAtText` 표시 및 24시간 초과 시 경고 배지 노출 로직 구현
6. `src/JS_Config.html`
   - `submitSystemCommand` 성공 처리 시 `refreshDashboard`/`incrementalSync`에 대해 `clearTabData()` 및 `loadDashboard()` 호출
7. `tests/unit/perf-cache-paths.test.js`
   - `recalcStockAndUsage` 실행 후 `LAST_SYNC_TIMESTAMP` 속성 기록 단언
   - `getDashboardData` 응답의 `recalcAt` / `recalcAtText` 검증 및 `date` 부재 확인
8. `tests/e2e/login-bootstrap.spec.js`
   - 37행 `#dashDate` 단언 문구를 `'재고 계산 기준: ' + ...` 형식으로 갱신
9. `Docs/Architecture.md`
   - 캐시 계층 설명 및 대시보드 갱신 흐름 반영
10. `Docs/UIGuidelines.md`
    - 대시보드 헤더 표기 및 경고 배지 가이드라인 반영

---

## Files to Create
- 없음 (필요 시 클라이언트 렌더링 검증용 단위 테스트 파일 `tests/unit/dashboard-client-logic.test.js` 생성 가능)

---

## Implementation Plan

### 1. `recalcStockAndUsage`에 타임스탬프 기록 추가 (`src/StockEngine.gs`)
```javascript
  if (stockUpdates.length > 0) {
    masterSheet.getRange(3, 8, stockUpdates.length, 2).setValues(stockUpdates);
    masterSheet.getRange(3, MASTER_COLS.TOTAL_VALUE + 1, valueUpdates.length, 1).setValues(valueUpdates);
  }

  // 재고 재계산 완료 시각 기록 (대시보드 기준일의 SSOT)
  PropertiesService.getScriptProperties().setProperty("LAST_SYNC_TIMESTAMP", new Date().toISOString());
```

### 2. `refreshDashboard` 중복 기록 제거 (`src/Dashboard.gs`)
- 103행 `PropertiesService.getScriptProperties().setProperty("LAST_SYNC_TIMESTAMP", new Date().toISOString());` 라인 삭제 (84행의 `recalcStockAndUsage(ss)`가 이미 기록함).

### 3. `getDashboardData` 응답 필드 개편 (`src/WebApp.gs`)
```javascript
  const props = PropertiesService.getScriptProperties();
  const recalcIso = props.getProperty("LAST_SYNC_TIMESTAMP");
  let recalcAt = null;
  let recalcAtText = null;
  if (recalcIso) {
    const d = new Date(recalcIso);
    if (!isNaN(d.getTime())) {
      recalcAt = recalcIso;
      recalcAtText = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    }
  }

  const dashboard = {
    success: true,
    season: currentSeason,
    seasonMultiplier: seasonMultiplier,
    recalcAt: recalcAt,
    recalcAtText: recalcAtText,
    kpi: { total: totalItems, risk: riskCount, order: orderCount, normal: normalCount },
    alertItems: alertItems
  };
```

### 4. 마크업 및 클라이언트 렌더링 개편 (`src/Index.html`, `src/JS_UI.html`)
- `src/Index.html`:
  ```html
  <span class="meta-badge">
    <span class="meta-icon"><svg class="ico"><use href="#i-clock"/></svg></span>
    <span id="dashDate">-</span>
  </span>
  <span id="dashStaleBadge" class="status-badge order" hidden title="마지막 재고 계산 후 24시간이 경과했습니다. 자정 트리거 상태를 확인하거나 통합 갱신을 실행하세요.">⚠️ 하루 이상 지난 계산</span>
  ```
- `src/JS_UI.html`:
  ```javascript
  function renderDashboard(data) {
    var dateEl = document.getElementById('dashDate');
    var badgeEl = document.getElementById('dashStaleBadge');
    
    if (data.recalcAtText) {
      dateEl.textContent = '재고 계산 기준: ' + data.recalcAtText;
    } else {
      dateEl.textContent = '재고 계산 기준: 기록 없음';
    }

    if (badgeEl) {
      if (data.recalcAt) {
        var diffMs = Date.now() - new Date(data.recalcAt).getTime();
        badgeEl.hidden = !(diffMs > 24 * 60 * 60 * 1000);
      } else {
        badgeEl.hidden = true;
      }
    }
    // 나머지 KPI 및 알림 테이블 렌더링 유지...
  ```

### 5. `submitSystemCommand` 후속 갱신 연결 (`src/JS_Config.html`)
```javascript
  google.script.run
    .withSuccessHandler(function(res) {
      hideLoading();
      if (res.success) {
        showToast(res.message, 'success');
        if (command === 'refreshDashboard' || command === 'incrementalSync') {
          clearTabData();
          loadDashboard();
        }
      } else {
        showToast(res.message, 'warning');
      }
    })
```

---

## Migration Plan
- 시트 구조 변경 없음. 데이터 마이그레이션 없음. ("없음")

---

## Test Plan

### Unit Test
- `tests/unit/perf-cache-paths.test.js`:
  1. `recalcStockAndUsage` 단독 실행 후 `ScriptProperties`의 `LAST_SYNC_TIMESTAMP`가 유효한 ISO 문자열로 기록되는지 단언.
  2. `refreshDashboard` 실행 시 중복 기록 없이 `recalcStockAndUsage`에 의해 기록된 시각이 유지되는지 확인.
  3. `getDashboardData` 응답에 `date` 필드가 존재하지 않고, `recalcAt` 및 `recalcAtText`가 올바르게 반환되는지 확인.
  4. `LAST_SYNC_TIMESTAMP`가 없을 때 `recalcAt: null`, `recalcAtText: null` 반환 확인.
  5. `CacheManager.invalidateAll()` 전후 캐시 동작 확인.
- `tests/unit/dashboard-client-logic.test.js` (신규):
  1. `renderDashboard`: `recalcAtText`가 있을 때 `#dashDate`가 `'재고 계산 기준: 2026-09-15 00:02'`로 렌더링됨을 단언.
  2. `renderDashboard`: `recalcAtText`가 null일 때 `#dashDate`가 `'재고 계산 기준: 기록 없음'`으로 렌더링됨을 단언.
  3. `renderDashboard`: `recalcAt`이 25시간 전인 경우 `#dashStaleBadge.hidden === false`, 1시간 전인 경우 `hidden === true` 단언.
  4. `submitSystemCommand`: `refreshDashboard` 또는 `incrementalSync` 성공 시 `clearTabData()`와 `loadDashboard()`가 호출됨을 단언. 다른 커맨드에서는 호출되지 않음을 단언.

### E2E Test (Playwright)
- `tests/e2e/login-bootstrap.spec.js`:
  - 로그인 직후 `#dashDate`의 텍스트가 `'재고 계산 기준: ' + (dash.recalcAtText || '기록 없음')`와 일치함을 단언.
  - 콘솔 에러 및 미체결 렌더링 없음 확인.
- `tests/e2e/sheet-sync-modal.spec.js`:
  - 대시보드 탭에서 「시트 동기화」 완료 후 대시보드가 정상 갱신됨을 확인.
  - (게이트 `E2E_ALLOW_REFRESH=1` 활성화 시): 관리자로 「통합갱신」 모달 실행 → 완료 토스트 수신 후 대시보드 헤더 시각이 최신으로 갱신되고 KPI가 재렌더링됨을 검증.

---

## Regression Risk
- `getDashboardData` 응답에서 `date` 필드가 제거되므로, 혹시라도 프런트엔드나 테스트에서 `data.date`를 직접 참조하던 코드가 있다면 깨질 수 있음 (현재 확인된 곳은 `JS_UI.html` 1곳과 `login-bootstrap.spec.js` 1곳뿐이며, 둘 다 본 Task에서 함께 수정).
- 대시보드 탭 캐시가 10분간 유지되는 특성상, 사용자가 다른 탭에서 작업을 하더라도 「통합갱신」 시 `clearTabData()`가 호출되므로 데이터 불일치 위험 없음.

---

## Acceptance Criteria
- [x] `recalcStockAndUsage` 실행 시 `LAST_SYNC_TIMESTAMP` 속성이 ISO 문자열로 저장된다.
- [x] `refreshDashboard` 내 중복 타임스탬프 기록 코드가 제거된다.
- [x] `getDashboardData` 응답에 `date`가 없고, `recalcAt`(ISO 문자열)과 `recalcAtText`(`yyyy-MM-dd HH:mm`)가 반환된다.
- [x] 대시보드 헤더에 `재고 계산 기준: YYYY-MM-DD HH:mm`(또는 `기록 없음`)이 표시된다.
- [x] `recalcAt` 시각이 24시간을 초과한 경우 `#dashStaleBadge`(`⚠️ 하루 이상 지난 계산`)가 표시된다.
- [x] 웹앱에서 「통합갱신」 및 「신규 내역 취합」 실행 성공 시 `clearTabData()` 및 `loadDashboard()`가 자동으로 실행되어 화면이 갱신된다.
- [x] 단위 테스트(`perf-cache-paths.test.js`, 신규 클라이언트 테스트)가 모두 통과한다.
- [x] Playwright E2E 테스트(`login-bootstrap.spec.js`, `sheet-sync-modal.spec.js`)가 통과한다.
- [x] `Docs/Architecture.md` 및 `Docs/UIGuidelines.md`가 갱신된다.

---

## Human Approval Required
- **Production 배포**:
  - DEV 환경 검증 및 Human QA 통과 후, 명시적 승인을 받아 `git push origin main`으로 배포한다.

---

## Deployment Notes
- 배포 직후 기존 `LAST_SYNC_TIMESTAMP` 속성이 이미 존재하므로 정상 표기되며, 만약 속성이 없더라도 `재고 계산 기준: 기록 없음`으로 안전하게 폴백된다.

---

## Rollback Plan
- 배포 후 문제 발생 시 `git revert`로 이전 배포 커밋으로 원복 배포.

---

## Final Report
*(Claude Code · 2026-09-15 · DEV 배포 `npm run dev:push` 완료 · 로컬 커밋 · Production 미배포)*

착수 전 `git status`: Files to Modify 중 미리 수정된 파일 없음(Task 파일만 untracked). 핫픽스 `0c30e1f`(로컬 커밋, 미push) 위에 구현.

### 1. 구현 요약

| 요구사항 | 구현 | 근거 |
|---|---|---|
| FR-1 기록 이전 | `recalcStockAndUsage(ss)` 끝(마스터 H·I·X열 되쓰기 직후)에 `PropertiesService…setProperty(STOCK_RECALC_AT_PROPERTY, new Date().toISOString())`. 스키마 검사 조기 반환(`_isMasterSchemaCurrent` 실패)은 그 앞이라 기록하지 않는다. `refreshDashboard`의 옛 기록 줄 제거. 키 문자열은 `Config.gs`의 `STOCK_RECALC_AT_PROPERTY = "LAST_SYNC_TIMESTAMP"` 상수 하나로(StockEngine·WebApp `getDashboardData`·`getLastSyncTime`이 공유) | `src/StockEngine.gs`, `src/Dashboard.gs`, `src/Config.gs` |
| FR-2 응답 개편 | `getDashboardData`: 콜드 미스 때 속성 1회 읽어 `recalcAt`(ISO, 없거나 파싱 불가면 `null`)·`recalcAtText`(`Utilities.formatDate(…, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")` 또는 `null`). `date` 제거. 캐시 주석을 새 의미로 교체 | `src/WebApp.gs` |
| FR-3 헤더·배지 | `renderDashboard` → `renderDashboardRecalcAt(data)`: `재고 계산 기준: <recalcAtText | 기록 없음>`; `recalcAt`이 `DASHBOARD_STALE_MS`(24h)보다 오래됐을 때만 `#dashStaleBadge.hidden = false`(깨진 값은 숨김). 마크업 `<span id="dashStaleBadge" class="status-badge order" hidden title="…">하루 이상 지난 계산</span>`. `.status-badge`는 `display:inline-flex`라 `[hidden]`이 먹지 않아 `Stylesheet.html`의 `[hidden]` 덮어쓰기 목록에 `.status-badge[hidden]` 추가 | `src/Index.html`, `src/JS_UI.html`, `src/Stylesheet.html` |
| FR-4 자동 재조회 | `submitSystemCommand` 성공 분기에서 `command === 'refreshDashboard' || 'incrementalSync'`일 때 `clearTabData(); loadDashboard();`. 다른 명령은 그대로 | `src/JS_Config.html` |
| FR-5 보존 | `getLastSyncTime` 유지(상수만 사용), 시트 대시보드 C2 `=TODAY()` 불변 | |
| FR-6 문서 | `Docs/Architecture.md` 캐시 계층(대시보드 캐시에 recalcAt 동봉·무효화 정합) + 대시보드 갱신 흐름(기록 위치·웹앱 재조회·헤더 규칙). `Docs/UIGuidelines.md` §5에 헤더 시각 표기·오래된 계산 배지 규칙 | |
| NFR | 부트스트랩·대시보드 조회에 추가된 건 속성 읽기 1회뿐(캐시 히트 땐 0). 캐시 키·TTL 불변. 포맷은 서버 타임존 | |

### 2. 검증

- `npm test` — **25개 파일 전체 통과**(신규 1 포함). 새 검사는 구현 전 소스에서 실패함을 확인(클라이언트 7/10 실패, 서버 4건 실패).
  - `perf-cache-paths.test.js` +6: recalc 뒤 ISO 기록 / `refreshDashboard(true)` 실제 실행 중 그 키 쓰기 1회뿐 + `Dashboard.gs`에 옛 줄 없음 / 응답 키 집합 `alertItems·kpi·recalcAt·recalcAtText·season·seasonMultiplier·success`(`date` 없음)와 `formatDate` 인자(값·`Asia/Seoul`·`yyyy-MM-dd HH:mm`) / 기록 없음·깨진 값 → `null` / 캐시 히트는 같은 값, `invalidateAll` 뒤 새 값 / `runSystemCommand`가 통합 갱신 실패를 전달.
  - `monthly-closing.test.js` +1: 월마감 뒤 `LAST_SYNC_TIMESTAMP`가 ISO(전에는 통합 갱신만 기록).
  - `dashboard-client-logic.test.js`(신규, 10건): `JS_UI.html`·`JS_Config.html` `<script>`를 vm에 올려 — 헤더 문구(있음/없음/옛 응답 형태), 배지(25h 보임 · 1h/23h 숨김 · 깨진 값 숨김), 마크업 규약(`status-badge order`·기본 hidden·이모지 없음·`[hidden]` CSS), `renderDashboard`가 찾는 id가 전부 `Index.html`에 있음(가짜 DOM은 미선언 id에 null), `submitSystemCommand` 성공 시 `clearTabData → loadDashboard`(refreshDashboard·incrementalSync만, 다른 명령·실패·예외는 아님).
- Playwright(DEV):
  - `dashboard-recalc-time.spec.js`(신규): 로그인 직후 헤더 == 서버 `recalcAtText`, `recalcAt == getLastSyncTime().timestamp`, 배지는 나이와 일치, 25h 흉내 시 배지 표시·색 `rgb(217,119,6)`(`--order-text`); 768px 가로 오버플로우 없음. **게이트 `E2E_ALLOW_REFRESH=1`로 1회 실행**: 「통합갱신」 모달 → 갱신 → 토스트 → 헤더 시각이 실행 시각(16:5x → 17:0x)으로 바뀌고 KPI 재렌더 — **통과**(DEV 통합 갱신 ≈20초).
  - `login-bootstrap.spec.js`: 헤더 단언을 `재고 계산 기준: …`으로, 배지 상태 단언 추가 — 통과.
  - 전체 회귀 `npx playwright test` — **32 passed / 6 skipped / 0 failed**(16.9분, 38건). skip 6건 = 기존 게이트 5(실제 월마감 2 · perf 2 · 거래처 삭제 제약 1) + 이번 `E2E_ALLOW_REFRESH` 1(위에서 따로 실행해 통과). 기존 스펙 회귀 없음.
- 스크린샷(UIGuidelines §7): `AI/audits/UI-AUDIT-001/after/TASK-029/` — `E01`(1440 평상시) · `E02`(1440 배지) · `E03`(768 평상시) · `E04`(768 배지). 배지는 앰버 pill, 768에서 제목 줄 안에 들어간다.

### 3. 명세와 다른 점 / 판단

- **배지 문구에서 이모지(`⚠️`)를 뺐다** — `Docs/UIGuidelines.md` §3 "UI 텍스트에 이모지를 쓰지 않는다", §5 "상태는 색+텍스트 pill". 텍스트 `하루 이상 지난 계산`, 사유는 `title`.
- **`runSystemCommand`가 `refreshDashboard(true)`의 `{success:false}`(잠금 대기 실패·오류, TASK-023)를 그대로 돌려주게 했다.** 전에는 무시하고 항상 성공 토스트였는데, 이제 성공이면 대시보드를 다시 그리므로 실패를 성공으로 보이게 두면 갱신 안 된 값 위에 "완료"가 뜬다. 웹앱 토스트 문구(`🔄 대시보드 및 재고 갱신이 완료되었습니다.`)는 그대로.
- `Stylesheet.html`(`.status-badge[hidden]`), `tests/unit/monthly-closing.test.js`, `tests/e2e/negative-stock.spec.js`(renderDashboard 픽스처의 `date` → `recalcAt/recalcAtText`), `tests/e2e/README.md`는 Files to Modify에 없었지만 필요해서 고쳤다. 통합 갱신 E2E는 `sheet-sync-modal.spec.js`에 넣지 않고 새 `dashboard-recalc-time.spec.js`로 뒀다(시트 동기화 모달과 다른 모달·명령).
- 24시간 판정은 명세대로 `>` 24h다. 자정 트리거는 0~1시 사이 아무 때나 돌므로 어제보다 늦게 돌면 그 차이만큼(최대 ~1시간, 새벽) 배지가 잠깐 보일 수 있다 — 문제라면 임계값(`DASHBOARD_STALE_MS`)만 25h로 올리면 된다.

### 4. Human Approval Required

- Production 반영은 Human QA 뒤 `git push origin main`. 핫픽스 `0c30e1f`도 아직 미push라 함께 나간다.
- DEV에서는 검증을 위해 「통합갱신」을 실제로 2회 실행했다(첫 회는 E2E의 토스트 문구 불일치로 단언만 실패, 서버 갱신은 완료 — DEV 시트 취합·재계산, 되돌릴 필요 없음).

### 5. 배포 메모

- 시트 구조·마이그레이션 없음. Production에는 `LAST_SYNC_TIMESTAMP`가 이미 있어(자정 트리거가 매일 기록) 배포 직후부터 값이 보인다. 없더라도 `기록 없음`.
- 다음 자정 트리거 이후부터는 `recalcStockAndUsage` 경로(월마감·품목 초기재고 변경 포함)가 기록한다.
