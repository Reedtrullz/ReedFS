import { describe, expect, it } from 'vitest';
import {
  createDefaultFlightForScenario,
  createEnvaEngmFlight,
  createEnvaEngmRouteSource,
  createKseaKpdxFlight,
  createKseaKpdxRouteSource,
  createRunwayToRunwayFlightWithRunways,
  createRunwayToRunwayRouteSource,
  ENVA_ENGM_APPROACH_CONTRACT,
  KSEA_KPDX_APPROACH_CONTRACT,
} from '../flightPlanLoader';
import { ENVA_TUTORIAL_SCENARIO, KPDX_TUTORIAL_SCENARIO, KSEA_TUTORIAL_SCENARIO } from '../scenarios';
import { ENGM_AUTOLAND_APPROACH, KPDX_RUNWAY_10R_APPROACH } from '../../viewport/runwayData';

describe('flightPlanLoader', () => {
  it('adds synthetic ENGM 19R approach, final and runway-threshold semantics to the ENVA route', () => {
    const fp = createEnvaEngmFlight();
    const approach = ENGM_AUTOLAND_APPROACH;

    expect(fp.origin).toBe(ENVA_ENGM_APPROACH_CONTRACT.originAirport);
    expect(fp.destination).toBe(ENVA_ENGM_APPROACH_CONTRACT.destinationAirport);
    expect(ENVA_ENGM_APPROACH_CONTRACT.originScenarioId).toBe(ENVA_TUTORIAL_SCENARIO.id);
    expect(fp.route).toBe('ENVA RFSNOR ENGM19R_IF ENGM19R_FAF ENGM19R_RWY');
    expect(fp.waypoints.map((waypoint) => waypoint.ident)).toEqual([
      'ENVA',
      'RFSNOR',
      approach.initialApproachFix.ident,
      approach.finalApproachFix.ident,
      approach.threshold.ident,
    ]);

    const enroute = fp.waypoints.find((waypoint) => waypoint.ident === 'RFSNOR');
    const initialApproach = fp.waypoints.find((waypoint) => waypoint.ident === approach.initialApproachFix.ident);
    const finalApproach = fp.waypoints.find((waypoint) => waypoint.ident === approach.finalApproachFix.ident);
    const threshold = fp.waypoints.find((waypoint) => waypoint.ident === approach.threshold.ident);

    expect(enroute).toMatchObject({
      coordinateSource: 'synthetic',
      discontinuity: false,
      altitudeConstraint: { type: 'AT_OR_BELOW', altitude: 14000 },
      speedConstraint: { type: 'AT_OR_BELOW', speed: 280 },
    });
    expect(initialApproach).toMatchObject({
      lat: approach.initialApproachFix.point.lat,
      lon: approach.initialApproachFix.point.lon,
      coordinateSource: 'synthetic',
      discontinuity: false,
      legType: 'IF',
      altitudeConstraint: { type: 'AT', altitude: approach.initialApproachFix.point.altFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: approach.initialApproachFix.speedKt },
    });
    expect(finalApproach).toMatchObject({
      lat: approach.finalApproachFix.point.lat,
      lon: approach.finalApproachFix.point.lon,
      coordinateSource: 'synthetic',
      discontinuity: false,
      legType: 'TF',
      altitudeConstraint: { type: 'AT', altitude: approach.finalApproachFix.point.altFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: approach.finalApproachFix.speedKt },
    });
    expect(threshold).toMatchObject({
      lat: approach.threshold.point.lat,
      lon: approach.threshold.point.lon,
      coordinateSource: 'synthetic',
      discontinuity: false,
      legType: 'RW',
      altitudeConstraint: { type: 'AT', altitude: approach.threshold.point.altFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: approach.threshold.speedKt },
    });
  });

  it('adds synthetic KPDX 10R approach, final and runway-threshold semantics to the KSEA route', () => {
    const fp = createKseaKpdxFlight();
    const approach = KPDX_RUNWAY_10R_APPROACH;

    expect(KPDX_TUTORIAL_SCENARIO.runway.runway).toBe(approach.runwayId);
    expect(KPDX_TUTORIAL_SCENARIO.runway.approach).toEqual({
      runwayId: KSEA_KPDX_APPROACH_CONTRACT.runway,
      finalApproachFixIdent: approach.finalApproachFix.ident,
      thresholdIdent: approach.threshold.ident,
      coordinateSource: 'synthetic',
    });
    expect(fp.route).toBe('KSEA OLM BTG KPDX10R_IF KPDX10R_FAF KPDX10R_RWY');
    expect(fp.waypoints.map((waypoint) => waypoint.ident)).toEqual([
      'KSEA',
      'OLM',
      'BTG',
      'KPDX10R_IF',
      approach.finalApproachFix.ident,
      approach.threshold.ident,
    ]);

    const btg = fp.waypoints.find((waypoint) => waypoint.ident === 'BTG');
    const initialApproach = fp.waypoints.find((waypoint) => waypoint.ident === 'KPDX10R_IF');
    const finalApproach = fp.waypoints.find((waypoint) => waypoint.ident === approach.finalApproachFix.ident);
    const threshold = fp.waypoints.find((waypoint) => waypoint.ident === approach.threshold.ident);

    expect(btg?.altitudeConstraint).toEqual({ type: 'AT_OR_BELOW', altitude: 12000 });
    expect(btg?.speedConstraint).toEqual({ type: 'AT_OR_BELOW', speed: 280 });
    expect(initialApproach).toMatchObject({
      lat: approach.initialApproachFix.point.lat,
      lon: approach.initialApproachFix.point.lon,
      coordinateSource: 'synthetic',
      discontinuity: false,
      legType: 'IF',
      altitudeConstraint: { type: 'AT', altitude: approach.initialApproachFix.point.altFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: approach.initialApproachFix.speedKt },
    });
    expect(finalApproach).toMatchObject({
      lat: approach.finalApproachFix.point.lat,
      lon: approach.finalApproachFix.point.lon,
      coordinateSource: 'synthetic',
      discontinuity: false,
      legType: 'TF',
      altitudeConstraint: { type: 'AT', altitude: approach.finalApproachFix.point.altFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: approach.finalApproachFix.speedKt },
    });
    expect(threshold).toMatchObject({
      lat: approach.threshold.point.lat,
      lon: approach.threshold.point.lon,
      coordinateSource: 'synthetic',
      discontinuity: false,
      legType: 'RW',
      altitudeConstraint: { type: 'AT', altitude: approach.threshold.point.altFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: approach.threshold.speedKt },
    });
  });

  it('exposes the ENVA sample route through an RFMS adapter source boundary', () => {
    const source = createEnvaEngmRouteSource();

    expect(source.id).toBe('canned:enva-engm');
    expect(source.type).toBe('canned');
    expect(source.flightPlan).toEqual(createEnvaEngmFlight());
    expect(source.limitations.join(' ')).toMatch(/RFMS shared/i);
    expect(source.limitations.join(' ')).toMatch(/CDU route editing UI is not implemented/i);
    expect(source.limitations.join(' ')).toMatch(/synthetic training/i);
    expect(source.limitations.join(' ')).toMatch(/not official procedure/i);
    expect(source.limitations.join(' ')).toMatch(/selected synthetic autoland runway/i);
  });

  it('exposes the KSEA sample route through an RFMS adapter source boundary', () => {
    const source = createKseaKpdxRouteSource();

    expect(source.id).toBe('canned:ksea-kpdx');
    expect(source.type).toBe('canned');
    expect(source.flightPlan).toEqual(createKseaKpdxFlight());
    expect(source.limitations.join(' ')).toMatch(/RFMS shared/i);
    expect(source.limitations.join(' ')).toMatch(/CDU route editing UI is not implemented/i);
    expect(source.limitations.join(' ')).toMatch(/synthetic training/i);
    expect(source.limitations.join(' ')).toMatch(/not official procedure/i);
  });

  it('builds a generated runway-to-runway route with finite constraints and manual source boundaries', () => {
    const { flightPlan, runways } = createRunwayToRunwayFlightWithRunways({
      originAirport: 'ENBR',
      originRunway: '17',
      destinationAirport: 'ENSB',
      destinationRunway: '09',
    });

    expect(runways.originRunway).toMatchObject({ airport: 'ENBR', id: '17' });
    expect(runways.destinationRunway).toMatchObject({ airport: 'ENSB', id: '09' });
    expect(flightPlan.origin).toBe('ENBR');
    expect(flightPlan.destination).toBe('ENSB');
    expect(flightPlan.flightNumber).toBe('RFSANY');
    expect(flightPlan.waypoints.map((waypoint) => waypoint.ident)).toEqual([
      'ENBR17_DEP',
      'ENBR17_CLB',
      'ENBRENSB_ENR',
      'ENSB09_DES',
      'ENSB09_FAF',
      'ENSB09_RWY',
    ]);
    expect(flightPlan.waypoints[0]).toMatchObject({
      lat: runways.originRunway.start.lat,
      lon: runways.originRunway.start.lon,
      coordinateSource: 'manual',
      discontinuity: false,
      legType: 'IF',
      altitudeConstraint: { type: 'AT', altitude: runways.originRunway.elevationFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: 180 },
    });
    expect(flightPlan.waypoints.at(-1)).toMatchObject({
      lat: runways.destinationRunway.start.lat,
      lon: runways.destinationRunway.start.lon,
      coordinateSource: 'manual',
      discontinuity: false,
      legType: 'RW',
      altitudeConstraint: { type: 'AT', altitude: runways.destinationRunway.elevationFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: 145 },
    });
    for (const waypoint of flightPlan.waypoints) {
      expect(Number.isFinite(waypoint.lat), waypoint.ident).toBe(true);
      expect(Number.isFinite(waypoint.lon), waypoint.ident).toBe(true);
      expect(waypoint.discontinuity, waypoint.ident).toBe(false);
      expect(waypoint.coordinateSource, waypoint.ident).toBe('manual');
      expect(waypoint.altitudeConstraint, waypoint.ident).toBeDefined();
      expect(waypoint.speedConstraint, waypoint.ident).toBeDefined();
    }
  });

  it('uses the selected opposite runway threshold and reciprocal heading for generated routes', () => {
    const { flightPlan, runways } = createRunwayToRunwayFlightWithRunways({
      originAirport: 'ENBR',
      originRunway: '35',
      destinationAirport: 'ENZV',
      destinationRunway: '36',
    });

    expect(runways.originRunway.id).toBe('35');
    expect(runways.originRunway.oppositeId).toBe('17');
    expect(runways.destinationRunway.id).toBe('36');
    expect(flightPlan.waypoints[0]).toMatchObject({
      ident: 'ENBR35_DEP',
      lat: runways.originRunway.start.lat,
      lon: runways.originRunway.start.lon,
    });
    expect(flightPlan.route).toContain('ENBR35_CLB');
    expect(flightPlan.route).toContain('ENZV36_RWY');
  });

  it('exposes generated runway-pair routes through a manual route source with explicit non-official limitations', () => {
    const source = createRunwayToRunwayRouteSource({
      originAirport: 'ENVA',
      originRunway: '27',
      destinationAirport: 'ENGM',
      destinationRunway: '01L',
    });

    expect(source.id).toBe('generated:ENVA-27:ENGM-01L');
    expect(source.type).toBe('manual');
    expect(source.flightPlan.origin).toBe('ENVA');
    expect(source.flightPlan.destination).toBe('ENGM');
    expect(source.limitations.join(' ')).toMatch(/LNAV\/VNAV\/SPD/i);
    expect(source.limitations.join(' ')).toMatch(/APP\/G\/S\/autoland remains available only/i);
    expect(source.limitations.join(' ')).toMatch(/not official procedures/i);
  });

  it('rejects unsupported runway endpoints with a clear message', () => {
    expect(() => createRunwayToRunwayFlightWithRunways({
      originAirport: 'ENBR',
      originRunway: '99',
      destinationAirport: 'ENSB',
      destinationRunway: '09',
    })).toThrow(/Unsupported origin runway ENBR 99/);
  });

  it('returns ENVA to ENGM for the ENVA tutorial while preserving KSEA default route behavior', () => {
    expect(createDefaultFlightForScenario(ENVA_TUTORIAL_SCENARIO)).toEqual(createEnvaEngmFlight());
    expect(createDefaultFlightForScenario(KSEA_TUTORIAL_SCENARIO)).toEqual(createKseaKpdxFlight());
  });
});
