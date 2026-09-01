const { test, expect } = require('./fixtures/browser');
const { hasCredentials, missingEnvReason, login, waitForIdle } = require('./fixtures/env');
const fs = require('fs');
const path = require('path');

/**
 * TASK-002 (단위 목록) / TASK-001B (실사 Excel 다운로드) 검증용 E2E.
 */
test.describe('DEV 기초데이터 · 실사 Excel', () => {
  test.skip(!hasCredentials(), missingEnvReason());

  test('기초데이터 단위 목록에 신규 10종이 노출되고 PACK이 없다', async ({ page }) => {
    const app = await login(page);

    await app.getByRole('button', { name: /기초데이터/ }).click();
    await waitForIdle(page, app);

    const unitList = app.locator('#unitList');
    await expect(unitList).toBeVisible();
    const unitsText = await unitList.innerText();

    for (const u of ['망', '판', '마리', '족', '타레', '벌', '켤레', '매', '평', '본']) {
      expect(unitsText, `신규 단위 '${u}'가 목록에 없습니다`).toContain(u);
    }
    expect(unitsText, "'팩'이 목록에 없습니다").toContain('팩');
    expect(unitsText, "'세트'가 목록에 없습니다").toContain('세트');
    expect(unitsText, "'PACK'이 아직 남아 있습니다").not.toContain('PACK');

    // CASE는 MIGRATIONS[11] 실행 후에만 사라진다. 현재 상태를 기록만 하고 실패시키지 않는다.
    const caseStillPresent = unitsText.includes('CASE');
    console.log(`[INFO] 단위 목록 CASE 잔존 여부: ${caseStillPresent ? '있음 (v11 미실행)' : '없음 (v11 반영됨)'}`);
  });

  test('실사 양식 Excel이 실제로 다운로드되고 유효한 xlsx이다', async ({ page }) => {
    const app = await login(page);

    // 대시보드의 인쇄/다운로드 드롭다운
    await app.getByRole('button', { name: /인쇄\/다운로드/ }).click();

    const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
    await app.getByRole('button', { name: /실사 양식 다운로드/ }).click();
    const download = await downloadPromise;

    // [TASK-006 미해결] 이 테스트는 Playwright 러너 + headless 조합에서
    // `download.saveAs: Target page, context or browser has been closed`로 실패한다.
    // 확인된 사실: 실패 시점에 page/context는 살아 있고 다운로드 산출물만 폐기된다.
    //   - 러너 밖 순수 스크립트(동일 프로필·동일 headless)에서는 항상 성공
    //   - `--headed`로 실행하면 성공
    //   - tracing(`--trace=off`), 신형 headless(`--headless=new`), Safe Browsing 플래그,
    //     새 페이지 사용 — 모두 무관함을 실측으로 배제
    // 앱 측 blob 해제 지연(1초 → 60초, JS_BaseData.html)은 별개의 실제 버그로 확인·수정했으나
    // 이 실패의 원인은 아니었다. 원인 규명 전까지 headless에서는 실패할 수 있다.
    expect(download.suggestedFilename()).toMatch(/^재고실사조사표_\d{8}\.xlsx$/);

    const outDir = path.join(__dirname, '..', '..', 'test-results');
    fs.mkdirSync(outDir, { recursive: true });
    const filePath = path.join(outDir, download.suggestedFilename());
    await download.saveAs(filePath);

    const buf = fs.readFileSync(filePath);
    expect(buf.length, '다운로드 파일이 비어 있습니다').toBeGreaterThan(1000);
    // xlsx는 ZIP 컨테이너 — 매직 넘버 'PK'
    expect(buf[0], 'xlsx ZIP 시그니처(PK) 불일치').toBe(0x50);
    expect(buf[1], 'xlsx ZIP 시그니처(PK) 불일치').toBe(0x4b);
  });
});
