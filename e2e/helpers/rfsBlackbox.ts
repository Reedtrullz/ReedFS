import { expect, type Page } from '@playwright/test';

export interface VisibleFlightNumbers {
  iasKt: number;
  pitchDeg: number;
  verticalSpeedFpm: number;
  radioAltitudeFt: number | null;
}

function parseRequiredNumber(label: string, text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  if (!match) throw new Error(`Unable to read ${label} from visible text: ${text}`);
  const value = Number(match[1]);
  if (!Number.isFinite(value)) throw new Error(`Visible ${label} was not finite: ${match[1]}`);
  return value;
}

export async function openRfsBlackbox(page: Page): Promise<void> {
  await page.goto('/');

  const viewport = page.getByTestId('cesium-viewport');
  await viewport.waitFor({ state: 'visible' });
  await expect(viewport).toHaveAttribute('data-rfs-ready', 'true', { timeout: 15_000 });
  await page.locator('canvas').nth(1).waitFor({ state: 'attached', timeout: 15_000 });
  await expect(page.getByRole('button', { name: /START ROLL|ABORT/i })).toBeVisible();
}

export async function loadKseaRouteThroughVisibleControls(page: Page): Promise<void> {
  await page.getByLabel('Scenario', { exact: true }).selectOption('ksea-tutorial');
  await page.getByRole('button', { name: /^LOAD PLAN$/ }).click();

  const routeStatus = page.getByLabel('Route status');
  await expect(routeStatus.getByText('KSEA→KPDX')).toBeVisible();
  await expect(routeStatus.getByText(/LEG\s+1\/3/)).toBeVisible();
  await expect(routeStatus.getByText('KSEA → OLM')).toBeVisible();
}

export async function startRollThroughVisibleControls(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^START ROLL$/ }).click();
  await expect(page.getByRole('button', { name: /^ABORT$/ })).toBeVisible();
}

export async function configureTakeoffThroughVisibleControls(page: Page): Promise<void> {
  const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
  await expect(takeoffSetup).toBeVisible();
  await expect(takeoffSetup.getByRole('button', { name: 'Flaps Next' })).toBeVisible();
  await expect(takeoffSetup.getByRole('button', { name: 'Trim Nose Up' })).toBeVisible();
  await expect(takeoffSetup.getByRole('button', { name: 'Throttle Up' })).toBeVisible();

  for (let press = 0; press < 3; press += 1) await page.keyboard.press('f');
  await expect(takeoffSetup.getByText('Flaps 5')).toBeVisible();

  for (let press = 0; press < 50; press += 1) await page.keyboard.press('9');
  await expect(takeoffSetup.getByText('Trim 5.0')).toBeVisible();

  for (let press = 0; press < 20; press += 1) await page.keyboard.press('ArrowUp');
  await expect(takeoffSetup.getByText('Throttle 100%')).toBeVisible();
}

export async function readVisibleFlightNumbers(page: Page): Promise<VisibleFlightNumbers> {
  const pfd = page.getByLabel('Primary flight display');
  const airspeedText = await pfd.getByLabel('Airspeed tape').textContent();
  const attitudeText = await pfd.getByLabel('Attitude and heading display').textContent();
  if (!airspeedText || !attitudeText) throw new Error('Primary flight display text was not available.');

  const radioAltitude = pfd.getByLabel('Radio altitude');
  const radioAltitudeText = await radioAltitude.count() > 0 ? await radioAltitude.textContent() : null;

  return {
    iasKt: parseRequiredNumber('IAS', airspeedText, /IAS\s*(\d+)\s*KT/),
    pitchDeg: parseRequiredNumber('pitch', attitudeText, /ATT\s*P\s*([+-]?\d+(?:\.\d+)?)°/),
    verticalSpeedFpm: parseRequiredNumber('vertical speed', attitudeText, /VS\s*([+-]?\d+)/),
    radioAltitudeFt: radioAltitudeText
      ? parseRequiredNumber('radio altitude', radioAltitudeText, /RA\s*(\d+)/)
      : null,
  };
}

export async function rotateToPositiveRateThroughKeyboard(page: Page): Promise<void> {
  await expect.poll(
    async () => (await readVisibleFlightNumbers(page)).iasKt,
    { message: 'visible IAS reaches legal rotation speed', timeout: 30_000 },
  ).toBeGreaterThanOrEqual(135);

  await page.keyboard.down('w');
  try {
    await expect.poll(
      async () => {
        const numbers = await readVisibleFlightNumbers(page);
        return numbers.radioAltitudeFt !== null
          && numbers.radioAltitudeFt > 20
          && numbers.verticalSpeedFpm > 100;
      },
      { message: 'visible PFD shows airborne positive rate', timeout: 15_000 },
    ).toBe(true);
  } finally {
    await page.keyboard.up('w');
  }
}
