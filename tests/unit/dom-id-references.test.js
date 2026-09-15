/**
 * 클라이언트 JS가 getElementById로 찾는 id가 실제로 어딘가에 있는지 — 정적 검사
 *
 * 회귀 사례(2026-09-15 핫픽스): 사이드바 정리 커밋(83d3007)이 #lastSyncTimeText를 지웠는데 JS_Auth.html은 계속
 * 거기에 썼다. 별도 콜백이던 동안은 조용히 실패했고, TASK-027이 그 호출을 loadBootstrap 안으로 옮기자
 * TypeError가 renderDashboard까지 막아 로그인마다 대시보드가 비었다. 이 검사는 그런 "사라진 요소 참조"를
 * 배포 전에 잡는다.
 *
 * id 출처로 인정하는 것: src/*.html의 id="x"(마크업·JS 템플릿 문자열 모두), JS의 `.id = 'x'` 동적 생성.
 * 검사 대상: src/JS_*.html의 getElementById('x') 문자열 리터럴.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = path.join(__dirname, '..', '..', 'src');
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.html'));

const declared = new Set();
const referenced = new Map(); // id → Set(file)

files.forEach((f) => {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const m of s.matchAll(/\bid=\\?["']([A-Za-z0-9_-]+)\\?["']/g)) declared.add(m[1]);
  for (const m of s.matchAll(/\.id\s*=\s*["']([A-Za-z0-9_-]+)["']/g)) declared.add(m[1]);
  if (!/^JS_/.test(f)) return;
  for (const m of s.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)) {
    if (!referenced.has(m[1])) referenced.set(m[1], new Set());
    referenced.get(m[1]).add(f);
  }
});

const missing = [...referenced.keys()].filter((id) => !declared.has(id)).sort();

console.log(`[DOM id] 선언 ${declared.size}개 · 참조 ${referenced.size}개`);
missing.forEach((id) => console.log('  FAIL #' + id + ' ← ' + [...referenced.get(id)].join(', ')));

assert.ok(referenced.size > 50, 'getElementById 참조를 거의 못 찾았다 — 정규식이 소스와 어긋났는지 확인');
assert.deepStrictEqual(missing, [], '어디에도 없는 id를 getElementById로 찾는다: ' + missing.join(', '));
console.log('✓ 참조하는 id가 모두 존재한다');
