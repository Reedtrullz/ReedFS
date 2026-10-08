import { expect, test } from '@playwright/test';

test('actual browser saves wait for the origin lock and preserve concurrent new slots', async ({ page, context }) => {
  const other = await context.newPage();
  await page.goto('/'); await other.goto('/');
  await page.getByLabel('Save slot name').waitFor(); await other.getByLabel('Save slot name').waitFor();
  await page.evaluate(() => {
    const state = window as unknown as { held?: boolean; release?: () => void };
    void navigator.locks.request('rfs-scenario-saves', async () => {
      state.held = true;
      await new Promise<void>((resolve) => { state.release = resolve; });
    });
  });
  await page.waitForFunction(() => (window as unknown as { held?: boolean }).held);
  try {
    await other.getByLabel('Save slot name').fill('Locked save');
    await other.getByRole('button', { name: 'Save scenario state', exact: true }).click();
    await expect(other.getByText(/Waiting for save lock/)).toBeVisible();
    expect(await other.evaluate(() => localStorage.getItem('rfs.scenarioSnapshot.v1'))).toBeNull();
  } finally { await page.evaluate(() => (window as unknown as { release?: () => void }).release?.()); }
  await expect(other.getByText('Locked save saved.', { exact: true })).toBeVisible();
  await page.getByLabel('Save slot name').fill('First session');
  await other.getByLabel('Save slot name').fill('Second session');
  await Promise.all([
    page.getByRole('button', { name: 'Save scenario state', exact: true }).click(),
    other.getByRole('button', { name: 'Save scenario state', exact: true }).click(),
  ]);
  await expect(page.getByText('First session saved.', { exact: true })).toBeVisible();
  await expect(other.getByText('Second session saved.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rfs.scenarioSnapshot.v1')!).slots).sort())).toEqual(['first-session', 'locked-save', 'second-session']);
});

test('actual full browser quota preserves previous saves and offers the pending payload export', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Save slot name').fill('Preserved');
  await page.getByRole('button', { name: 'Save scenario state', exact: true }).click();
  await expect(page.getByText('Preserved saved.', { exact: true })).toBeVisible();
  const previous = await page.evaluate(() => {
    const previous = localStorage.getItem('rfs.scenarioSnapshot.v1');
    try { for (let i = 0; i < 3000; i++) localStorage.setItem(`quota-fill-${i}`, 'x'.repeat(4096)); }
    catch (error) { if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') throw error; }
    return previous;
  });
  try {
    await page.getByLabel('Save slot name').fill('Pending quota payload');
    await page.getByRole('button', { name: 'Save scenario state', exact: true }).click();
    await expect(page.getByText(/Scenario save failed:/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('rfs.scenarioSnapshot.v1'))).toBe(previous);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export pending save' }).click();
    expect((await download).suggestedFilename()).toBe('rfs-pending-save.json');
    await page.getByRole('button', { name: 'Discard pending save' }).click();
    await expect(page.getByRole('button', { name: 'Export pending save' })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('rfs.scenarioSnapshot.v1'))).toBe(previous);
  } finally { await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('quota-fill-')).forEach((key) => localStorage.removeItem(key))); }
});

test('stale overwrite and delete confirmations preserve another session version', async ({ page, context }) => {
  const other = await context.newPage();
  await page.goto('/'); await other.goto('/');
  await page.getByLabel('Save slot name').fill('Shared');
  await other.getByLabel('Save slot name').fill('Shared');
  await page.getByRole('button', { name: 'Save scenario state', exact: true }).click();
  await expect(page.getByText('Shared saved.', { exact: true })).toBeVisible();
  await expect(other.getByLabel('Saved scenario slot', { exact: true })).toContainText('Shared');
  await page.getByRole('button', { name: 'Save scenario state', exact: true }).click();
  await other.getByRole('button', { name: 'Save scenario state', exact: true }).click();
  await other.getByRole('button', { name: 'Confirm overwrite Shared' }).click();
  await expect(other.getByText('Shared overwritten.', { exact: true })).toBeVisible();
  const newer = await other.evaluate(() => localStorage.getItem('rfs.scenarioSnapshot.v1'));
  await page.getByRole('button', { name: 'Confirm overwrite Shared' }).click();
  await expect(page.getByText(/Save slot changed in another session/)).toBeVisible();
  await page.getByRole('button', { name: 'Discard pending save' }).click();
  expect(await page.evaluate(() => localStorage.getItem('rfs.scenarioSnapshot.v1'))).toBe(newer);
  await page.getByRole('button', { name: 'Delete saved slot Shared' }).click();
  await other.getByRole('button', { name: 'Save scenario state', exact: true }).click();
  await other.getByRole('button', { name: 'Confirm overwrite Shared' }).click();
  await expect(other.getByText('Shared overwritten.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm delete Shared' }).click();
  await expect(page.getByText(/Save slot changed in another session/)).toBeVisible();
  expect(await page.evaluate(() => Boolean(JSON.parse(localStorage.getItem('rfs.scenarioSnapshot.v1')!).slots.shared))).toBe(true);
  await page.getByRole('button', { name: 'Delete saved slot Shared' }).click();
  await other.getByLabel('Save slot name').fill('Surviving');
  await Promise.all([
    page.getByRole('button', { name: 'Confirm delete Shared' }).click(),
    other.getByRole('button', { name: 'Save scenario state', exact: true }).click(),
  ]);
  await expect(page.getByText('Saved slot deleted.', { exact: true })).toBeVisible();
  await expect(other.getByText('Surviving saved.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rfs.scenarioSnapshot.v1')!).slots))).toEqual(['surviving']);
});

test('discard cancels a queued save without replacing an earlier pending payload', async ({ page, context }) => {
  const other = await context.newPage();
  await page.goto('/'); await other.goto('/');
  await page.getByLabel('Save slot name').waitFor();
  await other.evaluate(() => {
    const state = window as unknown as { held?: boolean; release?: () => void };
    void navigator.locks.request('rfs-scenario-saves', async () => {
      state.held = true; await new Promise<void>((resolve) => { state.release = resolve; });
    });
  });
  await other.waitForFunction(() => (window as unknown as { held?: boolean }).held);
  try {
    await page.getByLabel('Save slot name').fill('Queued');
    await page.getByRole('button', { name: 'Save scenario state', exact: true }).click();
    await expect(page.getByText(/Waiting for save lock/)).toBeVisible();
    await page.getByRole('button', { name: 'Save scenario state', exact: true }).click();
    await expect(page.getByText(/Export or discard the pending save/)).toBeVisible();
    await page.getByRole('button', { name: 'Discard pending save' }).click();
  } finally { await other.evaluate(() => (window as unknown as { release?: () => void }).release?.()); }
  await page.getByLabel('Save slot name').fill('After discard');
  await page.getByRole('button', { name: 'Save scenario state', exact: true }).click();
  await expect(page.getByText('After discard saved.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rfs.scenarioSnapshot.v1')!).slots))).toEqual(['after-discard']);
});
