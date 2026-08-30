/**
 * 단위 테스트 러너 (TASK-004)
 *
 * GAS 코드는 Node에서 직접 실행할 수 없으므로, 이 디렉터리의 테스트는
 * `src/*.gs`의 핵심 로직 블록을 Node로 옮겨 Sheets API를 모킹한
 * "로직 시뮬레이션" 방식이다. 실제 GAS 런타임 검증은 DEV 환경 E2E가 담당한다.
 *
 * 각 *.test.js는 실패 시 예외를 던지고 종료코드 != 0 이 되어야 한다.
 *
 * 실행: npm run test:unit
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const testFiles = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

if (testFiles.length === 0) {
  console.error('실행할 테스트 파일이 없습니다 (tests/unit/*.test.js).');
  process.exit(1);
}

let failed = 0;

for (const file of testFiles) {
  console.log('\n══════════════════════════════════════════');
  console.log('▶ ' + file);
  console.log('══════════════════════════════════════════');
  try {
    const out = execFileSync(process.execPath, [path.join(dir, file)], { encoding: 'utf8' });
    process.stdout.write(out);
  } catch (err) {
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    console.error('✗ FAILED: ' + file);
    failed++;
  }
}

console.log('\n══════════════════════════════════════════');
if (failed > 0) {
  console.error(`✗ ${failed}/${testFiles.length} 테스트 파일 실패`);
  process.exit(1);
}
console.log(`✓ 전체 통과 (${testFiles.length}개 테스트 파일)`);
