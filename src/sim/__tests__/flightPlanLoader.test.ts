import { describe, expect, it } from 'vitest';
import { createDefaultFlightForScenario, createKseaKpdxFlight, createKseaKpdxRouteSource } from '../flightPlanLoader';
import { ENVA_TUTORIAL_SCENARIO } from '../scenarios';

describe('flightPlanLoader', () => {
  it('adds descent altitude and speed constraints to the KSEA to KPDX route', () => {
    const fp = createKseaKpdxFlight();

    const btg = fp.waypoints.find((waypoint) => waypoint.ident === 'BTG');
    const kpdx = fp.waypoints.find((waypoint) => waypoint.ident === 'KPDX');

    expect(btg?.altitudeConstraint).toEqual({ type: 'AT_OR_BELOW', altitude: 12000 });
    expect(btg?.speedConstraint).toEqual({ type: 'AT_OR_BELOW', speed: 280 });
    expect(kpdx?.altitudeConstraint).toEqual({ type: 'AT', altitude: 3000 });
    expect(kpdx?.speedConstraint).toEqual({ type: 'AT_OR_BELOW', speed: 210 });
  });

  it('exposes the KSEA sample route through an RFMS adapter source boundary', () => {
    const source = createKseaKpdxRouteSource();

    expect(source.id).toBe('canned:ksea-kpdx');
    expect(source.type).toBe('canned');
    expect(source.flightPlan).toEqual(createKseaKpdxFlight());
    expect(source.limitations.join(' ')).toMatch(/RFMS shared/i);
    expect(source.limitations.join(' ')).toMatch(/CDU route editing UI is not implemented/i);
  });

  it('keeps unsupported ENVA default route unavailable', () => {
    expect(createDefaultFlightForScenario(ENVA_TUTORIAL_SCENARIO)).toBeNull();
  });
});
