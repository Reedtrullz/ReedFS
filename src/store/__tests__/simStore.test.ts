import { describe, it, expect, beforeEach, vi } from 'vitest';
import simStoreSource from '../simStore.ts?raw';
import { useSimStore } from '../simStore';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { AutopilotCommands } from '../../sim/types';
import { KSEA_RUNWAY_ALT_FT } from '../../sim/systems/ground';
import { ENVA_TUTORIAL_SCENARIO, KSEA_LIGHT_PATTERN_SCENARIO, KSEA_TUTORIAL_SCENARIO, SCENARIOS } from '../../sim/scenarios';
import { createKseaKpdxFlight } from '../../sim/flightPlanLoader';
import {
  SCENARIO_SAVE_KEY,
  createScenarioSnapshot,
  type ScenarioPersistenceStorage,
} from '../scenarioPersistence';
import { applyDiscreteKeyInput } from '../../input/keyboardControls';
import { cockpitInputForInteraction } from '../../viewport/cockpitInteractions';

function minimalApState(): AutopilotState {
  return {
    boeing: {
      courseL: 0,
      courseR: 0,
      speed: null,
      mach: null,
      heading: 0,
      altitude: 0,
      verticalSpeed: null,
      fdLeft: false,
      fdRight: false,
      autothrottleArm: false,
      n1: false,
      speedMode: false,
      lnav: false,
      vnav: false,
      lvlChg: false,
      hdgSel: true,
      vorLoc: false,
      app: false,
      altHold: true,
      vs: false,
      cmdA: true,
      cmdB: false,
      cwsA: false,
      cwsB: false,
    },
    airbus: {
      speed: null,
      speedManaged: false,
      heading: null,
      headingManaged: false,
      altitude: 0,
      altitudeManaged: false,
      verticalSpeed: null,
      fpa: null,
      fd1: false,
      fd2: false,
      athr: false,
      ap1: false,
      ap2: false,
      loc: false,
      appr: false,
      exped: false,
      hdgTrkMode: 'HDG_VS',
      metricAltitude: false,
      speedMachMode: 'SPD',
    },
    truth: {
      lateralActive: 'HDG_SEL',
      verticalActive: 'ALT_HOLD',
      thrustActive: 'SPEED',
      autopilotStatus: 'CMD_A',
      lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
    },
  };
}

function speedAutothrottleOnlyState(): AutopilotState {
  const ap = minimalApState();
  ap.truth.autopilotStatus = 'OFF';
  ap.truth.lateralActive = 'OFF';
  ap.truth.verticalActive = 'OFF';
  ap.truth.thrustActive = 'SPEED';
  ap.boeing.cmdA = false;
  ap.boeing.hdgSel = false;
  ap.boeing.altHold = false;
  ap.boeing.autothrottleArm = true;
  ap.boeing.speedMode = true;
  ap.boeing.speed = 240;
  return ap;
}

function startTakeoffRollFromStore(): void {
  useSimStore.getState().setInput({
    throttle1: 1,
    throttle2: 1,
    flapLever: 5,
    gearLever: 'DOWN',
    brake: 0,
    elevator: 0,
  });
  useSimStore.getState().start();
}

function tickAtHz(hz: number, seconds: number): void {
  const startMs = 1000;
  for (let frame = 0; frame < seconds * hz; frame++) {
    useSimStore.getState().tick(startMs + frame * (1000 / hz));
  }
}

function establishPositiveRateInStore(): void {
  useSimStore.setState((s) => {
    const aircraft = structuredClone(s.aircraft);
    aircraft.flightPhase = 'TAKEOFF';
    aircraft.ground = {
      ...aircraft.ground,
      weightOnWheels: false,
      contact: 'none',
      onRunway: false,
      aglFt: 80,
      normalForceN: 0,
    };
    aircraft.velocity.w = -1.5;
    aircraft.position.alt += 80;
    return { aircraft };
  });
}

function shortRoutePlan(): FlightPlan {
  return {
    origin: 'ORIG',
    destination: 'DEST',
    flightNumber: 'TST123',
    route: 'ORIG MID DEST',
    waypoints: [
      { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
      { ident: 'MID', lat: 47.1, lon: -122.0, discontinuity: false },
      { ident: 'DEST', lat: 47.2, lon: -122.0, discontinuity: false },
    ],
  };
}

function memoryScenarioStorage(): ScenarioPersistenceStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    removeItem: (key: string) => { entries.delete(key); },
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
}

describe('useSimStore', () => {
  beforeEach(() => useSimStore.getState().reset());

  it('assembles stable domain slices while preserving the public compatibility API', () => {
    const state = useSimStore.getState();
    for (const action of ['startTakeoffRoll', 'setInput', 'setTakeoffConfig', 'setApState', 'setFlightPlan', 'reset', 'tick'] as const) {
      expect(typeof state[action]).toBe('function');
    }

    for (const factory of ['createAircraftSlice', 'createInputSlice', 'createAutoflightSlice', 'createRouteSlice', 'createPersistenceSlice']) {
      expect(simStoreSource).toMatch(new RegExp(`${factory}\\b`));
    }
  });

  it('starts stopped', () => expect(useSimStore.getState().status).toBe('stopped'));

  it('starts with unified scenario guidance derived from the initial aircraft and controls', () => {
    const state = useSimStore.getState();

    expect(state.guidance.scenarioId).toBe(ENVA_TUTORIAL_SCENARIO.id);
    expect(state.guidance.phase).toBe('preflight');
    expect(state.guidance.tutorial.stepIndex).toBe(0);
    expect(state.guidance.activeTutorialStep?.id).toBe('line-up');
    expect(state.guidance.checklist.every((item) => item.complete)).toBe(true);
    expect(state.guidance.coachMessage).toMatch(/start roll/i);
  });

  it('can select every published scenario without throwing', () => {
    for (const scenario of SCENARIOS) {
      expect(() => useSimStore.getState().setScenario(scenario.id)).not.toThrow();
      expect(useSimStore.getState().selectedScenarioId).toBe(scenario.id);
    }
    useSimStore.getState().setScenario(ENVA_TUTORIAL_SCENARIO.id);
  });

  it('separates pilot inputs, AP commands, effective controls, and legacy inputs alias', () => {
    const state = useSimStore.getState();

    expect(state.apCommands).toEqual({});
    expect(state.pilotInputs).toEqual(expect.objectContaining({
      flapLever: ENVA_TUTORIAL_SCENARIO.flapSetting,
      gearLever: 'DOWN',
    }));
    expect(state.effectiveControls).toEqual(state.pilotInputs);
    expect(state.inputs).toBe(state.effectiveControls);
  });
  it('start → running', () => { useSimStore.getState().start(); expect(useSimStore.getState().status).toBe('running'); });

  it('preserves configured takeoff flaps and trim when starting the roll', () => {
    const store = useSimStore.getState();
    store.setScenario('ksea-tutorial');
    store.setInput({ flapLever: 5, throttle1: 0, throttle2: 0 });
    store.startTakeoffRoll();
    const next = useSimStore.getState();
    expect(next.aircraft.flightPhase).toBe('TAKEOFF');
    expect(next.inputs.flapLever).toBe(5);
    expect(next.aircraft.config.stabilizerTrimUnits).toBeCloseTo(5.0, 1);
  });

  it('sets active scenario takeoff config without trim click loops', () => {
    const store = useSimStore.getState();
    store.setInput({ flapLever: 30, throttle1: 0.65, throttle2: 0.65, gearLever: 'DOWN' });
    store.applyInputActions({ trimDelta: 1.2 }, 0);
    useSimStore.getState().setApState(speedAutothrottleOnlyState());
    useSimStore.setState((state) => {
      const apCommands: AutopilotCommands = { throttle1: 0.8, throttle2: 0.8 };
      const effectiveControls = { ...state.pilotInputs, ...apCommands };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });

    useSimStore.getState().setTakeoffConfig();

    const next = useSimStore.getState();
    expect(next.inputs).toEqual(expect.objectContaining({
      flapLever: ENVA_TUTORIAL_SCENARIO.flapSetting,
      gearLever: 'DOWN',
      throttle1: 0,
      throttle2: 0,
    }));
    expect(next.pilotInputs).toEqual(expect.objectContaining({
      flapLever: ENVA_TUTORIAL_SCENARIO.flapSetting,
      gearLever: 'DOWN',
      throttle1: 0,
      throttle2: 0,
    }));
    expect(next.aircraft.config.stabilizerTrimUnits).toBe(ENVA_TUTORIAL_SCENARIO.stabilizerTrimUnits);
    expect(next.inputManager.stabilizerTrimUnits).toBe(ENVA_TUTORIAL_SCENARIO.stabilizerTrimUnits);
    expect(next.inputManager.throttle).toBe(0);
    expect(next.apState).toBeNull();
    expect(next.apCommands).toEqual({});
    expect(next.inputs).toBe(next.effectiveControls);
  });

  it('startTakeoffRoll sets inputs, running status, and TAKEOFF phase', () => {
    useSimStore.getState().startTakeoffRoll();

    const state = useSimStore.getState();
    expect(state.status).toBe('running');
    expect(state.inputs).toEqual(expect.objectContaining({
      throttle1: 0,
      throttle2: 0,
      flapLever: ENVA_TUTORIAL_SCENARIO.flapSetting,
      gearLever: 'DOWN',
      brake: 0,
      elevator: 0,
    }));
    expect(state.pilotInputs).toEqual(expect.objectContaining({
      throttle1: 0,
      throttle2: 0,
      flapLever: ENVA_TUTORIAL_SCENARIO.flapSetting,
      elevator: 0,
    }));
    expect(state.aircraft.config.stabilizerTrimUnits).toBe(ENVA_TUTORIAL_SCENARIO.stabilizerTrimUnits);
    expect(state.inputs).toBe(state.effectiveControls);
    expect(state.aircraft.flightPhase).toBe('TAKEOFF');
    expect(state.guidance.phase).toBe('takeoff-roll');
    expect(state.guidance.coachMessage).toMatch(/takeoff thrust/i);
  });

  it('startTakeoffRoll clears stale side-specific brake commands', () => {
    useSimStore.getState().setInput({ leftBrake: 1, rightBrake: 1 });

    useSimStore.getState().startTakeoffRoll();

    const state = useSimStore.getState();
    expect(state.inputs.leftBrake).toBe(0);
    expect(state.inputs.rightBrake).toBe(0);
    expect(state.pilotInputs.leftBrake).toBe(0);
    expect(state.pilotInputs.rightBrake).toBe(0);
    expect(state.inputManager.leftBrake).toBe(0);
    expect(state.inputManager.rightBrake).toBe(0);
  });

  it('abortTakeoff rejects a running takeoff without pausing the braking rollout', () => {
    useSimStore.getState().startTakeoffRoll();
    useSimStore.getState().setApState(minimalApState());
    useSimStore.setState((s) => ({
      aircraft: {
        ...s.aircraft,
        velocity: { ...s.aircraft.velocity, u: 45 },
      },
    }));

    useSimStore.getState().abortTakeoff();

    const state = useSimStore.getState();
    expect(state.status).toBe('running');
    expect(state.apState).toBeNull();
    expect(state.apCommands).toEqual({});
    expect(state.aircraft.flightPhase).toBe('TAKEOFF');
    expect(state.inputs).toEqual(expect.objectContaining({
      throttle1: 0,
      throttle2: 0,
      brake: 1,
      spoilers: 1,
      elevator: 0,
      gearLever: 'DOWN',
    }));
    expect(state.pilotInputs).toEqual(expect.objectContaining({ throttle1: 0, throttle2: 0, brake: 1, spoilers: 1 }));
    expect(state.guidance.phase).toBe('rejected-takeoff');
    expect(state.guidance.coachMessage).toMatch(/rejected takeoff|hold brakes|RESET/i);
  });

  it('keeps rejected-takeoff brakes latched across neutral input-manager frames', () => {
    useSimStore.getState().startTakeoffRoll();
    useSimStore.setState((s) => ({
      aircraft: {
        ...s.aircraft,
        velocity: { ...s.aircraft.velocity, u: 45 },
      },
    }));
    useSimStore.getState().abortTakeoff();

    useSimStore.getState().applyInputActions({}, 1 / 60);

    const state = useSimStore.getState();
    expect(state.inputs).toEqual(expect.objectContaining({ throttle1: 0, throttle2: 0, brake: 1, spoilers: 1 }));
    expect(state.guidance.phase).toBe('rejected-takeoff');
    expect(state.guidance.coachMessage).toMatch(/rejected takeoff|hold brakes|RESET/i);
  });
  it('pause → paused', () => { useSimStore.getState().start(); useSimStore.getState().pause(); expect(useSimStore.getState().status).toBe('paused'); });
  it('setInput partial updates pilot inputs and effective controls when AP is off', () => {
    useSimStore.getState().setInput({ throttle1: 0.8 });
    expect(useSimStore.getState().pilotInputs.throttle1).toBe(0.8);
    expect(useSimStore.getState().effectiveControls.throttle1).toBe(0.8);
    expect(useSimStore.getState().inputs.throttle1).toBe(0.8);
    expect(useSimStore.getState().inputs.throttle2).toBe(0);
  });
  it('neutral input-manager frames do not erase external control commands', () => {
    useSimStore.setState((s) => {
      const pilotInputs = { ...s.pilotInputs, elevator: 0.42 };
      const effectiveControls = { ...pilotInputs };
      return { pilotInputs, effectiveControls, inputs: effectiveControls };
    });

    useSimStore.getState().applyInputActions({}, 1 / 60);

    expect(useSimStore.getState().pilotInputs.elevator).toBe(0.42);
    expect(useSimStore.getState().inputs.elevator).toBe(0.42);
  });
  it('neutral input-manager frames preserve split-throttle partial inputs', () => {
    useSimStore.getState().setInput({ throttle1: 0.8 });

    useSimStore.getState().applyInputActions({}, 1 / 60);

    expect(useSimStore.getState().inputs.throttle1).toBe(0.8);
    expect(useSimStore.getState().inputs.throttle2).toBe(0);
  });
  it('neutral input-manager frames do not erase public setInput axis commands', () => {
    useSimStore.getState().setInput({ elevator: 0.42 });

    useSimStore.getState().applyInputActions({}, 1 / 60);

    expect(useSimStore.getState().inputs.elevator).toBe(0.42);
  });
  it('public setInput axis commands detach stale input-manager recentering', () => {
    useSimStore.getState().applyInputActions({ pitch: -1 }, 1 / 60);
    expect(useSimStore.getState().inputs.elevator).toBeLessThan(0);

    useSimStore.getState().setInput({ elevator: 0.42 });
    useSimStore.getState().applyInputActions({}, 1 / 60);

    expect(useSimStore.getState().inputs.elevator).toBe(0.42);
  });
  it('neutral input-manager frames do not erase separated AP commands', () => {
    const ap = minimalApState();
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = true;
    useSimStore.getState().setApState(ap);
    const apCommands: AutopilotCommands = { elevator: 0.42, aileron: -0.2, throttle1: 0.8, throttle2: 0.8 };
    useSimStore.setState((s) => {
      const effectiveControls = { ...s.pilotInputs, ...apCommands };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });

    useSimStore.getState().applyInputActions({}, 1 / 60);

    expect(useSimStore.getState().apCommands).toEqual(apCommands);
    expect(useSimStore.getState().pilotInputs.elevator).not.toBe(0.42);
    expect(useSimStore.getState().inputs.elevator).toBe(0.42);
  });
  it('A/T-only SPEED owns throttles while manual pitch and roll remain pilot-owned', () => {
    const ap = speedAutothrottleOnlyState();
    useSimStore.getState().setApState(ap);
    const apCommands: AutopilotCommands = {
      elevator: -0.4,
      aileron: 0.3,
      throttle1: 0.72,
      throttle2: 0.72,
    };
    useSimStore.setState((s) => {
      const effectiveControls = {
        ...s.pilotInputs,
        elevator: apCommands.elevator ?? s.pilotInputs.elevator,
        aileron: apCommands.aileron ?? s.pilotInputs.aileron,
        throttle1: apCommands.throttle1 ?? s.pilotInputs.throttle1,
        throttle2: apCommands.throttle2 ?? s.pilotInputs.throttle2,
      };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });

    useSimStore.getState().setInput({ elevator: 0.22, aileron: -0.11, throttle1: 0.95, throttle2: 0.95 });

    const state = useSimStore.getState();
    expect(state.apState?.truth.autopilotStatus).toBe('OFF');
    expect(state.apState?.truth.thrustActive).toBe('SPEED');
    expect(state.apCommands.elevator).toBeUndefined();
    expect(state.apCommands.aileron).toBeUndefined();
    expect(state.apCommands.throttle1).toBe(0.72);
    expect(state.apCommands.throttle2).toBe(0.72);
    expect(state.pilotInputs.elevator).toBe(0.22);
    expect(state.pilotInputs.aileron).toBe(-0.11);
    expect(state.pilotInputs.throttle1).not.toBe(0.95);
    expect(state.effectiveControls.elevator).toBe(0.22);
    expect(state.effectiveControls.aileron).toBe(-0.11);
    expect(state.effectiveControls.throttle1).toBe(0.72);
    expect(state.inputs).toBe(state.effectiveControls);
  });

  it('throttle input-manager actions start from the live throttle lever after split-throttle input', () => {
    useSimStore.getState().setInput({ throttle1: 0.8 });

    useSimStore.getState().applyInputActions({ throttleDelta: 0.05 }, 0);

    expect(useSimStore.getState().inputs.throttle1).toBeCloseTo(0.85, 8);
    expect(useSimStore.getState().inputs.throttle2).toBeCloseTo(0.85, 8);
  });
  it('side-specific brake actions update pilot/effective controls without disconnecting AP axes', () => {
    const ap = minimalApState();
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = true;
    useSimStore.getState().setApState(ap);
    const apCommands: AutopilotCommands = { elevator: -0.5, aileron: 0.25, throttle1: 0.7, throttle2: 0.7 };
    useSimStore.setState((s) => {
      const effectiveControls = { ...s.pilotInputs, ...apCommands };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });

    useSimStore.getState().applyInputActions({ leftBrake: 1 }, 1 / 60);

    const braked = useSimStore.getState();
    expect(braked.apState?.truth.autopilotStatus).toBe('CMD_A');
    expect(braked.apCommands).toEqual(apCommands);
    expect(braked.pilotInputs.leftBrake).toBe(1);
    expect(braked.effectiveControls.leftBrake).toBe(1);
    expect(braked.effectiveControls.elevator).toBe(apCommands.elevator);
    expect(braked.effectiveControls.aileron).toBe(apCommands.aileron);
    expect(braked.effectiveControls.throttle1).toBe(apCommands.throttle1);

    useSimStore.getState().applyInputActions({}, 1 / 60);

    const released = useSimStore.getState();
    expect(released.apState?.truth.autopilotStatus).toBe('CMD_A');
    expect(released.apCommands).toEqual(apCommands);
    expect(released.pilotInputs.leftBrake).toBe(0);
    expect(released.effectiveControls.leftBrake).toBe(0);
    expect(released.effectiveControls.elevator).toBe(apCommands.elevator);
  });

  it('loadScenarioState clears stale persisted side-specific brake commands while preserving symmetric brake', () => {
    const storage = memoryScenarioStorage();
    useSimStore.getState().setInput({ brake: 0.4 });
    const snapshot = createScenarioSnapshot(useSimStore.getState());
    snapshot.pilotInputs.leftBrake = 1;
    snapshot.pilotInputs.rightBrake = 0.75;
    snapshot.inputManager.leftBrake = 1;
    snapshot.inputManager.rightBrake = 0.75;
    storage.setItem(SCENARIO_SAVE_KEY, JSON.stringify(snapshot));

    useSimStore.getState().setInput({ brake: 0, leftBrake: 0, rightBrake: 0 });
    useSimStore.getState().loadScenarioState(storage);

    const restored = useSimStore.getState();
    expect(restored.pilotInputs.brake).toBe(0.4);
    expect(restored.pilotInputs.leftBrake).toBe(0);
    expect(restored.pilotInputs.rightBrake).toBe(0);
    expect(restored.effectiveControls.brake).toBe(0.4);
    expect(restored.effectiveControls.leftBrake).toBe(0);
    expect(restored.effectiveControls.rightBrake).toBe(0);
    expect(restored.inputs).toBe(restored.effectiveControls);
    expect(restored.inputManager.leftBrake).toBe(0);
    expect(restored.inputManager.rightBrake).toBe(0);
  });

  it('loadScenarioState fills missing gear transit state from legacy gearDown snapshots', () => {
    const storage = memoryScenarioStorage();
    const snapshot = createScenarioSnapshot(useSimStore.getState());
    snapshot.aircraft.config.gearDown = true;
    delete (snapshot.aircraft.config as unknown as Record<string, unknown>).gearPosition;
    storage.setItem(SCENARIO_SAVE_KEY, JSON.stringify(snapshot));

    useSimStore.getState().loadScenarioState(storage);

    const restored = useSimStore.getState();
    expect(restored.aircraft.config.gearDown).toBe(true);
    expect(restored.aircraft.config.gearPosition).toBe(1);
  });

  it('loadScenarioState clears stale AP pitch/roll while preserving backed A/T throttle when CMD_A is unbacked', () => {
    const storage = memoryScenarioStorage();
    useSimStore.getState().setInput({
      elevator: 0.12,
      aileron: -0.08,
      throttle1: 0.21,
      throttle2: 0.23,
    });
    const snapshot = createScenarioSnapshot(useSimStore.getState());
    const ap = minimalApState();
    ap.truth.autopilotStatus = 'CMD_A';
    ap.truth.lateralActive = 'HDG_SEL';
    ap.truth.verticalActive = 'ALT_HOLD';
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.cmdA = false;
    ap.boeing.hdgSel = true;
    ap.boeing.altHold = true;
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = true;
    snapshot.apState = ap;
    snapshot.apCommands = {
      elevator: -0.7,
      aileron: 0.6,
      throttle1: 0.9,
      throttle2: 0.85,
    };
    storage.setItem(SCENARIO_SAVE_KEY, JSON.stringify(snapshot));

    useSimStore.getState().reset();
    useSimStore.getState().loadScenarioState(storage);

    const restored = useSimStore.getState();
    expect(restored.apCommands).toEqual({ throttle1: 0.9, throttle2: 0.85 });
    expect(restored.effectiveControls).toEqual(expect.objectContaining({
      elevator: 0.12,
      aileron: -0.08,
      throttle1: 0.9,
      throttle2: 0.85,
    }));
    expect(restored.effectiveControls.elevator).toBe(restored.pilotInputs.elevator);
    expect(restored.effectiveControls.aileron).toBe(restored.pilotInputs.aileron);
    expect(restored.pilotInputs.throttle1).toBe(0.21);
    expect(restored.pilotInputs.throttle2).toBe(0.23);
    expect(restored.effectiveControls.throttle1).toBe(restored.apCommands.throttle1);
    expect(restored.effectiveControls.throttle2).toBe(restored.apCommands.throttle2);
    expect(restored.inputs).toBe(restored.effectiveControls);
  });

  it('tick advances simTime when running', () => { useSimStore.getState().start(); const b = useSimStore.getState().aircraft.simTime; useSimStore.getState().tick(performance.now()); expect(useSimStore.getState().aircraft.simTime).toBeGreaterThanOrEqual(b); });

  it('splits a long frame into fixed simulation steps', () => {
    const store = useSimStore.getState();
    store.reset();
    useSimStore.getState().startTakeoffRoll();

    useSimStore.getState().tick(1000);
    useSimStore.getState().tick(1200);

    const after = useSimStore.getState();
    expect(after.lastFrameTime).toBe(1200);
    expect(after.fixedStepAccumulatorSeconds).toBeLessThan(1 / 60);
    expect(after.simulationTimeSeconds).toBeGreaterThanOrEqual(0.21);
    expect(after.simulationTimeSeconds).toBeLessThanOrEqual(0.22);
  });

  it('caps catch-up work and records dropped simulation time after a giant frame', () => {
    useSimStore.getState().startTakeoffRoll();

    useSimStore.getState().tick(1000);
    useSimStore.getState().tick(11000);

    const after = useSimStore.getState();
    expect(after.lastFrameTime).toBe(11000);
    expect(after.simulationTimeSeconds).toBeCloseTo(17 / 60, 8);
    expect(after.fixedStepAccumulatorSeconds).toBe(0);
    expect(after.droppedSimulationTimeSeconds).toBeGreaterThan(9.7);
  });

  it('clones the aircraft once per rendered frame instead of once per fixed substep', () => {
    useSimStore.getState().startTakeoffRoll();
    const cloneSpy = vi.spyOn(globalThis, 'structuredClone');

    useSimStore.getState().tick(1000);
    useSimStore.getState().tick(11000);

    // The 10s frame is capped at 16 fixed substeps. The store should clone the
    // aircraft once before the loop, then run substeps with cloneAircraft=false.
    expect(cloneSpy.mock.calls.length).toBeLessThanOrEqual(2);
    cloneSpy.mockRestore();
  });

  it('setFlightPlan initializes the first valid active leg and route feedback', () => {
    useSimStore.getState().setScenario(KSEA_TUTORIAL_SCENARIO.id);
    const fp = createKseaKpdxFlight();

    useSimStore.getState().setFlightPlan(fp);

    const state = useSimStore.getState();
    expect(state.flightPlan).toBe(fp);
    expect(state.activeLegIndex).toBe(0);
    expect(state.routeStatus.routeName).toBe('KSEA→KPDX');
    expect(state.routeStatus.lnavAvailable).toBe(true);
    expect(state.routeStatus.fromIdent).toBe('KSEA');
    expect(state.routeStatus.nextWaypointIdent).not.toBe('KPDX');
    expect(state.routeStatus.distanceToNextNm).toBeGreaterThan(0);
  });

  it('keeps LNAV unavailable when a loaded route is incompatible with the selected scenario position', () => {
    useSimStore.getState().setScenario(ENVA_TUTORIAL_SCENARIO.id);
    const fp = createKseaKpdxFlight();

    useSimStore.getState().setFlightPlan(fp);

    const state = useSimStore.getState();
    expect(state.selectedScenarioId).toBe(ENVA_TUTORIAL_SCENARIO.id);
    expect(state.flightPlan).toBe(fp);
    expect(state.routeStatus.routeName).toBe('KSEA→KPDX');
    expect(state.routeStatus.lnavAvailable).toBe(false);
    expect(state.routeStatus.lnavUnavailableReason).toMatch(/route.*not compatible.*current aircraft position/i);
  });

  it('setFlightPlan clears stale LNAV aileron commands when clearing the route', () => {
    useSimStore.getState().setInput({ aileron: -0.12 });
    const startPosition = useSimStore.getState().aircraft.position;
    const fp: FlightPlan = {
      origin: 'ORIG',
      destination: 'DEST',
      flightNumber: 'TST123',
      route: 'ORIG DEST',
      waypoints: [
        { ident: 'ORIG', lat: startPosition.lat, lon: startPosition.lon, discontinuity: false },
        { ident: 'DEST', lat: startPosition.lat + 0.1, lon: startPosition.lon, discontinuity: false },
      ],
    };
    useSimStore.getState().setFlightPlan(fp);

    const ap = minimalApState();
    ap.truth.lateralActive = 'LNAV';
    ap.truth.verticalActive = 'OFF';
    ap.truth.thrustActive = 'OFF';
    ap.boeing.lnav = true;
    ap.boeing.hdgSel = false;
    ap.boeing.altHold = false;
    useSimStore.getState().setApState(ap);
    useSimStore.setState((s) => {
      const apCommands: AutopilotCommands = { aileron: 0.42 };
      const effectiveControls = { ...s.pilotInputs, ...apCommands };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });

    const withRoute = useSimStore.getState();
    expect(withRoute.routeStatus.lnavAvailable).toBe(true);
    expect(withRoute.apState?.truth.autopilotStatus).toBe('CMD_A');
    expect(withRoute.apState?.truth.lateralActive).toBe('LNAV');
    expect(withRoute.apState?.boeing.lnav).toBe(true);
    expect(withRoute.apCommands.aileron).toBe(0.42);
    expect(withRoute.effectiveControls.aileron).toBe(0.42);
    expect(withRoute.pilotInputs.aileron).toBe(-0.12);

    useSimStore.getState().setFlightPlan(null);

    const withoutRoute = useSimStore.getState();
    expect(withoutRoute.flightPlan).toBeNull();
    expect(withoutRoute.activeLegIndex).toBeNull();
    expect(withoutRoute.routeStatus.lnavAvailable).toBe(false);
    expect(withoutRoute.routeStatus.lnavUnavailableReason).toMatch(/no flight plan/i);
    expect(withoutRoute.apCommands.aileron).toBeUndefined();
    expect(withoutRoute.effectiveControls.aileron).toBe(withoutRoute.pilotInputs.aileron);
    expect(withoutRoute.effectiveControls).toEqual(withoutRoute.pilotInputs);
    expect(withoutRoute.inputs).toBe(withoutRoute.effectiveControls);
  });

  it('tick advances the active leg and refreshes route feedback as the aircraft progresses', () => {
    const fp = shortRoutePlan();
    useSimStore.getState().setFlightPlan(fp);
    useSimStore.setState((s) => ({
      aircraft: {
        ...s.aircraft,
        position: { ...s.aircraft.position, lat: 47.1005, lon: -122.0 },
        velocity: { ...s.aircraft.velocity, u: 0, v: 0, w: 0 },
      },
    }));

    useSimStore.getState().start();
    useSimStore.getState().tick(1000);

    const state = useSimStore.getState();
    expect(state.activeLegIndex).toBe(1);
    expect(state.routeStatus.activeLegIndex).toBe(1);
    expect(state.routeStatus.fromIdent).toBe('MID');
    expect(state.routeStatus.nextWaypointIdent).toBe('DEST');
  });

  it('reset clears route state cleanly', () => {
    useSimStore.getState().setFlightPlan(createKseaKpdxFlight());

    useSimStore.getState().reset();

    const state = useSimStore.getState();
    expect(state.flightPlan).toBeNull();
    expect(state.activeLegIndex).toBeNull();
    expect(state.routeStatus.lnavAvailable).toBe(false);
    expect(state.routeStatus.lnavUnavailableReason).toMatch(/no flight plan/i);
  });
  it('reset clears everything', () => {
    useSimStore.getState().setInput({ throttle1: 1 });
    useSimStore.getState().setApState(minimalApState());
    useSimStore.setState((s) => {
      const apCommands: AutopilotCommands = { throttle1: 0.9, throttle2: 0.9 };
      const effectiveControls = { ...s.pilotInputs, ...apCommands };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });
    useSimStore.getState().start();
    useSimStore.getState().tick(1000);
    useSimStore.getState().reset();
    expect(useSimStore.getState().status).toBe('stopped');
    expect(useSimStore.getState().pilotInputs.throttle1).toBe(0);
    expect(useSimStore.getState().apCommands).toEqual({});
    expect(useSimStore.getState().inputs.throttle1).toBe(0);
  });
  it('starts from the ENVA tutorial scenario mass and runway setup', () => {
    const state = useSimStore.getState();

    expect(state.selectedScenarioId).toBe(ENVA_TUTORIAL_SCENARIO.id);
    expect(state.aircraft.payloadWeight).toBe(ENVA_TUTORIAL_SCENARIO.payloadWeightKg);
    expect(state.aircraft.zeroFuelWeight).toBe(ENVA_TUTORIAL_SCENARIO.zeroFuelWeightKg);
    expect(state.aircraft.cg).toBe(ENVA_TUTORIAL_SCENARIO.cgPercent);
    expect(state.aircraft.config.stabilizerTrimUnits).toBe(ENVA_TUTORIAL_SCENARIO.stabilizerTrimUnits);
    expect(state.aircraft.fuel.totalFuel).toBe(ENVA_TUTORIAL_SCENARIO.fuel.totalFuel);
    expect(state.aircraft.ground.groundAltFt).toBe(ENVA_TUTORIAL_SCENARIO.runway.elevationFt);
  });
  it('reset returns to the selected scenario instead of hardcoded defaults', () => {
    useSimStore.getState().setScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);
    useSimStore.getState().setInput({ throttle1: 1, flapLever: 30 });
    useSimStore.getState().start();
    useSimStore.getState().tick(1000);
    useSimStore.getState().reset();

    const state = useSimStore.getState();
    expect(state.selectedScenarioId).toBe(KSEA_LIGHT_PATTERN_SCENARIO.id);
    expect(state.aircraft.payloadWeight).toBe(KSEA_LIGHT_PATTERN_SCENARIO.payloadWeightKg);
    expect(state.aircraft.zeroFuelWeight).toBe(KSEA_LIGHT_PATTERN_SCENARIO.zeroFuelWeightKg);
    expect(state.aircraft.cg).toBe(KSEA_LIGHT_PATTERN_SCENARIO.cgPercent);
    expect(state.aircraft.config.stabilizerTrimUnits).toBe(KSEA_LIGHT_PATTERN_SCENARIO.stabilizerTrimUnits);
    expect(state.aircraft.config.flapSetting).toBe(KSEA_LIGHT_PATTERN_SCENARIO.flapSetting);
    expect(state.inputs.flapLever).toBe(KSEA_LIGHT_PATTERN_SCENARIO.flapSetting);
    expect(state.aircraft.ground.groundAltFt).toBe(KSEA_LIGHT_PATTERN_SCENARIO.runway.elevationFt);
    expect(state.wind).toEqual(KSEA_LIGHT_PATTERN_SCENARIO.wind);
    expect(state.inputs.throttle1).toBe(0);
    expect(state.guidance.scenarioId).toBe(KSEA_LIGHT_PATTERN_SCENARIO.id);
    expect(state.guidance.phase).toBe('preflight');
    expect(state.guidance.activeTutorialStep?.id).toBe('pattern-setup');
  });

  it('setScenario resets unified guidance and setTutorialStep clamps it in place', () => {
    useSimStore.getState().setScenario(KSEA_TUTORIAL_SCENARIO.id);
    useSimStore.getState().setTutorialStep(99);
    expect(useSimStore.getState().guidance.tutorial.stepIndex).toBe(KSEA_TUTORIAL_SCENARIO.tutorialSteps.length - 1);
    expect(useSimStore.getState().guidance.activeTutorialStep?.id).toBe('rotate-positive-rate');

    useSimStore.getState().setScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);
    expect(useSimStore.getState().guidance.scenarioId).toBe(KSEA_LIGHT_PATTERN_SCENARIO.id);
    expect(useSimStore.getState().guidance.tutorial.stepIndex).toBe(0);
    expect(useSimStore.getState().guidance.activeTutorialStep?.id).toBe('pattern-setup');

    useSimStore.getState().setTutorialStep(99);
    expect(useSimStore.getState().guidance.tutorial.stepIndex).toBe(KSEA_LIGHT_PATTERN_SCENARIO.tutorialSteps.length - 1);
    expect(useSimStore.getState().guidance.activeTutorialStep?.id).toBe('repeat-handfly');
  });

  it('keeps unified guidance checklist and coach synchronized after pilot input changes', () => {
    useSimStore.getState().setInput({ flapLever: 0 });

    const state = useSimStore.getState();
    expect(state.guidance.checklist.find((item) => item.id === 'flaps')?.complete).toBe(false);
    expect(state.guidance.coachMessage).toMatch(/Flaps set for takeoff/);
  });
  it('reset restores selected scenario wind from an immutable copy', () => {
    useSimStore.getState().setScenario(KSEA_LIGHT_PATTERN_SCENARIO.id);
    const wind = useSimStore.getState().wind;
    if (wind) wind.speed = 99;

    useSimStore.getState().reset();

    expect(KSEA_LIGHT_PATTERN_SCENARIO.wind.speed).toBe(6);
    expect(useSimStore.getState().wind).toEqual(KSEA_LIGHT_PATTERN_SCENARIO.wind);
  });
  it('apState starts null', () => expect(useSimStore.getState().apState).toBeNull());
  it('setApState stores autopilot state', () => { useSimStore.getState().setApState(minimalApState()); expect(useSimStore.getState().apState).toBeTruthy(); });

  it('target-only setApState preserves existing AP commands until the next tick recomputes them', () => {
    const initialAp = minimalApState();
    initialAp.boeing.autothrottleArm = true;
    initialAp.boeing.speedMode = true;
    useSimStore.getState().setApState(initialAp);
    const apCommands: AutopilotCommands = { elevator: 0.3, aileron: -0.2, throttle1: 0.65, throttle2: 0.65 };
    useSimStore.setState((s) => {
      const effectiveControls = { ...s.pilotInputs, ...apCommands };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });

    const targetOnlyUpdate = structuredClone(initialAp);
    targetOnlyUpdate.boeing.heading = 25;
    targetOnlyUpdate.boeing.altitude = 3500;
    useSimStore.getState().setApState(targetOnlyUpdate);

    const state = useSimStore.getState();
    expect(state.apCommands).toEqual(apCommands);
    expect(state.effectiveControls).toEqual(expect.objectContaining(apCommands));
    expect(state.inputs).toBe(state.effectiveControls);
    expect(state.apState?.boeing.heading).toBe(25);
  });

  it('reset clears apState', () => { useSimStore.getState().setApState(minimalApState()); useSimStore.getState().reset(); expect(useSimStore.getState().apState).toBeNull(); });

  it('AP tick writes commands/effective controls without mutating pilot input object', () => {
    useSimStore.getState().setInput({
      throttle1: 0.2,
      throttle2: 0.2,
      elevator: 0.15,
      aileron: -0.1,
      flapLever: 5,
      gearLever: 'UP',
    });
    const pilotBeforeRef = useSimStore.getState().pilotInputs;
    const pilotBefore = structuredClone(pilotBeforeRef);

    const ap = minimalApState();
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = true;
    useSimStore.getState().setApState(ap);
    useSimStore.getState().start();
    useSimStore.getState().tick(1000);

    const state = useSimStore.getState();
    expect(state.pilotInputs).toBe(pilotBeforeRef);
    expect(state.pilotInputs).toEqual(pilotBefore);
    expect(state.apCommands.throttle1).toBeGreaterThan(0);
    expect(state.effectiveControls.throttle1).toBe(state.apCommands.throttle1);
    expect(state.effectiveControls.flapLever).toBe(pilotBefore.flapLever);
    expect(state.effectiveControls.gearLever).toBe(pilotBefore.gearLever);
    expect(state.inputs).toBe(state.effectiveControls);
  });

  it('tick stores N1 autothrottle commands and effective throttle while running', () => {
    const ap = minimalApState();
    ap.truth.autopilotStatus = 'CMD_A';
    ap.truth.thrustActive = 'N1';
    ap.boeing.autothrottleArm = true;
    ap.boeing.n1 = true;
    ap.boeing.speedMode = false;

    useSimStore.setState((s) => ({
      aircraft: {
        ...s.aircraft,
        flightPhase: 'TAKEOFF',
        engines: [
          { ...s.aircraft.engines[0], n1: 0 },
          { ...s.aircraft.engines[1], n1: 0 },
        ],
      },
    }));
    useSimStore.getState().setApState(ap);
    expect(useSimStore.getState().apCommands).toEqual({});
    expect(useSimStore.getState().pilotInputs.throttle1).toBe(0);
    useSimStore.getState().start();
    useSimStore.getState().tick(1000);

    const state = useSimStore.getState();
    expect(state.apCommands.throttle1).toBeGreaterThan(0);
    expect(state.effectiveControls.throttle1).toBe(state.apCommands.throttle1);
    expect(state.inputs).toBe(state.effectiveControls);
    expect(state.pilotInputs.throttle1).toBe(0);
    expect(state.aircraft.engines[0].n1).toBeGreaterThan(0);
  });

  it('manual setInput throttle is ignored while AP owns thrust', () => {
    const ap = minimalApState();
    ap.truth.autopilotStatus = 'CMD_A';
    ap.truth.thrustActive = 'N1';
    ap.boeing.autothrottleArm = true;
    ap.boeing.n1 = true;
    ap.boeing.speedMode = true;

    useSimStore.getState().setApState(ap);
    useSimStore.setState((s) => ({
      apCommands: { throttle1: 0.25, throttle2: 0.25 },
      effectiveControls: { ...s.pilotInputs, throttle1: 0.25, throttle2: 0.25 },
      inputs: { ...s.pilotInputs, throttle1: 0.25, throttle2: 0.25 },
    }));

    useSimStore.getState().setInput({ throttle1: 0.7, throttle2: 0.7 });

    // When AP owns thrust (N1/SPEED mode), throttle input is silently ignored
    const state = useSimStore.getState();
    expect(state.apState?.truth.autopilotStatus).toBe('CMD_A'); // still engaged
    expect(state.apState?.truth.thrustActive).toBe('N1');
    expect(state.pilotInputs.throttle1).toBe(0);
    expect(state.effectiveControls.throttle1).not.toBe(0.7); // AP overrides
  });

  it('manual input action throttle is ignored while AP owns thrust', () => {
    const ap = minimalApState();
    ap.truth.autopilotStatus = 'CMD_A';
    ap.truth.thrustActive = 'N1';
    ap.boeing.autothrottleArm = true;
    ap.boeing.n1 = true;

    useSimStore.getState().setApState(ap);
    useSimStore.setState((s) => ({
      apCommands: { throttle1: 0.25, throttle2: 0.25 },
      effectiveControls: { ...s.pilotInputs, throttle1: 0.25, throttle2: 0.25 },
      inputs: { ...s.pilotInputs, throttle1: 0.25, throttle2: 0.25 },
    }));

    useSimStore.getState().applyInputActions({ throttleDelta: 0.5 }, 0);

    const state = useSimStore.getState();
    expect(state.apState?.truth.autopilotStatus).toBe('CMD_A');
    expect(state.apState?.truth.thrustActive).toBe('N1');
    expect(state.pilotInputs.throttle1).toBe(0);
    expect(state.inputManager.throttle).toBe(0);
    expect(state.effectiveControls.throttle1).toBe(0.25);
  });

  it('does not treat unbacked SPEED truth as AP-owned thrust for manual setInput', () => {
    const ap = minimalApState();
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = false;
    useSimStore.getState().setApState(ap);
    useSimStore.getState().setInput({ throttle1: 0.7, throttle2: 0.7 });
    expect(useSimStore.getState().pilotInputs.throttle1).toBe(0.7);
    expect(useSimStore.getState().pilotInputs.throttle2).toBe(0.7);
    expect(useSimStore.getState().effectiveControls.throttle1).toBe(0.7);
    expect(useSimStore.getState().apState?.truth.autopilotStatus).toBe('CMD_A');
  });

  it('releases stale AP throttle commands when SPEED backing disappears', () => {
    const backed = minimalApState();
    backed.truth.autopilotStatus = 'CMD_A';
    backed.truth.thrustActive = 'SPEED';
    backed.boeing.autothrottleArm = true;
    backed.boeing.speedMode = true;
    backed.boeing.cmdA = true;
    useSimStore.getState().setApState(backed);
    useSimStore.setState((s) => {
      const apCommands: AutopilotCommands = { throttle1: 0.8, throttle2: 0.8 };
      const effectiveControls = { ...s.pilotInputs, ...apCommands };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });

    const unbacked = structuredClone(backed);
    unbacked.boeing.speedMode = false;
    useSimStore.getState().setApState(unbacked);
    expect(useSimStore.getState().apCommands.throttle1).toBeUndefined();
    expect(useSimStore.getState().apCommands.throttle2).toBeUndefined();
    expect(useSimStore.getState().effectiveControls.throttle1)
      .toBe(useSimStore.getState().pilotInputs.throttle1);
    useSimStore.getState().setInput({ throttle1: 0.3, throttle2: 0.3 });

    const state = useSimStore.getState();
    expect(state.pilotInputs.throttle1).toBe(0.3);
    expect(state.pilotInputs.throttle2).toBe(0.3);
    expect(state.effectiveControls.throttle1).toBe(0.3);
    expect(state.effectiveControls.throttle2).toBe(0.3);
    expect(state.apState?.truth.autopilotStatus).toBe('CMD_A');
  });

  it('does not strip throttle input actions when SPEED truth is unbacked', () => {
    const ap = minimalApState();
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = false;
    useSimStore.getState().setApState(ap);
    useSimStore.getState().applyInputActions({ throttleDelta: 0.1 }, 1 / 60);
    expect(useSimStore.getState().pilotInputs.throttle1).toBeGreaterThan(0);
    expect(useSimStore.getState().pilotInputs.throttle2).toBeGreaterThan(0);
  });

  it('manual input override disconnects AP and makes pilot controls effective deterministically', () => {
    useSimStore.getState().setApState(minimalApState());
    useSimStore.setState((s) => {
      const apCommands: AutopilotCommands = { elevator: -0.7, aileron: 0.4, throttle1: 0.9, throttle2: 0.9 };
      const effectiveControls = { ...s.pilotInputs, ...apCommands };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });

    useSimStore.getState().setInput({ elevator: 0.25 });

    const state = useSimStore.getState();
    expect(state.apState?.truth.autopilotStatus).toBe('OFF');
    expect(state.apCommands).toEqual({});
    expect(state.pilotInputs.elevator).toBe(0.25);
    expect(state.effectiveControls.elevator).toBe(0.25);
    expect(state.inputs).toBe(state.effectiveControls);
  });

  it('pilot-owned gear/flaps/spoilers remain effective while AP commands flight axes', () => {
    const ap = minimalApState();
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = true;
    useSimStore.getState().setApState(ap);
    const apCommands: AutopilotCommands = { elevator: -0.5, aileron: 0.25, throttle1: 0.7, throttle2: 0.7 };
    useSimStore.setState((s) => {
      const effectiveControls = { ...s.pilotInputs, ...apCommands };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });
    establishPositiveRateInStore();

    useSimStore.getState().setInput({ flapLever: 15, gearLever: 'UP', spoilers: 0.3 });

    const state = useSimStore.getState();
    expect(state.apState?.truth.autopilotStatus).toBe('CMD_A');
    expect(state.effectiveControls.elevator).toBe(apCommands.elevator);
    expect(state.effectiveControls.throttle1).toBe(apCommands.throttle1);
    expect(state.effectiveControls.flapLever).toBe(15);
    expect(state.effectiveControls.gearLever).toBe('UP');
    expect(state.effectiveControls.spoilers).toBe(0.3);
  });

  it('gamepad-style input actions latch brake and next-flaps while gating gear-toggle commands', () => {
    useSimStore.getState().setInput({ flapLever: 0, gearLever: 'DOWN', brake: 0 });

    useSimStore.getState().applyInputActions({ brake: 1, flapNext: true, gearToggle: true }, 1 / 60);

    let state = useSimStore.getState();
    expect(state.pilotInputs.brake).toBe(1);
    expect(state.pilotInputs.flapLever).toBe(1);
    expect(state.pilotInputs.gearLever).toBe('DOWN');
    expect(state.effectiveControls).toEqual(expect.objectContaining({ brake: 1, flapLever: 1, gearLever: 'DOWN' }));

    establishPositiveRateInStore();

    useSimStore.getState().applyInputActions({ flapNext: true, gearToggle: true }, 1 / 60);

    state = useSimStore.getState();
    expect(state.pilotInputs.flapLever).toBe(2);
    expect(state.pilotInputs.gearLever).toBe('UP');

    useSimStore.getState().applyInputActions({ gearToggle: true }, 1 / 60);

    expect(useSimStore.getState().pilotInputs.gearLever).toBe('DOWN');
  });

  it('rejects direct gear-up input before positive rate but still allows gear down', () => {
    useSimStore.getState().setInput({ gearLever: 'UP' });

    let state = useSimStore.getState();
    expect(state.pilotInputs.gearLever).toBe('DOWN');
    expect(state.effectiveControls.gearLever).toBe('DOWN');

    establishPositiveRateInStore();
    useSimStore.getState().setInput({ gearLever: 'UP' });

    state = useSimStore.getState();
    expect(state.pilotInputs.gearLever).toBe('UP');
    expect(state.effectiveControls.gearLever).toBe('UP');

    useSimStore.setState((s) => {
      const aircraft = structuredClone(s.aircraft);
      aircraft.velocity.w = 2;
      return { aircraft };
    });
    useSimStore.getState().setInput({ gearLever: 'DOWN' });

    state = useSimStore.getState();
    expect(state.pilotInputs.gearLever).toBe('DOWN');
    expect(state.effectiveControls.gearLever).toBe('DOWN');
  });

  it('gates keyboard and cockpit gear-up patches at the store boundary before positive rate', () => {
    const keyboardPatch = applyDiscreteKeyInput('g', useSimStore.getState().inputs);
    expect(keyboardPatch).toEqual({ gearLever: 'UP' });

    useSimStore.getState().setInput(keyboardPatch ?? {});
    expect(useSimStore.getState().pilotInputs.gearLever).toBe('DOWN');

    const cockpitPatch = cockpitInputForInteraction('gear-lever', useSimStore.getState().inputs);
    expect(cockpitPatch).toEqual({ gearLever: 'UP' });

    useSimStore.getState().setInput(cockpitPatch ?? {});
    expect(useSimStore.getState().pilotInputs.gearLever).toBe('DOWN');
  });

  it('legacy full-object setInput does not copy AP-owned effective axes into pilot inputs', () => {
    const ap = minimalApState();
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = true;
    useSimStore.getState().setApState(ap);
    const apCommands: AutopilotCommands = { elevator: -0.5, aileron: 0.25, throttle1: 0.7, throttle2: 0.7 };
    useSimStore.setState((s) => {
      const effectiveControls = { ...s.pilotInputs, ...apCommands };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });
    const pilotBefore = structuredClone(useSimStore.getState().pilotInputs);

    useSimStore.getState().setInput({ ...useSimStore.getState().inputs, flapLever: 15 });

    const state = useSimStore.getState();
    expect(state.apState?.truth.autopilotStatus).toBe('CMD_A');
    expect(state.pilotInputs.elevator).toBe(pilotBefore.elevator);
    expect(state.pilotInputs.aileron).toBe(pilotBefore.aileron);
    expect(state.pilotInputs.throttle1).toBe(pilotBefore.throttle1);
    expect(state.pilotInputs.throttle2).toBe(pilotBefore.throttle2);
    expect(state.pilotInputs.flapLever).toBe(15);
    expect(state.effectiveControls.elevator).toBe(apCommands.elevator);
    expect(state.effectiveControls.throttle1).toBe(apCommands.throttle1);
    expect(state.effectiveControls.flapLever).toBe(15);
  });

  it('takeoff roll stays at or above runway elevation through store ticks', () => {
    const store = useSimStore.getState();
    store.setInput({
      throttle1: 1,
      throttle2: 1,
      flapLever: 5,
      gearLever: 'DOWN',
      brake: 0,
      elevator: 0,
    });
    store.start();

    for (let frame = 0; frame < 5 * 60; frame++) {
      useSimStore.getState().tick(frame * (1000 / 60));
    }

    const state = useSimStore.getState().aircraft;
    expect(state.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
    expect(state.velocity.u).toBeGreaterThan(5);
    expect(state.config.gearDown).toBe(true);
  });

  it('reset then repeated takeoff roll accelerates at 120 Hz', () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      useSimStore.getState().reset();
      startTakeoffRollFromStore();

      tickAtHz(120, 20);

      const state = useSimStore.getState().aircraft;
      expect(state.position.alt).toBeGreaterThanOrEqual(KSEA_RUNWAY_ALT_FT - 0.01);
      expect(state.velocity.u).toBeGreaterThan(25);
      expect(state.config.gearDown).toBe(true);
    }
  });

  it('wind does not directly overwrite ground velocity during a tick', () => {
    useSimStore.getState().setWind({ dir: 180, speed: 20 });
    useSimStore.getState().start();

    useSimStore.getState().tick(1000);

    expect(Math.abs(useSimStore.getState().aircraft.velocity.u)).toBeLessThan(1);
  });
});
