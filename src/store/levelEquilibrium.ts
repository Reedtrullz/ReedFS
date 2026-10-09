import { B737_800_SPEC, type ControlInputs } from '../sim/types';
import { createInputManagerState, type InputManagerState } from '../input/InputManager';
import { createAircraftStateForScenario, type FlightScenario } from '../sim/scenarios';
import { solveLevelEquilibrium, type LevelEquilibriumResult } from '../sim/physics/levelEquilibrium';
import { inputsForScenario } from './simStoreInputReducers';

export interface LevelEquilibriumReceipt {
  scenarioId: string;
  status: 'converged' | 'infeasible';
  reason: string | null;
  targetTasKt: number | null;
  solvedThrottle: number | null;
  solvedTrimUnits: number | null;
  solvedPitchDeg: number | null;
  residualNormalForceN: number | null;
  residualAxialForceN: number | null;
  residualPitchMomentNm: number | null;
  provisionalDataNotice: string;
}

export const LEVEL_EQUILIBRIUM_PROVISIONAL_NOTICE = 'Provisional placeholder data; solver receipt is not a performance qualification.';

function receiptFor(scenario: FlightScenario, result: LevelEquilibriumResult): LevelEquilibriumReceipt {
  if (result.status === 'infeasible') {
    return {
      scenarioId: scenario.id,
      status: 'infeasible',
      reason: result.reason,
      targetTasKt: result.provenance.targetTasKt,
      solvedThrottle: null,
      solvedTrimUnits: null,
      solvedPitchDeg: null,
      residualNormalForceN: null,
      residualAxialForceN: null,
      residualPitchMomentNm: null,
      provisionalDataNotice: LEVEL_EQUILIBRIUM_PROVISIONAL_NOTICE,
    };
  }
  return {
    scenarioId: scenario.id,
    status: 'converged',
    reason: null,
    targetTasKt: result.provenance.targetTasKt,
    solvedThrottle: result.controls.throttle,
    solvedTrimUnits: result.controls.trimUnits,
    solvedPitchDeg: result.aircraft.attitude.theta * 180 / Math.PI,
    residualNormalForceN: result.residuals.normalForceN,
    residualAxialForceN: result.residuals.axialForceN,
    residualPitchMomentNm: result.residuals.pitchMomentNm,
    provisionalDataNotice: LEVEL_EQUILIBRIUM_PROVISIONAL_NOTICE,
  };
}

const solveCache = new Map<string, LevelEquilibriumResult>();

export function levelEquilibriumResultForScenario(scenario: FlightScenario): LevelEquilibriumResult | null {
  if (!scenario.levelEquilibrium) return null;
  const cached = solveCache.get(scenario.id);
  if (cached) return cached;
  const result = solveLevelEquilibrium({
    targetTasKt: scenario.levelEquilibrium.targetTasKt,
    altitudeFt: scenario.position.alt,
    weather: { qnhHpa: scenario.weather.qnhHpa, surfaceTemperatureC: scenario.weather.surfaceTemperatureC },
    spec: B737_800_SPEC,
    grossWeightKg: scenario.grossWeightKg,
    cgPercent: scenario.cgPercent,
    fuel: { centerTank: scenario.fuel.centerTank, leftTank: scenario.fuel.leftTank, rightTank: scenario.fuel.rightTank },
    state: createAircraftStateForScenario(B737_800_SPEC, scenario),
  }, scenario.wind);
  solveCache.set(scenario.id, result);
  return result;
}

export function levelEquilibriumReceiptForScenario(scenario: FlightScenario): LevelEquilibriumReceipt | null {
  const result = levelEquilibriumResultForScenario(scenario);
  return result ? receiptFor(scenario, result) : null;
}

export interface SolvedScenarioInitialization {
  aircraft: ReturnType<typeof createAircraftStateForScenario>;
  pilotInputs: ControlInputs;
  inputManager: InputManagerState;
}

export function solvedScenarioInitialization(scenario: FlightScenario): SolvedScenarioInitialization | null {
  const result = levelEquilibriumResultForScenario(scenario);
  if (!result || result.status !== 'converged') return null;
  const pilotInputs: ControlInputs = {
    ...inputsForScenario(scenario),
    throttle1: result.controls.throttle1,
    throttle2: result.controls.throttle2,
    gearLever: 'UP',
  };
  return {
    aircraft: structuredClone(result.aircraft),
    pilotInputs,
    inputManager: createInputManagerState({ ...pilotInputs, stabilizerTrimUnits: result.controls.trimUnits }),
  };
}
