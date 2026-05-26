import type { AircraftSpec, AircraftState, ControlInputs } from '../types';
import { computeAero } from './aero';

export interface PitchTrimSolution {
  stabilizerTrimUnits: number;
  elevator: number;
  pitchMomentNm: number;
  iterations: number;
  converged: boolean;
}

export interface PitchTrimSolverOptions {
  elevator?: number;
  minTrimUnits?: number;
  maxTrimUnits?: number;
  toleranceNm?: number;
  maxIterations?: number;
}

const DEFAULT_TOLERANCE_NM = 1_000;
const DEFAULT_MAX_ITERATIONS = 50;

function pitchMomentForTrim(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  trimUnits: number,
  elevator: number,
): number {
  const candidate = structuredClone(state);
  candidate.config.stabilizerTrimUnits = trimUnits;
  return computeAero(candidate, { ...inputs, elevator }, spec).pitchMoment;
}

export function solvePitchTrimForState(
  state: AircraftState,
  inputs: ControlInputs,
  spec: AircraftSpec,
  options: PitchTrimSolverOptions = {},
): PitchTrimSolution {
  const elevator = options.elevator ?? 0;
  const minTrimUnits = options.minTrimUnits ?? 0;
  const maxTrimUnits = options.maxTrimUnits ?? 15;
  const toleranceNm = options.toleranceNm ?? DEFAULT_TOLERANCE_NM;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  let low = minTrimUnits;
  let high = maxTrimUnits;
  let lowMoment = pitchMomentForTrim(state, inputs, spec, low, elevator);
  const highMoment = pitchMomentForTrim(state, inputs, spec, high, elevator);

  if (Math.abs(lowMoment) <= toleranceNm) {
    return { stabilizerTrimUnits: low, elevator, pitchMomentNm: lowMoment, iterations: 0, converged: true };
  }
  if (Math.abs(highMoment) <= toleranceNm) {
    return { stabilizerTrimUnits: high, elevator, pitchMomentNm: highMoment, iterations: 0, converged: true };
  }

  if (Math.sign(lowMoment) === Math.sign(highMoment)) {
    const useLow = Math.abs(lowMoment) < Math.abs(highMoment);
    return {
      stabilizerTrimUnits: useLow ? low : high,
      elevator,
      pitchMomentNm: useLow ? lowMoment : highMoment,
      iterations: 0,
      converged: false,
    };
  }

  let bestTrim = low;
  let bestMoment = lowMoment;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const mid = (low + high) / 2;
    const midMoment = pitchMomentForTrim(state, inputs, spec, mid, elevator);
    bestTrim = mid;
    bestMoment = midMoment;

    if (Math.abs(midMoment) <= toleranceNm) {
      return { stabilizerTrimUnits: mid, elevator, pitchMomentNm: midMoment, iterations: iteration, converged: true };
    }

    if (Math.sign(lowMoment) === Math.sign(midMoment)) {
      low = mid;
      lowMoment = midMoment;
    } else {
      high = mid;
    }
  }

  return {
    stabilizerTrimUnits: bestTrim,
    elevator,
    pitchMomentNm: bestMoment,
    iterations: maxIterations,
    converged: Math.abs(bestMoment) <= toleranceNm,
  };
}
