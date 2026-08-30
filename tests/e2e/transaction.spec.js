const { test, expect } = require('@playwright/test');
const { hasCredentials, missingEnvReason, login, waitForIdle, SEED_ITEMS } = require('./fixtures/env');

/**
 * TASK-001A 검증용 E2E: 입출고 등록이 ReferenceError 없이 성공하는지.
 *
 * 전제조건 (사용자가 DEV Apps Script 편집기에서 1회 실행):
 *   setupDevScriptProperties()  → APP_ENV=DEV 설정
 *   seedDevData()               → ITEM-TEST-001~003 시드
 */
test.describe('DEV 입출고 등록', () => {
  test.skip(!hasCredentials(), missingEnvReason());

  test('입고 10개 등록 시 오류 없이 저장되고 거래ID가 생성된다', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await login(page);

    // 입출고 기록 탭
    await page.getByRole('button', { name: /입출고 기록/ }).click();
    await waitForIdle(page);

    // 업장 선택 (select는 숨겨져 있으므로 값으로 직접 선택)
    const shopSelect = page.locator('#txShopSelect');
    await expect(shopSelect.locator('option')).not.toHaveCount(1); // "업장 선택..." 외 옵션 존재
    const firstShop = await shopSelect.locator('option').nth(1).getAttribute('value');
    await shopSelect.selectOption(firstShop);
    await waitForIdle(page);

    // 입력
    const today = new Date().toISOString().slice(0, 10);
    await page.locator('#txDate').fill(today);
    await page.locator('#txItemNameSearch').fill('테스트품목_단가1000');
    await page.locator('#itemNameDropdown').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('#itemNameDropdown >> text=테스트품목_단가1000').first().click();

    await expect(page.locator('#txItemCode')).toHaveValue(SEED_ITEMS.ITEM_1);

    await page.locator('#txType').selectOption('입고');
    await page.locator('#txQty').fill('10');
    await page.locator('#txPerson').fill('E2E');
    await page.locator('#txNote').fill('playwright-e2e');

    await page.getByRole('button', { name: /기록 저장/ }).click();
    await waitForIdle(page);

    // 성공 토스트 확인
    const toast = page.locator('#toastContainer');
    await expect(toast).toContainText(/저장|완료|✅/, { timeout: 60000 });

    // TASK-001A 회귀 방지: itemMap 관련 ReferenceError가 없어야 한다
    const itemMapError = consoleErrors.find((e) => /itemMap is not defined/i.test(e));
    expect(itemMapError, `콘솔 오류 발견: ${itemMapError}`).toBeUndefined();

    // 최근 내역에 거래ID가 채워졌는지 확인
    await waitForIdle(page);
    const firstRowTxId = page.locator('#txTableBody tr').first().locator('td').nth(7);
    await expect(firstRowTxId).not.toBeEmpty();
  });
});
