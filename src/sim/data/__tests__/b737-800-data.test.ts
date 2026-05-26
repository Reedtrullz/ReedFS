import { describe, expect, it } from 'vitest';
import { B737_800_SPEC, loadAircraftSpec } from '../../types';
import {
  B737_800_AIRCRAFT_DATA,
  B737_800_AIRCRAFT_DATA_VERSION,
} from '../aircraft/b737-800.v1';

describe('versioned B737-800 aircraft data', () => {
  it('declares a stable aircraft id, schema version, data version, and source notes', () => {
    expect(B737_800_AIRCRAFT_DATA.id).toBe('b737-800');
    expect(B737_800_AIRCRAFT_DATA.schemaVersion).toBe(1);
    expect(B737_800_AIRCRAFT_DATA.dataVersion).toBe(B737_800_AIRCRAFT_DATA_VERSION);
    expect(B737_800_AIRCRAFT_DATA.sourceNotes.length).toBeGreaterThan(0);
  });

  it('loads the runtime aircraft spec from the versioned data file', () => {
    const loaded = loadAircraftSpec();

    expect(loaded.emptyWeight).toBe(B737_800_AIRCRAFT_DATA.mass.emptyWeight);
    expect(loaded.maxTakeoffWeight).toBe(B737_800_AIRCRAFT_DATA.mass.maxTakeoffWeight);
    expect(loaded.wingArea).toBe(B737_800_AIRCRAFT_DATA.geometry.wingArea);
    expect(loaded.aerodynamicCenterPercentMac).toBe(B737_800_AIRCRAFT_DATA.geometry.aerodynamicCenterPercentMac);
    expect(loaded.ixz).toBe(B737_800_AIRCRAFT_DATA.inertia.ixz);
    expect(B737_800_SPEC).toEqual(loaded);
  });
});
