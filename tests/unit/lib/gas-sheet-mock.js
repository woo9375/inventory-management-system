// 최소 Google Apps Script / Sheets 목(mock).
// 목적: TASK-017의 열 삽입 마이그레이션과 시트 빌더를 DEV에 올리기 전에
//       런타임 에러 없이 도는지, 결과 지오메트리가 맞는지 로컬에서 확인한다.
'use strict';

function colToNum(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function numToCol(n) {
  let out = '';
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

class Cell {
  constructor() {
    this.value = ''; this.formula = ''; this.bg = '#ffffff'; this.note = '';
    this.validation = null; this.numberFormat = ''; this.hAlign = 'left';
  }
}

class Range {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet; this.row = row; this.col = col;
    this.numRows = numRows; this.numCols = numCols;
    if (row < 1 || col < 1) throw new Error('범위 시작이 시트 밖: r' + row + 'c' + col);
    if (row + numRows - 1 > sheet.maxRows) {
      throw new Error('범위가 시트 행을 벗어남: ' + sheet.name + ' 마지막행 ' + (row + numRows - 1) + ' > maxRows ' + sheet.maxRows);
    }
    if (col + numCols - 1 > sheet.maxCols) {
      throw new Error('범위가 시트 열을 벗어남: ' + sheet.name + ' 마지막열 ' + (col + numCols - 1) + ' > maxCols ' + sheet.maxCols);
    }
  }
  _each(fn) {
    for (let r = 0; r < this.numRows; r++)
      for (let c = 0; c < this.numCols; c++)
        fn(this.sheet.cell(this.row + r, this.col + c), r, c);
    return this;
  }
  getSheet() { return this.sheet; } // onEdit(e)의 e.range.getSheet()
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getNumRows() { return this.numRows; }
  getNumColumns() { return this.numCols; }
  getA1Notation() {
    return numToCol(this.col) + this.row + ':' + numToCol(this.col + this.numCols - 1) + (this.row + this.numRows - 1);
  }
  getValue() { return this.sheet.cell(this.row, this.col).value; }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet.cell(this.row + r, this.col + c).value);
      out.push(line);
    }
    return out;
  }
  setValue(v) { return this._each(cell => { cell.value = v; cell.formula = ''; }); }
  setValues(vals) {
    if (vals.length !== this.numRows) throw new Error('setValues 행 수 불일치: ' + vals.length + ' vs ' + this.numRows);
    vals.forEach(row => {
      if (row.length !== this.numCols) throw new Error('setValues 열 수 불일치: ' + row.length + ' vs ' + this.numCols);
    });
    return this._each((cell, r, c) => { cell.value = vals[r][c]; cell.formula = ''; });
  }
  getFormula() { return this.sheet.cell(this.row, this.col).formula; }
  setFormula(f) { return this._each(cell => { cell.formula = f; cell.value = f; }); }
  getBackground() { return this.sheet.cell(this.row, this.col).bg; }
  getBackgrounds() { // [TASK-027] onEdit 업장 시트 분기(거래ID 열 배경 보존)가 읽는다
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet.cell(this.row + r, this.col + c).bg || null);
      out.push(line);
    }
    return out;
  }
  setBackground(v) { return this._each(cell => { cell.bg = v; }); }
  setBackgrounds(vals) { return this._each((cell, r, c) => { cell.bg = vals[r][c]; }); }
  setFontColor() { return this; }
  setFontWeight() { return this; }
  setFontStyle() { return this; }
  setFontSize() { return this; }
  setWrap() { return this; }
  setVerticalAlignment() { return this; }
  setHorizontalAlignment(v) { return this._each(cell => { cell.hAlign = v; }); }
  setNumberFormat(v) { return this._each(cell => { cell.numberFormat = v; }); }
  getDataValidation() { return this.sheet.cell(this.row, this.col).validation; }
  setDataValidation(v) { return this._each(cell => { cell.validation = v; }); }
  clearDataValidations() { return this._each(cell => { cell.validation = null; }); }
  setNote(v) { return this._each(cell => { cell.note = v; }); }
  clearContent() { return this._each(cell => { cell.value = ''; cell.formula = ''; }); }
  merge() { this.sheet.merges.push(this.getA1Notation()); return this; }
  breakApart() {
    this.sheet.merges = this.sheet.merges.filter(m => m !== this.getA1Notation());
    return this;
  }
  protect() {
    const p = {
      _desc: '', _ranges: [], _type: 'RANGE',
      setDescription(d) { this._desc = d; return this; },
      getDescription() { return this._desc; },
      setWarningOnly() { return this; },
      setUnprotectedRanges(r) { this._ranges = r; return this; },
      remove: () => { this.sheet.protections = this.sheet.protections.filter(x => x !== p); }
    };
    this.sheet.protections.push(p);
    return p;
  }
}

class Sheet {
  constructor(name, maxRows = 1000, maxCols = 26) {
    this.name = name; this.maxRows = maxRows; this.maxCols = maxCols;
    this.grid = new Map();
    this.merges = []; this.protections = []; this.cfRules = [];
    this.widths = {}; this.hidden = new Set();
    this.frozenRows = 0; this.frozenCols = 0; this.isHidden = false;
    // [TASK-019] 시트마다 고유 GID. 업장관리 F열(GID)로 시트를 찾는 코드(consolidateAllSheets,
    //   migrateShops_TASK019)가 모든 시트를 같은 것으로 보지 않도록 한다.
    this.sheetId = Sheet._nextId++;
  }
  // [TASK-019] 템플릿 복사(generateNewShops: template.copyTo(ss).setName(name)) 재현.
  //   값·수식·배경·검증을 그대로 복제하고 스프레드시트에 붙인다. 이름은 실제 Sheets처럼 "… 의 사본".
  copyTo(ss) {
    const copy = new Sheet(this.name + ' 의 사본', this.maxRows, this.maxCols);
    for (const [k, cell] of this.grid) copy.grid.set(k, Object.assign(new Cell(), cell));
    copy.widths = Object.assign({}, this.widths);
    copy.merges = this.merges.slice();
    copy.owner = ss;
    ss.sheets.push(copy);
    return copy;
  }
  setName(n) {
    if (this.owner && this.owner.sheets.some(s => s !== this && s.name === n)) throw new Error('이미 존재하는 시트: ' + n);
    this.name = n; return this;
  }
  cell(r, c) {
    const k = r + ':' + c;
    if (!this.grid.has(k)) this.grid.set(k, new Cell());
    return this.grid.get(k);
  }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getLastRow() {
    let last = 0;
    for (const [k, cell] of this.grid) {
      if (cell.value !== '' && cell.value !== null && cell.value !== undefined) last = Math.max(last, +k.split(':')[0]);
    }
    return last;
  }
  getLastColumn() {
    let last = 0;
    for (const [k, cell] of this.grid) {
      if (cell.value !== '' && cell.value !== null && cell.value !== undefined) last = Math.max(last, +k.split(':')[1]);
    }
    return last;
  }
  getRange(a, b, c, d) {
    if (typeof a === 'string') return this.getRange.apply(this, this._parseA1(a));
    return new Range(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
  }
  _parseA1(a1) {
    const parts = a1.split(':');
    const m1 = /^([A-Z]+)(\d+)$/.exec(parts[0]);
    if (!m1) throw new Error('A1 파싱 실패: ' + a1);
    const c1 = colToNum(m1[1]), r1 = +m1[2];
    if (parts.length === 1) return [r1, c1, 1, 1];
    const m2 = /^([A-Z]+)(\d*)$/.exec(parts[1]);
    if (!m2) throw new Error('A1 파싱 실패: ' + a1);
    const c2 = colToNum(m2[1]);
    const r2 = m2[2] ? +m2[2] : this.maxRows; // "A3:A" 같은 열린 범위
    return [Math.min(r1, r2), Math.min(c1, c2), Math.abs(r2 - r1) + 1, Math.abs(c2 - c1) + 1];
  }
  _shiftGrid(fromIndex, delta, axis) { // axis: 'row' | 'col'
    const next = new Map();
    for (const [k, cell] of this.grid) {
      let [r, c] = k.split(':').map(Number);
      if (axis === 'col' && c >= fromIndex) c += delta;
      if (axis === 'row' && r >= fromIndex) r += delta;
      next.set(r + ':' + c, cell);
    }
    this.grid = next;
  }
  insertRowsAfter(after, n) { this.maxRows += n; return this; }
  deleteRow(row) {
    // 실제 Sheets처럼 그 행의 **모든 열**을 지우고 아래를 끌어올린다.
    //   (숨김 열에 든 수식도 함께 사라진다는 점이 중요하다)
    const next = new Map();
    for (const [k, cell] of this.grid) {
      const [r, c] = k.split(":").map(Number);
      if (r === row) continue;
      next.set((r > row ? r - 1 : r) + ":" + c, cell);
    }
    this.grid = next;
    this.maxRows -= 1;
    return this;
  }
  insertColumnsAfter(after, n) { this.maxCols += n; return this; }
  // 사용자가 M 오른쪽의 빈 열을 정리하는 흔한 조작. 숨김 보조 열까지 함께 사라진다는 점이
  //   이 목이 재현해야 하는 핵심이다(거래처 드롭다운 소스가 이렇게 죽었다).
  deleteColumns(col, n) {
    const next = new Map();
    for (const [k, cell] of this.grid) {
      const [r, c] = k.split(":").map(Number);
      if (c >= col && c < col + n) continue;
      next.set(r + ":" + (c >= col + n ? c - n : c), cell);
    }
    this.grid = next;

    const w = {};
    Object.keys(this.widths).forEach(k => {
      const c = +k;
      if (c >= col && c < col + n) return;
      w[c >= col + n ? c - n : c] = this.widths[k];
    });
    this.widths = w;

    const hidden = new Set();
    this.hidden.forEach(c => {
      if (c >= col && c < col + n) return;
      hidden.add(c >= col + n ? c - n : c);
    });
    this.hidden = hidden;

    this.maxCols -= n;
    return this;
  }
  deleteColumn(col) { return this.deleteColumns(col, 1); }
  insertColumnBefore(col) {
    this.maxCols += 1;
    this._shiftGrid(col, 1, 'col');
    // 열 너비도 함께 밀린다. 새 열은 왼쪽 열의 너비를 물려받는다(실제 Sheets 동작).
    const w = {};
    Object.keys(this.widths).forEach(k => { const c = +k; w[c >= col ? c + 1 : c] = this.widths[k]; });
    w[col] = this.widths[col - 1] !== undefined ? this.widths[col - 1] : 100;
    this.widths = w;
    // 병합 범위는 삽입 지점을 품고 있으면 한 칸 넓어진다
    this.merges = this.merges.map(m => {
      const [s, e] = m.split(':');
      const ms = /^([A-Z]+)(\d+)$/.exec(s), me = /^([A-Z]+)(\d+)$/.exec(e);
      let cs = colToNum(ms[1]), ce = colToNum(me[1]);
      if (cs >= col) cs += 1;
      if (ce >= col) ce += 1;
      return numToCol(cs) + ms[2] + ':' + numToCol(ce) + me[2];
    });
    return this;
  }
  // 실제 Sheets는 병합 범위를 가로지르는 고정을 거부한다.
  //   ("병합된 셀의 일부만 포함된 열을 고정할 수 없습니다")
  //   목이 이걸 통과시키면 시트 생성이 통째로 실패하는 버그를 테스트가 못 잡는다.
  _assertNoMergeStraddle(n, axis) {
    for (const m of this.merges) {
      const [a, b] = m.split(":");
      const ma = /^([A-Z]+)(\d+)$/.exec(a), mb = /^([A-Z]+)(\d+)$/.exec(b);
      if (!ma || !mb) continue;
      const start = axis === "col" ? colToNum(ma[1]) : Number(ma[2]);
      const end = axis === "col" ? colToNum(mb[1]) : Number(mb[2]);
      if (start <= n && end > n) {
        throw new Error(
          "병합된 셀의 일부만 포함된 " + (axis === "col" ? "열" : "행") + "을 고정할 수 없습니다. " +
          "셀을 병합 해제하거나 병합된 셀을 모두 포함하도록 더 많은 " +
          (axis === "col" ? "열" : "행") + "을 고정하세요. (" + this.name + " 병합범위 " + m + ", 고정 " + n + ")");
      }
    }
  }
  setFrozenRows(n) { this._assertNoMergeStraddle(n, "row"); this.frozenRows = n; return this; }
  setFrozenColumns(n) { this._assertNoMergeStraddle(n, "col"); this.frozenCols = n; return this; }
  setColumnWidth(c, w) { this.widths[c] = w; return this; }
  setRowHeight() { return this; }
  hideColumns(c) { this.hidden.add(c); return this; }
  hideSheet() { this.isHidden = true; return this; }
  setConditionalFormatRules(rules) { this.cfRules = rules; return this; }
  getConditionalFormatRules() { return this.cfRules; }
  getProtections() { return this.protections.slice(); }
  protect() {
    const p = {
      _desc: '',
      setDescription(d) { this._desc = d; return this; },
      getDescription() { return this._desc; },
      setWarningOnly() { return this; },
      setUnprotectedRanges() { return this; },
      remove: () => { this.protections = this.protections.filter(x => x !== p); }
    };
    this.protections.push(p);
    return p;
  }
  sort() { return this; }
  getSheetId() { return this.sheetId; }
}
Sheet._nextId = 1;

class Spreadsheet {
  constructor(name) { this.name = name; this.sheets = []; }
  getName() { return this.name; }
  getUrl() { return 'https://example.invalid/mock'; }
  insertSheet(name) {
    if (this.sheets.some(s => s.name === name)) throw new Error('이미 존재하는 시트: ' + name);
    const sh = new Sheet(name);
    sh.owner = this;
    this.sheets.push(sh);
    return sh;
  }
  getSheetByName(name) { return this.sheets.find(s => s.name === name) || null; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(sh) { this.sheets = this.sheets.filter(s => s !== sh); }
  toast() {}
  copy(n) { return new Spreadsheet(n); }
  getId() { return 'mock-id'; }
}

function makeValidationBuilder() {
  const v = { type: null, args: null, allowInvalid: true, helpText: '' };
  const b = {
    requireValueInList(list) { v.type = 'LIST'; v.args = list; return b; },
    requireValueInRange(range, showDropdown) { v.type = 'RANGE'; v.args = range; v.showDropdown = showDropdown; return b; },
    requireFormulaSatisfied(f) { v.type = 'FORMULA'; v.args = f; return b; },
    requireNumberGreaterThan(n) { v.type = 'NUM_GT'; v.args = n; return b; },
    setAllowInvalid(x) { v.allowInvalid = x; return b; },
    setHelpText(t) { v.helpText = t; return b; },
    build() { return v; }
  };
  return b;
}

function makeCfBuilder() {
  const rule = { criteria: null, arg: null, bg: null, ranges: [] };
  const b = {
    whenTextEqualTo(t) { rule.criteria = 'TEXT_EQ'; rule.arg = t; return b; },
    whenNumberLessThan(n) { rule.criteria = 'NUM_LT'; rule.arg = n; return b; },
    whenFormulaSatisfied(f) { rule.criteria = 'FORMULA'; rule.arg = f; return b; },
    setBackground(c) { rule.bg = c; return b; },
    setFontColor() { return b; },
    setBold() { return b; },
    setRanges(r) { rule.ranges = r; return b; },
    build() { return rule; }
  };
  return b;
}

function buildEnv(activeSpreadsheet) {
  const scriptProps = new Map();
  const uiCalls = [];
  const env = {};

  env.console = console;
  env.SpreadsheetApp = {
    getActiveSpreadsheet: () => activeSpreadsheet,
    getActive: () => activeSpreadsheet,
    openById: () => activeSpreadsheet,
    flush: () => {},
    newDataValidation: makeValidationBuilder,
    newConditionalFormatRule: makeCfBuilder,
    ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
    getUi: () => ({
      alert: (...a) => { uiCalls.push(a); return 'YES'; },
      prompt: () => ({ getSelectedButton: () => 'CANCEL' }),
      ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' },
      Button: { YES: 'YES', NO: 'NO', OK: 'OK' },
      createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addSubMenu: () => m, addToUi: () => {} }; return m; }
    }),
    BorderStyle: { SOLID: 'SOLID' }
  };
  env.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: k => (scriptProps.has(k) ? scriptProps.get(k) : null),
      setProperty: (k, v) => { scriptProps.set(k, v); },
      deleteProperty: k => { scriptProps.delete(k); },
      getProperties: () => Object.fromEntries(scriptProps)
    })
  };
  // 실제로 값을 보관하는 인메모리 캐시. no-op 스텁이면 CacheManager를 태우는 코드에서
  //   "캐시에 담겼는가 / 쓰기 후 비워졌는가"를 검증할 수 없다.
  const cacheStore = new Map();
  const scriptCache = {
    get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
    put: (k, v) => { cacheStore.set(k, String(v)); },
    getAll: (keys) => {
      const out = {};
      (keys || []).forEach((k) => { if (cacheStore.has(k)) out[k] = cacheStore.get(k); });
      return out;
    },
    remove: (k) => { cacheStore.delete(k); },
    removeAll: (keys) => { (keys || []).forEach((k) => cacheStore.delete(k)); }
  };
  env.CacheService = { getScriptCache: () => scriptCache };
  env.__cacheStore = cacheStore;
  env.LockService = {
    getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {}, tryLock: () => true })
  };
  env.Session = {
    getActiveUser: () => ({ getEmail: () => 'mock@example.invalid' }),
    getScriptTimeZone: () => 'Asia/Seoul',
    getTemporaryActiveUserKey: () => 'mock-key'
  };
  env.Utilities = {
    formatDate: (d, tz, fmt) => new Date(d).toISOString(),
    computeDigest: () => [1, 2, 3],
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    base64Encode: s => Buffer.from(String(s)).toString('base64'),
    getUuid: () => 'mock-uuid',
    sleep: () => {}
  };
  // [TASK-024] Drive 백업 경로(Archive.gs _getBackupFolder / backupMasterSnapshot)가 실제로 돌게 한다.
  //   만든 파일은 env.__driveFiles에 쌓인다 — "업로드 전 스냅샷이 남았는가"를 검증할 수 있다.
  const driveFiles = [];
  const makeFolder = (name) => {
    const folder = {
      _name: name, _subfolders: [],
      getName: () => name,
      createFile: (fileName, content, mime) => { const f = { name: fileName, content, mime, folder: name, trashed: false, getUrl: () => 'x', isTrashed: () => !!f.trashed }; driveFiles.push(f); return f; },
      // [TASK-028] 월마감의 동명 아카이브 파일 검사(_hasLiveFileNamed)가 쓴다 — f.trashed = true로 휴지통 파일을 흉내 낸다
      getFilesByName: (n) => { const hits = driveFiles.filter(x => x.folder === name && x.name === n); let i = 0; return { hasNext: () => i < hits.length, next: () => hits[i++] }; },
      getFoldersByName: (n) => { const hits = folder._subfolders.filter(x => x._name === n); let i = 0; return { hasNext: () => i < hits.length, next: () => hits[i++] }; },
      createFolder: (n) => { const sub = makeFolder(n); folder._subfolders.push(sub); return sub; }
    };
    return folder;
  };
  const rootFolder = makeFolder('root');
  env.DriveApp = {
    getFolderById: () => rootFolder,
    getRootFolder: () => rootFolder,
    getFileById: () => ({ getParents: () => ({ hasNext: () => false, next: () => rootFolder }) }),
    createFile: (fileName, content, mime) => rootFolder.createFile(fileName, content, mime)
  };
  env.__driveFiles = driveFiles;
  env.MimeType = { CSV: 'text/csv', PLAIN_TEXT: 'text/plain' };
  env.MailApp = { sendEmail: () => {} };
  env.HtmlService = {
    createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({ setXFrameOptionsMode: () => ({}) }) }) }),
    createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }),
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
  };
  env.ScriptApp = {
    getProjectTriggers: () => [],
    newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create: () => {} }) }) }) }),
    deleteTrigger: () => {}
  };
  env.__uiCalls = uiCalls;
  env.__scriptProps = scriptProps;
  return env;
}

module.exports = { Sheet, Spreadsheet, Range, buildEnv, colToNum, numToCol };
