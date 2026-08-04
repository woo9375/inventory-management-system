/**
 * 호텔덕구온천 재고 관리 시스템 v1.0.0 — 재고 계산 엔진 모듈
 * 재고 집계, 일평균 사용량 계산, 시즌 보정 로직
 */

// [v6.8] 타임존 안전 패치: Date 객체의 시각 부분을 제거하여 로컬 자정으로 정규화
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
  const configSheet = ss.getSheetByName(SHEET_CONFIG);
  
  const seasonData = configSheet.getRange("N4:P" + Math.max(configSheet.getLastRow(), 4)).getValues();
  const logLastRow = Math.max(logSheet.getLastRow(), 3);
  const logData = logSheet.getRange(3, 1, logLastRow - 2, 5).getValues();
  
  const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
  const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, 8).getValues(); 

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

  // [v6.8] 시즌 초기 모수 왜곡 방지: MIN_ANALYSIS_DAYS 미만이면 30일 평균으로 fallback
  let targetDays = 30;
  let limitDateStart; // 일평균 집계 시작일 (밀리초)
  
  if (targetSeason && targetSeason.name !== "비수기") {
    const effectiveEnd = Math.min(todayTime, targetSeason.end);
    const rawDays = (effectiveEnd - targetSeason.start) / (1000 * 60 * 60 * 24) + 1;
    
    if (rawDays < MIN_ANALYSIS_DAYS) {
      // 시즌 시작 직후: 데이터 부족으로 일평균이 왜곡될 수 있으므로 30일 평균 사용
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
    // 비수기 또는 시즌 미매칭: 최근 30일
    const fallbackDate = new Date(today);
    fallbackDate.setDate(fallbackDate.getDate() - 30);
    limitDateStart = fallbackDate.getTime();
  }

  const usageMap = {};
  const stockMap = {};
  const disposeMap = {}; // 리포트용 확장 보장

  logData.forEach(row => {
    const dateVal = toLocalDate(row[0]).getTime();
    const code = row[1];
    const type = row[3];
    const qty = Number(row[4]) || 0;

    if (!code || isNaN(dateVal)) return;

    // [요구사항 1-2] 재고 집계식 보정 (폐기 처리)
    if (!stockMap[code]) stockMap[code] = 0;
    if (type === "입고") stockMap[code] += qty;
    if (type === "출고") stockMap[code] -= qty;
    if (type === "폐기") { 
      stockMap[code] -= qty;
      disposeMap[code] = (disposeMap[code] || 0) + qty;
    }

    // [v6.8] 통일된 범위 기반 일평균 집계 (출고만)
    if (type === "출고" && dateVal >= limitDateStart && dateVal <= todayTime) {
      usageMap[code] = (usageMap[code] || 0) + qty;
    }
  });

  const updates = masterData.map(row => {
    const code = row[0];
    const initStock = Number(row[6]) || 0;
    if (!code) return ["", ""];
    
    const currentStock = Math.max(0, initStock + (stockMap[code] || 0));
    const usage = usageMap[code] || 0;
    // [v6.8] targetDays가 0이 되는 엣지케이스 방어
    const safeDays = Math.max(targetDays, 1);
    const dailyUsage = usage > 0 ? Number((usage / safeDays).toFixed(2)) : 0.0;
    
    return [currentStock, dailyUsage];
  });

  if (updates.length > 0) {
    masterSheet.getRange(3, 8, updates.length, 2).setValues(updates);
  }
}
