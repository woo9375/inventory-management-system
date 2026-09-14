/**
 * 대용량 데이터 전역 캐싱을 위한 CacheManager
 * 구글 CacheService는 항목당 100KB 제한이 있으므로, 
 * 대형 데이터를 분할(Chunking)하여 저장하고 읽어오는 래퍼 유틸리티입니다.
 */
const CacheManager = {
  CHUNK_SIZE: 90000, // 90KB (안전 마진 포함)
  // [TASK-027] 기본 TTL은 Config.gs의 TTL.DEFAULT(10분). 객체 리터럴 평가 시점에 Config.gs가 아직
  //   로드되지 않았을 수 있으므로 set() 안에서 늦게 읽는다. 아래 값은 그 폴백이다.
  TTL: 600,

  /**
   * 데이터를 캐시에 저장
   * @param {string} key 고유 식별자 (예: 'ITEM_MASTER_DATA')
   * @param {any} data 저장할 데이터 (객체 또는 배열)
   * @param {number} ttl 유지 시간 (초)
   */
  set: function(key, data, ttl) {
    if (ttl === undefined) ttl = (typeof TTL !== 'undefined' && TTL.DEFAULT) ? TTL.DEFAULT : this.TTL;
    const cache = CacheService.getScriptCache();
    const jsonStr = JSON.stringify(data);
    
    // 데이터가 90KB보다 작으면 단일 키로 저장
    if (jsonStr.length <= this.CHUNK_SIZE) {
      cache.put(key, jsonStr, ttl);
      cache.put(key + '_chunks', '1', ttl); // 청크 개수 기록
      return;
    }

    // 데이터가 90KB보다 크면 분할 저장
    const numChunks = Math.ceil(jsonStr.length / this.CHUNK_SIZE);
    const cacheObj = {};
    for (let i = 0; i < numChunks; i++) {
      let chunk = jsonStr.substring(i * this.CHUNK_SIZE, (i + 1) * this.CHUNK_SIZE);
      cacheObj[key + '_' + i] = chunk;
    }
    // 최대 putAll 용량 제한(100KB)을 넘지 않도록 개별 put 실행
    // (더 최적화하려면 putAll을 100KB 이내로 묶어서 실행할 수도 있음)
    for (let k in cacheObj) {
      cache.put(k, cacheObj[k], ttl);
    }
    cache.put(key + '_chunks', numChunks.toString(), ttl);
  },

  /**
   * 캐시에서 데이터를 읽어옴
   * @param {string} key 고유 식별자
   * @return {any} 저장된 데이터 (없으면 null)
   */
  get: function(key) {
    const cache = CacheService.getScriptCache();
    // [TASK-027] 청크 개수와 단일 본체를 getAll 1회로 같이 읽는다 — 90KB 이하 데이터(업장·설정·품목맵 등 대부분)는
    //   왕복 1회로 끝난다. 전에는 _chunks 조회 + 본체 조회 2회였고, 이 함수는 API 호출마다 1~2번 불린다.
    const head = cache.getAll([key + '_chunks', key]) || {};
    const chunksStr = head[key + '_chunks'];

    if (!chunksStr) return null; // 캐시 미스

    const numChunks = parseInt(chunksStr, 10);
    if (numChunks === 1) {
      const dataStr = head[key];
      try { return dataStr ? JSON.parse(dataStr) : null; } catch (e) { return null; }
    }

    // [v10.0] 분할된 캐시 조립 시 루프 밖에서 한 번에 가져오기 (성능 최적화)
    const chunkKeys = [];
    for (let i = 0; i < numChunks; i++) {
      chunkKeys.push(key + '_' + i);
    }
    const chunks = cache.getAll(chunkKeys);
    
    let fullJsonStr = '';
    for (let i = 0; i < numChunks; i++) {
      const chunk = chunks[key + '_' + i];
      if (!chunk) return null; // 청크 일부가 유실된 경우 캐시 미스 처리
      fullJsonStr += chunk;
    }

    try {
      return JSON.parse(fullJsonStr);
    } catch (e) {
      return null;
    }
  },

  /**
   * 캐시 데이터 삭제
   * @param {string} key 고유 식별자
   */
  remove: function(key) {
    const cache = CacheService.getScriptCache();
    const chunksStr = cache.get(key + '_chunks');
    if (!chunksStr) {
      cache.remove(key); // 단일 키였을 수 있으므로 시도
      return;
    }

    // [v10.0] 단일 호출로 일괄 삭제
    const keysToRemove = [key, key + '_chunks'];
    const numChunks = parseInt(chunksStr, 10);
    for (let i = 0; i < numChunks; i++) {
      keysToRemove.push(key + '_' + i);
    }
    cache.removeAll(keysToRemove);
  },

  /**
   * 관련된 모든 마스터/설정 캐시 일괄 삭제 (데이터 갱신 시 호출)
   * [CR-04 FIX] CONFIG_DATA/BASE_DATA의 역할별 접미사 키도 명시적 삭제
   */
  invalidateAll: function() {
    // [TASK-027] 키마다 get + removeAll을 반복하던 것(키 14개 × 2 = 28회 왕복, 쓰기마다 0.5~1.5초)을
    //   getAll 1회(청크 개수 조회) + removeAll 1회로 줄였다. 대상 키는 Config.gs CACHE_INVALIDATE_KEYS —
    //   새 캐시 키는 거기에 넣지 않으면 등록/수정 직후에도 TTL이 끝날 때까지 낡은 값이 화면에 남는다.
    //   거래 등록(addTransaction)은 이 함수를 더 이상 부르지 않는다 — 거래 행은 어떤 캐시에도 들어 있지 않다.
    const cache = CacheService.getScriptCache();
    const baseKeys = (typeof CACHE_INVALIDATE_KEYS !== 'undefined') ? CACHE_INVALIDATE_KEYS : [];
    const counts = cache.getAll(baseKeys.map(k => k + '_chunks')) || {};

    const toRemove = [];
    baseKeys.forEach(key => {
      toRemove.push(key, key + '_chunks');
      const n = parseInt(counts[key + '_chunks'], 10);
      for (let i = 0; i < (n > 1 ? n : 0); i++) toRemove.push(key + '_' + i);
    });
    cache.removeAll(toRemove);
    // 같은 요청 안에서 들고 있던 메모(TxService._getActiveShops)도 함께 비운다
    if (typeof _resetRequestMemos === 'function') _resetRequestMemos();
  },

  /**
   * [v8.0] 품목 인덱스 맵 캐시 강제 갱신
   */
  buildItemMapCache: function(ss) {
    const masterSheet = ss.getSheetByName(SHEET_MASTER);
    const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
    if (masterLastRow < 3) return {};
    
    // [v10.0] MASTER_COL_COUNT열로 읽어서 사용유무 필터링
    const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();
    const itemMap = {};
    masterData.forEach(r => {
      if (r[MASTER_COLS.CODE] && r[MASTER_COLS.USAGE_STATUS] !== '미사용') {
        itemMap[r[MASTER_COLS.CODE]] = {
          name: r[MASTER_COLS.NAME],
          price: Number(r[MASTER_COLS.UNIT_PRICE]) || 0,
          // [TASK-005] FIFO 최초 로트(초기재고) 산출용
          initStock: Number(r[MASTER_COLS.INIT_STOCK]) || 0
        };
      }
    });
    
    this.set(CACHE_KEYS.ITEM_MAP, itemMap, TTL.ITEM_MAP);
    return itemMap;
  }
};
