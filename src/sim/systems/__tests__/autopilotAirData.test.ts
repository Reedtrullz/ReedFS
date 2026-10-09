import { expect, it } from 'vitest';
import { createDefaultAutopilotState } from '../../../instruments/defaultAutopilotState';
import { B737_800_SPEC, createInitialState } from '../../types';
import { computeDerived } from '../../physics/derived';
import { computeAutopilotCommandsForStateWithControllerState, createAutopilotControllerState } from '../autopilot';

it('SPEED uses ideal CAS and scenario weather rather than EAS or ISA-only Mach', () => {
  const state = createInitialState(B737_800_SPEC);
  state.position.alt = 35000; state.velocity.u = 250; state.ground.weightOnWheels = false; state.flightPhase = 'CRUISE';
  const ap = createDefaultAutopilotState(); ap.boeing.speedMode = true; ap.truth.thrustActive = 'SPEED';
  const weather = { qnhHpa: 1013.25, surfaceTemperatureC: 35 };
  const air = computeDerived(state, null, weather); ap.boeing.speed = air.ias;
  const result = computeAutopilotCommandsForStateWithControllerState(state, ap, null, 1, null, null, null, createAutopilotControllerState(), weather);
  expect(result.controllerState.thrustPid.prevError).toBeCloseTo(0, 9);
  expect(result.controllerState.thrustPid.value).toBeCloseTo(0, 9);
  expect(air.ias).toBeGreaterThan(air.eas + 10);
});

it('unsupported air data retains pilot thrust and freezes the SPEED integrator', () => {
  const state = createInitialState(B737_800_SPEC); state.velocity.u = 400;
  const ap = createDefaultAutopilotState(); ap.boeing.speedMode = true; ap.truth.thrustActive = 'SPEED'; ap.boeing.speed = 250;
  const controller = createAutopilotControllerState(); controller.thrustPid = { value: .25, prevError: -3 }; controller.throttleLimited = .45;
  const result = computeAutopilotCommandsForStateWithControllerState(state, ap, null, 1, null, null, null, controller);
  expect(result.commands.throttle1).toBeUndefined(); expect(result.commands.throttle2).toBeUndefined();
  expect(result.controllerState.thrustPid).toEqual(controller.thrustPid);
  expect(result.controllerState.throttleLimited).toBe(.45);
  expect(controller.thrustPid).toEqual({ value: .25, prevError: -3 });
});
