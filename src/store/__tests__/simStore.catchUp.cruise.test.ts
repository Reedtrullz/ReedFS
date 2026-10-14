import { describe, expect, it } from 'vitest';
import { useSimStore } from '../simStore';
import { B737_800_SPEC, createInitialState } from '../../sim/types';
import { eulerToQuat } from '../../sim/physics/quaternion';
import { computeDerived } from '../../sim/physics/derived';
import { createDefaultAutopilotStateFromAircraft } from '../../instruments/defaultAutopilotState';
import { applyMcpMode } from '../../instruments/mcpCommands';

const FRAME_MS = 1000 / 60;
const START_MS = 1000;
const GAP_SECONDS = 600;

function seedAutopilotCruise() {
  const aircraft = createInitialState(B737_800_SPEC);
  aircraft.flightPhase = 'CRUISE';
  aircraft.position = { lat: 60, lon: 10, alt: 20_000 };
  aircraft.attitude = { phi: 0, theta: 0.03, psi: 0 };
  aircraft.quaternion = eulerToQuat(0, 0.03, 0);
  aircraft.velocity = { u: 205, v: 0, w: 0 };
  aircraft.config = { ...aircraft.config, gearDown: false, gearPosition: 0, flapSetting: 0 };
  aircraft.ground = {
    ...aircraft.ground,
    weightOnWheels: false,
    contact: 'none',
    onRunway: false,
    aglFt: 19_000,
    groundAltFt: 1_000,
  };
  aircraft.engines = aircraft.engines.map((engine) => ({ ...engine, running: true, n1: 85, n2: 90 })) as typeof aircraft.engines;

  const apState = createDefaultAutopilotStateFromAircraft(aircraft, null);
  apState.boeing.altitude = 20_000;
  apState.boeing.speed = 270;
  apState.boeing.heading = 45;
  applyMcpMode(apState, 'HDG_SEL');
  applyMcpMode(apState, 'ALT_HOLD');
  applyMcpMode(apState, 'SPEED');

  useSimStore.getState().setScenario('ksea-tutorial');
  useSimStore.setState({
    status: 'running',
    aircraft,
    flightPlan: null,
    activeLegIndex: null,
    wind: null,
    simRate: 1,
    lastFrameTime: START_MS,
    fixedStepAccumulatorSeconds: 0,
    simulationTimeSeconds: 0,
    droppedSimulationTimeSeconds: 0,
    pilotInputs: { elevator: 0, aileron: 0, rudder: 0, throttle1: 0.7, throttle2: 0.7, flapLever: 0, gearLever: 'UP', spoilers: 0, brake: 0 },
  });
  useSimStore.getState().setApState(apState);
}

function readFlight() {
  const state = useSimStore.getState();
  return {
    simTime: state.simulationTimeSeconds,
    dropped: state.droppedSimulationTimeSeconds,
    lat: state.aircraft.position.lat,
    lon: state.aircraft.position.lon,
    altFt: state.aircraft.position.alt,
    headingDeg: (state.aircraft.attitude.psi * 180) / Math.PI,
    fuelKg: state.aircraft.fuel.totalFuel,
    iasKt: computeDerived(state.aircraft, state.wind).ias,
    apStatus: state.apState?.truth.autopilotStatus,
  };
}

describe('catchUpBackgroundTime with the real autopilot cruise', () => {
  it('matches continuous 60 Hz ticking over a 10 minute hidden gap', async () => {
    seedAutopilotCruise();
    for (let frame = 1; frame <= GAP_SECONDS * 60; frame++) {
      useSimStore.getState().tick(START_MS + frame * FRAME_MS);
    }
    const continuous = readFlight();

    seedAutopilotCruise();
    await useSimStore.getState().catchUpBackgroundTime(START_MS + GAP_SECONDS * 1000);
    const caughtUp = readFlight();

    expect(continuous.lat).toBeGreaterThan(60.5);
    expect(continuous.fuelKg).toBeLessThan(20_894 - 300);
    expect(Math.abs(continuous.altFt - 20_000)).toBeLessThan(150);
    expect(continuous.apStatus).toBe('CMD_A');

    expect(caughtUp.simTime).toBeCloseTo(continuous.simTime, 1);
    expect(caughtUp.dropped).toBe(0);
    expect(caughtUp.apStatus).toBe(continuous.apStatus);
    expect(Math.abs(caughtUp.lat - continuous.lat)).toBeLessThan(2e-4);
    expect(Math.abs(caughtUp.lon - continuous.lon)).toBeLessThan(2e-4);
    expect(Math.abs(caughtUp.altFt - continuous.altFt)).toBeLessThan(2);
    expect(Math.abs(caughtUp.fuelKg - continuous.fuelKg)).toBeLessThan(0.5);
    expect(Math.abs(caughtUp.headingDeg - continuous.headingDeg)).toBeLessThan(0.1);
    expect(Math.abs(caughtUp.iasKt - continuous.iasKt)).toBeLessThan(1);
  }, 60_000);
});
