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
  const knownSourceReferenceIds = new Set(B737_800_FDM.lineage.sourceReferences.map((source) => source.id));

  const isStrictIsoCalendarDate = (value: string): boolean => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const [, year, month, day] = match;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return parsed.toISOString().slice(0, 10) === value;
  };

  const expectSectionSourceMetadata = (sectionName: string, section: unknown): void => {
    expect(section, `${sectionName} section metadata target`).toBeTypeOf('object');
    expect(section, `${sectionName} section metadata target`).not.toBeNull();

    const metadata = section as {
      sourceQuality?: unknown;
      sourceRefs?: unknown;
      claimBoundary?: unknown;
      lastReviewed?: unknown;
      sourceReferenceIds?: unknown;
    };

    expect(metadata.sourceQuality, `${sectionName}.sourceQuality`).toBe('gameplay-calibrated');
    expect(metadata.sourceRefs, `${sectionName}.sourceRefs`).toEqual(expect.arrayContaining([expect.any(String)]));
    for (const sourceRef of metadata.sourceRefs as string[]) {
      expect(knownSourceReferenceIds.has(sourceRef), `${sectionName}.sourceRefs contains unknown source id ${sourceRef}`).toBe(true);
    }
    if (metadata.sourceReferenceIds !== undefined) {
      expect(metadata.sourceReferenceIds, `${sectionName}.sourceReferenceIds legacy alias`).toEqual(metadata.sourceRefs);
      expect(metadata.sourceReferenceIds, `${sectionName}.sourceReferenceIds should not share mutable sourceRefs array`).not.toBe(metadata.sourceRefs);
    }

    expect(metadata.claimBoundary, `${sectionName}.claimBoundary`).toBeTypeOf('string');
    const claimBoundary = (metadata.claimBoundary as string).toLowerCase();
    expect(claimBoundary, `${sectionName}.claimBoundary should prevent certification overclaims`).toContain('not certified');
    expect(claimBoundary, `${sectionName}.claimBoundary should prevent AFM overclaims`).toContain('not afm');
    expect(claimBoundary, `${sectionName}.claimBoundary should identify gameplay placeholders`).toContain('gameplay placeholder');

    expect(metadata.lastReviewed, `${sectionName}.lastReviewed`).toBeTypeOf('string');
    expect(isStrictIsoCalendarDate(metadata.lastReviewed as string), `${sectionName}.lastReviewed should be a real ISO calendar date`).toBe(true);
  };

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

  it('requires source-lineage metadata on every FDM section', () => {
    expectSectionSourceMetadata('aero', B737_800_FDM.aero);
    for (const gearStation of B737_800_FDM.gearStations) {
      expectSectionSourceMetadata(`gearStations.${gearStation.id}`, gearStation);
    }
    expectSectionSourceMetadata('ground', B737_800_FDM.ground);
  });
});
