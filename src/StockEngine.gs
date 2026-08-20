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
  
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 20).getValues(); // 20열까지 (T열 = 매입단가)

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
      Logger.log(`[Season] ${targetSeason.name} 시작 ${rawDays}일차 — 30일 평균으로 fallback`);
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
    const code = row[0];
    const initStock = Number(row[6]) || 0;
    const unitPrice = Number(row[19]) || 0;
    
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
    const code = row[0];
    const initStock = Number(row[6]) || 0;
    if (!code) {
      stockUpdates.push(["", ""]);
      valueUpdates.push([""]);
      return;
    }
    
    const currentStock = Math.max(0, initStock + (stockMap[code] || 0));
    const usage = usageMap[code] || 0;
    const safeDays = Math.max(targetDays, 1);
    const dailyUsage = usage > 0 ? Number((usage / safeDays).toFixed(2)) : 0.0;
    
    stockUpdates.push([currentStock, dailyUsage]);
    
    // [v7.0] FIFO 기반 합계금액 (로트가 없으면 현재 매입단가 × 현재고)
    const fifoValue = fifoValueMap[code];
    if (fifoValue !== undefined) {
      valueUpdates.push([fifoValue]);
    } else {
      // 입고 기록이 없는 경우 (초기재고만 있는 경우) — 현재 매입단가 × 현재고
      const unitPrice = Number(row[19]) || 0;
      valueUpdates.push([unitPrice * currentStock]);
    }
  });

  if (stockUpdates.length > 0) {
    masterSheet.getRange(3, 8, stockUpdates.length, 2).setValues(stockUpdates);
    // [v7.0] W열(합계금액)을 FIFO 결과로 직접 기록
    masterSheet.getRange(3, 23, valueUpdates.length, 1).setValues(valueUpdates);
  }
}
