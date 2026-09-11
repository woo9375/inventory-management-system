/**
 * 호텔덕구온천 재고 관리 시스템 v7.0 — 재고 계산 엔진 모듈
 * [v7.0] FIFO 로직 추가, 시즌 참조 변경, 9열 입출고 구조
 */

// 타임존 안전 패치
function toLocalDate(val) {
  if (val instanceof Date) {
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }
  if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = val.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(val);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function recalcStockAndUsage(ss) {
  const masterSheet = ss.getSheetByName(SHEET_MASTER);
  const logSheet = ss.getSheetByName(SHEET_INOUT);
  // [v7.0] 시즌 데이터를 시즌설정 시트에서 읽기
  const seasonSheet = ss.getSheetByName(SHEET_SEASONS);
  
  const seasonData = seasonSheet.getRange("A5:C" + Math.max(seasonSheet.getLastRow(), 5)).getValues();
  const logLastRow = Math.max(logSheet.getLastRow(), 3);
  // [v7.0] 9열 구조: 6열(단가 스냅샷) 포함 읽기
  const logData = logSheet.getRange(3, 1, logLastRow - 2, TX_COLS).getValues();
  
  // [TASK-017] 이 함수는 계산 결과를 MASTER_COLS 기준 열에 **되쓴다**.
  //   마이그레이션 전 시트에 그대로 쓰면 재고 합계금액이 사용유무 열을 덮어써 값을 지운다.
  //   자정 트리거가 배포~마이그레이션 사이에 걸릴 수 있으므로 쓰기 전에 구조를 확인한다.
  if (!_isMasterSchemaCurrent(masterSheet)) {
    _warnMasterSchemaStale("재고 재계산");
    return;
  }

  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues(); // [TASK-017] 25열 (U열 = 매입단가)

  const today = new Date();
  const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  
  let targetSeason = null;
  for (let r of seasonData) {
    if (!r[0] || !r[1] || !r[2]) continue;
    const sStart = toLocalDate(r[1]).getTime();
    const sEnd = toLocalDate(r[2]).getTime();
    if (todayTime >= sStart && todayTime <= sEnd) {
      targetSeason = { name: r[0], start: sStart, end: sEnd };
      break;
    }
  }

  let targetDays = 30;
  let limitDateStart;
  
  if (targetSeason && targetSeason.name !== "비수기") {
    const effectiveEnd = Math.min(todayTime, targetSeason.end);
    const rawDays = (effectiveEnd - targetSeason.start) / (1000 * 60 * 60 * 24) + 1;
    
    if (rawDays < MIN_ANALYSIS_DAYS) {
      targetDays = 30;
      const fallbackDate = new Date(today);
      fallbackDate.setDate(fallbackDate.getDate() - 30);
      limitDateStart = fallbackDate.getTime();
      console.log(`[Season] ${targetSeason.name} 시작 ${rawDays}일차 — 30일 평균으로 fallback`);
    } else {
      targetDays = rawDays;
      limitDateStart = targetSeason.start;
    }
  } else {
    const fallbackDate = new Date(today);
    fallbackDate.setDate(fallbackDate.getDate() - 30);
    limitDateStart = fallbackDate.getTime();
  }

  const usageMap = {};
  const stockMap = {};

  // [v7.0] FIFO를 위한 로트 데이터 수집
  const lotsMap = {};       // { code: [{ date, qty, price, remaining }] }
  const outEventsMap = {};  // { code: [{ date, qty, type }] }

  // [FIX] 초기재고(initStock)를 FIFO의 가장 첫 번째 로트(가장 오래된 날짜)로 편입
  masterData.forEach(row => {
    const code = row[MASTER_COLS.CODE];
    const initStock = Number(row[MASTER_COLS.INIT_STOCK]) || 0;
    const unitPrice = Number(row[MASTER_COLS.UNIT_PRICE]) || 0;
    
    if (code && initStock > 0) {
      lotsMap[code] = [{ date: 0, qty: initStock, price: unitPrice, remaining: initStock }];
    }
  });

  logData.forEach(row => {
    const dateVal = toLocalDate(row[0]).getTime();
    const code = row[1];
    const type = row[3];
    const qty = Number(row[4]) || 0;
    const price = Number(row[5]) || 0; // [v7.0] 단가 스냅샷

    if (!code || isNaN(dateVal)) return;

    // 재고 집계
    if (!stockMap[code]) stockMap[code] = 0;
    if (type === "입고") stockMap[code] += qty;
    if (type === "출고") stockMap[code] -= qty;
    if (type === "폐기") stockMap[code] -= qty;

    // [v7.0] FIFO 로트 수집
    if (type === "입고") {
      if (!lotsMap[code]) lotsMap[code] = [];
      lotsMap[code].push({ date: dateVal, qty: qty, price: price, remaining: qty });
    }
    if (type === "출고" || type === "폐기") {
      if (!outEventsMap[code]) outEventsMap[code] = [];
      outEventsMap[code].push({ date: dateVal, qty: qty, type: type });
    }

    // 일평균 집계 (출고만)
    if (type === "출고" && dateVal >= limitDateStart && dateVal <= todayTime) {
      usageMap[code] = (usageMap[code] || 0) + qty;
    }
  });

  // [v7.0] FIFO 계산: 각 품목별로 출고/폐기를 날짜순으로 처리
  const fifoValueMap = {}; // { code: 합계금액 }
  
  Object.keys(lotsMap).forEach(code => {
    // 로트를 날짜순 정렬
    const lots = lotsMap[code].sort((a, b) => a.date - b.date);
    // 출고/폐기를 날짜순 정렬
    const outs = (outEventsMap[code] || []).sort((a, b) => a.date - b.date);
    
    // 각 remaining을 원본 qty로 리셋 (이미 위에서 설정됨)
    
    // 출고/폐기 처리: 가장 오래된 로트부터 차감
    outs.forEach(out => {
      let remainingOut = out.qty;
      for (let lot of lots) {
        if (remainingOut <= 0) break;
        if (lot.remaining <= 0) continue;
        
        const deducted = Math.min(lot.remaining, remainingOut);
        lot.remaining -= deducted;
        remainingOut -= deducted;
      }
    });
    
    // 남은 로트의 (잔여수량 × 단가) 합산
    let totalValue = 0;
    lots.forEach(lot => {
      if (lot.remaining > 0) {
        totalValue += lot.remaining * lot.price;
      }
    });
    fifoValueMap[code] = totalValue;
  });

  const stockUpdates = [];   // H~I열
  const valueUpdates = [];   // W열

  masterData.forEach(row => {
    const code = row[MASTER_COLS.CODE];
    const initStock = Number(row[MASTER_COLS.INIT_STOCK]) || 0;
    if (!code) {
      stockUpdates.push(["", ""]);
      valueUpdates.push([""]);
      return;
    }
    
    // [TASK-011] 현재고는 음수를 그대로 노출한다.
    //   과거에는 Math.max(0, ...)로 0에 고정했으나, 그러면 선출고/실사 결손 수량을
    //   현업이 확인할 수 없었다. 음수는 "미입고 또는 결손"을 뜻하는 실제 신호다.
    const currentStock = initStock + (stockMap[code] || 0);
    const usage = usageMap[code] || 0;
    const safeDays = Math.max(targetDays, 1);
    const dailyUsage = usage > 0 ? Number((usage / safeDays).toFixed(2)) : 0.0;
    
    stockUpdates.push([currentStock, dailyUsage]);
    
    // [v7.0] FIFO 기반 합계금액 (로트가 없으면 현재 매입단가 × 현재고)
    // [TASK-011] 수량은 음수를 허용하되 회계상 재고자산(W열)은 0원을 하한으로 둔다.
    //   마이너스 자산이 장부에 기록되면 회계 기준 위반이므로 평가액만 0으로 절사한다.
    if (currentStock <= 0) {
      valueUpdates.push([0]);
      return;
    }

    const fifoValue = fifoValueMap[code];
    if (fifoValue !== undefined) {
      valueUpdates.push([Math.max(0, fifoValue)]);
    } else {
      // 입고 기록이 없는 경우 (초기재고만 있는 경우) — 현재 매입단가 × 현재고
      // [TASK-017] 매입단가 인덱스를 19로 하드코딩하고 있었다. S열(거래처코드) 삽입으로
      //   한 칸 밀렸으므로 상수를 쓴다 — 그대로 뒀다면 과세구분을 단가로 읽어 평가액이 0이 됐다.
      const unitPrice = Number(row[MASTER_COLS.UNIT_PRICE]) || 0;
      valueUpdates.push([Math.max(0, unitPrice * currentStock)]);
    }
  });

  if (stockUpdates.length > 0) {
    masterSheet.getRange(3, 8, stockUpdates.length, 2).setValues(stockUpdates);
    // [v7.0] 합계금액 열을 FIFO 결과로 직접 기록
    // [TASK-017] 열 번호를 23(W열)으로 하드코딩하고 있었다. S열 삽입 후 합계금액은 24(X열)이므로
    //   상수를 쓴다 — 그대로 뒀다면 FIFO 평가액을 단위 세액 열에 덮어썼다.
    masterSheet.getRange(3, MASTER_COLS.TOTAL_VALUE + 1, valueUpdates.length, 1).setValues(valueUpdates);
  }
}
