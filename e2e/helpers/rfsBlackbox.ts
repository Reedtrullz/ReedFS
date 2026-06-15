import { expect, type Page } from '@playwright/test';

export interface VisibleFlightNumbers {
  iasKt: number;
  pitchDeg: number;
  verticalSpeedFpm: number;
  radioAltitudeFt: number | null;
}

export interface VisibleFmaModes {
  thrustActive: string;
  lateralActive: string;
  verticalActive: string;
  autopilotStatus: string;
}

type VisibleMcpModeButton = 'LNAV' | 'SPD' | 'ALT';
type FmaTextExpectation = string | RegExp;

function parseRequiredNumber(label: string, text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  if (!match) throw new Error(`Unable to read ${label} from visible text: ${text}`);
  const value = Number(match[1]);
  if (!Number.isFinite(value)) throw new Error(`Visible ${label} was not finite: ${match[1]}`);
  return value;
}

async function readRequiredVisibleText(page: Page, label: string): Promise<string> {
  const pfd = page.getByLabel('Primary flight display');
  const text = await pfd.getByLabel(label).textContent();
  const normalized = text?.trim();
  if (!normalized) throw new Error(`Unable to read ${label} from visible PFD text.`);
  return normalized;
}

function fmaTextMatches(actual: string, expected: FmaTextExpectation): boolean {
  return typeof expected === 'string' ? actual === expected : expected.test(actual);
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
  await expect(routeStatus.getByText(/LEG\s+1\/5/)).toBeVisible();
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
  for (let press = 0; press < count; press += 1) {
    await button.click();
  }
}

const discreteRepeatKeys = new Set(['ArrowUp', 'ArrowDown', 'Digit8', 'Digit9', 'KeyF', 'KeyG']);

export async function holdKey(page: Page, key: string, countOrDurationUnits: number): Promise<void> {
  if (discreteRepeatKeys.has(key)) {
    for (let press = 0; press < countOrDurationUnits; press += 1) {
      await page.keyboard.press(key);
    }
    return;
  }

  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(countOrDurationUnits * 100);
  } finally {
    await page.keyboard.up(key);
  }
}

export async function waitForVisibleAirspeedAtLeast(page: Page, minKt: number): Promise<void> {
  await expect.poll(async () => (await readVisibleFlightNumbers(page)).iasKt, {
    timeout: 90_000,
    intervals: [500],
  }).toBeGreaterThanOrEqual(minKt);
}

export async function waitForVisiblePitchAtLeast(page: Page, minPitchDeg: number): Promise<void> {
  await expect.poll(async () => (await readVisibleFlightNumbers(page)).pitchDeg, {
    timeout: 10_000,
    intervals: [250],
  }).toBeGreaterThanOrEqual(minPitchDeg);
}

export async function waitForVisiblePositiveRate(page: Page): Promise<void> {
  await expect.poll(async () => {
    const numbers = await readVisibleFlightNumbers(page);
    return numbers.verticalSpeedFpm > 100 && (numbers.radioAltitudeFt ?? 0) >= 5;
  }, {
    timeout: 45_000,
    intervals: [500],
  }).toBe(true);
}

export async function clickVisibleMcpMode(page: Page, mode: VisibleMcpModeButton): Promise<void> {
  const mcp = page.getByRole('region', { name: 'Mode control panel' });
  const button = mcp.getByRole('button', { name: new RegExp(`^${mode}$`) });

  await expect(mcp).toBeVisible();
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
}

export async function readVisibleFmaModes(page: Page): Promise<VisibleFmaModes> {
  return {
    thrustActive: await readRequiredVisibleText(page, 'FMA thr active'),
    lateralActive: await readRequiredVisibleText(page, 'FMA roll active'),
    verticalActive: await readRequiredVisibleText(page, 'FMA pitch active'),
    autopilotStatus: await readRequiredVisibleText(page, 'FMA ap active'),
  };
}

export async function waitForVisibleFmaModes(
  page: Page,
  expected: Partial<Record<keyof VisibleFmaModes, FmaTextExpectation>>,
): Promise<VisibleFmaModes> {
  let latest: VisibleFmaModes | null = null;

  await expect.poll(async () => {
    latest = await readVisibleFmaModes(page);
    return (Object.entries(expected) as [keyof VisibleFmaModes, FmaTextExpectation][]).every(
      ([key, value]) => fmaTextMatches(latest?.[key] ?? '', value),
    );
  }, {
    timeout: 15_000,
    intervals: [250],
  }).toBe(true);

  return latest ?? readVisibleFmaModes(page);
}

export async function sampleVisibleVerticalSpeeds(
  page: Page,
  samples: number,
  intervalMs: number,
): Promise<number[]> {
  if (samples <= 0) throw new Error('sampleVisibleVerticalSpeeds requires at least one sample.');

  const verticalSpeeds: number[] = [];
  for (let sample = 0; sample < samples; sample += 1) {
    verticalSpeeds.push((await readVisibleFlightNumbers(page)).verticalSpeedFpm);
    if (sample < samples - 1) await page.waitForTimeout(intervalMs);
  }
  return verticalSpeeds;
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
