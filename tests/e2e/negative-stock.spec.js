const { test, expect } = require('./fixtures/browser');
const { hasCredentials, missingEnvReason, login, waitForIdle } = require('./fixtures/env');

/**
 * [TASK-011] 음수 재고 표시 지원 E2E — DEV Web App 전용.
 *
 * ## 검증 범위
 *   1. 가용 재고를 넘는 출고를 등록하면 현재고가 **음수로 표시**된다 (0으로 클램핑되지 않는다)
 *   2. 음수 재고여도 재고 합계금액(totalValue)은 **0원**이다 (마이너스 자산 차단)
 *   3. 일평균 사용량이 0인 품목은 음수 재고가 되어도 **적정발주량이 0**이다 (P3의 `I<=0` 방어)
 *   4. 대시보드 알림 목록이 음수 수량을 **🚨 붉은 배지**로 렌더링한다
 *   5. (승인 게이트) 음수 재고 상태에서 월마감이 **차단**된다
 *
 * ## 전제조건
 * DEV 스프레드시트에서 `runMigrations()`로 **스키마 v14**까지 적용돼 있어야 한다.
 * v14가 P3(적정발주량)·W3(재고 합계금액) 수식을 재적용하므로, 실행 전에는 3번을 확인할 수 없다.
 *
 * ## 품목 마스터 화면을 검증하지 않는 이유
 * Task 명세는 "웹앱 품목 마스터 테이블"의 배지를 요구하지만, 현재 `Index.html`은
 * `JS_Master.html`을 include하지 않고 `tab-master` / `masterTableBody` 엘리먼트도 없다
 * (커밋 `e4a6d6e`에서 include와 마크업이 함께 제거됐다).
 * 즉 품목 마스터 화면은 배포된 웹앱에 존재하지 않으므로 E2E로 확인할 대상이 없다.
 * 실제 사용자 노출 경로는 **대시보드 알림 목록**(`JS_UI.html`)이며 이 스펙이 그것을 본다.
 *
 * ## 데이터 원복
 * 이 스펙은 DEV 시트에 의도적으로 음수 재고를 만들고, 테스트 종료 시 동일 수량을 입고해 되돌린다.
 * **원복은 UI가 아니라 서버 API(`addTransaction`)로 직접 등록한다.** 원복까지 화면을 거치면
 * 자동완성 드롭다운 같은 UI 흔들림 한 번에 DEV 시트가 음수 재고인 채로 남기 때문이다
 * (실제로 폐기 195건이 복구되지 않은 사고가 있었다). 검증 대상인 출고/폐기 등록만 UI로 수행한다.
 *
 * ## 월마감 차단 테스트가 기본 실행되지 않는 이유
 * 가드레일이 정상이면 `executeMonthlyClosing()`은 시트를 건드리기 전에 반환하므로 안전하다.
 * 그러나 **가드레일에 결함이 있으면 그 호출이 곧 실제 마감**이 되어 DEV 입출고 행이
 * Drive로 이관되고 초기재고가 0으로 리셋된다. 기존 `monthly-closing.spec.js`와 같은 기준으로
 * 명시적 승인을 요구한다.
 *
 *   E2E_ALLOW_MONTHLY_CLOSING=1   # DEV 시트가 마감돼도 무방함을 명시적으로 승인
 */

const ALLOW_REAL_CLOSING = process.env.E2E_ALLOW_MONTHLY_CLOSING === '1';

/** 목표 결손 수량: 현재고를 -SHORTFALL 로 만든다 */
const SHORTFALL = 5;

// ─────────────────────────────────────────────────────────────
//  서버 호출
// ─────────────────────────────────────────────────────────────

/** 앱 프레임에서 서버 함수를 호출한다 (google.script.run → Promise). 세션 토큰은 자동 주입한다. */
async function callServer(app, fnName, args) {
  return app.locator('body').evaluate(
    (_el, [fn, rest]) =>
      new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler((e) => reject(new Error(String((e && e.message) || e))))
          [fn](getToken(), ...rest);
      }),
    [fnName, args || []]
  );
}

/**
 * 재고 재계산을 강제한다 (웹앱의 "🔄 대시보드 및 재고 갱신" 버튼과 동일 경로).
 *
 * ⚠️ `addTransaction()`은 현재고(H열)를 갱신하지 않는다. `recalcStockAndUsage()`를 부르는 곳은
 * `refreshDashboard()`(자정 트리거 · 관리자 수동 갱신), 월마감, 품목 수정뿐이다.
 * 따라서 거래를 저장한 직후 마스터를 읽으면 재고는 거래 이전 값 그대로다
 * (TASK-011 이전부터의 기존 동작이며, 이 스펙이 처음 실패한 실제 원인이었다).
 */
async function forceRecalc(app) {
  const res = await callServer(app, 'runSystemCommand', ['refreshDashboard']);
  expect(res && res.success, `재고 갱신 실패: ${JSON.stringify(res)}`).toBe(true);
}

/**
 * 품목 코드로 마스터 1건 조회.
 * `getItemMasterData`는 60초 캐시를 태우므로 매번 `forceRefreshData`로 캐시를 버린 뒤 읽는다.
 */
async function getItem(app, code) {
  await callServer(app, 'forceRefreshData');
  const items = await callServer(app, 'getItemMasterData');
  return items.find((it) => it.code === code) || null;
}

/** 첫 번째 활성 업장명 */
async function firstShopName(app) {
  const shops = await callServer(app, 'getShopList');
  const s = Array.isArray(shops) ? shops[0] : shops;
  const name = typeof s === 'string' ? s : s && s.name;
  expect(name, '활성 업장을 찾지 못했습니다').toBeTruthy();
  return name;
}

/**
 * 재고 원복 — 서버 API로 직접 입고한다.
 * UI 경로를 쓰지 않는 이유는 파일 상단 "데이터 원복" 주석 참고.
 */
async function restoreStock(app, code, qty, label) {
  const shopName = await firstShopName(app);
  const res = await callServer(app, 'addTransaction', [
    shopName,
    {
      date: new Date().toISOString().slice(0, 10),
      code: code,
      type: '입고',
      qty: qty,
      person: 'E2E',
      note: `playwright ${label} restore (TASK-011)`
    }
  ]);
  expect(res && res.success, `재고 원복 실패 — DEV에 음수 재고가 남는다: ${JSON.stringify(res)}`).toBe(true);

  await forceRecalc(app);
  const restored = await getItem(app, code);
  console.log(`[원복] ${code} → 현재고 ${restored.currentStock} / 자산 ${restored.totalValue}`);
  return restored;
}

// ─────────────────────────────────────────────────────────────
//  UI 조작
// ─────────────────────────────────────────────────────────────

/**
 * 입출고 기록 탭으로 이동하고, 열려 있으면 업장 선택 모달을 닫는다.
 *
 * ⚠️ 모달이 열렸는지는 **`#modalOverlay`의 `.active` 클래스**로만 판정한다.
 * `closeModal()`은 `.active`만 제거하고 `#shopSelectionList` 마크업은 DOM에 남기며,
 * 오버레이는 `display`가 아니라 `opacity`로 숨는다. 따라서 모달이 닫힌 뒤에도
 * 업장 버튼은 Playwright의 visible 판정을 통과하고, 클릭하면 그 위를 덮은
 * 본문 `<div class="mt-16">`이 포인터를 가로채 타임아웃을 통째로 태운다.
 */
async function gotoTransactionTab(page, app) {
  await app.getByRole('button', { name: /입출고 기록/ }).click();
  await waitForIdle(page, app);

  const overlay = app.locator('#modalOverlay');

  // 모달이 뜰 시간을 짧게 준다 (이미 업장이 선택돼 있으면 뜨지 않는다)
  await expect
    .poll(() => overlay.evaluate((el) => el.classList.contains('active')).catch(() => false), {
      timeout: 15000,
      intervals: [250]
    })
    .toBeDefined();

  const isOpen = await overlay.evaluate((el) => el.classList.contains('active')).catch(() => false);
  if (isOpen) {
    await overlay.locator('#shopSelectionList button').first().click();
    await waitForIdle(page, app);
  }
  await expect(overlay, '업장 선택 모달이 닫혀야 한다').not.toHaveClass(/active/);
}

/**
 * 품목 자동완성에서 코드로 품목을 선택한다.
 * 검색창에 같은 값이 남아 있으면 드롭다운이 다시 열리지 않으므로 매번 비운 뒤 입력하고,
 * 목록 로딩 타이밍에 걸릴 수 있어 최대 3회 재시도한다.
 */
async function selectItem(app, code) {
  const searchInput = app.locator('#txItemNameSearch');
  const dropdown = app.locator('#itemNameDropdown');

  for (let attempt = 1; attempt <= 3; attempt++) {
    await searchInput.fill('');
    await searchInput.fill(code);
    const shown = await dropdown
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (shown) {
      await dropdown.locator('.autocomplete-item').first().click();
      if ((await app.locator('#txItemCode').inputValue()) === code) return;
    }
    console.log(`[자동완성] ${code} 선택 재시도 ${attempt}/3`);
  }
  throw new Error(`품목 자동완성에서 ${code}를 선택하지 못했습니다`);
}

/** 거래 1건을 UI로 저장하고 서버 토스트 문구를 그대로 돌려준다 */
async function saveTx(page, app, { code, type, qty, note }) {
  await app.locator('#txDate').fill(new Date().toISOString().slice(0, 10));
  if ((await app.locator('#txItemCode').inputValue()) !== code) {
    await selectItem(app, code);
  }

  await app.locator('#txType').selectOption(type);
  await app.locator('#txQty').fill(String(qty));
  await app.locator('#txPerson').fill('E2E');
  await app.locator('#txNote').fill(note);

  const toast = app.locator('#toastContainer .toast').last();
  await app.getByRole('button', { name: /기록 저장/ }).click();
  await toast.waitFor({ state: 'visible', timeout: 120000 });
  const message = (await toast.innerText()).replace(/\s+/g, ' ').trim();
  await waitForIdle(page, app);

  console.log(`[${type} ${qty}] 서버 응답: ${message}`);
  return message;
}

/** 시드 품목 중 실제 마스터에 존재하는 첫 번째 품목 (재계산 + 캐시 무효화 후 읽는다) */
async function pickSeedItem(app) {
  await forceRecalc(app);
  const items = await callServer(app, 'getItemMasterData');
  expect(items.length, 'DEV 품목 마스터가 비어 있습니다 (seedDevData() 실행 필요)').toBeGreaterThan(0);

  const seeded = items.find((it) => /^ITEM-TEST-/.test(it.code));
  const target = seeded || items[0];
  console.log(`[대상 품목] ${target.code} / ${target.name} / 현재고 ${target.currentStock} / 자산 ${target.totalValue}`);
  return target;
}

// ─────────────────────────────────────────────────────────────
//  테스트
// ─────────────────────────────────────────────────────────────

test.describe('DEV 음수 재고 표시', () => {
  test.skip(!hasCredentials(), missingEnvReason());

  // 거래 저장 + 재계산 + 원복까지 GAS 왕복이 여러 번 발생한다
  test.setTimeout(10 * 60 * 1000);

  test('가용 재고 초과 출고 시 현재고가 음수로 표시되고 재고자산은 0원이 된다', async ({ page }) => {
    const app = await login(page);
    const target = await pickSeedItem(app);
    const before = Number(target.currentStock) || 0;
    // 기준 재고가 이미 음수여도(이전 실행이 원복 전에 죽은 경우) 출고 수량이 0 이하가 되지 않게 한다
    const outQty = Math.max(before, 0) + SHORTFALL;

    await gotoTransactionTab(page, app);
    const outMsg = await saveTx(page, app, {
      code: target.code,
      type: '출고',
      qty: outQty,
      note: `playwright-negative-${Date.now()}`
    });
    expect(outMsg, '초과 출고가 저장되어야 한다 (초과출고 자체는 허용된 동작)').toContain('✅');

    try {
      // 거래 저장만으로는 H열이 갱신되지 않으므로 재계산을 명시적으로 돌린다
      await forceRecalc(app);

      // ── 1) 현재고 음수 + 2) 재고자산 0원 ──
      // 정확히 -SHORTFALL을 단정하지 않는다. DEV 시트는 다른 스펙/사람이 동시에 건드릴 수 있어
      // 기준 재고가 흔들리며, 이 테스트의 본질은 "음수가 0으로 눌리지 않는가"이기 때문이다.
      await expect
        .poll(async () => Number((await getItem(app, target.code)).currentStock), {
          message: '현재고가 음수로 갱신되지 않았습니다 (Math.max(0,...) 클램핑이 남아 있는지 확인)',
          timeout: 120000
        })
        .toBeLessThan(0);

      const after = await getItem(app, target.code);
      console.log(`[결과] ${target.code} 현재고 ${before} → ${after.currentStock} / 자산 ${after.totalValue}`);
      expect(Number(after.totalValue), '음수 재고의 재고자산 평가액은 0원이어야 한다').toBe(0);

      // ── 음수 재고 품목이 대시보드 위험 목록에 실리는지 (관측만) ──
      // DEV 시트는 상태(Q열)·발주점(O열) ARRAYFORMULA가 여전히 비어 있어 KPI가 모두 0이고
      // alertItems가 한 건도 만들어지지 않는다 (v14는 P3/W3만 재적용 — 사용자 결정).
      // 목록 노출 여부는 단정하지 않고 관측 결과만 남긴다. 배지 렌더링 자체는 별도 테스트가 검증한다.
      const dash = await callServer(app, 'getDashboardData');
      const listed = (dash.alertItems || []).some((it) => it.code === target.code);
      console.log(
        `[대시보드] alertItems=${(dash.alertItems || []).length}건, KPI=${JSON.stringify(dash.kpi)}, ` +
          `${target.code} 포함=${listed}`
      );
      if (!listed) {
        test.info().annotations.push({
          type: 'known-issue',
          description:
            'DEV 품목 마스터의 상태(Q열) 수식이 비어 있어 위험 목록이 생성되지 않는다. ' +
            '음수 재고의 위험 분류는 이 결손이 복구된 뒤에야 확인할 수 있다.'
        });
      }
    } finally {
      await restoreStock(app, target.code, outQty, 'negative');
    }
  });

  test('일평균 0인 품목은 음수 재고가 되어도 적정발주량이 0으로 유지된다', async ({ page }) => {
    const app = await login(page);

    await forceRecalc(app);
    const items = await callServer(app, 'getItemMasterData');
    const target = items.find(
      (it) => Number(it.dailyUsage) === 0 && Number(it.currentStock) >= 0 && Number(it.orderQty) === 0
    );
    expect(
      target,
      '일평균 0 · 재고 0 이상 · 발주량 0 인 품목을 찾지 못했습니다 ' +
        '(적정발주량이 전부 빈 값이면 DEV에 스키마 v14 마이그레이션이 필요합니다)'
    ).toBeTruthy();
    console.log(
      `[대상 품목/무사용] ${target.code} / ${target.name} / 현재고 ${target.currentStock} / ` +
        `일평균 ${target.dailyUsage} / 발주량 ${target.orderQty}`
    );

    const before = Number(target.currentStock) || 0;
    const qty = Math.max(before, 0) + SHORTFALL;

    // ⚠️ 출고를 쓰면 그 수량이 최근 30일 사용량으로 잡혀 일평균이 0을 벗어나 조건 자체가 깨진다.
    //    폐기는 재고만 줄이고 일평균 집계에서 제외되므로(StockEngine은 `type === "출고"`만 집계)
    //    "일평균 0인데 재고가 음수" 상태를 만들 수 있는 유일한 경로다.
    await gotoTransactionTab(page, app);
    const outMsg = await saveTx(page, app, {
      code: target.code,
      type: '폐기',
      qty: qty,
      note: `playwright-idle-${Date.now()}`
    });
    expect(outMsg, '폐기가 저장되어야 한다').toContain('✅');

    try {
      await forceRecalc(app);
      const after = await getItem(app, target.code);
      console.log(
        `[결과] ${target.code} 현재고 ${before} → ${after.currentStock} / 일평균 ${after.dailyUsage} / ` +
          `발주량 ${after.orderQty} / 자산 ${after.totalValue}`
      );

      expect(Number(after.currentStock), '현재고가 음수여야 한다').toBeLessThan(0);
      expect(Number(after.dailyUsage), '폐기는 일평균에 잡히지 않아야 한다').toBe(0);
      expect(
        Number(after.orderQty),
        '일평균이 0인 품목은 음수 재고여도 발주를 권장하지 않아야 한다 (P3의 I<=0 방어)'
      ).toBe(0);
      expect(Number(after.totalValue), '음수 재고의 재고자산 평가액은 0원이어야 한다').toBe(0);
    } finally {
      await restoreStock(app, target.code, qty, 'idle');
    }
  });

  test('대시보드 알림 목록이 음수 수량을 🚨 붉은 배지로 렌더링한다', async ({ page }) => {
    const app = await login(page);

    // 서버 데이터가 아니라 **배포된 렌더링 코드**(JS_UI.html의 renderDashboard)를 직접 호출한다.
    // DEV 시트의 상태(Q열) 수식이 비어 alertItems가 한 건도 생성되지 않는 현재 상황에서도
    // 배지 렌더링 자체는 검증할 수 있어야 하기 때문이다.
    await app.locator('body').evaluate(() => {
      renderDashboard({
        date: '9999-12-31 00:00',
        season: '비수기',
        seasonMultiplier: 1,
        kpi: { total: 2, risk: 1, order: 1, normal: 0 },
        alertItems: [
          { code: 'E2E-NEG', name: '음수재고품목', grade: '', currentStock: -5, safetyStock: 0, rop: 0, orderQty: 0, status: 'risk' },
          { code: 'E2E-POS', name: '정상품목', grade: '', currentStock: 3, safetyStock: 5, rop: 8, orderQty: 5, status: 'order' }
        ]
      });
    });

    const negCell = app.locator('#alertTableBody tr').filter({ hasText: 'E2E-NEG' }).first().locator('td').nth(3);
    await expect(negCell, '음수 수량에 🚨 경고 배지가 붙어야 한다').toContainText('🚨');
    await expect(negCell).toContainText('-5');

    const negColor = await negCell.locator('span').first().evaluate((el) => getComputedStyle(el).color);
    expect(negColor, `붉은색 강조가 적용되어야 한다 (실제: ${negColor})`).toBe('rgb(197, 57, 41)');

    // 양수 재고는 기존 표기 그대로 — 배지가 붙지 않아야 한다 (회귀 방지)
    const posCell = app.locator('#alertTableBody tr').filter({ hasText: 'E2E-POS' }).first().locator('td').nth(3);
    await expect(posCell).toHaveText('3');
  });

  test('음수 재고가 남아 있으면 월마감이 차단된다 (E2E_ALLOW_MONTHLY_CLOSING=1 필요)', async ({ page }) => {
    test.skip(
      !ALLOW_REAL_CLOSING,
      'executeMonthlyClosing을 실제 호출한다. 가드레일에 결함이 있으면 DEV 시트가 실제로 마감된다. ' +
        '동의 시 E2E_ALLOW_MONTHLY_CLOSING=1 로 실행하십시오.'
    );

    const app = await login(page);
    const target = await pickSeedItem(app);
    const before = Number(target.currentStock) || 0;
    const outQty = Math.max(before, 0) + SHORTFALL;

    await gotoTransactionTab(page, app);
    const outMsg = await saveTx(page, app, {
      code: target.code,
      type: '출고',
      qty: outQty,
      note: `playwright-closing-guard-${Date.now()}`
    });
    expect(outMsg).toContain('✅');

    try {
      await forceRecalc(app);
      await expect
        .poll(async () => Number((await getItem(app, target.code)).currentStock), { timeout: 120000 })
        .toBeLessThan(0);

      // 마감 대상은 전월 (당월을 마감하면 방금 만든 행까지 대상이 된다)
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const res = await callServer(app, 'executeMonthlyClosing', [prev.getFullYear(), prev.getMonth() + 1]);

      console.log(`[월마감 응답] ${JSON.stringify(res)}`);
      expect(res.success, '음수 재고가 있으면 마감이 차단되어야 한다').toBe(false);
      expect(res.message).toContain('마감 차단');
      expect(res.message).toContain(target.code);
    } finally {
      await restoreStock(app, target.code, outQty, 'closing-guard');
    }
  });
});
