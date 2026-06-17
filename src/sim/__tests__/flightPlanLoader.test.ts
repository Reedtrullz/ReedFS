import { describe, expect, it } from 'vitest';
import {
  createDefaultFlightForScenario,
  createEnvaEngmFlight,
  createKseaKpdxFlight,
  createKseaKpdxRouteSource,
  KSEA_KPDX_APPROACH_CONTRACT,
} from '../flightPlanLoader';
import { ENGM_19R_SHORT_FINAL_SCENARIO, ENVA_TUTORIAL_SCENARIO, KPDX_TUTORIAL_SCENARIO } from '../scenarios';
import { ENGM_RUNWAY_19R_APPROACH, KPDX_RUNWAY_10R_APPROACH } from '../../viewport/runwayData';

describe('flightPlanLoader', () => {
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

  it('provides an ENVA to ENGM route with synthetic ENGM 19R approach/runway semantics for the default tutorial scenario', () => {
    const route = createEnvaEngmFlight();
    const approach = ENGM_RUNWAY_19R_APPROACH;

    expect(route.origin).toBe('ENVA');
    expect(route.destination).toBe('ENGM');
    expect(ENGM_19R_SHORT_FINAL_SCENARIO.runway.approach).toEqual({
      runwayId: approach.runwayId,
      finalApproachFixIdent: approach.finalApproachFix.ident,
      thresholdIdent: approach.threshold.ident,
      coordinateSource: 'synthetic',
    });
    expect(route.route).toBe('ENVA ENVA09_CLB RFS_DOVRE RFS_MJOSA ENGM19R_IF ENGM19R_FAF ENGM19R_RWY');
    expect(route.waypoints.map((waypoint) => waypoint.ident)).toEqual([
      'ENVA',
      'ENVA09_CLB',
      'RFS_DOVRE',
      'RFS_MJOSA',
      approach.initialApproachFix.ident,
      approach.finalApproachFix.ident,
      approach.threshold.ident,
    ]);
    expect(route.waypoints.every((waypoint) => waypoint.coordinateSource === 'synthetic')).toBe(true);
    expect(route.waypoints[1]).toMatchObject({
      ident: 'ENVA09_CLB',
      altitudeConstraint: { type: 'AT_OR_ABOVE', altitude: 3000 },
      speedConstraint: { type: 'AT_OR_BELOW', speed: 250 },
    });
    expect(route.waypoints.at(-3)).toMatchObject({
      ident: approach.initialApproachFix.ident,
      lat: approach.initialApproachFix.point.lat,
      lon: approach.initialApproachFix.point.lon,
      legType: 'IF',
      altitudeConstraint: { type: 'AT', altitude: approach.initialApproachFix.point.altFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: approach.initialApproachFix.speedKt },
    });
    expect(route.waypoints.at(-2)).toMatchObject({
      ident: approach.finalApproachFix.ident,
      lat: approach.finalApproachFix.point.lat,
      lon: approach.finalApproachFix.point.lon,
      legType: 'TF',
      altitudeConstraint: { type: 'AT', altitude: approach.finalApproachFix.point.altFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: approach.finalApproachFix.speedKt },
    });
    expect(route.waypoints.at(-1)).toMatchObject({
      ident: approach.threshold.ident,
      lat: approach.threshold.point.lat,
      lon: approach.threshold.point.lon,
      legType: 'RW',
      altitudeConstraint: { type: 'AT', altitude: approach.threshold.point.altFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: approach.threshold.speedKt },
    });

    expect(createDefaultFlightForScenario(ENVA_TUTORIAL_SCENARIO)).toEqual(route);
  });
});
