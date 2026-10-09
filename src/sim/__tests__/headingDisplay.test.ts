import { expect, it } from 'vitest';
import { headingDisplayContext, headingDisplayText } from '../headingDisplay';
import { createInitialState, B737_800_SPEC } from '../types';

function point(lat = 80, lon = 0, year = 2025) {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.position = { lat, lon, alt: 35_000 };
  aircraft.utcEpochMs = Date.UTC(year, 0, 1); aircraft.simTime = 0;
  return aircraft;
}

it('uses a declared zero-km ellipsoid surface estimate even in an airborne state', () => {
  const context = headingDisplayContext(point(), 'magnetic');
  expect(context.reference).toBe('magnetic');
  expect(context.suffix).toBe('M SFC');
  expect(context.variationEastDeg).toBeCloseTo(1.28, 2);
  expect(context.heightAboveEllipsoidKm).toBe(0);
  expect(headingDisplayText(90.49, context)).toBe('089M SFC');
});

it('shows true headings with a reason when a requested magnetic reference is unavailable', () => {
  for (const [aircraft, reason] of [[point(80, 0, 2030), 'unsupported epoch'], [point(90), 'geographic pole'], [point(91), 'invalid location']] as const) {
    const context = headingDisplayContext(aircraft, 'magnetic');
    expect(context.reference).toBe('true'); expect(context.variationEastDeg).toBeNull();
    expect(context.unavailableReason).toBe(reason);
    expect(headingDisplayText(359.6, context)).toBe('000T');
  }
});

it('leaves true display available for dates outside the magnetic model and never fabricates a magnetic value', () => {
  const context = headingDisplayContext(point(0, 0, 1950), 'true');
  expect(context.unavailableReason).toBeNull(); expect(context.reference).toBe('true');
  expect(headingDisplayText(Number.NaN, context)).toBe('---T');
});

it('labels the actual northern caution and blackout zones without a zero-variation substitution', () => {
  const caution = headingDisplayContext(point(85), 'magnetic');
  expect(caution.reference).toBe('magnetic'); expect(caution.caution).toBe(true);
  expect(headingDisplayText(90, caution)).toBe('086M SFC !');
  const blackout = headingDisplayContext(point(89.9), 'magnetic');
  expect(blackout.reference).toBe('true'); expect(blackout.variationEastDeg).toBeNull();
  expect(blackout.unavailableReason).toBe('weak horizontal field');
  expect(headingDisplayText(90, blackout)).toBe('090T');
});
