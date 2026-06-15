import { expect, type Locator, type Page } from '@playwright/test';

export interface VisibleFlightNumbers {
  iasKt: number;
  altitudeFt: number;
  pitchDeg: number;
  verticalSpeedFpm: number;
  radioAltitudeFt: number | null;
}

export interface VisibleRouteStatus {
  text: string;
  activeLeg: string | null;
  distanceToGoNm: number | null;
}

export interface VisibleFmaModes {
  thrustActive: string;
  lateralActive: string;
  verticalActive: string;
  autopilotStatus: string;
}

type VisibleMcpModeButton = 'LNAV' | 'SPD' | 'ALT' | 'VS' | 'VNAV';
type FmaTextExpectation = string | RegExp;

interface VisibleSimDriveOptions {
  timeoutMs: number;
  stepMs?: number;
}

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

async function activateAlreadyVisibleControl(control: Locator): Promise<void> {
  // In fake-clock driven tests, Chromium can pause requestAnimationFrame enough that
  // Playwright's pointer actionability waits never settle. Dispatching click on a
  // control we already resolved as visible still exercises the real button handler
  // while avoiding direct app-state reads or mutations.
  await control.dispatchEvent('click');
}

export async function openRfsBlackbox(page: Page): Promise<void> {
  await page.goto('/');

  const viewport = page.getByTestId('cesium-viewport');
  await viewport.waitFor({ state: 'visible' });
  await expect(viewport).toHaveAttribute('data-rfs-ready', 'true', { timeout: 15_000 });
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /START ROLL|ABORT/i })).toBeVisible();
}

export async function selectKseaScenarioThroughVisibleControls(page: Page): Promise<void> {
  await page.getByLabel('Scenario', { exact: true }).selectOption('ksea-tutorial');
}

export async function loadSelectedRouteThroughVisibleControls(page: Page): Promise<void> {
  const loadPlanButton = page.getByRole('button', { name: /^LOAD PLAN$/ });
  await expect(loadPlanButton).toBeVisible();
  // After long page.clock.runFor() advances, Chromium's rAF can leave actionability
  // checks waiting even though the visible button is targetable. This still uses the
  // real user-facing control and does not inspect or mutate app state.
  await activateAlreadyVisibleControl(loadPlanButton);

  const routeStatus = page.getByLabel('Route status');
  await expect(routeStatus.getByText('KSEA→KPDX')).toBeVisible();
  await expect(routeStatus.getByText(/LEG\s+1\/5/)).toBeVisible();
  await expect(routeStatus.getByText('KSEA → OLM')).toBeVisible();
}

export async function loadKseaRouteThroughVisibleControls(page: Page): Promise<void> {
  await selectKseaScenarioThroughVisibleControls(page);
  await loadSelectedRouteThroughVisibleControls(page);
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
    // After page.clock.runFor(), Chromium's rAF can be paused; dispatch still targets
    // this already-visible control without using hidden app state or DOM mutation.
    await activateAlreadyVisibleControl(button);
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

export async function advanceVisibleSimTime(page: Page, milliseconds: number): Promise<void> {
  await page.clock.runFor(milliseconds);
}

export async function holdKeyForVisibleSimTime(page: Page, key: string, milliseconds: number): Promise<void> {
  await page.keyboard.down(key);
  try {
    await advanceVisibleSimTime(page, milliseconds);
  } finally {
    await page.keyboard.up(key);
  }
}

export async function driveVisibleSimUntil(
  page: Page,
  description: string,
  predicate: () => Promise<boolean>,
  { timeoutMs, stepMs = 1000 }: VisibleSimDriveOptions,
): Promise<void> {
  let elapsedMs = 0;
  while (elapsedMs <= timeoutMs) {
    if (await predicate()) return;
    await advanceVisibleSimTime(page, stepMs);
    elapsedMs += stepMs;
  }
  throw new Error(`Timed out after ${timeoutMs} ms of visible simulator time waiting for ${description}.`);
}

export async function rotateToVisiblePositiveRate(page: Page): Promise<void> {
  await driveVisibleSimUntil(page, 'positive rate after visible rotation input', async () => {
    const numbers = await readVisibleFlightNumbers(page);
    if (numbers.verticalSpeedFpm > 100 && (numbers.radioAltitudeFt ?? 0) >= 5) return true;
    if (numbers.iasKt >= 135 && numbers.pitchDeg < 9) {
      await holdKeyForVisibleSimTime(page, 'KeyW', 650);
    }
    return false;
  }, {
    timeoutMs: 45_000,
    stepMs: 350,
  });
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
  // See clickTakeoffSetupButtonRepeatedly: fake-clock driven rAF can starve
  // Playwright actionability after long simulated-time advances.
  await activateAlreadyVisibleControl(button);
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

  await driveVisibleSimUntil(page, `FMA modes matching ${JSON.stringify(expected)}`, async () => {
    latest = await readVisibleFmaModes(page);
    return (Object.entries(expected) as [keyof VisibleFmaModes, FmaTextExpectation][]).every(
      ([key, value]) => fmaTextMatches(latest?.[key] ?? '', value),
    );
  }, {
    timeoutMs: 15_000,
    stepMs: 250,
  });

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

export async function idleThrustThroughVisibleControls(page: Page): Promise<void> {
  const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });

  await clickTakeoffSetupButtonRepeatedly(page, 'Throttle Down', 20);
  await expect(takeoffSetup.getByText('Throttle 0%')).toBeVisible();
}

export async function cleanUpAirframeThroughVisibleControls(page: Page): Promise<void> {
  const takeoffSetup = page.getByRole('region', { name: 'Takeoff setup' });

  await clickTakeoffSetupButtonRepeatedly(page, 'Flaps Previous', 3);
  await expect(takeoffSetup.getByText('Flaps 0')).toBeVisible();
}

export async function readVisibleRouteStatus(page: Page): Promise<VisibleRouteStatus> {
  const text = (await page.getByLabel('Route status').textContent())?.replace(/\s+/g, ' ').trim() ?? '';
  const activeLeg = text.match(/([A-Z0-9]+\s+→\s+[A-Z0-9]+)/)?.[1] ?? null;
  const dtgMatch = text.match(/DTG\s*([0-9]+(?:\.[0-9]+)?)\s*NM/);
  const distanceToGoNm = dtgMatch ? Number(dtgMatch[1]) : null;
  return { text, activeLeg, distanceToGoNm: Number.isFinite(distanceToGoNm) ? distanceToGoNm : null };
}

export async function readVisibleFlightPhase(page: Page): Promise<string> {
  const text = (await page.getByLabel('PFD flight phase').textContent())?.trim() ?? '';
  const match = text.match(/^PHASE\s+([A-Z_]+)$/);
  if (!match) throw new Error(`Unable to read visible flight phase from PFD text: ${text}`);
  return match[1];
}

export async function waitForVisibleFlightPhase(page: Page, expected: RegExp): Promise<string> {
  let latest = '';
  await driveVisibleSimUntil(page, `PFD flight phase matching ${expected}`, async () => {
    latest = await readVisibleFlightPhase(page);
    return expected.test(latest);
  }, {
    timeoutMs: 180_000,
    stepMs: 1000,
  });
  return latest;
}

export async function waitForVisibleRouteText(page: Page, expected: RegExp): Promise<VisibleRouteStatus> {
  let latest: VisibleRouteStatus | null = null;
  await driveVisibleSimUntil(page, `route status matching ${expected}`, async () => {
    latest = await readVisibleRouteStatus(page);
    return expected.test(latest.text);
  }, {
    timeoutMs: 180_000,
    stepMs: 1000,
  });
  return latest ?? readVisibleRouteStatus(page);
}

export async function waitForVisibleCoachText(page: Page, expected: RegExp): Promise<string> {
  let latest = '';
  await driveVisibleSimUntil(page, `coach status matching ${expected}`, async () => {
    latest = (await page.getByLabel('Coach status').textContent())?.replace(/\s+/g, ' ').trim() ?? '';
    return expected.test(latest);
  }, {
    timeoutMs: 180_000,
    stepMs: 1000,
  });
  return latest;
}

async function readMcpText(page: Page): Promise<string> {
  return (await page.getByRole('region', { name: 'Mode control panel' }).textContent())?.replace(/\s+/g, ' ').trim() ?? '';
}

function readMcpAltitudeTarget(text: string): number {
  return parseRequiredNumber('MCP altitude target', text, /ALT\s+(\d+)/);
}

function readMcpVerticalSpeedTarget(text: string): number {
  return parseRequiredNumber('MCP vertical speed target', text, /VS\s+([+-]?\d+)/);
}

export async function setVisibleMcpAltitude(page: Page, targetFt: number): Promise<void> {
  const mcp = page.getByRole('region', { name: 'Mode control panel' });
  const buttonName = targetFt >= readMcpAltitudeTarget(await readMcpText(page)) ? 'ALT +1000' : 'ALT -1000';
  const button = mcp.getByRole('button', { name: buttonName });
  for (let guard = 0; guard < 50; guard += 1) {
    const current = readMcpAltitudeTarget(await readMcpText(page));
    if (current === targetFt) return;
    if ((buttonName === 'ALT +1000' && current > targetFt) || (buttonName === 'ALT -1000' && current < targetFt)) {
      throw new Error(`MCP altitude target stepped past ${targetFt}; current ${current}.`);
    }
    await activateAlreadyVisibleControl(button);
  }
  throw new Error(`Unable to set visible MCP altitude target to ${targetFt}.`);
}

export async function setVisibleMcpAltitudeAtLeast(page: Page, minTargetFt: number): Promise<number> {
  const mcp = page.getByRole('region', { name: 'Mode control panel' });
  const button = mcp.getByRole('button', { name: 'ALT +1000' });
  for (let guard = 0; guard < 50; guard += 1) {
    const current = readMcpAltitudeTarget(await readMcpText(page));
    if (current >= minTargetFt) return current;
    await activateAlreadyVisibleControl(button);
  }
  throw new Error(`Unable to set visible MCP altitude target at or above ${minTargetFt}.`);
}

export async function setVisibleMcpAltitudeAtMost(page: Page, maxTargetFt: number): Promise<number> {
  const mcp = page.getByRole('region', { name: 'Mode control panel' });
  const button = mcp.getByRole('button', { name: 'ALT -1000' });
  for (let guard = 0; guard < 50; guard += 1) {
    const current = readMcpAltitudeTarget(await readMcpText(page));
    if (current <= maxTargetFt) return current;
    await activateAlreadyVisibleControl(button);
  }
  throw new Error(`Unable to set visible MCP altitude target at or below ${maxTargetFt}.`);
}

export async function setVisibleMcpVerticalSpeed(page: Page, targetFpm: number): Promise<void> {
  const mcp = page.getByRole('region', { name: 'Mode control panel' });
  const buttonName = targetFpm >= readMcpVerticalSpeedTarget(await readMcpText(page)) ? 'VS +100' : 'VS -100';
  const button = mcp.getByRole('button', { name: buttonName });
  for (let guard = 0; guard < 80; guard += 1) {
    const current = readMcpVerticalSpeedTarget(await readMcpText(page));
    if (current === targetFpm) return;
    if ((buttonName === 'VS +100' && current > targetFpm) || (buttonName === 'VS -100' && current < targetFpm)) {
      throw new Error(`MCP vertical speed target stepped past ${targetFpm}; current ${current}.`);
    }
    await activateAlreadyVisibleControl(button);
  }
  throw new Error(`Unable to set visible MCP vertical speed target to ${targetFpm}.`);
}

export async function configureTakeoffThroughVisibleControls(page: Page): Promise<void> {
  await configureTakeoffAirframeThroughVisibleControls(page);
  await advanceTakeoffThrustThroughVisibleControls(page);
}

export async function readVisibleFlightNumbers(page: Page): Promise<VisibleFlightNumbers> {
  const pfd = page.getByLabel('Primary flight display');
  const airspeedText = await pfd.getByLabel('Airspeed tape').textContent();
  const altitudeText = await pfd.getByLabel('Altitude tape').textContent();
  const attitudeText = await pfd.getByLabel('Attitude and heading display').textContent();
  if (!airspeedText || !altitudeText || !attitudeText) throw new Error('Primary flight display text was not available.');

  const radioAltitude = pfd.getByLabel('Radio altitude');
  const radioAltitudeText = await radioAltitude.count() > 0 ? await radioAltitude.textContent() : null;

  return {
    iasKt: parseRequiredNumber('IAS', airspeedText, /IAS\s*(\d+)\s*KT/),
    altitudeFt: parseRequiredNumber('altitude', altitudeText, /ALT\s*(\d+)\s*FT/),
    pitchDeg: parseRequiredNumber('pitch', attitudeText, /ATT\s*P\s*([+-]?\d+(?:\.\d+)?)°/),
    verticalSpeedFpm: parseRequiredNumber('vertical speed', attitudeText, /VS\s*([+-]?\d+)/),
    radioAltitudeFt: radioAltitudeText
      ? parseRequiredNumber('radio altitude', radioAltitudeText, /RA\s*(\d+)/)
      : null,
  };
}
