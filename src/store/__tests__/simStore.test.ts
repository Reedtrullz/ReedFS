import { describe, it, expect, beforeEach } from 'vitest';
import { useSimStore } from '../simStore';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { AutopilotCommands } from '../../sim/types';
import { KSEA_RUNWAY_ALT_FT } from '../../sim/systems/ground';
import { KSEA_LIGHT_PATTERN_SCENARIO, KSEA_TUTORIAL_SCENARIO } from '../../sim/scenarios';
import { createKseaKpdxFlight } from '../../sim/flightPlanLoader';
import {
  SCENARIO_SAVE_KEY,
  createScenarioSnapshot,
  type ScenarioPersistenceStorage,
} from '../scenarioPersistence';

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
      hdgSel: false,
      vorLoc: false,
      app: false,
      altHold: false,
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

  it('starts stopped', () => expect(useSimStore.getState().status).toBe('stopped'));

  it('starts with unified scenario guidance derived from the initial aircraft and controls', () => {
    const state = useSimStore.getState();

    expect(state.guidance.scenarioId).toBe(KSEA_TUTORIAL_SCENARIO.id);
    expect(state.guidance.phase).toBe('preflight');
    expect(state.guidance.tutorial.stepIndex).toBe(0);
    expect(state.guidance.activeTutorialStep?.id).toBe('line-up');
    expect(state.guidance.checklist.every((item) => item.complete)).toBe(true);
    expect(state.guidance.coachMessage).toMatch(/start roll/i);
  });

  it('separates pilot inputs, AP commands, effective controls, and legacy inputs alias', () => {
    const state = useSimStore.getState();

    expect(state.apCommands).toEqual({});
    expect(state.pilotInputs).toEqual(expect.objectContaining({
      flapLever: KSEA_TUTORIAL_SCENARIO.flapSetting,
      gearLever: 'DOWN',
    }));
    expect(state.effectiveControls).toEqual(state.pilotInputs);
    expect(state.inputs).toBe(state.effectiveControls);
  });
  it('start → running', () => { useSimStore.getState().start(); expect(useSimStore.getState().status).toBe('running'); });
  it('startTakeoffRoll sets inputs, running status, and TAKEOFF phase', () => {
    useSimStore.getState().startTakeoffRoll();

    const state = useSimStore.getState();
    expect(state.status).toBe('running');
    expect(state.inputs).toEqual(expect.objectContaining({
      throttle1: 1,
      throttle2: 1,
      flapLever: 5,
      gearLever: 'DOWN',
      brake: 0,
      elevator: 0,
    }));
    expect(state.pilotInputs).toEqual(expect.objectContaining({ throttle1: 1, throttle2: 1, elevator: 0 }));
    expect(state.inputs).toBe(state.effectiveControls);
    expect(state.aircraft.flightPhase).toBe('TAKEOFF');
    expect(state.guidance.phase).toBe('takeoff-roll');
    expect(state.guidance.coachMessage).toMatch(/centerline|rotate|IAS/i);
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
    useSimStore.getState().setApState(minimalApState());
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
  it('throttle input-manager actions start from the live throttle lever after split-throttle input', () => {
    useSimStore.getState().setInput({ throttle1: 0.8 });

    useSimStore.getState().applyInputActions({ throttleDelta: 0.05 }, 0);

    expect(useSimStore.getState().inputs.throttle1).toBeCloseTo(0.85, 8);
    expect(useSimStore.getState().inputs.throttle2).toBeCloseTo(0.85, 8);
  });
  it('side-specific brake actions update pilot/effective controls without disconnecting AP axes', () => {
    useSimStore.getState().setApState(minimalApState());
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

  it('setFlightPlan initializes the first valid active leg and route feedback', () => {
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
  it('starts from the KSEA tutorial scenario mass and runway setup', () => {
    const state = useSimStore.getState();

    expect(state.selectedScenarioId).toBe(KSEA_TUTORIAL_SCENARIO.id);
    expect(state.aircraft.payloadWeight).toBe(KSEA_TUTORIAL_SCENARIO.payloadWeightKg);
    expect(state.aircraft.zeroFuelWeight).toBe(KSEA_TUTORIAL_SCENARIO.zeroFuelWeightKg);
    expect(state.aircraft.cg).toBe(KSEA_TUTORIAL_SCENARIO.cgPercent);
    expect(state.aircraft.config.stabilizerTrimUnits).toBe(KSEA_TUTORIAL_SCENARIO.stabilizerTrimUnits);
    expect(state.aircraft.fuel.totalFuel).toBe(KSEA_TUTORIAL_SCENARIO.fuel.totalFuel);
    expect(state.aircraft.ground.groundAltFt).toBe(KSEA_TUTORIAL_SCENARIO.runway.elevationFt);
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

    useSimStore.getState().setApState(minimalApState());
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

  it('manual throttle override disconnects AP and clears stale N1 Boeing flag', () => {
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

    const state = useSimStore.getState();
    expect(state.apState?.truth.thrustActive).toBe('OFF');
    expect(state.apState?.truth.lateralActive).toBe('OFF');
    expect(state.apState?.truth.verticalActive).toBe('OFF');
    expect(state.apState?.truth.autopilotStatus).toBe('OFF');
    expect(state.apState?.boeing.n1).toBe(false);
    expect(state.apState?.boeing.speedMode).toBe(false);
    expect(state.apCommands).toEqual({});
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
    useSimStore.getState().setApState(minimalApState());
    const apCommands: AutopilotCommands = { elevator: -0.5, aileron: 0.25, throttle1: 0.7, throttle2: 0.7 };
    useSimStore.setState((s) => {
      const effectiveControls = { ...s.pilotInputs, ...apCommands };
      return { apCommands, effectiveControls, inputs: effectiveControls };
    });

    useSimStore.getState().setInput({ flapLever: 15, gearLever: 'UP', spoilers: 0.3 });

    const state = useSimStore.getState();
    expect(state.apState?.truth.autopilotStatus).toBe('CMD_A');
    expect(state.effectiveControls.elevator).toBe(apCommands.elevator);
    expect(state.effectiveControls.throttle1).toBe(apCommands.throttle1);
    expect(state.effectiveControls.flapLever).toBe(15);
    expect(state.effectiveControls.gearLever).toBe('UP');
    expect(state.effectiveControls.spoilers).toBe(0.3);
  });

  it('legacy full-object setInput does not copy AP-owned effective axes into pilot inputs', () => {
    useSimStore.getState().setApState(minimalApState());
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
