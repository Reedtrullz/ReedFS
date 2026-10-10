import { describe, expect, it } from 'vitest';
import { computeEngineThrustN } from '../../systems/engine';
import { lbfToN } from '../../physics/units';
import { B737_800_SPEC, loadAircraftSpec } from '../../types';
import { B737_800_AIRCRAFT_DATA } from '../aircraft/b737-800.v1';
import {
  B737_800_FDM,
  B737_800_FDM_DATA_VERSION,
  ENGINE_STATIC_THRUST_ANCHOR_LBF,
} from '../aircraft/b737-800-fdm.v1';

describe('B737-800 engine static-thrust anchor', () => {
  it('anchors takeoff static thrust to the TCDS A16WE Rev 45 CFM56-7B27 rating', () => {
    expect(ENGINE_STATIC_THRUST_ANCHOR_LBF).toBe(27300);
    expect(B737_800_FDM.dataVersion).toBe(B737_800_FDM_DATA_VERSION);
    expect(B737_800_FDM.dataVersion).toBe('1.1.0');

    const tcdsRef = B737_800_FDM.lineage.sourceReferences.find((source) => source.id === 'faa-tcds-a16we-rev45-b738-takeoff-thrust');
    const derivedRef = B737_800_FDM.lineage.sourceReferences.find((source) => source.id === 'b737-800-static-thrust-anchor');
    expect(tcdsRef?.classification).toBe('manufacturer-published');
    expect(tcdsRef?.confidence).toBe('high');
    expect(tcdsRef?.role).toBe('engine');
    expect(derivedRef?.classification).toBe('manufacturer-published');
    expect(derivedRef?.confidence).toBe('high');
  });

  it('keeps the aircraft propulsion shell parity with the source-qualified anchor', () => {
    expect(B737_800_AIRCRAFT_DATA.propulsion.maxThrust).toBe(ENGINE_STATIC_THRUST_ANCHOR_LBF);
    expect(loadAircraftSpec().maxThrust).toBe(ENGINE_STATIC_THRUST_ANCHOR_LBF);
    expect(B737_800_SPEC.maxThrust).toBe(ENGINE_STATIC_THRUST_ANCHOR_LBF);
  });

  it('delivers exactly the anchor at sea level static through the runtime thrust path', () => {
    expect(computeEngineThrustN(100, B737_800_SPEC, 0, 0.2)).toBe(lbfToN(ENGINE_STATIC_THRUST_ANCHOR_LBF));
  });
});
