import { describe, expect, it } from 'vitest';
import type { FlightPlan } from '@shared/types/fmc';
import { buildGuidanceState } from '../guidanceState';
import { createAircraftStateForScenario, KSEA_LIGHT_PATTERN_SCENARIO } from '../scenarios';
import {
  advanceSimulationStep,
  type SimulationStepInput,
  type SimulationStepResult,
} from '../simulationStep';
import { computeRouteStatus } from '../systems/navigation';
import { B737_800_SPEC, type ControlInputs } from '../types';
import {
  decodeSimulationStepRequest,
  decodeSimulationStepResponse,
  encodeSimulationStepError,
  encodeSimulationStepRequest,
  encodeSimulationStepResult,
  SIMULATION_WORKER_PROTOCOL_VERSION,
} from '../workerCodec';

function takeoffControls(): ControlInputs {
  return {
    elevator: -0.08,
    aileron: 0.02,
    rudder: -0.03,
    throttle1: 0.92,
    throttle2: 0.91,
    flapLever: KSEA_LIGHT_PATTERN_SCENARIO.flapSetting,
    gearLever: 'DOWN',
    spoilers: 0,
    brake: 0,
  };
}

function shortFlightPlan(): FlightPlan {
  return {
    origin: 'KSEA',
    destination: 'KPDX',
    flightNumber: 'RFS64C',
    route: 'KSEA SEA OLM KPDX',
    waypoints: [
      { ident: 'KSEA', lat: 47.4502, lon: -122.3088, discontinuity: false, coordinateSource: 'manual' },
      { ident: 'SEA', lat: 47.4354, lon: -122.3096, discontinuity: false, coordinateSource: 'navdb' },
      { ident: 'OLM', lat: 46.9712, lon: -122.9026, discontinuity: false, coordinateSource: 'navdb' },
      { ident: 'KPDX', lat: 45.5898, lon: -122.5951, discontinuity: false, coordinateSource: 'manual' },
    ],
  };
}

function realisticStepInput(): SimulationStepInput {
  const aircraft = createAircraftStateForScenario(B737_800_SPEC, KSEA_LIGHT_PATTERN_SCENARIO);
  aircraft.velocity = { u: 72, v: -1.8, w: 0.4 };
  aircraft.engines = [
    { ...aircraft.engines[0], running: true, n1: 88, n2: 92, egt: 610, fuelFlow: 1210, thrust: 91_000 },
    { ...aircraft.engines[1], running: true, n1: 87.5, n2: 91.8, egt: 608, fuelFlow: 1205, thrust: 90_700 },
  ];
  aircraft.simTime = 42_000;
  aircraft.flightPhase = 'TAKEOFF';

  const pilotInputs = takeoffControls();
  const flightPlan = shortFlightPlan();
  const routeStatus = computeRouteStatus(aircraft, flightPlan, 0);
  const guidance = buildGuidanceState({
    scenario: KSEA_LIGHT_PATTERN_SCENARIO,
    status: 'running',
    aircraft,
    controls: pilotInputs,
    tutorialStepIndex: 1,
  });

  return {
    aircraft,
    spec: B737_800_SPEC,
    pilotInputs,
    apState: null,
    flightPlan,
    activeLegIndex: routeStatus.activeLegIndex,
    routeStatus,
    wind: { ...KSEA_LIGHT_PATTERN_SCENARIO.wind },
    dt: 1 / 60,
    status: 'running',
    selectedScenarioId: KSEA_LIGHT_PATTERN_SCENARIO.id,
    guidance,
  };
}

function expectResultResponse(
  response: ReturnType<typeof decodeSimulationStepResponse>,
): asserts response is ReturnType<typeof decodeSimulationStepResponse> & { type: 'simulation.step.result' } {
  expect(response.type).toBe('simulation.step.result');
  if (response.type !== 'simulation.step.result') {
    throw new Error(`expected result response, got ${response.type}`);
  }
}

function expectErrorResponse(
  response: ReturnType<typeof decodeSimulationStepResponse>,
): asserts response is ReturnType<typeof decodeSimulationStepResponse> & { type: 'simulation.step.error' } {
  expect(response.type).toBe('simulation.step.error');
  if (response.type !== 'simulation.step.error') {
    throw new Error(`expected error response, got ${response.type}`);
  }
}

describe('workerCodec', () => {
  it('round-trips a realistic simulation step input as structured-clone-safe data', () => {
    const input = realisticStepInput();
    const originalWind = structuredClone(input.wind);

    const encoded = encodeSimulationStepRequest('step-64c', input);
    const decoded = decodeSimulationStepRequest(structuredClone(encoded));

    expect(decoded).toEqual({
      protocolVersion: SIMULATION_WORKER_PROTOCOL_VERSION,
      type: 'simulation.step.request',
      requestId: 'step-64c',
      input,
    });
    expect(decoded.input).not.toBe(input);
    expect(decoded.input.aircraft).not.toBe(input.aircraft);
    expect(decoded.input.flightPlan).not.toBe(input.flightPlan);
    expect(decoded.input.wind).toEqual(KSEA_LIGHT_PATTERN_SCENARIO.wind);
    expect(decoded.input.wind).not.toBe(input.wind);
    expect(input.wind).toEqual(originalWind);
  });

  it('round-trips a simulation step result with the matching request id', () => {
    const input = realisticStepInput();
    const result: SimulationStepResult = advanceSimulationStep(input);

    const encoded = encodeSimulationStepResult('step-64c', result);
    const decoded = decodeSimulationStepResponse(structuredClone(encoded));

    expectResultResponse(decoded);
    expect(decoded.protocolVersion).toBe(SIMULATION_WORKER_PROTOCOL_VERSION);
    expect(decoded.requestId).toBe('step-64c');
    expect(decoded.result).toEqual(result);
    expect(decoded.result).not.toBe(result);
    expect(decoded.result.aircraft).not.toBe(result.aircraft);
  });

  it('round-trips a structured worker error response', () => {
    const error = new Error('physics worker failed before integration');
    error.name = 'SimulationWorkerError';
    error.stack = 'SimulationWorkerError: physics worker failed before integration';

    const encoded = encodeSimulationStepError('step-64c-error', error);
    const decoded = decodeSimulationStepResponse(structuredClone(encoded));

    expectErrorResponse(decoded);
    expect(decoded).toEqual({
      protocolVersion: SIMULATION_WORKER_PROTOCOL_VERSION,
      type: 'simulation.step.error',
      requestId: 'step-64c-error',
      error: {
        name: 'SimulationWorkerError',
        message: 'physics worker failed before integration',
        stack: 'SimulationWorkerError: physics worker failed before integration',
      },
    });
  });
});

// Boundary regressions: envelope validity must not admit unsafe execution data.
describe('worker payload validation', () => {
  it.each([NaN, Infinity, -Infinity, 0, -1, 0.5, 1e9])('rejects unsafe batch count %s before execution', (steps) => {
    const message = encodeSimulationStepRequest('bounds', realisticStepInput());
    message.input.steps = steps;
    expect(() => decodeSimulationStepRequest(message)).toThrow();
  });
  it.each([NaN, Infinity, 0, -0.1, 10])('rejects unsafe timestep %s', (dt) => {
    const message = encodeSimulationStepRequest('bounds', realisticStepInput());
    message.input.dt = dt;
    expect(() => decodeSimulationStepRequest(message)).toThrow();
  });
  it.each([null, {}, { aircraft: null }])('rejects malformed request payload %s', (input) => {
    const message = encodeSimulationStepRequest('shape', realisticStepInput());
    expect(() => decodeSimulationStepRequest({ ...message, input })).toThrow();
  });
  it('rejects a nested nonfinite aircraft value', () => {
    const message = encodeSimulationStepRequest('shape', realisticStepInput());
    message.input.aircraft.velocity.w = NaN;
    expect(() => decodeSimulationStepRequest(message)).toThrow();
  });
  it('rejects an unsupported scenario identity', () => {
    const message = encodeSimulationStepRequest('identity', realisticStepInput());
    message.input.selectedScenarioId = 'unknown-scenario';
    expect(() => decodeSimulationStepRequest(message)).toThrow();
  });
  it('rejects an impossible control command', () => {
    const message = encodeSimulationStepRequest('control', realisticStepInput());
    message.input.pilotInputs.throttle1 = 4;
    expect(() => decodeSimulationStepRequest(message)).toThrow();
  });
  it.each([null, {}, { aircraft: null }])('rejects malformed result payload %s', (result) => {
    const message = encodeSimulationStepResult('result', advanceSimulationStep(realisticStepInput()));
    expect(() => decodeSimulationStepResponse({ ...message, result })).toThrow();
  });
  it('rejects nonfinite results before they can be published', () => {
    const message = encodeSimulationStepResult('result', advanceSimulationStep(realisticStepInput()));
    message.result.aircraft.position.alt = NaN;
    expect(() => decodeSimulationStepResponse(message)).toThrow();
  });
});
