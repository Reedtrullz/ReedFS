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
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 15_000 });
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

async function clickTakeoffSetupButtonRepeatedly(page: Page, name: string, count: number): Promise<void> {
  const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });
  const button = takeoffSetup.getByRole('button', { name });
  await expect(takeoffSetup).toBeVisible();
  await expect(button).toBeVisible();
  await button.evaluate((element, repeatCount) => {
    const htmlButton = element as HTMLButtonElement;
    for (let press = 0; press < repeatCount; press += 1) htmlButton.click();
  }, count);
}

export async function configureTakeoffAirframeThroughVisibleControls(page: Page): Promise<void> {
  const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });

  await clickTakeoffSetupButtonRepeatedly(page, 'Flaps Next', 3);
  await expect(takeoffSetup.getByText('Flaps 5')).toBeVisible();

  await clickTakeoffSetupButtonRepeatedly(page, 'Trim Nose Up', 50);
  await expect(takeoffSetup.getByText('Trim 5.0')).toBeVisible();
}

export async function advanceTakeoffThrustThroughVisibleControls(page: Page): Promise<void> {
  const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });

  await clickTakeoffSetupButtonRepeatedly(page, 'Throttle Up', 20);
  await expect(takeoffSetup.getByText('Throttle 100%')).toBeVisible();
}

export async function configureTakeoffThroughVisibleControls(page: Page): Promise<void> {
  await configureTakeoffAirframeThroughVisibleControls(page);
  await advanceTakeoffThrustThroughVisibleControls(page);
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
