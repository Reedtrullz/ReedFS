import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { PreflightSheet } from '../PreflightSheet';
import { useSimStore } from '../../store/simStore';
import { createRunwayToRunwayFlightWithRunways } from '../../sim/flightPlanLoader';
import { ENVA_TUTORIAL_SCENARIO, KSEA_LIGHT_PATTERN_SCENARIO } from '../../sim/scenarios';

describe('PreflightSheet', () => {
  beforeEach(() => {
    useSimStore.getState().setScenario(ENVA_TUTORIAL_SCENARIO.id);
    useSimStore.getState().reset();
    useSimStore.getState().setRunwayOverrides(null);
  });
  afterEach(cleanup);

  it('reads the active loading, runway and gameplay fixture with explicit data quality', () => {
    render(<PreflightSheet />);
    const sheet = screen.getByRole('region', { name: 'Preflight sheet' });
    expect(sheet).toHaveTextContent('61913 / 49913 kg');
    expect(sheet).toHaveTextContent('12000 kg');
    expect(sheet).toHaveTextContent('ENVA 09 / 90 deg true');
    expect(sheet).toHaveTextContent('2999 m / 56 ft');
    expect(sheet).toHaveTextContent('141 / 149 / 155 kt');
    expect(sheet).toHaveTextContent('not a certified Boeing AFM table');
    expect(sheet).toHaveTextContent('Fuel required, landing performance and takeoff distance: unavailable');
  });

  it('invalidates rather than retaining speeds when loading, flap command, trim or weather changes', () => {
    render(<PreflightSheet />);
    act(() => useSimStore.getState().setInput({ flapLever: 10 }));
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('10 commanded, 5.0 actual');
    expect(screen.getByLabelText('Preflight sheet')).not.toHaveTextContent('141 / 149 / 155 kt');
    act(() => useSimStore.getState().setInput({ flapLever: 5 }));
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('141 / 149 / 155 kt');
    act(() => useSimStore.getState().applyInputActions({ trimDelta: 0.1 }, 0));
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('5.1 units');
    expect(screen.getByLabelText('Preflight sheet')).not.toHaveTextContent('141 / 149 / 155 kt');
    act(() => useSimStore.getState().setTakeoffConfig());
    act(() => useSimStore.getState().setWeather({ ...ENVA_TUTORIAL_SCENARIO.weather, surfaceTemperatureC: 30 }));
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('30 C');
    expect(screen.getByLabelText('Preflight sheet')).not.toHaveTextContent('141 / 149 / 155 kt');
    act(() => useSimStore.getState().setWeather({ ...ENVA_TUTORIAL_SCENARIO.weather, qnhHpa: 1000 }));
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('1000 hPa');
    expect(screen.getByLabelText('Preflight sheet')).not.toHaveTextContent('141 / 149 / 155 kt');
    act(() => useSimStore.getState().setScenario(KSEA_LIGHT_PATTERN_SCENARIO.id));
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('50413');
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('KSEA 16L');
    expect(screen.getByLabelText('Preflight sheet')).not.toHaveTextContent('141 / 149 / 155 kt');
  });

  it('recomputes true-runway wind components and clears them when wind is unavailable', () => {
    render(<PreflightSheet />);
    act(() => useSimStore.getState().setWind({ dir: 90, speed: 20 }));
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('Head 20.0 kt / cross 0.0 kt');
    expect(screen.getByLabelText('Preflight sheet')).not.toHaveTextContent('141 / 149 / 155 kt');
    act(() => useSimStore.getState().setWind({ dir: 270, speed: 20 }));
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('Tail 20.0 kt / cross 0.0 kt');
    act(() => useSimStore.getState().setWind({ dir: 180, speed: 12 }));
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('cross 12.0 kt');
    act(() => useSimStore.getState().setWind(null));
    expect(screen.getByLabelText('Preflight checks')).toHaveTextContent('Weather unavailable');
    expect(screen.getByLabelText('Preflight sheet')).not.toHaveTextContent('cross 12.0 kt');
  });

  it('uses the loaded reciprocal runway and applies overrides before reversing the heading', () => {
    const { flightPlan, runways } = createRunwayToRunwayFlightWithRunways({
      originAirport: 'ENVA', originRunway: '27', destinationAirport: 'ENGM', destinationRunway: '01L',
    });
    useSimStore.getState().setFlightPlanAtRunway(flightPlan, runways.originRunway);
    render(<PreflightSheet />);
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('ENVA 27 / 270 deg true');
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('ENGM 01L');
    expect(screen.getByLabelText('Preflight sheet')).not.toHaveTextContent('141 / 149 / 155 kt');
    act(() => useSimStore.getState().setRunwayOverrides({ 'ENVA-09': { headingDeg: 100, elevationFt: 100 } }));
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('ENVA 27 / 280 deg true');
    expect(screen.getByLabelText('Preflight sheet')).toHaveTextContent('2999 m / 100 ft');
    expect(screen.getByLabelText('Preflight checks')).toHaveTextContent('Edited runway geometry');
  });

  it('does not invent a runway for unmatched route endpoints or accept inconsistent loading', () => {
    const { flightPlan } = createRunwayToRunwayFlightWithRunways({
      originAirport: 'ENVA', originRunway: '09', destinationAirport: 'ENGM', destinationRunway: '19R',
    });
    flightPlan.waypoints[0].lat = 0;
    useSimStore.getState().setFlightPlan(flightPlan);
    render(<PreflightSheet />);
    expect(screen.getByLabelText('Preflight checks')).toHaveTextContent('Departure runway not identified');
    act(() => useSimStore.setState((s) => ({ aircraft: { ...s.aircraft, grossWeight: 90000, cg: 40 } })));
    expect(screen.getByLabelText('Preflight checks')).toHaveTextContent('Loading outside the simulator envelope');
    expect(screen.getByLabelText('Preflight sheet')).not.toHaveTextContent('141 / 149 / 155 kt');
  });

  it('flags weather from a different departure station and absent weather', () => {
    const { flightPlan, runways } = createRunwayToRunwayFlightWithRunways({
      originAirport: 'ENBR', originRunway: '17', destinationAirport: 'ENSB', destinationRunway: '09',
    });
    useSimStore.getState().setFlightPlanAtRunway(flightPlan, runways.originRunway);
    render(<PreflightSheet />);
    expect(screen.getByLabelText('Preflight checks')).toHaveTextContent('Weather station differs from departure');
    act(() => useSimStore.getState().setWeather(null));
    expect(screen.getByLabelText('Preflight checks')).toHaveTextContent('Weather unavailable');
  });
});
