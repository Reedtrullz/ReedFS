import { describe, expect, it } from 'vitest';
import { createInitialState, B737_800_SPEC, type ControlInputs } from '../types';
import { KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { buildGuidanceState } from '../guidanceState';
import { createNoRouteStatus } from '../systems/navigation';
import { advanceSimulationStep } from '../simulationStep';
import { sampleSupportedAirportSurface } from '../runwaySurface';
import { ENVA_RUNWAY_09, type RunwayOverrides } from '../../viewport/runwayData';

const METERS_PER_DEG_LAT = 111_320;

function geoAlongHeading(
  start: { lat: number; lon: number },
  headingDeg: number,
  alongM: number,
  alt: number,
) {
  const headingRad = headingDeg * Math.PI / 180;
  return {
    lat: start.lat + Math.cos(headingRad) * alongM / METERS_PER_DEG_LAT,
    lon: start.lon + Math.sin(headingRad) * alongM / (METERS_PER_DEG_LAT * Math.cos(start.lat * Math.PI / 180)),
    alt,
  };
}

describe('runway override surface parity (#83 first increment)', () => {
  const along = 1000;

  it('moves runway contact geometry with heading and elevation overrides', () => {
    const overrides: RunwayOverrides = {
      [`ENVA-${ENVA_RUNWAY_09.id}`]: {
        elevationFt: ENVA_RUNWAY_09.elevationFt + 25,
        headingDeg: ENVA_RUNWAY_09.headingDeg + 5,
      },
    };
    const pointOnOverridden = geoAlongHeading(
      ENVA_RUNWAY_09.start,
      ENVA_RUNWAY_09.headingDeg + 5,
      along,
      ENVA_RUNWAY_09.elevationFt + 25,
    );

    const overridden = sampleSupportedAirportSurface(pointOnOverridden, overrides);
    const unoverridden = sampleSupportedAirportSurface(pointOnOverridden);

    expect(overridden.runwayId).toBe(ENVA_RUNWAY_09.id);
    expect(overridden.onRunway).toBe(true);
    expect(overridden.groundAltFt).toBe(ENVA_RUNWAY_09.elevationFt + 25);
    expect(Math.abs(overridden.lateralOffsetM ?? 99)).toBeLessThan(0.5);
    // Without the same revision the same physical point is no longer on the runway.
    expect(unoverridden.onRunway).toBe(false);
    expect(unoverridden.groundAltFt).not.toBe(ENVA_RUNWAY_09.elevationFt + 25);
  });

  it('feeds editor elevation overrides through the simulation step into ground contact', () => {
    const raisedElevationFt = ENVA_RUNWAY_09.elevationFt + 25;
    const aircraft = createInitialState(B737_800_SPEC);
    aircraft.position = { lat: ENVA_RUNWAY_09.start.lat, lon: ENVA_RUNWAY_09.start.lon, alt: raisedElevationFt };
    const pilotInputs: ControlInputs = {
      elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0,
      flapLever: 0, gearLever: 'DOWN', spoilers: 0, brake: 0,
    };
    const guidance = buildGuidanceState({
      scenario: KSEA_TUTORIAL_SCENARIO, status: 'paused', aircraft, controls: pilotInputs,
    });
    const base = {
      aircraft: structuredClone(aircraft),
      spec: B737_800_SPEC,
      pilotInputs,
      apState: null,
      flightPlan: null,
      activeLegIndex: null,
      routeStatus: createNoRouteStatus(),
      wind: null,
      guidance,
      dt: 1 / 60,
      status: 'paused' as const,
      selectedScenarioId: KSEA_TUTORIAL_SCENARIO.id,
    };

    const withoutOverrides = advanceSimulationStep({ ...base });
    const withOverrides = advanceSimulationStep({
      ...base,
      aircraft: structuredClone(aircraft),
      runwayOverrides: { [`ENVA-${ENVA_RUNWAY_09.id}`]: { elevationFt: raisedElevationFt } } satisfies RunwayOverrides,
    });

    expect(withOverrides.aircraft.ground.groundAltFt).toBeCloseTo(raisedElevationFt, 6);
    expect(withoutOverrides.aircraft.ground.groundAltFt).toBeCloseTo(ENVA_RUNWAY_09.elevationFt, 6);
  });

  it('keeps unsupported-terrain altitude explicitly invalid', () => {
    const far = { lat: 0, lon: 0, alt: 5_000 };
    const sample = sampleSupportedAirportSurface(far);

    expect(sample.kind).toBe('unsupportedTerrain');
    expect(sample.groundAltValid).toBe(false);
  });
});

