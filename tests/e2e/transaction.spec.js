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

    const app = await login(page);

    // 입출고 기록 탭 (선택된 업장이 없으면 업장 선택 모달이 자동 오픈됨)
    await app.getByRole('button', { name: /입출고 기록/ }).click();
    await waitForIdle(page, app);

    // 모달에서 첫 번째 업장 선택
    const shopButton = app.locator('#shopSelectionList button').first();
    await shopButton.waitFor({ state: 'visible', timeout: 30000 });
    await shopButton.click();
    await waitForIdle(page, app);

    // 입력 (날짜 및 품목 검색)
    const today = new Date().toISOString().slice(0, 10);
    await app.locator('#txDate').fill(today);
    
    // 시드 품목('테스트') 검색 시도, 없을 경우 일반 품목 폴백
    const searchInput = app.locator('#txItemNameSearch');
    await searchInput.fill('테스트');
    
    const dropdown = app.locator('#itemNameDropdown');
    const isDropdownVisible = await dropdown.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    
    if (!isDropdownVisible) {
      // seedDevData()가 아직 안 돌았을 경우 실제 시트 품목 검색으로 폴백
      await searchInput.fill('수건');
      const fallbackVisible = await dropdown.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
      if (!fallbackVisible) {
        await searchInput.fill('a');
        await dropdown.waitFor({ state: 'visible', timeout: 20000 });
      }
    }
    
    await dropdown.locator('.autocomplete-item').first().click();

    const selectedCode = await app.locator('#txItemCode').inputValue();
    expect(selectedCode).toBeTruthy();

    await app.locator('#txType').selectOption('입고');
    await app.locator('#txQty').fill('10');
    await app.locator('#txPerson').fill('E2E');
    await app.locator('#txNote').fill('playwright-e2e');

    await app.getByRole('button', { name: /기록 저장/ }).click();
    await waitForIdle(page, app);

    // TASK-001A 회귀 방지: itemMap 관련 ReferenceError가 없어야 한다
    const itemMapError = consoleErrors.find((e) => /itemMap is not defined/i.test(e));
    expect(itemMapError, `콘솔 오류 발견: ${itemMapError}`).toBeUndefined();

    // 최근 내역 테이블에 방금 저장된 품목코드 행이 나타날 때까지 대기
    const dataRow = app.locator('#txTableBody tr').filter({ hasText: selectedCode }).first();
    await expect(dataRow).toBeVisible({ timeout: 60000 });

    const txIdCell = dataRow.locator('td').nth(7);
    await expect(txIdCell).not.toHaveText('-', { timeout: 30000 });
  });
});
