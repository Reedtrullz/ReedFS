import { describe, expect, it } from 'vitest';
import { B737_800_SPEC, loadAircraftSpec } from '../../types';
import {
  B737_800_AIRCRAFT_DATA,
  B737_800_AIRCRAFT_DATA_VERSION,
} from '../aircraft/b737-800.v1';
import {
  B737_800_FDM,
  B737_800_FDM_DATA_VERSION,
} from '../aircraft/b737-800-fdm.v1';

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

describe('versioned B737-800 FDM data shell', () => {
  it('declares stable FDM identity, version, and honest source metadata', () => {
    expect(B737_800_FDM.id).toBe('b737-800-fdm');
    expect(B737_800_FDM.aircraftDataId).toBe(B737_800_AIRCRAFT_DATA.id);
    expect(B737_800_FDM.schemaVersion).toBe(1);
    expect(B737_800_FDM.dataVersion).toBe(B737_800_FDM_DATA_VERSION);
    expect(B737_800_FDM.lineage.sourceReferences.length).toBeGreaterThan(0);
    expect(B737_800_FDM.lineage.notes.join(' ').toLowerCase()).toContain('gameplay');
    expect(B737_800_FDM.lineage.notes.join(' ').toLowerCase()).toContain('not certified boeing data');
  });

  it('groups aero, gear-station, and ground-model data under the FDM shell', () => {
    expect(B737_800_FDM.aero.flapPolars.map((polar) => polar.detent)).toEqual([0, 1, 5, 15, 30, 40]);
    expect(B737_800_FDM.gearStations.map((station) => station.id)).toEqual(['nose', 'leftMain', 'rightMain']);
    expect(B737_800_FDM.ground.friction.maxBrakeFrictionCoefficient).toBeGreaterThan(0);
    expect(B737_800_FDM.ground.steering.maxRudderPedalNosewheelSteeringRad).toBeGreaterThan(0);
    expect(B737_800_FDM.ground.sourceReferenceIds.length).toBeGreaterThan(0);
  });
});
