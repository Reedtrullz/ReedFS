export const B737_800_AIRCRAFT_DATA_VERSION = '1.0.0';

export interface VersionedAircraftData {
  schemaVersion: 1;
  dataVersion: string;
  id: string;
  name: string;
  sourceNotes: string[];
  mass: {
    emptyWeight: number;
    maxFuel: number;
    maxTakeoffWeight: number;
    cgLimits: readonly [number, number];
    fuelCapacity: { center: number; left: number; right: number };
  };
  geometry: {
    wingArea: number;
    wingSpan: number;
    meanChord: number;
    aerodynamicCenterPercentMac: number;
  };
  propulsion: {
    engineCount: number;
    maxThrust: number;
  };
  inertia: {
    ixx: number;
    iyy: number;
    izz: number;
    ixz: number;
  };
  performance: {
    stallSpeedClean: number;
    maxFlaps: number;
  };
}

export const B737_800_AIRCRAFT_DATA: VersionedAircraftData = {
  schemaVersion: 1,
  dataVersion: B737_800_AIRCRAFT_DATA_VERSION,
  id: 'b737-800',
  name: 'Boeing 737-800',
  sourceNotes: [
    'Initial RFS gameplay-tuned B737-800 data package; values preserve existing tested runtime behavior until audited source tables replace them.',
    'Mass, geometry, fuel capacity, thrust, inertia, and clean stall speed are versioned together so future flight-model changes can cite an explicit dataset.',
  ],
  mass: {
    emptyWeight: 41413,
    maxFuel: 20894,
    maxTakeoffWeight: 79015,
    cgLimits: [7, 30],
    fuelCapacity: { center: 13066, left: 3914, right: 3914 },
  },
  geometry: {
    wingArea: 124.6,
    wingSpan: 35.8,
    meanChord: 3.96,
    aerodynamicCenterPercentMac: 25,
  },
  propulsion: {
    engineCount: 2,
    maxThrust: 27300,
  },
  inertia: {
    ixx: 1340000,
    iyy: 3450000,
    izz: 4610000,
    ixz: 40000,
  },
  performance: {
    stallSpeedClean: 120,
    maxFlaps: 40,
  },
};
