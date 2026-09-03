# TASK-011: 재고조정 목적의 음수 재고 표시 지원 및 회계·월마감 가드레일 구축

## Objective

구매팀의 실무적 요구(전산 입고 지연에 따른 선출고분 식별, 실사 차이 결손 수량 파악)를 충족하기 위해 스프레드시트 품목 마스터(`🗂️ 품목 마스터`) 및 웹앱 대시보드에 **현재고 수량의 음수(마이너스) 표시를 허용**하되, 수식 연쇄 오류·회계 자산 마이너스 왜곡·월마감 시 음수 증발 사고를 원천 방지하는 **4대 안전장치(재고자산 0원 하한 보장, 월마감 차단 가드레일, 적정발주량 수식 방어, 음수 시각화 경고)**를 구축한다.

> **시스템 구조 확인**: 품목 마스터는 웹앱 뷰가 존재하지 않으며, 구글 스프레드시트(`🗂️ 품목 마스터` 시트)에서 100% 직접 관리된다. 웹앱에는 대시보드의 '위험·발주필요 품목 테이블'(`alertTableBody`)에만 품목 현재고가 노출된다.

## Confirmed Facts

1. **현재고 0 강제 클램핑 (`src/StockEngine.gs:165`)**:
   - `StockEngine.recalcStockAndUsage()`에서 현재고를 산출할 때 `const currentStock = Math.max(0, initStock + (stockMap[code] || 0));`로 처리되어 있어, 총 출고량이 입고량을 초과하더라도 시트와 웹앱 대시보드에는 무조건 `0`으로 표시된다.
2. **평가액 음수 왜곡 위험 (`src/StockEngine.gs:173-180`)**:
   - FIFO 계산 시 입고 로트가 전혀 없던 품목이 초과 출고된 경우 `unitPrice * currentStock`로 합계금액(W열)을 계산하므로, `currentStock`가 음수이면 재고자산 평가액이 음수(마이너스 자산)로 기록될 수 있다.
3. **월마감 시 음수 재고 증발 취약점 (`src/Archive.gs:226-239, 254-257`)**:
   - `executeMonthlyClosing()`의 FIFO 잔여 로트 이월 로직은 `lot.remaining > 0`인 경우에만 익월 1일자 이월 행(`SYS-...`)을 생성한다.
   - 음수 재고 상태에서 월마감이 실행되면 과거 입출고 내역은 아카이브 시트로 잘려나가고, 이월 행은 0건 생성되며, 마스터 시트 초기재고(G열)는 `0`으로 리셋된다.
   - 따라서 익월 1일 시점에 음수 결손 수량(예: -5개)이 흔적도 없이 사라지고 `0개`로 둔갑하여 실물 결손이 장부에서 영구 유실된다.
4. **적정발주량 수식 특성 (`src/SheetBuilder.gs:322`)**:
   - P3 공식: `=ARRAYFORMULA(IF(A3:A="", "", IF((I3:I * M3:M) - H3:H < 0, 0, ROUNDUP((I3:I * M3:M) - H3:H, 0))))`
   - H열이 -10인 경우 `(목표수량) - (-10)`이 되어 부족분을 메우도록 정상 동작하나, 일평균(I열)이 0인 품목의 경우 `0 - (-5) = 5개`가 계산되어 불필요한 발주가 권장될 수 있다.
5. **초과 출고 자체는 이미 허용 중 (`src/TxService.gs:168-185, 207-213, 247-320`)**:
   - `_calculateFifoOutboundSplits()`에서 가용 재고보다 많은 수량을 출고할 때 `isOverdraft: true`로 분할되고 비고란에 `[FIFO 초과출고]`가 기록되며, 사용자에게 경고 메시지가 전달된다.
6. **업무 규칙 문서 (`Docs/BusinessRules.md:27`)**:
   - 현재 `| 수량 검증 | 양수만 허용, 음수 재고 발생 시 현재고가 0으로 처리됨 |`으로 규정되어 있다.
7. **웹앱 UI 구성 (`src/Index.html:80-105`)**:
   - 웹앱 사이드바 메뉴는 대시보드, 입출고 기록, 업장 관리, 시즌 관리, 계정 관리, 기초데이터, 내 설정으로만 구성되어 있으며, 품목 마스터 탭은 존재하지 않는다 (`JS_Master.html` 미사용).
   - 대시보드의 '위험·발주필요 품목' 테이블(`src/JS_UI.html:148-153`)에서 현재고 음수 시 붉은 배지 표시 로직이 기구현되어 있다.

## Hypotheses

- 현재고 수량만 음수를 허용하고 재고자산 평가금액(W열)은 `Math.max(0, ...)`로 0원 하한을 보장하면 회계 기준을 위배하지 않으면서 구매팀의 실사 결손 파악 목적을 100% 달성할 수 있다.
- 월마감 시점에 `현재고 < 0`인 품목이 존재할 경우 마감을 차단(Block)하면 결손 데이터 증발을 원천 차단하고 실사 조정을 강제할 수 있다.

## Business Context

- 호텔·리조트 현장에서는 식음료 자재나 비품이 전산 전표 등록보다 먼저 실물 출고되는 "선출고 후입고" 상황이 빈번하게 발생한다.
- 현재고가 0으로 고정되면 실제 몇 개가 미입고/결손 상태인지 파악할 수 없어 재고 실사 및 결손 조정을 수행하기 어렵다.
- 따라서 수량 단위의 음수 표시는 현업의 실무적 요구에 부합하나, 회계상 자산 계정이 마이너스가 되거나 월마감 후 결손 내역이 증발해서는 안 된다.

## Current System

- 총 출고량이 입고량을 초과하더라도 `Math.max(0, ...)`에 의해 현재고가 `0`으로 표시된다.
- 품목 마스터 시트와 웹앱 대시보드 어디에서도 실제 음수 결손 수량(-5 등)을 직관적으로 확인할 수 없다.

## Root Cause / Diagnostic Logic

해당 없음 — 업무 규칙 변경 및 기능 개선 요청.

## Requirements

### Functional
- [ ] **현재고 수량 음수 표시 허용 (`src/StockEngine.gs`)**:
  - `recalcStockAndUsage()` 내 현재고 계산에서 `Math.max(0, ...)`를 제거하여 순수 계산값(`initStock + stockMap[code]`)을 H열에 기록한다.
  - 마스터 시트 신규 품목 등록/CSV 업로드 초기값은 기존대로 `initStock`을 유지한다.
- [ ] **재고자산 평가액(W열) 0원 하한 보장 (`src/StockEngine.gs`)**:
  - 현재고가 0 이하(`currentStock <= 0`)인 품목은 FIFO 평가액 및 단가 곱연산 결과와 무관하게 W열(재고 합계금액)에 **`0`**을 기록한다.
  - 음수 자산 금액이 장부에 기록되는 것을 원천 차단한다.
- [ ] **적정발주량 수식 방어 보강 (`src/SheetBuilder.gs:buildItemMaster`)**:
  - P3 수식에 `I3:I <= 0` 방어 조건을 추가하여, 일평균 사용량이 없는 품목은 음수 재고가 발생해도 발주 권장량이 0이 되도록 개선한다:
    `=ARRAYFORMULA(IF(A3:A="", "", IF(I3:I<=0, 0, IF((I3:I * M3:M) - H3:H < 0, 0, ROUNDUP((I3:I * M3:M) - H3:H, 0)))))`
- [ ] **월마감 음수 재고 가드레일 (`src/Archive.gs:executeMonthlyClosing`)**:
  - 월마감 실행 직후, 마감 대상 기간 내 또는 현재고가 음수(`currentStock < 0`)인 활성 품목이 존재하는지 검사한다.
  - 음수 품목이 1건이라도 존재하면 마감 작업을 즉시 중단하고 상세 사유를 반환한다:
    `"❌ [마감 차단] 현재고가 음수인 품목이 N건(예: ITM-001 외) 존재합니다. 누락된 입고 전표 등록 또는 재고실사 조정을 완료한 후 마감해주세요."`
- [ ] **시트 시각화 서식 개선 (`src/SheetBuilder.gs:applyItemMasterFormatting`)**:
  - 품목 마스터 H열(현재고)에 조건부 서식을 추가: 값이 `< 0`일 때 연분홍 배경(`#fce8e6`) 및 붉은 글씨(`#c53929`), 굵게 표시.
  - H열 숫자 서식을 음수가 명확히 보이도록 설정 (기본 `#,##0`은 음수 시 `-5`로 자동 표기됨).

### Non-Functional
- [ ] 대시보드 KPI(위험/발주/정상) 및 필터링이 음수 재고에 의해 왜곡되지 않아야 한다. (음수는 정상적으로 `🚨 위험`으로 분류됨)
- [ ] 거래 입력 시 수량 칸에 음수를 직접 입력하는 것은 기존대로 엄격히 차단 유지 (`txData.qty > 0`).

## Constraints

- GAS 런타임 제약 및 시트 보호 설정 유지.
- `MASTER_COLS` 상수 인덱스 체계 변경 금지.
- `executeMonthlyClosing()`의 기존 락(`LockService`) 및 트랜잭션 안전성 유지.

## Files to Inspect

- [`src/StockEngine.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/StockEngine.gs)
- [`src/SheetBuilder.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs)
- [`src/Archive.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Archive.gs)
- [`src/Dashboard.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Dashboard.gs)
- [`src/JS_UI.html`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/JS_UI.html)
- [`Docs/BusinessRules.md`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/Docs/BusinessRules.md)

## Files to Modify

- [`src/StockEngine.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/StockEngine.gs): `recalcStockAndUsage()`의 현재고 음수 허용 및 W열 0원 하한선 보장
- [`src/SheetBuilder.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/SheetBuilder.gs): 적정발주량(P3) 수식 개선, H열 음수 조건부 서식 추가
- [`src/Archive.gs`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/src/Archive.gs): `executeMonthlyClosing()` 내 음수 재고 검증 및 마감 차단 가드레일 추가
- [`Docs/BusinessRules.md`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/Docs/BusinessRules.md): 재고 출고 수량 규칙 업데이트 (음수 표시 허용 및 월마감 차단 규칙 반영)

## Files to Create

- [`tests/unit/negative-stock.test.js`](file:///c:/Users/덕구온천호텔/Documents/GitHub/GasApps/inventory-management-system/tests/unit/negative-stock.test.js): 음수 현재고 계산, 재고자산 0원 하한 보장, 월마감 차단 로직 단위 테스트

## Implementation Plan

1. **`src/StockEngine.gs` 수정**:
   ```javascript
   // 현재고: Math.max(0, ...) 제거하여 음수 허용
   const currentStock = initStock + (stockMap[code] || 0);
   stockUpdates.push([currentStock, dailyUsage]);

   // 재고 합계금액(W열): 재고가 음수이면 자산 평가액은 0원으로 고정
   if (currentStock <= 0) {
     valueUpdates.push([0]);
   } else {
     const fifoValue = fifoValueMap[code];
     if (fifoValue !== undefined) {
       valueUpdates.push([Math.max(0, fifoValue)]);
     } else {
       const unitPrice = Number(row[19]) || 0;
       valueUpdates.push([unitPrice * currentStock]);
     }
   }
   ```
2. **`src/Archive.gs` 월마감 가드레일 추가**:
   - `executeMonthlyClosing()` 진입부(데이터 검증 단계)에서 `masterData` 스캔:
   ```javascript
   const negativeItems = masterData
     .filter(r => r[MASTER_COLS.CODE] && Number(r[MASTER_COLS.CURRENT_STOCK]) < 0)
     .map(r => `${r[MASTER_COLS.CODE]}(${r[MASTER_COLS.NAME]}: ${r[MASTER_COLS.CURRENT_STOCK]}개)`);

   if (negativeItems.length > 0) {
     const sample = negativeItems.slice(0, 3).join(", ");
     const etc = negativeItems.length > 3 ? ` 외 ${negativeItems.length - 3}건` : "";
     return {
       success: false,
       message: `❌ [월마감 차단] 현재고가 음수인 품목이 ${negativeItems.length}건 있습니다 (${sample}${etc}). 누락된 입고 전표 등록 또는 재고 실사 조정을 완료한 후 마감해주세요.`
     };
   }
   ```
3. **`src/SheetBuilder.gs` 수식 및 서식 개선**:
   - P3 적정발주량 수식 교체:
     `=ARRAYFORMULA(IF(A3:A="", "", IF(I3:I<=0, 0, IF((I3:I * M3:M) - H3:H < 0, 0, ROUNDUP((I3:I * M3:M) - H3:H, 0)))))`
   - H열 조건부 서식 규칙 추가:
     `SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setBackground("#fce8e6").setFontColor("#c53929").setBold(true).setRanges([sheet.getRange(3, 8, VALIDATION_ROWS, 1)]).build()`
4. **`Docs/BusinessRules.md` 갱신**:
   - 제2조 재고 출고 수량 검증 항목을 "음수 재고 허용(마스터 음수 표시, 재고자산 0원 보정, 음수 존재 시 월마감 차단)"으로 수정.

## Migration Plan

- 기존 마스터 시트 수식 갱신: `DevTools.gs` 또는 배포 후 관리자 메뉴의 수식 갱신 함수를 통해 P3 수식을 신규 공식으로 재적용.
- H열 조건부 서식은 기존 시트 빌더 실행 또는 마이그레이션 스크립트로 1회 반영.

## Test Plan

### Unit Test (`tests/unit/negative-stock.test.js`)
- [ ] 입고 10, 출고 15 발생 시 `currentStock`가 `-5`로 산출되는지 검증.
- [ ] `currentStock`가 `-5`일 때 W열 재고 합계금액이 `0`으로 기록되는지 검증.
- [ ] 일평균 사용량이 0이고 현재고가 `-5`일 때 적정발주량이 0으로 유지되는지 검증.
- [ ] 현재고가 `-1` 이하인 품목이 존재할 때 `executeMonthlyClosing()`이 에러와 함께 차단되는지 검증.
- [ ] 모든 품목의 현재고가 0 이상일 때 `executeMonthlyClosing()`이 정상 진행되는지 검증.

### E2E Test (Playwright)
- [ ] DEV 환경 웹앱 로그인 후 재고 0인 품목에 출고를 등록하여 현재고가 음수가 되는지 확인.
- [ ] 대시보드 알림 테이블에서 해당 품목의 현재고가 붉은색 경고 배지(`🚨 -N`)로 표시되는지 확인.
- [ ] 관리자 계정으로 월마감 실행 시도 시 음수 품목 경고와 함께 차단 팝업이 노출되는지 확인.

## Regression Risk

- **기존 발주 알림 목록**: 음수 재고 품목은 `H <= N`을 만족하므로 대시보드의 `🚨 위험` 목록에 정상 유지되어 누락되지 않음.
- **거래ID 발급 및 FIFO 분할**: `TxService.gs`는 이미 초과 출고 시 `isOverdraft: true`로 마스터 단가 기록을 처리하고 있으므로 기존 거래 등록 체계와 완벽히 호환됨.

## Acceptance Criteria

- [ ] 초과 출고 발생 시 품목 마스터 H열 및 대시보드 테이블에 실제 마이너스 수량(예: `-5`)이 붉은색으로 강조 표시된다.
- [ ] 음수 재고가 발생해도 W열(재고 합계금액)은 음수가 되지 않고 `0원`으로 평가된다.
- [ ] 일평균 사용량이 0인 품목에 음수 재고가 발생해도 불필요한 적정발주량이 계산되지 않는다.
- [ ] 음수 재고 품목이 남아 있는 상태에서는 월마감이 차단되어 데이터 증발이 방지된다.
- [ ] `npm test` 단위 테스트가 100% 통과한다.

## Human Approval Required

- 구매팀 및 재무/회계 관리자와 "음수 재고 품목의 수량은 음수로 표시하되, 회계 재고자산 가액은 0원으로 고정하고, 월마감 전에는 실사 조정을 완료해야 마감이 가능하다"는 운영 정책 최종 승인 필요.

## Deployment Notes

- DEV 배포 후 `DevTools.gs`를 통해 마스터 시트 P3 수식 및 조건부 서식을 갱신하여 기존 데이터 시트에 반영할 것.

## Rollback Plan

- `src/StockEngine.gs`의 현재고 계산식을 다시 `Math.max(0, ...)`로 복원하고 `npm run dev:push` 실행.

## Final Report

**구현 완료 (Claude Code) — 2026-09-02**

### 변경 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/StockEngine.gs` | `recalcStockAndUsage()`의 `Math.max(0, ...)` 제거 → 현재고 음수 그대로 기록. 재고 합계금액(W열)은 `currentStock <= 0`이면 0원, FIFO/단가 곱연산 결과에도 `Math.max(0, ...)` 하한 적용 |
| `src/SheetBuilder.gs` | P3(적정발주량)에 `I3:I<=0` 방어 추가, W3(합계금액)에 행 단위 0원 하한 추가, H열 `#,##0` 숫자 서식 + 음수 강조 조건부 서식(`#fce8e6` / `#c53929` / 굵게) |
| `src/Archive.gs` | `executeMonthlyClosing()` 진입부(시트 변경 전)에 음수 재고 가드레일 추가 + `collectNegativeStockItems()` 헬퍼 신설 |
| ~~`src/JS_Master.html`~~ | 음수 배지를 넣었으나 **TASK-012에서 롤백됨.** `Index.html`이 include하지 않는 사장된 파일이라 런타임 영향이 없었다. 해당 파일에는 이후 `[DEPRECATED]` 워터마크가 부착되었다 |
| `src/JS_UI.html` | 대시보드 알림 목록 현재고(4번째 열) 음수 시 붉은 배지 강조 (`textContent` 기반, XSS 안전) |
| `src/Migration.gs` | `MIGRATIONS[14]` 신설 — 기존 시트에 P3/W3 수식 + H열 서식 재적용 후 재계산 |
| `src/Config.gs` | `CURRENT_SCHEMA_VERSION` 13 → 14 |
| `Docs/BusinessRules.md` | 제2조(재고 출고) 음수 재고 규칙 5항 교체, 제6조 적정발주량 방어 조건 명시, 제10조(월마감) 차단 규칙 2항 추가 |
| `tests/unit/negative-stock.test.js` | 신규 — 23건 |
| `tests/unit/migration-v12-formatting.test.js` | 조건부 서식 스텁에 `whenNumberLessThan` / `setBold` 추가 (신규 규칙 대응) |

### 명세 대비 구현 판단 (2건)

1. **가드레일 판정 기준을 "H열 기록값 OR 재계산값"으로 강화**
   명세의 구현 계획은 마스터 H열만 스캔하나, H열은 `recalcStockAndUsage()`가 갱신하는 파생값이라 마지막 재계산 이후의 입출고를 반영하지 못했을 수 있다. H열이 스테일하면 가드레일이 그대로 뚫려 결손이 증발하므로, `collectNegativeStockItems()`는 **기록값(H열)** 과 **초기재고 + 입출고 실적 재계산값** 중 하나라도 음수면 차단하고 더 보수적인 수량을 보고한다. 부작용 없는 순수 함수이며 시트 쓰기가 없다. (테스트: "H열이 갱신되기 전이어도…")

2. **미사용(`X열 = 미사용`) 품목은 차단 대상에서 제외**
   Requirements의 "활성 품목" 문구를 따랐다. 폐기 예정 품목의 음수 재고 때문에 월마감이 영구 차단되는 상황을 막기 위함이다. 구현 계획 스니펫에는 이 필터가 없었으므로 **운영 정책 확인 필요** — 미사용 품목의 결손도 마감 전 정리 대상이라면 필터를 제거하면 된다.

### 명세 외 추가 반영 (2건)

- **W3 초기 수식에도 0원 하한 적용**: W열은 StockEngine이 덮어쓰기 전까지 `T3:T * H3:H` 수식값이 표시되므로, 수식 자체를 고치지 않으면 재계산 사이에 마이너스 자산이 노출된다. `ARRAYFORMULA` 안에서 `MAX()`는 배열 전체를 집계하므로 `IF(T*H<0, 0, T*H)`로 행 단위 절사했다.
- **`MIGRATIONS[14]` 신설**: Migration Plan이 요구한 "기존 시트 수식/서식 1회 반영"을 이 저장소의 표준 경로(스키마 마이그레이션)로 구현했다. DevTools 임시 함수보다 재실행 안전(멱등)하고 이력이 남는다.

### 테스트 결과

`npm test` — **7개 파일 전체 통과** (신규 `negative-stock.test.js` 23건 포함, 기존 6개 파일 무회귀)

신규 테스트는 로직을 복사하지 않고 `src/*.gs` 실제 소스를 vm 샌드박스에 로드해 검증한다. 적정발주량·합계금액 수식은 **`MIGRATIONS[14]`가 실제로 시트에 쓰는 수식 문자열을 그대로 꺼내 1행분으로 평가**하므로, 수식이 바뀌면 테스트도 바뀐 수식을 검증한다.

- 현재고: 입고10/출고15 → `-5`, 초기재고3/출고8 → `-5`, 정상 재고 무회귀
- 평가액: 음수 재고 시 W열 `0` (입고 로트 유무 무관), 정상 FIFO 평가액 무회귀
- 적정발주량: 일평균0 + 재고-5 → `0`, 일평균2 + 재고-5 → `19`(부족분 보충 정상)
- 월마감: 음수 1건 → 차단 + 원본 데이터 보존 검증, 재고 0/정상 → 통과, 스테일 H열 → 차단, 미사용 → 통과, 4건 이상 → "외 1건" 요약
- 서식: H열 음수 조건부 서식 존재 + **미사용 회색 규칙보다 앞선 순서**(뒤에 오면 회색에 덮여 붉게 보이지 않음) + `#,##0` 숫자 서식

### 미수행 항목

- **E2E (Playwright)**: 완료 — 아래 "E2E 결과" 섹션 참고 (전체 11 passed / 2 skipped, 신규 스펙 4 passed).
- **Human Approval**: 구매팀·재무 관리자의 운영 정책 승인(수량 음수 표시 / 자산 0원 고정 / 마감 전 실사 조정 강제)이 Production 배포 전 선행되어야 한다.

### 배포 순서

1. `npm run dev:push` → DEV 반영
2. DEV 관리자 메뉴에서 마이그레이션 실행 (v13 → v14) — P3/W3 수식 + H열 서식 갱신 후 자동 재계산
3. E2E 확인 (`npm run test:e2e`) — 완료
4. Human 승인 후 `git push origin main` (Production은 GitHub Actions 위임)

Production 시트도 **v14 마이그레이션 실행이 필수**다. 실행 전까지는 기존 P3/W3 수식과 서식이 유지되어 음수 재고가 붉게 보이지 않고 허수 발주량이 계산될 수 있다.

### 롤백

`src/StockEngine.gs`의 현재고 계산을 `Math.max(0, initStock + (stockMap[code] || 0))`으로 되돌리고 `npm run dev:push`. 마이그레이션 v14는 수식/서식만 바꾸므로 되돌릴 필요가 없다(음수가 발생하지 않으면 기존과 동일하게 동작).
---

## E2E 결과 (DEV 배포 + 스키마 v14 마이그레이션 후 · 2026-09-02)

`npm run dev:push` → DEV @HEAD 배포(E2E 대상 URL이 @HEAD 배포이므로 즉시 반영).
이후 사용자가 DEV 스프레드시트에서 `runMigrations()` 실행 → **`SCHEMA_VERSION = 14`** 확인.

### 마이그레이션 v14 효과 (실측)

| 컬럼 | 마이그레이션 전 | 후 |
|------|----------------|-----|
| 적정발주량(P열) | 0 / 4292건 | **4292 / 4292건** |
| 재고 합계금액(W열) | 4292건 | 4292건 (음수 재고 시 0원) |
| 발주점(O열)·상태(Q열)·공급단가(U열)·세액(V열) | 0건 | 0건 (v14 범위 밖 — 사용자 결정) |

동작 확인: 일평균 0인 품목(FBV-002~005)은 발주량 `0`, 일평균 1·목표 7일인 FBV-001은 `7` — 신규 `I<=0` 방어가 살아 있다.

### 테스트 결과

| 스위트 | 결과 |
|--------|------|
| 단위 테스트 (`npm test`) | **7개 파일 전체 통과** (신규 `negative-stock.test.js` 23건 포함) |
| 전체 E2E (`npm run test:e2e`) | **11 passed / 2 skipped** (skip 2건은 모두 승인 게이트, 회귀 없음) |
| 신규 `tests/e2e/negative-stock.spec.js` | **4 passed** (월마감 차단 포함 — 사용자 승인 후 `E2E_ALLOW_MONTHLY_CLOSING=1`로 실행) |

### 실제 GAS 런타임에서 실증된 항목

1. **현재고 음수 표시 + 재고자산 0원**
   재고 0인 `FBV-001`에 출고 5 → 서버가 `⚠️ 가용 로트보다 5 많이 출고` 경고와 함께 저장.
   재계산 후 **현재고 `0 → -5`** (0으로 클램핑되지 않음), **재고자산 `0원`**.

2. **적정발주량 방어 (`I<=0`)**
   일평균 0·재고 190인 `FBV-002`에 **폐기** 195 → **현재고 `190 → -5`, 일평균 `0` 유지, 적정발주량 `0`, 재고자산 `0원`**.
   ※ 출고를 쓰면 그 수량이 최근 30일 사용량으로 잡혀 일평균이 0을 벗어난다.
      폐기는 재고만 줄이고 일평균 집계에서 제외되므로(`StockEngine`은 `type === "출고"`만 집계)
      "일평균 0인데 재고가 음수"를 만들 수 있는 유일한 경로다.

3. **음수 재고 배지 렌더링**
   배포된 `renderDashboard()`를 직접 호출해 검증 — 음수는 `🚨 -5` + `rgb(197,57,41)` 붉은 배지, 양수(`3`)는 기존 표기 유지.

4. **월마감 차단 가드레일**
   음수 재고 상태에서 `executeMonthlyClosing(2026, 8)` 호출 → 서버가 시트를 건드리기 전에 차단:
   ```
   ❌ [월마감 차단] 현재고가 음수인 품목이 1건 있습니다 (FBV-001(냉동단호박: -5개)).
   누락된 입고 전표 등록 또는 재고 실사 조정을 완료한 후 마감해주세요.
   ```
   호출 후 DEV 상태 재확인: 품목 4292건 유지, 입출고 이관 없음, 초기재고 리셋 없음 — 아무것도 변경되지 않았다.
   음수 품목이 2건일 때는 두 건을 모두 나열하는 것도 확인했다.

5. **데이터 원복**: 모든 테스트가 종료 시 동일 수량 입고로 복구 (`FBV-001 → 0`, `FBV-002 → 190 / 자산 1,425,000`). 최종 DEV 음수 재고 **0건**.

### E2E 과정에서 드러난 기존 결함 3건 (TASK-011과 무관)

1. **웹앱에 품목 마스터 화면이 없다** *(명세 갱신에 반영됨 — Confirmed Facts #7)*
   `Index.html`이 `JS_Master.html`을 include하지 않으며 `tab-master` / `masterTableBody` 엘리먼트도 없다.
   커밋 `e4a6d6e`(2026-08-22, "[fix] UI 버튼 배치 및 계정관리 액션 버그 해결")에서 include와 관련 마크업이 함께 제거됐다.
   → 명세가 요구한 "웹앱 품목 마스터 테이블 배지"는 **화면 자체가 없어 런타임에 노출되지 않는다.**
   `src/JS_Master.html`의 배지 코드는 화면이 복구되는 시점을 위해 반영해 두었고, 실제 사용자 경로인
   **대시보드 알림 목록**(`JS_UI.html`)에 배지를 넣어 E2E로 검증했다.

2. **거래 등록만으로는 현재고가 갱신되지 않는다**
   `addTransaction()`은 `recalcStockAndUsage()`를 호출하지 않는다. 호출 지점은
   `refreshDashboard()`(자정 트리거 · 관리자 "🔄 대시보드 및 재고 갱신"), 월마감, 품목 수정뿐이다.
   → 출고 직후 마스터를 읽으면 재고가 **거래 이전 값 그대로**다. E2E 첫 실패의 실제 원인이었고,
   스펙은 `runSystemCommand('refreshDashboard')`로 재계산을 명시적으로 돌리도록 했다.
   **음수 재고 역시 재계산이 돌기 전까지는 화면에 나타나지 않는다** — 현업 안내가 필요한 지점이다.

3. **품목 마스터의 수식 컬럼 일부가 여전히 비어 있다 (대시보드 기능 정지)**
   v14 적용 후에도 상태(Q열)·발주점(O열)·공급단가(U열)·세액(V열)이 4292건 전부 빈 값이다.
   그 결과 `getDashboardData()`의 KPI가 `{total:4292, risk:0, order:0, normal:0}`이고
   **알림 목록이 한 건도 생성되지 않는다.**
   → 비기능 요구사항인 "음수 재고가 `🚨 위험`으로 분류된다"는 이 결손이 복구되기 전에는 확인할 수 없다.
   E2E는 이를 통과로 위장하지 않고 관측값만 로그에 남기고 `known-issue` 주석을 붙인다.
   → **사용자 결정(2026-09-02): v14는 명세 범위(P3/W3)를 유지하고, 수식 결손 복구는 별도 Task로 분리한다.**

### E2E 스펙 설계 메모

- **원복은 UI가 아니라 서버 API(`addTransaction`)로 수행한다.** 초기 구현은 원복도 화면을 거쳤는데,
  자동완성 드롭다운이 한 번 열리지 않은 것만으로 폐기 195건이 복구되지 않고 DEV 시트에 음수 재고가 남았다.
  검증 대상인 출고/폐기 등록만 UI로 하고, 뒷정리는 흔들리지 않는 경로로 분리했다.
- **업장 선택 모달은 `#modalOverlay`의 `.active` 클래스로만 판정한다.** `closeModal()`은 `.active`만 제거하고
  `#shopSelectionList` 마크업은 DOM에 남기며 오버레이는 `opacity`로 숨으므로, 닫힌 뒤에도 업장 버튼이
  Playwright의 visible 판정을 통과한다. 이를 클릭하면 본문 `<div class="mt-16">`이 포인터를 가로채 타임아웃된다.

### 남은 항목

- **Production 배포**: Human 승인 후 `git push origin main`. 아직 커밋하지 않았다.
- **Production 마이그레이션**: 배포 후 Production 스프레드시트에서도 `runMigrations()`(v13 → v14)를 실행해야
  P3/W3 신규 수식과 H열 음수 강조 서식이 반영된다. 실행 전까지는 기존 수식/서식이 그대로다.
