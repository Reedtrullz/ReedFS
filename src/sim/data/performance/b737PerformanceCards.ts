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

export interface B737CleanClimbEnvelope {
  altitudeFt: number;
  iasKt: number;
  n1Percent: number;
  expectedClimbFpm: [number, number];
}

export interface B737ApproachEnvelope {
  heightAglFt: number;
  iasKt: number;
  flapSetting: number;
  expectedAoADeg: [number, number];
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
  initialClimbPitchDeg: number;
  ownership: B737PerformanceDataOwnership;
  notes: string[];
}

export const b737PerformanceCards: B737TakeoffPerformanceCard[] = [
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
      flapSetting: 30,
      expectedAoADeg: [1, 9],
    },
    initialClimbPitchDeg: 10,
    ownership: {
      label: 'runtime-takeoff-cue-and-physics-test-card',
      runtimeConsumers: ['src/sim/takeoffCue.ts'],
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
      flapSetting: 30,
      expectedAoADeg: [0, 8],
    },
    initialClimbPitchDeg: 10,
    ownership: {
      label: 'runtime-takeoff-cue-and-physics-test-card',
      runtimeConsumers: ['src/sim/takeoffCue.ts'],
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
