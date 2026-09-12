const { test, expect } = require('./fixtures/browser');
const { hasCredentials, missingEnvReason, login, waitForIdle } = require('./fixtures/env');

/**
 * [TASK-019] 입출고 일괄 업로드 E2E
 *
 *   1. 일괄 업로드 버튼 → 안내문 모달이 뜨고 취소하면 닫힌다
 *   2. 잘못된 행이 섞인 CSV → "검증 실패" 모달, 아무것도 저장되지 않는다
 *   3. 정상 CSV(1행) → 확인 모달 → 저장 시작 → 완료 모달 → 최근 내역에 행이 나타난다
 *
 * 전제조건 (DEV Apps Script 편집기에서 1회): setupDevScriptProperties() → seedDevData()
 * 파일은 디스크에 두지 않고 Buffer로 넘긴다 (Playwright setInputFiles).
 */
test.describe('DEV 입출고 일괄 업로드', () => {
  test.skip(!hasCredentials(), missingEnvReason());

  /** 입출고 탭 진입 + 첫 업장 선택 + 실제 존재하는 품목코드 1개 확보 */
  async function enterTxTabWithShop(page, app) {
    await app.getByRole('button', { name: /입출고 기록/ }).click();
    await waitForIdle(page, app);
    const shopButton = app.locator('#shopSelectionList button').first();
    await shopButton.waitFor({ state: 'visible', timeout: 30000 });
    await shopButton.click();
    await waitForIdle(page, app);
  }

  async function pickExistingItemCode(app) {
    const searchInput = app.locator('#txItemNameSearch');
    const dropdown = app.locator('#itemNameDropdown');
    for (const q of ['테스트', '수건', 'a']) {
      await searchInput.fill(q);
      const visible = await dropdown.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
      if (visible) break;
    }
    await dropdown.locator('.autocomplete-item').first().click();
    const code = await app.locator('#txItemCode').inputValue();
    expect(code).toBeTruthy();
    await searchInput.fill('');
    return code;
  }

  function csvFile(name, lines) {
    // BOM 없는 UTF-8 — 클라이언트 디코더가 UTF-8 → EUC-KR 순으로 판별한다
    return { name, mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n'), 'utf8') };
  }

  test('안내문 모달이 뜨고 취소하면 닫힌다', async ({ page }) => {
    const app = await login(page);
    await enterTxTabWithShop(page, app);

    await app.locator('#btnTxBulkUpload').click();
    const overlay = app.locator('#modalOverlay');
    await expect(overlay).toHaveClass(/active/);
    await expect(app.locator('#modalTitle')).toHaveText(/입출고 일괄 업로드/);
    await expect(app.locator('#bulkGuide')).toContainText('파일 형식');
    await expect(app.locator('#bulkGuide')).toContainText('아무것도 저장하지 않고');
    await expect(app.locator('#btnBulkStart')).toBeVisible();

    await app.locator('#modalFooter').getByRole('button', { name: '취소' }).click();
    await expect(overlay).not.toHaveClass(/active/);
  });

  test('오류 행이 있으면 검증 실패 모달이 뜨고 저장하지 않는다', async ({ page }) => {
    const app = await login(page);
    await enterTxTabWithShop(page, app);
    const code = await pickExistingItemCode(app);
    const today = new Date().toISOString().slice(0, 10);

    await app.locator('#btnTxBulkUpload').click();
    await expect(app.locator('#modalTitle')).toHaveText(/입출고 일괄 업로드/);
    await app.locator('#txBulkFile').setInputFiles(csvFile('bad.csv', [
      '날짜,품목코드,구분,수량,비고',
      `${today},${code},입고,1,playwright-bulk-bad`,
      `${today},${code},반품,1,구분 오류`,
      `${today},NO-SUCH-CODE,입고,1,미등록 품목`
    ]));

    await expect(app.locator('#modalTitle')).toHaveText(/검증 실패/, { timeout: 90000 });
    await expect(app.locator('#modalBody')).toContainText('아무것도 저장하지 않았습니다');
    // 3행(구분)은 클라이언트에서, 4행(품목코드)은 클라이언트 1차 검사 통과 후 서버에서 걸리지만
    // 어느 단계든 오류 행 번호가 표시돼야 한다
    await expect(app.locator('#bulkErrorBody')).toContainText('3행');
    await app.locator('#modalFooter').getByRole('button', { name: '닫기' }).click();
  });

  test('정상 CSV 1건 → 확인 → 저장 완료 → 최근 내역에 표시', async ({ page }) => {
    const app = await login(page);
    await enterTxTabWithShop(page, app);
    const code = await pickExistingItemCode(app);
    const today = new Date().toISOString().slice(0, 10);
    const note = 'playwright-bulk-' + Date.now();

    await app.locator('#btnTxBulkUpload').click();
    await app.locator('#txBulkFile').setInputFiles(csvFile('ok.csv', [
      '날짜,품목코드,구분,수량,비고',
      `${today},${code},입고,1,${note}`
    ]));

    await expect(app.locator('#modalTitle')).toHaveText(/업로드 확인/, { timeout: 90000 });
    await expect(app.locator('#modalBody')).toContainText('검증 통과');
    await expect(app.locator('#bulkPreviewBody')).toContainText(code);

    await app.locator('#btnBulkRun').click();
    await expect(app.locator('#modalTitle')).toHaveText(/업로드 완료/, { timeout: 120000 });
    await expect(app.locator('#modalBody')).toContainText('1건 저장 완료');
    await app.locator('#modalFooter').getByRole('button', { name: '확인' }).click();
    await waitForIdle(page, app);

    const row = app.locator('#txTableBody tr').filter({ hasText: note }).first();
    await expect(row).toBeVisible({ timeout: 60000 });
    await expect(row.locator('td').nth(1)).toHaveText(code);
    await expect(row.locator('td').nth(7)).not.toHaveText(/^[-—]$/);
  });
});
