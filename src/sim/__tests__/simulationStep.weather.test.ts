import { describe, expect, it } from 'vitest';
import { B737_800_SPEC, createInitialState } from '../types';
import { createNoRouteStatus } from '../systems/navigation';
import { advanceSimulationStep } from '../simulationStep';
import { KPDX_10R_SHORT_FINAL_SCENARIO, createAircraftStateForScenario } from '../scenarios';
import { buildGuidanceState } from '../guidanceState';

function baseInput(overrides: Record<string, unknown> = {}) {
  const aircraft = createInitialState(B737_800_SPEC);
  const pilotInputs = {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 0.2,
    throttle2: 0.2,
    flapLever: KPDX_10R_SHORT_FINAL_SCENARIO.flapSetting,
    gearLever: 'DOWN' as const,
    spoilers: 0,
    brake: 0,
  };
  return {
    aircraft,
    spec: B737_800_SPEC,
    pilotInputs,
    apState: null,
    flightPlan: null,
    activeLegIndex: null,
    routeStatus: createNoRouteStatus(),
    wind: null,
    dt: 1 / 60,
    status: 'running' as const,
    selectedScenarioId: KPDX_10R_SHORT_FINAL_SCENARIO.id,
    guidance: buildGuidanceState({
      scenario: KPDX_10R_SHORT_FINAL_SCENARIO,
      status: 'running',
      aircraft,
      controls: pilotInputs,
    }),
    cloneAircraft: true,
    ...overrides,
  };
}

describe('advanceSimulationStep weather plumbing', () => {
  it('applies live METAR weather over the scenario default when provided', () => {
    const live = {
      ...KPDX_10R_SHORT_FINAL_SCENARIO.weather,
      qnhHpa: 850,
      surfaceTemperatureC: 45,
    };
    const finalAltitude = (overrides: Record<string, unknown>) => {
      let aircraft = createAircraftStateForScenario(B737_800_SPEC, KPDX_10R_SHORT_FINAL_SCENARIO);
      let guidance = baseInput().guidance;
      let routeStatus = baseInput().routeStatus;
      for (let step = 0; step < 300; step += 1) {
        const result = advanceSimulationStep(baseInput({ ...overrides, aircraft, guidance, routeStatus }) as never);
        aircraft = result.aircraft;
        guidance = result.guidance;
        routeStatus = result.routeStatus;
      }
      return aircraft.position.alt;
    };
    const scenarioOnly = finalAltitude({});
    const withLive = finalAltitude({ weather: live });
    expect(Math.abs(withLive - scenarioOnly)).toBeGreaterThan(0.5);
  });
});
