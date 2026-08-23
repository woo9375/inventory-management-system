/**
 * 대용량 데이터 전역 캐싱을 위한 CacheManager
 * 구글 CacheService는 항목당 100KB 제한이 있으므로, 
 * 대형 데이터를 분할(Chunking)하여 저장하고 읽어오는 래퍼 유틸리티입니다.
 */
const CacheManager = {
  CHUNK_SIZE: 90000, // 90KB (안전 마진 포함)
  TTL: 60, // 60초 (기본 캐시 유지 시간)

  /**
   * 데이터를 캐시에 저장
   * @param {string} key 고유 식별자 (예: 'ITEM_MASTER_DATA')
   * @param {any} data 저장할 데이터 (객체 또는 배열)
   * @param {number} ttl 유지 시간 (초)
   */
  set: function(key, data, ttl = this.TTL) {
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
    const chunksStr = cache.get(key + '_chunks');
    
    if (!chunksStr) return null; // 캐시 미스

    const numChunks = parseInt(chunksStr, 10);
    if (numChunks === 1) {
      const dataStr = cache.get(key);
      return dataStr ? JSON.parse(dataStr) : null;
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
    const ROLE_SUFFIXES = ['_admin', '_manager', '_staff'];
    this.remove('ITEM_MASTER_DATA');
    this.remove('ITEM_CODES');
    this.remove('CONFIG_DATA');
    this.remove('BASE_DATA');
    this.remove('SHOP_LIST');
    this.remove(CACHE_KEYS.ITEM_MAP);
    // [CR-04 + NF-03] 역할별 캐시 키 전부 삭제
    ROLE_SUFFIXES.forEach(suffix => {
      this.remove('CONFIG_DATA' + suffix);
      this.remove('BASE_DATA' + suffix);
    });
  },

  /**
   * [v8.0] 품목 인덱스 맵 캐시 강제 갱신
   */
  buildItemMapCache: function(ss) {
    const masterSheet = ss.getSheetByName(SHEET_MASTER);
    const masterLastRow = Math.max(masterSheet.getLastRow(), 3);
    if (masterLastRow < 3) return {};
    
    // [v10.0] MASTER_COL_COUNT\uc5f4\ub85c \uc77d\uc5b4\uc11c \uc0ac\uc6a9\uc720\ubb34 \ud544\ud130\ub9c1\n    const masterData = masterSheet.getRange(3, 1, masterLastRow - 2, MASTER_COL_COUNT).getValues();\n    const itemMap = {};\n    masterData.forEach(r => { \n      if(r[MASTER_COLS.CODE] && r[MASTER_COLS.USAGE_STATUS] !== '\ubbf8\uc0ac\uc6a9') { \n        itemMap[r[MASTER_COLS.CODE]] = { name: r[MASTER_COLS.NAME], price: r[MASTER_COLS.UNIT_PRICE] || 0 };\n      }\n    });
    
    this.set(CACHE_KEYS.ITEM_MAP, itemMap, TTL.ITEM_MAP);
    return itemMap;
  }
};
