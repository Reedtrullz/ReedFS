import { expect, test } from '@playwright/test';

test('Briefing preflight readback follows scenario, flap and runway changes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Briefing', exact: true })).toBeVisible();
  await expect(page.getByLabel('Preflight sheet')).toHaveCount(0);
  await page.getByRole('button', { name: 'Briefing', exact: true }).click();
  const sheet = page.getByRole('region', { name: 'Preflight sheet' });
  await expect(sheet).toContainText('ENVA 09');
  await expect(sheet).toContainText('61913');
  await page.getByRole('button', { name: 'Flaps Next', exact: true }).click();
  await expect(sheet).toContainText('10 commanded');
  await expect(sheet).toContainText('No matching gameplay fixture');
  await page.getByLabel('Scenario', { exact: true }).selectOption('ksea-light-pattern');
  await expect(sheet).toContainText('50413');
  await expect(sheet).toContainText('KSEA 16L');
  await page.getByLabel('Custom origin runway').selectOption('ENVA:27');
  await page.getByLabel('Custom destination runway').selectOption('ENGM:01L');
  await page.getByRole('button', { name: 'Load Route', exact: true }).click();
  await expect(sheet).toContainText('ENVA 27 / 270 deg true');
  await expect(sheet).toContainText('ENGM 01L');
  await expect(sheet).not.toContainText('141 / 149 / 155 kt');
  await page.getByRole('button', { name: 'Flight', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: /START ROLL/i })).toBeVisible();
});

for (const [width, height] of [[1440, 900], [1100, 720], [720, 900]]) {
  test(`Briefing preflight dock clears loaded-route controls at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.getByRole('button', { name: 'Briefing', exact: true }).click();
    await page.getByLabel('Custom origin runway').selectOption('ENVA:27');
    await page.getByLabel('Custom destination runway').selectOption('ENGM:01L');
    await page.getByRole('button', { name: 'Load Route', exact: true }).click();
    const sheet = page.getByRole('region', { name: 'Preflight sheet' });
    await expect(sheet).toContainText('ENVA 27 / 270 deg true');
    await expect(page.getByRole('status', { name: 'Route load result' })).toContainText('loaded');
    const dock = await page.getByRole('complementary', { name: 'Setup dock' }).boundingBox();
    const controls = await page.getByRole('region', { name: 'Simulator controls' }).boundingBox();
    expect(dock).not.toBeNull();
    expect(controls).not.toBeNull();
    expect((dock?.y ?? 0) + (dock?.height ?? 0)).toBeLessThanOrEqual(controls?.y ?? 0);
    const widthOverflow = await sheet.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(widthOverflow).toBeLessThanOrEqual(1);
  });
}
