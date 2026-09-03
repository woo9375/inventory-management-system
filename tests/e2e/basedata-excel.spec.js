const { test, expect } = require('./fixtures/browser');
const { hasCredentials, missingEnvReason, login, waitForIdle } = require('./fixtures/env');
const fs = require('fs');
const path = require('path');

/**
 * TASK-002 (단위 목록) / TASK-001B (실사 Excel 다운로드) 검증용 E2E.
 * TASK-013에서 실사 양식 출력에 3단계 필터(유·무·전체) 선택 모달이 추가되어,
 * 드롭다운 클릭 → 모달에서 옵션 선택 → 출력 버튼 클릭의 2단계 흐름이 되었다.
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

    // [TASK-013] 드롭다운 항목은 곧바로 다운로드하지 않고 필터 선택 모달을 연다
    await app.getByRole('button', { name: /실사 양식 다운로드/ }).click();

    const overlay = app.locator('#modalOverlay');
    await expect(overlay, '실사 양식 옵션 모달이 열려야 한다').toHaveClass(/active/);
    await expect(app.locator('#modalTitle')).toHaveText(/재고 실사 양식 출력/);

    // 3단계 옵션이 모두 있고 기본값은 재고 '유'(음수 포함)
    await expect(app.locator('input[name="checkFilterOption"]')).toHaveCount(3);
    await expect(app.locator('input[name="checkFilterOption"][value="exist"]')).toBeChecked();

    await app.locator('input[name="checkFilterOption"][value="exist"]').check();

    const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
    await app.locator('#modalFooter').getByRole('button', { name: /Excel 다운로드/ }).click();
    const download = await downloadPromise;

    await expect(overlay, '다운로드 시작 후 모달이 닫혀야 한다').not.toHaveClass(/active/);

    // [TASK-007 해결] 과거 headless에서 이 다운로드가 실패하던 원인은
    // 영속 프로필의 `Default/shared_proto_db`가 다운로드 시작 시 Chrome을 CHECK-crash 시키는 것이었다.
    // 브라우저가 죽으면서 다운로드 산출물이 폐기돼 `saveAs`가 "Target ... has been closed"를 던졌다.
    // tests/e2e/fixtures/browser.js의 purgeCrashingSharedProtoDb()가 매 실행 전 이를 제거한다.
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

  test('[TASK-013] 실사 필터가 실제 품목 데이터에 정확히 적용된다', async ({ page }) => {
    const app = await login(page);

    // 배포된 filterPhysicalCheckItems를 DEV 실데이터에 직접 적용해 결과를 돌려받는다.
    // 다운로드된 xlsx를 파싱하려면 별도 라이브러리가 필요하고, 파일이 유효한 zip인지만
    // 보는 위 테스트로는 "필터가 실제로 걸렸는지"를 알 수 없기 때문이다.
    const result = await app.locator('body').evaluate(
      () =>
        new Promise((resolve, reject) => {
          google.script.run
            .withSuccessHandler((items) => {
              const parse = (v) =>
                v === null || v === undefined || v === '' || isNaN(Number(v)) ? 0 : Number(v);
              const exist = filterPhysicalCheckItems(items, 'exist');
              const zero = filterPhysicalCheckItems(items, 'zero');
              const all = filterPhysicalCheckItems(items, 'all');
              const negatives = items.filter((i) => parse(i.currentStock) < 0);
              resolve({
                total: items.length,
                exist: exist.length,
                zero: zero.length,
                all: all.length,
                negativeTotal: negatives.length,
                negativeInExist: exist.filter((i) => parse(i.currentStock) < 0).length,
                negativeInZero: zero.filter((i) => parse(i.currentStock) < 0).length,
                zeroLeakedIntoExist: exist.filter((i) => parse(i.currentStock) === 0).length,
                nonZeroLeakedIntoZero: zero.filter((i) => parse(i.currentStock) !== 0).length,
                // DEV에 음수 재고가 한 건도 없을 수 있다(실사 조정 직후 등). 그러면 위 음수 단정이
                // 0 === 0 으로 공허하게 통과하므로, 배포된 함수에 음수를 직접 물려 한 번 더 확인한다.
                probe: (() => {
                  const sample = [
                    { code: 'P-NEG-NUM', currentStock: -5 },
                    { code: 'P-NEG-STR', currentStock: '-7' },
                    { code: 'P-POS', currentStock: 3 },
                    { code: 'P-ZERO', currentStock: 0 },
                    { code: 'P-EMPTY', currentStock: '' },
                    { code: 'P-NULL', currentStock: null }
                  ];
                  return {
                    exist: filterPhysicalCheckItems(sample, 'exist').map((i) => i.code),
                    zero: filterPhysicalCheckItems(sample, 'zero').map((i) => i.code),
                    all: filterPhysicalCheckItems(sample, 'all').length,
                    fallback: filterPhysicalCheckItems(sample).length
                  };
                })()
              });
            })
            .withFailureHandler((e) => reject(new Error(String((e && e.message) || e))))
            .getItemMasterData(getToken());
        })
    );

    console.log(`[필터 결과] ${JSON.stringify(result)}`);

    expect(result.total, 'DEV 품목 마스터가 비어 있습니다').toBeGreaterThan(0);
    expect(result.all, "'전체'는 원본 건수와 같아야 한다").toBe(result.total);
    expect(result.exist + result.zero, "'유' + '무' = 전체 여야 한다 (누락·중복 없음)").toBe(result.total);
    expect(result.zeroLeakedIntoExist, "'유'에 0 재고가 섞이면 안 된다").toBe(0);
    expect(result.nonZeroLeakedIntoZero, "'무'에 0이 아닌 재고가 섞이면 안 된다").toBe(0);

    // 이 Task의 핵심: 음수 재고는 전부 '유'에 들어가고 '무'에는 하나도 없어야 한다
    expect(result.negativeInExist, "음수 재고가 '유'에서 누락되면 결손 조사가 불가능하다").toBe(
      result.negativeTotal
    );
    expect(result.negativeInZero, "음수 재고가 '무'로 분류되면 안 된다").toBe(0);

    // 배포된 함수에 음수를 직접 물린 확인 (DEV에 음수 재고가 없을 때도 핵심 요구사항을 검증)
    expect(result.probe.exist, "음수(숫자·문자열)와 양수만 '유'에 들어가야 한다").toEqual([
      'P-NEG-NUM',
      'P-NEG-STR',
      'P-POS'
    ]);
    expect(result.probe.zero, "0·빈값·null만 '무'에 들어가야 한다").toEqual([
      'P-ZERO',
      'P-EMPTY',
      'P-NULL'
    ]);
    expect(result.probe.all, "'전체'는 6건 모두").toBe(6);
    expect(result.probe.fallback, '인자 없이 부르면 전체로 폴백해야 한다 (하위 호환)').toBe(6);
  });

  test('[TASK-013] PDF 인쇄 양식에 필터 구분·건수가 찍히고 음수 재고가 붉게 강조된다', async ({ page }) => {
    const app = await login(page);

    // 실제 렌더링 코드(printPhysicalCheckList)를 그대로 실행하되,
    //  · window.print()는 다이얼로그가 떠 테스트를 멈추므로 스텁으로 대체
    //  · 서버 응답은 음수/0/양수가 모두 든 합성 데이터로 대체 (DEV에 음수 재고가 없어도 검증 가능)
    // 인쇄 후 컨테이너를 비우는 setTimeout보다 먼저 읽어야 하므로 innerHTML을 즉시 스냅샷한다.
    const printedHtml = await app.locator('body').evaluate(() => {
      const realRun = google.script.run;
      const realPrint = window.print;
      let printed = null;

      const items = [
        { code: 'PR-NEG', name: '결손품목', category: '원재료', unit: 'EA', currentStock: -5 },
        { code: 'PR-POS', name: '정상품목', category: '원재료', unit: 'EA', currentStock: 12 },
        { code: 'PR-ZERO', name: '영재고', category: '원재료', unit: 'EA', currentStock: 0 }
      ];

      const chain = {
        withSuccessHandler(fn) { chain._ok = fn; return chain; },
        withFailureHandler() { return chain; },
        getItemMasterData() { chain._ok(items); }
      };

      try {
        window.print = function () {
          printed = document.getElementById('printContainer').innerHTML;
        };
        google.script.run = chain;
        printPhysicalCheckList('exist');
      } finally {
        google.script.run = realRun;
        window.print = realPrint;
      }
      return printed;
    });

    // window.print()는 500ms setTimeout 뒤에 불리므로, 스냅샷이 잡힐 때까지 재시도한다
    const html = printedHtml !== null
      ? printedHtml
      : await app.locator('body').evaluate(
          () => new Promise((resolve) => setTimeout(() => resolve(document.getElementById('printContainer').innerHTML), 700))
        );

    expect(html, '인쇄 컨테이너가 렌더링되지 않았습니다').toBeTruthy();

    // 헤더: 필터 구분명 + 대상 건수 ('유'는 -5, 12 두 건이고 0 재고는 빠진다)
    expect(html).toContain("구분: 재고 '유' (음수 포함)");
    expect(html).toContain('(2건)');

    // 0 재고 품목은 '유' 목록에서 빠져야 한다
    expect(html).toContain('PR-NEG');
    expect(html).toContain('PR-POS');
    expect(html, "0 재고가 '유' 인쇄물에 섞이면 안 된다").not.toContain('PR-ZERO');

    // 음수 재고 셀만 붉은색 강조
    const negCell = html.match(/<td style="([^"]*)">-5<\/td>/);
    expect(negCell, '음수 재고(-5) 셀을 찾지 못했습니다').not.toBeNull();
    expect(negCell[1], '음수 재고는 붉게 강조되어야 한다').toContain('#dc2626');

    const posCell = html.match(/<td style="([^"]*)">12<\/td>/);
    expect(posCell, '양수 재고(12) 셀을 찾지 못했습니다').not.toBeNull();
    expect(posCell[1], '양수 재고에는 붉은 강조가 붙으면 안 된다').not.toContain('#dc2626');
  });
});
