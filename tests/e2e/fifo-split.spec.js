const { test, expect } = require('./fixtures/browser');
const { hasCredentials, missingEnvReason, login, waitForIdle } = require('./fixtures/env');

/**
 * TASK-005 검증용 E2E: 출고가 FIFO 잔여 로트별로 분할 저장되는지.
 *
 * 전제조건 (사용자가 DEV Apps Script 편집기에서 1회 실행):
 *   setupDevScriptProperties()  → APP_ENV=DEV 설정
 *   seedDevData()               → ITEM-TEST-001~003 시드
 *
 * DEV 시트의 기존 로트 잔량은 알 수 없으므로, "출고 수량이 몇 개 로트로 쪼개졌는가"를
 * 고정값으로 단정하지 않고 다음 불변식을 검증한다.
 *   - 분할된 행들의 수량 합 = 요청 수량
 *   - 모든 분할행이 동일한 Parent TxID + `-01`, `-02` … 접미사를 가진다
 *   - 2행 이상으로 분할된 경우 비고에 `[FIFO n/N` 태그가 붙는다
 */

const OUT_QTY = 7;
const IN_QTY = 5;

// 실행마다 고유한 비고 태그.
// 고정 문자열을 쓰면 이전 실행이 DEV 시트에 남긴 분할행까지 함께 수집되어
// (수집 루프는 "다른 비고"를 만나야 멈춘다) 수량 합이 실행 횟수만큼 배가된다.
// 즉 이 스펙이 DEV 시트에서 최초 1회만 통과하던 원인.
const OUT_NOTE = `playwright-fifo-out-${Date.now()}`;

test.describe('DEV FIFO 분할 출고', () => {
  test.skip(!hasCredentials(), missingEnvReason());

  // 한 테스트에서 입고 2회 + 출고 1회를 저장하므로 GAS 왕복이 기본 180초를 넘길 수 있다
  test.setTimeout(10 * 60 * 1000);

  test('출고 7개가 FIFO 잔여 로트별 분할행으로 저장된다', async ({ page }) => {
    const app = await login(page);

    await app.getByRole('button', { name: /입출고 기록/ }).click();
    await waitForIdle(page, app);

    const shopButton = app.locator('#shopSelectionList button').first();
    await shopButton.waitFor({ state: 'visible', timeout: 30000 });
    await shopButton.click();
    await waitForIdle(page, app);

    const today = new Date().toISOString().slice(0, 10);

    // 시드 품목 선택 (없으면 임의 품목으로 폴백)
    const searchInput = app.locator('#txItemNameSearch');
    const dropdown = app.locator('#itemNameDropdown');
    await searchInput.fill('테스트');
    const visible = await dropdown.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    if (!visible) {
      await searchInput.fill('a');
      await dropdown.waitFor({ state: 'visible', timeout: 20000 });
    }
    await dropdown.locator('.autocomplete-item').first().click();

    const itemCode = await app.locator('#txItemCode').inputValue();
    expect(itemCode).toBeTruthy();

    /**
     * 현재 선택된 품목으로 1건 저장 (품목 선택은 저장 후 초기화되므로 매번 재선택).
     * 서버 응답 토스트 문구를 그대로 돌려주어 실패 시 원인이 드러나도록 한다.
     */
    async function saveTx(type, qty, note) {
      await app.locator('#txDate').fill(today);
      if (!(await app.locator('#txItemCode').inputValue())) {
        await searchInput.fill(itemCode);
        await dropdown.waitFor({ state: 'visible', timeout: 20000 });
        await dropdown.locator('.autocomplete-item').first().click();
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
      expect(message, `${type} ${qty} 저장 실패`).toContain('✅');
      return message;
    }

    // 서로 다른 2개 로트 생성
    await saveTx('입고', IN_QTY, 'playwright-fifo-in-1');
    await saveTx('입고', IN_QTY, 'playwright-fifo-in-2');

    // FIFO 분할 대상 출고
    await saveTx('출고', OUT_QTY, OUT_NOTE);

    // 최근 내역은 최신순 정렬 → 상단에서 방금 저장된 출고 분할행을 수집
    const rows = app.locator('#txTableBody tr');
    await expect(rows.first()).toBeVisible({ timeout: 60000 });

    const rowCount = await rows.count();
    const splitRows = [];
    for (let i = 0; i < rowCount; i++) {
      const cells = await rows.nth(i).locator('td').allTextContents();
      if (cells.length < 8) continue;
      const [, code, , type, qty, , note, txId] = cells;
      if (code !== itemCode || type !== '출고') continue;
      if (note.indexOf(OUT_NOTE) !== 0) break;
      splitRows.push({ qty: Number(qty), note: note, txId: txId });
    }

    expect(splitRows.length, '방금 등록한 출고 행을 찾지 못했습니다').toBeGreaterThan(0);

    // 수량 합 = 요청 수량
    const totalQty = splitRows.reduce((sum, r) => sum + r.qty, 0);
    expect(totalQty).toBe(OUT_QTY);

    // Parent TxID 공유 + -01, -02 … 접미사 (테이블은 최신순이므로 역순 정렬 후 검사)
    const ordered = splitRows.slice().reverse();
    const parents = new Set(ordered.map((r) => r.txId.replace(/-\d{2}$/, '')));
    expect(parents.size, `분할행이 동일한 Parent TxID를 공유해야 함: ${ordered.map(r => r.txId).join(', ')}`).toBe(1);
    ordered.forEach((r, i) => {
      expect(r.txId).toMatch(new RegExp(`-${String(i + 1).padStart(2, '0')}$`));
    });

    // 2행 이상 분할 시 FIFO 태그 확인 (재고 부족분은 초과출고 태그가 붙는다)
    if (ordered.length > 1) {
      ordered.forEach((r, i) => {
        if (r.note.indexOf('[FIFO 초과출고]') >= 0) return;
        expect(r.note).toContain(`[FIFO ${i + 1}/${ordered.length}`);
      });
    }
  });
});
