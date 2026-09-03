# TASK-013: 재고 실사 양식(PDF·Excel) 출력 시 3단계 필터링 옵션(유·무·전체) 지원

## Objective

구매팀의 현장 실사 업무 효율화를 위해 웹앱 대시보드에서 제공하는 **재고 실사 양식 출력(PDF 인쇄 및 Excel 다운로드)** 기능에 **3단계 필터링 옵션**을 추가한다.
특히 초과 출고나 전산 미입고로 인해 발생하는 **음수(마이너스) 재고 품목도 '유(재고 있음)' 옵션에 반드시 포함**되어 실물 확인 및 재고 결손 조사가 누락되지 않도록 보장한다.

1. **옵션 1: '유' (재고 있음)** — 현재고가 존재하는 품목만 출력 (**중요: 음수 재고 포함**, `currentStock !== 0`)
2. **옵션 2: '무' (재고 없음)** — 현재고가 0인 품목만 출력 (`currentStock === 0`)
3. **옵션 3: '전체'** — 관리 대상 모든 품목 출력 (기존 전체 리스트업 동작 유지)

---

## Confirmed Facts

1. **웹앱 UI 진입점 및 실사 양식 트리거**:
   - `src/Index.html:81` (`showTab('dashboard')`) → `src/Index.html:120` (`#tab-dashboard`) 대시보드 탭 활성화.
   - `src/Index.html:135-141` 대시보드 헤더의 인쇄/다운로드 드롭다운 메뉴:
     - `printPhysicalCheckList()`: PDF 인쇄 호출 (`src/Index.html:138`)
     - `downloadPhysicalCheckListExcel()`: Excel 다운로드 호출 (`src/Index.html:139`)
   - `src/Index.html:520` 인쇄 전용 렌더링 컨테이너: `<div id="printContainer" class="print-container"></div>`
   - `src/Index.html:527` 스크립트 로드: `<?!= include('JS_BaseData') ?>`
   - `[진입점 호출 경로 증빙: src/Index.html:81 (showTab('dashboard')) → src/Index.html:120 (#tab-dashboard) → src/Index.html:135-141 (.dropdown) → src/Index.html:527 (include('JS_BaseData')) → src/JS_BaseData.html:72 (printPhysicalCheckList) & src/JS_BaseData.html:123 (downloadPhysicalCheckListExcel)]`

2. **공통 모달 컴포넌트 구조**:
   - `src/Index.html:58-67`에 `#modalOverlay`, `#modalTitle`, `#modalBody`, `#modalFooter`가 기정의되어 있음.
   - `src/JS_UI.html:94-103`에 `openModal(title, bodyHtml, footerHtml)` 및 `closeModal()` 함수가 활성화되어 있어 즉시 재사용 가능함.
   - `[진입점 호출 경로 증빙: src/Index.html:58-67 (#modalOverlay) → src/Index.html:523 (include('JS_UI')) → src/JS_UI.html:94 (openModal)]`

3. **데이터 소스 및 API 규격 (`src/ItemService.gs:8-46`)**:
   - `getItemMasterData(token)`는 `🗂️ 품목 마스터` 시트에서 활성 품목(`USAGE_STATUS !== '미사용'`) 목록을 조회하고, `CacheManager`에 캐싱함.
   - 반환되는 각 품목 객체는 `currentStock: row[MASTER_COLS.CURRENT_STOCK]`을 포함하고 있음.
   - 현재 `printPhysicalCheckList()`와 `downloadPhysicalCheckListExcel()` 모두 `google.script.run...getItemMasterData(getToken())`를 호출하여 전체 품목을 받아온 뒤 필터링 없이 그대로 출력함 (`src/JS_BaseData.html:120, 189`).

4. **음수 재고 허용 체계 (TASK-011)**:
   - TASK-011에서 선출고 및 실사 결손 파악을 위해 품목 마스터와 대시보드에 음수 현재고(예: `-5`) 표기를 공식 지원함 (`Docs/BusinessRules.md:28`).
   - 현재고 값은 `number` 또는 빈 값(`""`, `null`)일 수 있으며, 음수 재고는 `currentStock < 0`으로 유지됨.

5. **E2E 테스트 의존성 (`tests/e2e/basedata-excel.spec.js:34-60`)**:
   - Playwright E2E에서 대시보드 `인쇄/다운로드` 드롭다운의 `실사 양식 다운로드` 버튼을 클릭하고, 파일명이 `^재고실사조사표_\d{8}\.xlsx$` 패턴인지 검증함.
   - 다운로드 완료 후 파일 크기 > 1000 byte 및 ZIP 시그니처(`PK`)를 확인하고 있음.

---

## Hypotheses

1. **클라이언트 사이드 필터링 채택**:
   - `getItemMasterData(token)`는 이미 전체 품목 데이터를 메모리/캐시에서 한 번에 가져오므로, 클라이언트(`JS_BaseData.html`)에서 배열 필터링(`filterPhysicalCheckItems`)을 수행하는 것이 추가 서버 왕복(RTT) 및 불필요한 백엔드 API 변경 없이 가장 빠르고 안정적이다.
2. **모달 기반 옵션 선택 UX**:
   - 드롭다운에 6개 세부 버튼을 나열하는 방식은 모바일/태블릿 터치 조작 시 닫힘 현상(`:hover` 불안정)을 유발할 수 있으므로, 드롭다운 클릭 시 필터 선택 모달(`openPhysicalCheckModal`)을 띄우고 그 안에서 [PDF 인쇄] / [Excel 다운로드]를 선택하게 하는 것이 가장 직관적이고 오류가 적다.

---

## Business Context

- 호텔 및 리조트 구매팀/자재관리 현장에서는 정기 또는 수시로 창고 재고 실사(Physical Inventory Count)를 진행한다.
- **'유' (재고 있음, 음수 포함)**: 실사팀이 실제로 재고가 있다고 장부에 잡혀 있거나, 전산보다 먼저 물건이 나간 품목(음수 결손 품목)을 우선 점검하고자 할 때 필수적이다.
- **'무' (재고 없음)**: 재고가 0으로 잡혀 있는데 창고에 유령 실물이 방치되어 있는지, 혹은 안전재고 발주가 필요한지 집중 점검할 때 사용한다.
- **'전체'**: 월마감 정기 전수 실사 등 전체 품목을 빠짐없이 대조할 때 사용한다.
- 상세 비즈니스 규칙은 [BusinessRules.md](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/Docs/BusinessRules.md) 참조.

---

## Current System

- 대시보드의 `🖨️ 인쇄/다운로드 ▼` 버튼에서 `🖨️ 실사 양식 인쇄 (PDF)` 또는 `📥 실사 양식 다운로드 (Excel)` 클릭 시, 필터 선택 없이 관리 대상 전체 품목(`items`)이 무조건 100% 출력된다.
- 0재고 품목과 재고 보유 품목이 혼재되어 실사 목록이 불필요하게 길어지고, 현장 실사자가 종이 낭비 및 작업 비효율을 겪고 있다.

---

## Root Cause / Diagnostic Logic

해당 없음 (현업 업무 편의 향상을 위한 신규 기능 개선 요청).

---

## Requirements

### Functional

1. **실사 대상 품목 필터링 로직 (`filterPhysicalCheckItems(items, filterOption)`)**:
   - 수량 정규화 헬퍼 함수 구현:
     - `val === '' || val === null || val === undefined`이면 `0`
     - 그 외 `Number(val)`, `isNaN`이면 `0`
   - **옵션 1: `'exist'` ('유')**:
     - `stock !== 0` (즉, `stock > 0 || stock < 0`)
     - **중요**: 음수 재고(`stock < 0`)가 반드시 포함되어야 함.
   - **옵션 2: `'zero'` ('무')**:
     - `stock === 0`
   - **옵션 3: `'all'` ('전체')**:
     - 모든 품목 (`filterOption === 'all'` 또는 기본값)
   - 필터링 결과 품목 수가 0건인 경우:
     - 인쇄/다운로드를 중단하고 경고 토스트 노출: `"선택한 조건에 해당하는 품목이 없습니다."`

2. **실사 양식 옵션 선택 모달 (`openPhysicalCheckModal(defaultAction)`)**:
   - `src/JS_UI.html`의 `openModal()`을 활용하여 대화상자 표시.
   - **모달 타이틀**: `📋 재고 실사 양식 출력`
   - **모달 바디 (옵션 라디오 그룹)**:
     - 🔘 **재고 '유' (추천)**: `현재고가 있는 품목만 출력 (음수 재고 포함)` (기본 선택값 권장)
     - 🔘 **재고 '무'**: `현재고가 0인 품목만 출력`
     - 🔘 **전체 품목**: `관리 대상 모든 품목 출력`
     - ※ 안내 텍스트: `* 음수(마이너스) 재고는 선출고 및 실사 결손 품목으로 '유' 옵션에 포함됩니다.`
   - **모달 푸터 버튼 구성**:
     - `[취소]` (`closeModal()`)
     - `[🖨️ PDF 인쇄]` (`submitPhysicalCheckExport('pdf')`)
     - `[📥 Excel 다운로드]` (`submitPhysicalCheckExport('excel')`)

3. **UI 진입점 연동 (`src/Index.html:135-141`)**:
   - 대시보드 상단 `🖨️ 인쇄/다운로드 ▼` 드롭다운에서:
     - `🖨️ 실사 양식 인쇄 (PDF)` 클릭 시 모달 열기 (`openPhysicalCheckModal('pdf')`)
     - `📥 실사 양식 다운로드 (Excel)` 클릭 시 모달 열기 (`openPhysicalCheckModal('excel')`)
   - 모달에서 선택한 필터 라디오 값을 읽어 해당 인쇄/다운로드 함수 실행.

4. **PDF 인쇄 개선 (`printPhysicalCheckList(filterOption)`)**:
   - 선택된 `filterOption`으로 품목 목록 필터링.
   - 인쇄 상단 헤더의 일자 옆에 선택 구분 표시:
     - 예: `출력일자: 2026년 9월 2일 | 구분: 재고 '유' (음수 포함) (125건)`
   - 음수 재고(`currentStock < 0`)의 경우 전산재고 셀을 눈에 띄게 시각화(예: 붉은색 글씨/굵게 `color: #dc2626; font-weight: bold;`).

5. **Excel 다운로드 개선 (`downloadPhysicalCheckListExcel(filterOption)`)**:
   - 선택된 `filterOption`으로 품목 목록 필터링.
   - 파일명 생성:
     - 기본 호환성 유지: `재고실사조사표_YYYYMMDD.xlsx` (또는 옵션 포함 시 `tests/e2e/basedata-excel.spec.js` 정규식 업데이트).
   - 음수 재고 수량이 정상적인 음수 숫자로 엑셀 셀에 기입되도록 보장 (`item.currentStock`가 음수일 때 `0`으로 치환되지 않음).

### Non-Functional

- **응답 속도**: 클라이언트 측 필터링으로 필터 선택 후 100ms 이내에 즉각 인쇄창 호출 또는 다운로드 트리거.
- **반응형 모바일 지원**: 터치 기기에서도 모달 내 라디오 버튼과 푸터 액션 버튼이 시원하고 누르기 쉽게 스타일링.
- **코드 안전성**: `filterOption` 인자가 전달되지 않거나 유효하지 않은 경우 안전하게 `'all'`로 폴백.

---

## Constraints

1. **에이전트 역할 경계 (`.agents/rules/00_roles-and-workflow.md`)**:
   - Antigravity는 본 Task 명세 생성 후 즉시 턴을 종료하며 소스 코드를 직접 수정하지 않는다. 구현은 Claude Code가 수행한다.
2. **사장 파일 접근 금지**:
   - `src/JS_Master.html`은 사장된 파일이므로 절대 수정하지 않는다.
3. **서버 API 시그니처 보존**:
   - `ItemService.gs`의 `getItemMasterData(token)` 시그니처 및 반환 스키마를 변경하지 않고 유지한다.
4. **기존 JS 함수 하위 호환성**:
   - 외부나 테스트에서 `printPhysicalCheckList()` 또는 `downloadPhysicalCheckListExcel()`을 인자 없이 호출하더라도 오류 없이 기본값(`'all'`)으로 동작해야 한다.

---

## Files to Inspect

- [src/Index.html](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Index.html) (Line 135-141 드롭다운 메뉴, Line 58-67 모달 컨테이너)
- [src/JS_BaseData.html](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/JS_BaseData.html) (Line 70-190 실사 인쇄 및 엑셀 다운로드 함수)
- [src/JS_UI.html](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/JS_UI.html) (Line 94-105 `openModal`, `closeModal`)
- [tests/e2e/basedata-excel.spec.js](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/tests/e2e/basedata-excel.spec.js) (Line 34-60 실사 엑셀 다운로드 E2E)

---

## Files to Modify

- [src/Index.html](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Index.html)
  - 대시보드 드롭다운 버튼 onclick 핸들러 수정: `openPhysicalCheckModal('pdf')`, `openPhysicalCheckModal('excel')` 연결
- [src/JS_BaseData.html](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/JS_BaseData.html)
  - `openPhysicalCheckModal(defaultAction)` 신규 구현
  - `submitPhysicalCheckExport(actionType)` 구현
  - `filterPhysicalCheckItems(items, filterOption)` 헬퍼 구현
  - `printPhysicalCheckList(filterOption)` 필터 파라미터 적용 및 음수 재고 강조
  - `downloadPhysicalCheckListExcel(filterOption)` 필터 파라미터 적용
- [tests/e2e/basedata-excel.spec.js](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/tests/e2e/basedata-excel.spec.js)
  - 모달 대화상자 인터랙션 반영 (드롭다운 클릭 → 모달 열림 → 라디오 확인 → Excel 다운로드 클릭)

---

## Files to Create

- [tests/unit/physical-check-filter.test.js](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/tests/unit/physical-check-filter.test.js)
  - `filterPhysicalCheckItems`의 '유', '무', '전체' 3단계 필터링 단위 테스트
  - 양수/음수/0재고, 문자열 숫자, 빈 문자열, null/undefined에 대한 방어 로직 검증

---

## Implementation Plan

### 1. 필터링 함수 구현 (`src/JS_BaseData.html`)

```javascript
function parseStockValue(val) {
  if (val === null || val === undefined || val === '') return 0;
  var num = Number(val);
  return isNaN(num) ? 0 : num;
}

function filterPhysicalCheckItems(items, filterOption) {
  if (!items || !Array.isArray(items)) return [];
  var opt = filterOption || 'all';

  if (opt === 'exist') {
    // 옵션 1. '유': 현재고가 있는 품목 (중요: 음수 재고도 포함)
    return items.filter(function(item) {
      var stock = parseStockValue(item.currentStock);
      return stock !== 0; // stock > 0 || stock < 0
    });
  } else if (opt === 'zero') {
    // 옵션 2. '무': 현재고가 0인 품목
    return items.filter(function(item) {
      var stock = parseStockValue(item.currentStock);
      return stock === 0;
    });
  } else {
    // 옵션 3. '전체': 모든 품목
    return items;
  }
}
```

### 2. 옵션 선택 모달 UI (`src/JS_BaseData.html`)

```javascript
function openPhysicalCheckModal(defaultAction) {
  var action = defaultAction || 'pdf';
  var body = 
    '<div style="padding: 4px 0;">' +
    '  <p style="margin-bottom: 16px; color: var(--text-secondary); font-size: 0.95rem;">' +
    '    출력할 품목의 재고 상태를 선택해 주세요.' +
    '  </p>' +
    '  <div style="display: flex; flex-direction: column; gap: 12px;">' +
    '    <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card);">' +
    '      <input type="radio" name="checkFilterOption" value="exist" checked style="margin-top: 3px;">' +
    '      <div>' +
    '        <div style="font-weight: 600; color: var(--navy-800);">재고 \'유\' (재고 있는 품목만)</div>' +
    '        <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">현재고가 있는 품목만 출력 (<strong style="color: var(--risk);">음수 결손 재고 포함</strong>)</div>' +
    '      </div>' +
    '    </label>' +
    '    <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card);">' +
    '      <input type="radio" name="checkFilterOption" value="zero" style="margin-top: 3px;">' +
    '      <div>' +
    '        <div style="font-weight: 600; color: var(--navy-800);">재고 \'무\' (재고 0 품목만)</div>' +
    '        <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">현재고가 0인 품목만 출력</div>' +
    '      </div>' +
    '    </label>' +
    '    <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card);">' +
    '      <input type="radio" name="checkFilterOption" value="all" style="margin-top: 3px;">' +
    '      <div>' +
    '        <div style="font-weight: 600; color: var(--navy-800);">전체 품목</div>' +
    '        <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">재고 유·무와 관계없이 관리 대상 전체 품목 출력</div>' +
    '      </div>' +
    '    </label>' +
    '  </div>' +
    '</div>';

  var footer = 
    '<button class="btn btn-outline" onclick="closeModal()">취소</button>' +
    '<button class="btn btn-primary" onclick="submitPhysicalCheckExport(\'pdf\')">🖨️ PDF 인쇄</button>' +
    '<button class="btn btn-success" onclick="submitPhysicalCheckExport(\'excel\')">📥 Excel 다운로드</button>';

  openModal('📋 재고 실사 양식 출력', body, footer);
}

function submitPhysicalCheckExport(actionType) {
  var selected = document.querySelector('input[name="checkFilterOption"]:checked');
  var filterOption = selected ? selected.value : 'all';
  closeModal();

  if (actionType === 'excel') {
    downloadPhysicalCheckListExcel(filterOption);
  } else {
    printPhysicalCheckList(filterOption);
  }
}
```

### 3. 인쇄 및 엑셀 다운로드 함수 보강

- `printPhysicalCheckList(filterOption)`:
  - `var filtered = filterPhysicalCheckItems(items, filterOption);`
  - `if (filtered.length === 0) { showToast('선택한 조건에 해당하는 품목이 없습니다.', 'warning'); return; }`
  - 필터 라벨 결정: `var label = filterOption === 'exist' ? "재고 '유' (음수 포함)" : (filterOption === 'zero' ? "재고 '무' (0 재고)" : "전체");`
  - 제목 아래 `출력일자: YYYY년 M월 D일 | 구분: ${label} (${filtered.length}건)` 출력
  - 음수 재고 품목 행 또는 재고 셀: `<td style="font-weight:bold; ${stock < 0 ? 'color:#dc2626;' : ''}">${stock}</td>`
- `downloadPhysicalCheckListExcel(filterOption)`:
  - `var filtered = filterPhysicalCheckItems(items, filterOption);`
  - `if (filtered.length === 0) { showToast('선택한 조건에 해당하는 품목이 없습니다.', 'warning'); return; }`
  - `filtered.forEach(...)`로 엑셀 행 구성
  - `item.currentStock`가 음수일 때도 그대로 수치 입력 (`stock = parseStockValue(item.currentStock);`)

---

## Migration Plan

없음 (스프레드시트 구조 변경 없음).

---

## Test Plan

### Unit Test (`tests/unit/physical-check-filter.test.js`)

Node 환경에서 `filterPhysicalCheckItems` 로직을 시뮬레이션:
1. **Mock 데이터셋**:
   - 품목 A: `currentStock: 10` (양수 재고)
   - 품목 B: `currentStock: -3` (초과출고/음수 재고)
   - 품목 C: `currentStock: 0` (0 재고)
   - 품목 D: `currentStock: ""` (미입력/0 간주)
   - 품목 E: `currentStock: null` (null/0 간주)
   - 품목 F: `currentStock: "25"` (문자열 양수)
   - 품목 G: `currentStock: "-7"` (문자열 음수)
2. **테스트 케이스**:
   - `filterOption === 'exist'`: A(10), B(-3), F(25), G(-7) 포함 (총 4건). C, D, E 배제 검증. 특히 **음수 재고(B, G)가 반드시 포함**되는지 단언.
   - `filterOption === 'zero'`: C(0), D(""), E(null) 포함 (총 3건). A, B, F, G 배제 검증.
   - `filterOption === 'all'` 또는 undefined: 7건 전체 포함 검증.
   - 빈 배열 또는 잘못된 입력 방어 검증.

### E2E Test (Playwright: `tests/e2e/basedata-excel.spec.js`)

1. 대시보드 진입 후 `🖨️ 인쇄/다운로드` 드롭다운 클릭
2. `실사 양식 다운로드 (Excel)` 클릭
3. `📋 재고 실사 양식 출력` 모달이 표시되는지 확인 (`expect(app.getByText('📋 재고 실사 양식 출력')).toBeVisible()`)
4. 라디오 옵션 선택 (예: `재고 '유'`)
5. 모달 내 `Excel 다운로드` 버튼 클릭
6. 브라우저 다운로드 이벤트 발생 수신 및 파일명 정규식 검증
7. 다운로드된 xlsx 파일의 ZIP 매직넘버(`PK`) 및 정상 크기(> 1000 bytes) 검증

---

## Regression Risk

1. **기존 E2E 테스트 스텝 변경**:
   - 기존에는 `실사 양식 다운로드` 버튼 클릭 즉시 다운로드가 시작되었으나, 모달이 추가되면 모달 내 확인 버튼 클릭 스텝이 추가되어야 한다.
   - `tests/e2e/basedata-excel.spec.js`를 함께 업데이트하여 E2E 스위트가 안정적으로 통과되도록 보장한다.
2. **하위 호환성**:
   - `downloadPhysicalCheckListExcel()`이 인자 없이 호출되더라도 `filterOption`의 기본값이 `'all'`로 작동하여 기존 스크립트 호출에 지장이 없도록 방어한다.

---

## Acceptance Criteria

- [ ] 실사 양식 옵션 선택 모달(`openPhysicalCheckModal`)이 구현되어 대시보드 인쇄/다운로드 메뉴에서 호출된다.
- [ ] '유' 옵션 선택 시 현재고가 0이 아닌 품목(양수 및 음수 재고)만 정확히 추출된다.
- [ ] '무' 옵션 선택 시 현재고가 0인 품목(0, 빈값, null)만 정확히 추출된다.
- [ ] '전체' 옵션 선택 시 관리 대상 품목이 전부 추출된다.
- [ ] PDF 인쇄 시 헤더에 선택된 필터 구분명 및 대상 품목 건수가 표기된다.
- [ ] PDF 인쇄 시 음수 재고 품목의 수량이 붉은색 강조 스타일로 가독성 있게 표시된다.
- [ ] Excel 다운로드 시 선택된 조건의 품목만 시트에 포함되어 다운로드된다.
- [ ] 조건에 해당하는 품목이 0건일 경우 인쇄/다운로드가 중단되고 적절한 안내 토스트가 표시된다.
- [ ] `npm run test:unit` 실행 시 `physical-check-filter.test.js`를 포함한 모든 단위 테스트가 통과한다.
- [ ] `npm run test:e2e` 실행 시 실사 엑셀 다운로드 E2E 테스트가 통과한다.

---

## Human Approval Required

없음 (현업 요구사항에 부합하는 클라이언트 UI/기능 개선 작업).

---

## Deployment Notes

- 구현 완료 후 `npm run dev:push`로 DEV 환경에 배포하여 모달 레이아웃, PDF 인쇄 미리보기, Excel 다운로드 결과물을 육안 및 E2E로 검증한다.

---

## Rollback Plan

- Git 커밋 되돌리기: `git revert HEAD`
- DEV 환경 원상 복구 배포: `npm run dev:push`

---

## Final Report

**구현 완료 (Claude Code) — 2026-09-02**

### 변경 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/JS_BaseData.html` | `parseStockValue()` / `filterPhysicalCheckItems()` / `physicalCheckFilterLabel()` / `openPhysicalCheckModal()` / `submitPhysicalCheckExport()` 신규. `printPhysicalCheckList(filterOption)` · `downloadPhysicalCheckListExcel(filterOption)`에 필터 파라미터·0건 가드·음수 강조 적용 |
| `src/Index.html` | 대시보드 드롭다운 onclick을 `openPhysicalCheckModal('pdf')` / `openPhysicalCheckModal('excel')`로 교체 |
| `tests/unit/physical-check-filter.test.js` | 신규 — 16건 |
| `tests/e2e/basedata-excel.spec.js` | 모달 인터랙션 반영 + 필터 실효성 검증 + PDF 인쇄 렌더링 검증 2건 추가 |

### 착수 전 교차 검증

`Files to Modify` 3개 중 `tests/e2e/basedata-excel.spec.js`만 수정 상태였으나, diff 확인 결과 TASK-007(E2E 다운로드 headless 실패) 잔여분이었고 TASK-013 관련 코드(`openPhysicalCheckModal` 등)는 선구현되지 않았다. 역할 이탈 아님.

명세의 `Confirmed Facts`에 TASK-012에서 신설한 `[진입점 호출 경로 증빙]`이 포함되어 있어, 해당 라인들을 직접 재확인했다 — 드롭다운(`Index.html:139-140`), `printPhysicalCheckList`(`JS_BaseData.html:72`), `downloadPhysicalCheckListExcel`(`JS_BaseData.html:123`), `openModal`(`JS_UI.html:94`) 모두 명세대로였다.

### 명세 대비 구현 판단 (4건)

1. **`btn-success` / `var(--text-muted)` → 이 프로젝트에 실재하는 토큰으로 교체**
   명세의 모달 샘플 코드가 쓴 두 토큰이 **`Stylesheet.html`에 존재하지 않는다.**
   실재하는 버튼 클래스는 `btn-primary` / `btn-outline` / `btn-gold` / `btn-danger`이고, 색 변수는 `--text-secondary`다.
   그대로 넣었으면 Excel 버튼이 스타일 없는 맨 버튼으로, 설명 텍스트가 상속색으로 렌더링됐을 것이다.
   → Excel 버튼은 `btn-gold`, 설명 텍스트는 `--text-secondary`를 사용했다.

2. **`openPhysicalCheckModal(defaultAction)`의 인자에 실제 역할 부여**
   명세 샘플은 `var action = defaultAction || 'pdf';`로 변수를 만들어 놓고 **어디에서도 쓰지 않는다**(dead code).
   사용자가 드롭다운에서 "Excel"을 눌렀는데 모달의 강조 버튼이 PDF면 의도가 끊긴다.
   → 누른 포맷의 버튼을 `btn-primary`로 강조하도록 사용했다. 두 버튼을 모두 두는 명세 요구는 그대로 지켰다.

3. **인쇄 출력에 `escapeHtml()` 적용**
   기존 인쇄 코드는 `item.code`·`item.name` 등을 이스케이프 없이 `innerHTML`에 넣고 있었다.
   어차피 다시 쓰는 코드라 함께 정리했다(`escapeHtml`은 `JS_UI.html:176`에 이미 있고 include되어 있다).

4. **인쇄 시 전산재고를 `parseStockValue()`로 정규화 — 표시 동작이 바뀐다**
   기존에는 `item.currentStock`를 그대로 출력해 빈 값이면 **빈 칸**으로 인쇄됐다.
   실사 조사표에서 전산재고가 빈 칸이면 "0인지 미확인인지" 구분이 안 되므로 `0`으로 찍히게 했다.
   필터의 '무' 분류 기준(빈 값 = 0)과도 일치한다. **의도된 표시 변경이므로 QA 시 확인 필요.**

### 명세 외 추가 반영 (E2E 2건)

명세의 E2E 계획은 "모달이 뜨고 → 라디오 고르고 → 다운로드되고 → 파일이 유효한 xlsx인가"까지다.
그런데 이것만으로는 **필터가 실제로 걸렸는지 알 수 없다.** 필터를 통째로 무시해도 유효한 xlsx는 나오기 때문이다.
수용 기준의 핵심(음수 포함, 조건별 정확 추출, 인쇄 헤더, 붉은 강조)이 검증 밖에 남으므로 2건을 추가했다.

- **필터 실효성 검증**: 배포된 `filterPhysicalCheckItems`를 DEV 실데이터(4292건)에 적용해
  `'유'(4) + '무'(4288) = 전체(4292)` 파티션 성립, 상호 누출 0건을 단언한다.
  DEV에 음수 재고가 0건일 수 있어 음수 단정이 공허하게 통과하는 것을 막기 위해,
  **배포된 함수에 음수(숫자 `-5`·문자열 `'-7'`)를 직접 물리는 probe**를 함께 넣었다.
- **PDF 인쇄 렌더링 검증**: `window.print`를 스텁하고 서버 응답을 합성 데이터(음수/양수/0)로 바꿔
  실제 `printPhysicalCheckList('exist')`를 실행한 뒤 `#printContainer`를 검사한다.
  헤더의 `구분: 재고 '유' (음수 포함)` · `(2건)` 표기, 0 재고 제외, **음수 셀에만 `#dc2626` 적용**을 단언한다.

### 테스트 결과

**단위 테스트 — `npm test` 8개 파일 전체 통과** (신규 `physical-check-filter.test.js` 16건 포함)

로직을 테스트에 복사하지 않고 `src/JS_BaseData.html`의 `<script>` 블록을 vm 샌드박스에 로드해
**배포되는 실제 함수**를 호출한다. 소스가 바뀌면 테스트도 따라간다.

- `parseStockValue`: 숫자·문자열 숫자(음수 포함) 보존, 빈 값·null·undefined·비숫자 → 0
- `'유'`: A(10)·B(-3)·F("25")·G("-7") 4건 추출, **음수 2건 포함 단언**, 0·빈값·null 배제
- `'무'`: C(0)·D("")·E(null) 3건, 양수·음수 전부 배제
- `'전체'` / 미지정 / 알 수 없는 값: 7건 폴백
- `'유'`와 `'무'`의 배타성 + 합집합 = 전체
- 잘못된 입력(`[]`, `null`, `undefined`, `{}`, 문자열, 0) 방어, 원본 배열 불변
- 출력 함수를 인자 없이 호출해도 서버 호출까지 도달(하위 호환)

**E2E — DEV 배포 후 `basedata-excel.spec.js` 4 passed**

| 검증 | 결과 |
|------|------|
| 드롭다운 → 모달 오픈, 타이틀·옵션 3개·기본값 `'유'` | ✅ |
| 모달에서 Excel 다운로드 → 파일명 `재고실사조사표_YYYYMMDD.xlsx`, ZIP 시그니처, 모달 닫힘 | ✅ |
| 실데이터 필터 파티션 `4 + 4288 = 4292`, 누출 0건, 음수 probe | ✅ |
| 인쇄 헤더 구분·건수, 0 재고 제외, 음수만 붉은 강조 | ✅ |

전체 스위트(`npm run test:e2e`) **13 passed / 2 skipped**(skip 2건은 월마감 승인 게이트) — 회귀 없음.

### 검증되지 않은 항목 (솔직한 평가)

- **실제 인쇄 다이얼로그 / 종이 출력 레이아웃**: `window.print()`를 스텁했으므로 렌더링된 HTML까지만 검증했다.
  실제 인쇄 미리보기의 페이지 나눔·여백은 육안 확인이 필요하다.
- **다운로드된 xlsx의 내용**: ZIP 시그니처와 크기만 확인했고 시트 셀 값은 파싱하지 않았다
  (Node에 xlsx 파서 의존성이 없다). 필터 적용 여부는 위 실효성 테스트가 대신 보증한다.
- **0건 토스트**: 단위 테스트로 필터가 0건을 반환하는 경로는 덮었으나,
  실제 토스트 노출은 DEV에서 0건이 되는 조건을 만들기 어려워 E2E로 확인하지 못했다.
- **모바일 터치 레이아웃**: 명세의 비기능 요구(터치 기기 조작성)는 데스크톱 Chromium E2E로 확인할 수 없다.

### 배포

DEV 반영 완료(`npm run dev:push`). 시트 구조 변경이 없어 마이그레이션은 불필요하다.
Production은 Human 승인 후 `git push origin main`.

### 롤백

`git checkout HEAD -- src/JS_BaseData.html src/Index.html tests/e2e/basedata-excel.spec.js`
후 `npm run dev:push`. 신규 단위 테스트 파일은 삭제.
