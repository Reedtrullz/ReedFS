import type { FlightScenario } from '../../scenarios';

export interface B737PerformanceDataOwnership {
  /** Human-readable ownership label so test-only data is not mistaken for runtime AFM tables. */
  label: string;
  runtimeConsumers: string[];
  testConsumers: string[];
  sourceNote: string;
}

export interface B737VSpeeds {
  v1Kt: number;
  vrKt: number;
  v2Kt: number;
}

export interface B737StallSpeedFixture {
  name: string;
  grossWeightKg: number;
  altitudeFt: number;
  iasKt: number;
  flapSetting: number;
  gearDown: boolean;
  expectedStallIasKt: [number, number];
  expectedClMax: [number, number];
  expectedPeakAoADeg: [number, number];
  ownership: B737PerformanceDataOwnership;
}

export interface B737CleanClimbFixture {
  name: string;
  grossWeightKg: number;
  altitudeFt: number;
  iasKt: number;
  n1Percent: number;
  expectedClimbFpm: [number, number];
  ownership: B737PerformanceDataOwnership;
}

export interface B737CruiseTrimFixture {
  name: string;
  grossWeightKg: number;
  altitudeFt: number;
  iasKt: number;
  expectedAoADeg: [number, number];
  ownership: B737PerformanceDataOwnership;
}

export interface B737ApproachVrefFixture {
  name: string;
  grossWeightKg: number;
  heightAglFt: number;
  vrefKt: number;
  targetApproachIasKt: number;
  flapSetting: number;
  expectedAoADeg: [number, number];
  ownership: B737PerformanceDataOwnership;
}

export interface B737EngineLapseFixture {
  name: string;
  n1Percent: number;
  altitudeFt: number;
  mach: number;
  oatC: number;
  oatModeled: boolean;
  expectedThrustN: [number, number];
  expectedSeaLevelStaticRatio: [number, number];
  ownership: B737PerformanceDataOwnership;
}

export interface B737CleanClimbEnvelope {
  altitudeFt: number;
  iasKt: number;
  n1Percent: number;
  expectedClimbFpm: [number, number];
}

export interface B737ApproachEnvelope {
  heightAglFt: number;
  iasKt: number;
  vrefKt: number;
  flapSetting: number;
  expectedAoADeg: [number, number];
}

export interface B737LandingPerformanceEnvelope {
  vrefKt: number;
  targetApproachIasKt: number;
  glidepathDeg: number;
  sinkRateFpm: [number, number];
  touchdownSinkRateMps: [number, number];
  touchdownZoneDistanceM: [number, number];
  stoppingDistanceM: [number, number];
  ownership: B737PerformanceDataOwnership;
}

export interface B737TakeoffPerformanceCard {
  scenarioId: string;
  runway: string;
  grossWeightKg: number;
  flapSetting: number;
  stabilizerTrimUnits: number;
  assumedTemperatureC: number | null;
  vSpeeds: B737VSpeeds;
  cleanClimb: B737CleanClimbEnvelope;
  approach: B737ApproachEnvelope;
  landing: B737LandingPerformanceEnvelope;
  initialClimbPitchDeg: number;
  ownership: B737PerformanceDataOwnership;
  notes: string[];
}

const placeholderFixtureOwnership: B737PerformanceDataOwnership = {
  label: 'placeholder-performance-envelope-fixture',
  runtimeConsumers: [],
  testConsumers: [
    'src/sim/physics/__tests__/stallEnvelope.test.ts',
    'src/sim/physics/__tests__/performanceEnvelope.test.ts',
    'src/sim/systems/__tests__/engine.test.ts',
    'src/sim/data/__tests__/performanceCards.test.ts',
  ],
  sourceNote: 'RFS placeholder gameplay envelope fixture for automated tests only; broad sanity bounds, not certified Boeing data and not an AFM table.',
};

const landingPerformanceOwnership: B737PerformanceDataOwnership = {
  label: 'runtime-landing-proof-and-performance-test-card',
  runtimeConsumers: [],
  testConsumers: [
    'src/sim/data/__tests__/performanceCards.test.ts',
    'src/sim/physics/__tests__/performanceEnvelope.test.ts',
    'e2e/rfs-flight.spec.ts',
  ],
  sourceNote: 'RFS gameplay landing envelope card for automated acceptance only; broad placeholder bounds, not a certified Boeing AFM table.',
};

function landingPerformanceEnvelope(options: {
  vrefKt: number;
  targetApproachIasKt: number;
  sinkRateFpm: [number, number];
  touchdownSinkRateMps: [number, number];
  touchdownZoneDistanceM?: [number, number];
  stoppingDistanceM?: [number, number];
}): B737LandingPerformanceEnvelope {
  return {
    vrefKt: options.vrefKt,
    targetApproachIasKt: options.targetApproachIasKt,
    glidepathDeg: 3,
    sinkRateFpm: options.sinkRateFpm,
    touchdownSinkRateMps: options.touchdownSinkRateMps,
    touchdownZoneDistanceM: options.touchdownZoneDistanceM ?? [0, 900],
    stoppingDistanceM: options.stoppingDistanceM ?? [300, 1_000],
    ownership: landingPerformanceOwnership,
  };
}

export const b737StallSpeedFixtures: B737StallSpeedFixture[] = [
  {
    name: 'Medium clean stall placeholder - flaps up gear up',
    grossWeightKg: 62_000,
    altitudeFt: 5_000,
    iasKt: 170,
    flapSetting: 0,
    gearDown: false,
    expectedStallIasKt: [135, 145],
    expectedClMax: [1.45, 1.65],
    expectedPeakAoADeg: [10, 20],
    ownership: placeholderFixtureOwnership,
  },
  {
    name: 'Medium landing stall placeholder - flaps 30 gear down',
    grossWeightKg: 62_000,
    altitudeFt: 1_500,
    iasKt: 135,
    flapSetting: 30,
    gearDown: true,
    expectedStallIasKt: [106, 116],
    expectedClMax: [2.3, 2.6],
    expectedPeakAoADeg: [8, 22],
    ownership: placeholderFixtureOwnership,
  },
  {
    name: 'Light landing stall placeholder - flaps 30 gear down',
    grossWeightKg: 50_413,
    altitudeFt: 1_500,
    iasKt: 135,
    flapSetting: 30,
    gearDown: true,
    expectedStallIasKt: [96, 106],
    expectedClMax: [2.3, 2.6],
    expectedPeakAoADeg: [8, 22],
    ownership: placeholderFixtureOwnership,
  },
];

export const b737CleanClimbFixtures: B737CleanClimbFixture[] = [
  {
    name: 'Light clean climb placeholder - 10k ft / 250 KIAS / 72% N1',
    grossWeightKg: 50_413,
    altitudeFt: 10_000,
    iasKt: 250,
    n1Percent: 72,
    expectedClimbFpm: [2_000, 4_500],
    ownership: placeholderFixtureOwnership,
  },
  {
    name: 'Medium clean climb placeholder - 10k ft / 250 KIAS / 72% N1',
    grossWeightKg: 61_913,
    altitudeFt: 10_000,
    iasKt: 250,
    n1Percent: 72,
    expectedClimbFpm: [1_500, 3_500],
    ownership: placeholderFixtureOwnership,
  },
  {
    name: 'Heavy clean climb placeholder - 10k ft / 250 KIAS / 72% N1',
    grossWeightKg: 78_000,
    altitudeFt: 10_000,
    iasKt: 250,
    n1Percent: 72,
    expectedClimbFpm: [500, 2_800],
    ownership: placeholderFixtureOwnership,
  },
];

export const b737CruiseTrimFixtures: B737CruiseTrimFixture[] = [
  {
    name: 'Light clean cruise trim placeholder - 8k ft / 240 KIAS',
    grossWeightKg: 50_413,
    altitudeFt: 8_000,
    iasKt: 240,
    expectedAoADeg: [-1, 3],
    ownership: placeholderFixtureOwnership,
  },
  {
    name: 'Medium clean cruise trim placeholder - 10k ft / 280 KIAS',
    grossWeightKg: 61_913,
    altitudeFt: 10_000,
    iasKt: 280,
    expectedAoADeg: [-1, 2.5],
    ownership: placeholderFixtureOwnership,
  },
  {
    name: 'Medium high-cruise trim placeholder - 30k ft / 260 KIAS',
    grossWeightKg: 61_913,
    altitudeFt: 30_000,
    iasKt: 260,
    expectedAoADeg: [-1, 3],
    ownership: placeholderFixtureOwnership,
  },
];

export const b737ApproachVrefFixtures: B737ApproachVrefFixture[] = [
  {
    name: 'Medium flaps-30 VREF placeholder - VREF 135 plus 5 kt additive',
    grossWeightKg: 61_913,
    heightAglFt: 1_500,
    vrefKt: 135,
    targetApproachIasKt: 140,
    flapSetting: 30,
    expectedAoADeg: [4, 8],
    ownership: placeholderFixtureOwnership,
  },
  {
    name: 'Light flaps-30 VREF placeholder - VREF 130 plus 5 kt additive',
    grossWeightKg: 50_413,
    heightAglFt: 1_500,
    vrefKt: 130,
    targetApproachIasKt: 135,
    flapSetting: 30,
    expectedAoADeg: [2.5, 6.5],
    ownership: placeholderFixtureOwnership,
  },
];

export const b737EngineLapseFixtures: B737EngineLapseFixture[] = [
  {
    name: 'Sea-level takeoff lapse placeholder - 90% N1 / Mach 0.20',
    n1Percent: 90,
    altitudeFt: 0,
    mach: 0.2,
    oatC: 15,
    oatModeled: false,
    expectedThrustN: [95_000, 101_000],
    expectedSeaLevelStaticRatio: [0.98, 1.02],
    ownership: placeholderFixtureOwnership,
  },
  {
    name: 'Climb lapse placeholder - 10k ft / Mach 0.45 / 90% N1',
    n1Percent: 90,
    altitudeFt: 10_000,
    mach: 0.45,
    oatC: -5,
    oatModeled: false,
    expectedThrustN: [70_000, 76_000],
    expectedSeaLevelStaticRatio: [0.70, 0.78],
    ownership: placeholderFixtureOwnership,
  },
  {
    name: 'Cruise lapse OAT documentation - cold day 35k ft / Mach 0.78',
    n1Percent: 90,
    altitudeFt: 35_000,
    mach: 0.78,
    oatC: -54,
    oatModeled: false,
    expectedThrustN: [32_000, 37_000],
    expectedSeaLevelStaticRatio: [0.33, 0.38],
    ownership: placeholderFixtureOwnership,
  },
  {
    name: 'Cruise lapse OAT documentation - hot day 35k ft / Mach 0.78',
    n1Percent: 90,
    altitudeFt: 35_000,
    mach: 0.78,
    oatC: -20,
    oatModeled: false,
    expectedThrustN: [32_000, 37_000],
    expectedSeaLevelStaticRatio: [0.33, 0.38],
    ownership: placeholderFixtureOwnership,
  },
  {
    name: 'High-Mach sea-level lapse placeholder - Mach 0.82 / 90% N1',
    n1Percent: 90,
    altitudeFt: 0,
    mach: 0.82,
    oatC: 15,
    oatModeled: false,
    expectedThrustN: [74_000, 79_000],
    expectedSeaLevelStaticRatio: [0.74, 0.82],
    ownership: placeholderFixtureOwnership,
  },
];

export const b737PerformanceCards: B737TakeoffPerformanceCard[] = [
  {
    scenarioId: 'enva-tutorial',
    runway: '09',
    grossWeightKg: 61_913,
    flapSetting: 5,
    stabilizerTrimUnits: 5.0,
    assumedTemperatureC: null,
    vSpeeds: { v1Kt: 141, vrKt: 149, v2Kt: 155 },
    cleanClimb: {
      altitudeFt: 10_000,
      iasKt: 250,
      n1Percent: 72,
      expectedClimbFpm: [1_500, 3_500],
    },
    approach: {
      heightAglFt: 1_500,
      iasKt: 140,
      vrefKt: 135,
      flapSetting: 30,
      expectedAoADeg: [1, 9],
    },
    landing: landingPerformanceEnvelope({
      vrefKt: 135,
      targetApproachIasKt: 140,
      sinkRateFpm: [500, 850],
      touchdownSinkRateMps: [0.5, 14.5],
    }),
    initialClimbPitchDeg: 10,
    ownership: {
      label: 'runtime-takeoff-cue-and-physics-test-card',
      runtimeConsumers: ['src/sim/takeoffCue.ts', 'src/instruments/RfsPFD.tsx'],
      testConsumers: [
        'src/sim/data/__tests__/performanceCards.test.ts',
        'src/sim/physics/__tests__/performanceCards.test.ts',
      ],
      sourceNote: 'RFS gameplay baseline card; broad envelope guard, not a certified Boeing AFM table.',
    },
    notes: [
      'RFS gameplay card for the default medium ENVA tutorial scenario; keeps player-facing PFD V-speed references aligned with rotate cue logic.',
    ],
  },
  {
    scenarioId: 'ksea-tutorial',
    runway: '16L',
    grossWeightKg: 61_913,
    flapSetting: 5,
    stabilizerTrimUnits: 5.0,
    assumedTemperatureC: null,
    vSpeeds: { v1Kt: 141, vrKt: 149, v2Kt: 155 },
    cleanClimb: {
      altitudeFt: 10_000,
      iasKt: 250,
      n1Percent: 72,
      expectedClimbFpm: [1_500, 3_500],
    },
    approach: {
      heightAglFt: 1_500,
      iasKt: 140,
      vrefKt: 135,
      flapSetting: 30,
      expectedAoADeg: [1, 9],
    },
    landing: landingPerformanceEnvelope({
      vrefKt: 135,
      targetApproachIasKt: 140,
      sinkRateFpm: [500, 850],
      touchdownSinkRateMps: [0.5, 14.5],
    }),
    initialClimbPitchDeg: 10,
    ownership: {
      label: 'runtime-takeoff-cue-and-physics-test-card',
      runtimeConsumers: ['src/sim/takeoffCue.ts', 'src/instruments/RfsPFD.tsx'],
      testConsumers: [
        'src/sim/data/__tests__/performanceCards.test.ts',
        'src/sim/physics/__tests__/performanceCards.test.ts',
      ],
      sourceNote: 'RFS gameplay baseline card; broad envelope guard, not a certified Boeing AFM table.',
    },
    notes: [
      'RFS gameplay card for the medium KSEA tutorial scenario; keeps rotate cue aligned with current takeoff envelope tests.',
    ],
  },
  {
    scenarioId: 'ksea-light-pattern',
    runway: '16L',
    grossWeightKg: 50_413,
    flapSetting: 5,
    stabilizerTrimUnits: 4.5,
    assumedTemperatureC: null,
    vSpeeds: { v1Kt: 129, vrKt: 137, v2Kt: 145 },
    cleanClimb: {
      altitudeFt: 10_000,
      iasKt: 250,
      n1Percent: 72,
      expectedClimbFpm: [2_000, 4_500],
    },
    approach: {
      heightAglFt: 1_500,
      iasKt: 135,
      vrefKt: 130,
      flapSetting: 30,
      expectedAoADeg: [0, 8],
    },
    landing: landingPerformanceEnvelope({
      vrefKt: 130,
      targetApproachIasKt: 135,
      sinkRateFpm: [480, 820],
      touchdownSinkRateMps: [0.5, 14.5],
    }),
    initialClimbPitchDeg: 10,
    ownership: {
      label: 'runtime-takeoff-cue-and-physics-test-card',
      runtimeConsumers: ['src/sim/takeoffCue.ts', 'src/instruments/RfsPFD.tsx'],
      testConsumers: [
        'src/sim/data/__tests__/performanceCards.test.ts',
        'src/sim/physics/__tests__/performanceCards.test.ts',
      ],
      sourceNote: 'RFS gameplay baseline card; broad envelope guard, not a certified Boeing AFM table.',
    },
    notes: [
      'RFS gameplay card for light hand-flying/pattern practice; lower VR than the tutorial scenario by design.',
    ],
  },
];

export function findPerformanceCardForScenario(scenarioId: string): B737TakeoffPerformanceCard {
  const card = maybeFindPerformanceCardForScenario(scenarioId);
  if (!card) {
    throw new Error(`No B737 performance card defined for scenario ${scenarioId}`);
  }
  return card;
}

export function maybeFindPerformanceCardForScenario(scenarioId: string | null | undefined): B737TakeoffPerformanceCard | null {
  if (!scenarioId) return null;
  return b737PerformanceCards.find((candidate) => candidate.scenarioId === scenarioId) ?? null;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`Performance card ${label} mismatch: expected ${String(expected)}, got ${String(actual)}`);
  }
}

export function assertPerformanceCardMatchesScenario(
  card: B737TakeoffPerformanceCard,
  scenario: FlightScenario,
): void {
  assertEqual(card.scenarioId, scenario.id, 'scenario id');
  assertEqual(card.runway, scenario.runway.runway, 'runway');
  assertEqual(card.grossWeightKg, scenario.grossWeightKg, 'gross weight');
  assertEqual(card.flapSetting, scenario.flapSetting, 'flap setting');
  assertEqual(card.stabilizerTrimUnits, scenario.stabilizerTrimUnits, 'stabilizer trim');

  if (card.vSpeeds.v1Kt > card.vSpeeds.vrKt) {
    throw new Error(`Performance card ${card.scenarioId} V1 must not exceed VR`);
  }
  if (card.vSpeeds.vrKt >= card.vSpeeds.v2Kt) {
    throw new Error(`Performance card ${card.scenarioId} VR must be below V2`);
  }
  if (card.initialClimbPitchDeg <= 0 || card.initialClimbPitchDeg > 15) {
    throw new Error(`Performance card ${card.scenarioId} initial climb pitch must be playable and bounded`);
  }
}
