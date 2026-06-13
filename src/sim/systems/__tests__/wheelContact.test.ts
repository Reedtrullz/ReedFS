import { describe, expect, it } from 'vitest';
import { KSEA_RUNWAY_16L } from '../../../viewport/runwayData';
import { sampleSupportedAirportSurface, type GroundSurfaceSample } from '../../runwaySurface';
import {
  B737_800_SPEC,
  createInitialState,
  type AircraftState,
  type GearStationId,
} from '../../types';
import { eulerToQuat } from '../../physics/quaternion';
import { enuToEcef, ecefToGeodetic, geodeticToEcef } from '../../physics/geodesy';
import {
  computeWheelContactGeometry,
  stationContactById,
  type WheelStationContactGeometry,
} from '../wheelContact';

const FT_TO_M = 0.3048;

function kseaPositionMeters(alongTrackM: number, lateralOffsetM: number, altitudeFt = KSEA_RUNWAY_16L.elevationFt) {
  const headingRad = KSEA_RUNWAY_16L.headingDeg * Math.PI / 180;
  const northM = alongTrackM * Math.cos(headingRad) - lateralOffsetM * Math.sin(headingRad);
  const eastM = alongTrackM * Math.sin(headingRad) + lateralOffsetM * Math.cos(headingRad);
  const ref = geodeticToEcef(KSEA_RUNWAY_16L.start.lat, KSEA_RUNWAY_16L.start.lon, KSEA_RUNWAY_16L.elevationFt * FT_TO_M);
  const ecef = enuToEcef({ e: eastM, n: northM, u: (altitudeFt - KSEA_RUNWAY_16L.elevationFt) * FT_TO_M }, ref, KSEA_RUNWAY_16L.start.lat, KSEA_RUNWAY_16L.start.lon);
  const geo = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
  return { lat: geo.lat, lon: geo.lon, alt: altitudeFt };
}

function createRunwayState(options: {
  altitudeFt?: number;
  alongTrackM?: number;
  lateralOffsetM?: number;
  phiRad?: number;
  thetaRad?: number;
  psiRad?: number;
  velocity?: AircraftState['velocity'];
} = {}): AircraftState {
  const state = createInitialState(B737_800_SPEC);
  state.position = kseaPositionMeters(
    options.alongTrackM ?? 600,
    options.lateralOffsetM ?? 0,
    options.altitudeFt ?? KSEA_RUNWAY_16L.elevationFt,
  );
  state.attitude = {
    phi: options.phiRad ?? 0,
    theta: options.thetaRad ?? 0,
    psi: options.psiRad ?? KSEA_RUNWAY_16L.headingDeg * Math.PI / 180,
  };
  state.quaternion = eulerToQuat(state.attitude.phi, state.attitude.theta, state.attitude.psi);
  state.velocity = options.velocity ?? { u: 0, v: 0, w: 0 };
  state.ground = {
    ...state.ground,
    groundAltFt: KSEA_RUNWAY_16L.elevationFt,
    aglFt: state.position.alt - KSEA_RUNWAY_16L.elevationFt,
  };
  return state;
}

function expectStationIds(stations: WheelStationContactGeometry[]): void {
  expect(stations.map((station) => station.station.id).sort()).toEqual<GearStationId[]>([
    'leftMain',
    'nose',
    'rightMain',
  ]);
}

function expectCloseMeters(actual: number, expected: number, precision = 5): void {
  expect(actual).toBeCloseTo(expected, precision);
}

describe('computeWheelContactGeometry', () => {
  it('computes level runway station positions and clearances for nose and main gear', () => {
    const state = createRunwayState({ altitudeFt: KSEA_RUNWAY_16L.elevationFt + 12 });
    const surface = sampleSupportedAirportSurface(state.position);
    const geometry = computeWheelContactGeometry(state, B737_800_SPEC, surface);

    expect(geometry.surface.onRunway).toBe(true);
    expectStationIds(geometry.stations);

    const nose = stationContactById(geometry, 'nose');
    const leftMain = stationContactById(geometry, 'leftMain');
    const rightMain = stationContactById(geometry, 'rightMain');

    expectCloseMeters(nose.runwayClearanceM, 12 * FT_TO_M - 2.25 - 0.43);
    expectCloseMeters(leftMain.runwayClearanceM, 12 * FT_TO_M - 2.45 - 0.58);
    expectCloseMeters(rightMain.runwayClearanceM, leftMain.runwayClearanceM);
    expect(nose.runwayPenetrationM).toBe(0);
    expect(nose.onPreparedRunway).toBe(true);
    expect(leftMain.onPreparedRunway).toBe(true);
  });

  it('shows nosewheel unloading and main-gear penetration during a flare about the main gear', () => {
    const levelState = createRunwayState({ altitudeFt: KSEA_RUNWAY_16L.elevationFt + 3.2 });
    const flaredState = createRunwayState({
      altitudeFt: KSEA_RUNWAY_16L.elevationFt + 3.2,
      thetaRad: 8 * Math.PI / 180,
    });
    const levelSurface = sampleSupportedAirportSurface(levelState.position);
    const flareSurface = sampleSupportedAirportSurface(flaredState.position);

    const level = computeWheelContactGeometry(levelState, B737_800_SPEC, levelSurface);
    const flared = computeWheelContactGeometry(flaredState, B737_800_SPEC, flareSurface);

    const levelNose = stationContactById(level, 'nose');
    const flareNose = stationContactById(flared, 'nose');
    const flareLeftMain = stationContactById(flared, 'leftMain');
    const flareRightMain = stationContactById(flared, 'rightMain');

    expect(flareNose.runwayClearanceM).toBeGreaterThan(levelNose.runwayClearanceM + 1.5);
    expect(flareLeftMain.runwayPenetrationM).toBeGreaterThan(0);
    expectCloseMeters(flareLeftMain.runwayPenetrationM, flareRightMain.runwayPenetrationM, 5);
  });

  it('separates left and right main runway clearance when banked', () => {
    const rightWingDown = createRunwayState({
      altitudeFt: KSEA_RUNWAY_16L.elevationFt + 3,
      phiRad: 5 * Math.PI / 180,
    });
    const surface = sampleSupportedAirportSurface(rightWingDown.position);
    const geometry = computeWheelContactGeometry(rightWingDown, B737_800_SPEC, surface);

    const leftMain = stationContactById(geometry, 'leftMain');
    const rightMain = stationContactById(geometry, 'rightMain');

    expect(rightMain.runwayClearanceM).toBeLessThan(leftMain.runwayClearanceM);
    expect(rightMain.runwayPenetrationM).toBeGreaterThan(leftMain.runwayPenetrationM);
  });

  it('computes runway-normal sink rate from body velocity and attitude', () => {
    const state = createRunwayState({
      altitudeFt: KSEA_RUNWAY_16L.elevationFt + 1,
      thetaRad: -5 * Math.PI / 180,
      velocity: { u: 70, v: 0, w: 0 },
    });
    const surface = sampleSupportedAirportSurface(state.position);
    const geometry = computeWheelContactGeometry(state, B737_800_SPEC, surface);

    expect(geometry.runwayNormalSinkRateMps).toBeGreaterThan(6);
    expect(stationContactById(geometry, 'nose').runwayNormalSinkRateMps).toBeCloseTo(geometry.runwayNormalSinkRateMps, 8);
  });

  it('includes pitch-rate omega-cross-r station velocity in runway-normal sink rates', () => {
    const state = createRunwayState({
      altitudeFt: KSEA_RUNWAY_16L.elevationFt + 4,
      velocity: { u: 0, v: 0, w: 0 },
    });
    state.angularVel.q = 0.2;
    const surface = sampleSupportedAirportSurface(state.position);
    const geometry = computeWheelContactGeometry(state, B737_800_SPEC, surface);

    const nose = stationContactById(geometry, 'nose');
    const leftMain = stationContactById(geometry, 'leftMain');
    const rightMain = stationContactById(geometry, 'rightMain');

    expect(nose.runwayNormalVelocityMps).toBeLessThan(-3);
    expect(nose.runwayNormalSinkRateMps).toBe(0);
    expect(leftMain.runwayNormalVelocityMps).toBeGreaterThan(0.5);
    expect(leftMain.runwayNormalSinkRateMps).toBeCloseTo(leftMain.runwayNormalVelocityMps, 8);
    expect(rightMain.runwayNormalVelocityMps).toBeCloseTo(leftMain.runwayNormalVelocityMps, 8);
    expect(rightMain.runwayNormalSinkRateMps).toBeCloseTo(rightMain.runwayNormalVelocityMps, 8);
  });

  it('marks off-runway wheel samples without mutating the supplied surface semantics', () => {
    const state = createRunwayState({ lateralOffsetM: KSEA_RUNWAY_16L.widthM + 60, altitudeFt: KSEA_RUNWAY_16L.elevationFt + 1 });
    const surface: GroundSurfaceSample = sampleSupportedAirportSurface(state.position);
    const geometry = computeWheelContactGeometry(state, B737_800_SPEC, surface);

    expect(surface.onRunway).toBe(false);
    expect(geometry.surface).toBe(surface);
    for (const station of geometry.stations) {
      expect(station.onPreparedRunway).toBe(false);
      expect(station.groundAltFt).toBe(surface.groundAltFt);
      expect(station.runwayClearanceM).toBeLessThan(1);
    }
  });
});
