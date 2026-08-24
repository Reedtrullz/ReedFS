import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RouteBuilderPanel } from '../RouteBuilderPanel';
import { useSimStore } from '../../store/simStore';

describe('RouteBuilderPanel', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('loads a generated route through the store at the selected origin runway', () => {
    const loadSpy = vi.spyOn(useSimStore.getState(), 'setFlightPlanAtRunway');
    const onRouteLoad = vi.fn();

    render(<RouteBuilderPanel onRouteLoad={onRouteLoad} />);

    fireEvent.change(screen.getByLabelText('Custom origin runway'), { target: { value: 'ENBR:17' } });
    fireEvent.change(screen.getByLabelText('Custom destination runway'), { target: { value: 'ENSB:09' } });
    fireEvent.click(screen.getByRole('button', { name: /load route/i }));

    expect(loadSpy).toHaveBeenCalledTimes(1);
    const [flightPlan, originRunway] = loadSpy.mock.calls[0];
    expect(originRunway).toMatchObject({ airport: 'ENBR', id: '17' });
    expect(flightPlan).toMatchObject({
      origin: 'ENBR',
      destination: 'ENSB',
      flightNumber: 'RFSANY',
    });
    expect(flightPlan.waypoints[0].ident).toBe('ENBR17_DEP');
    expect(flightPlan.waypoints.at(-1)?.ident).toBe('ENSB09_RWY');
    expect(screen.getByRole('status', { name: 'Generated route result' }).textContent).toBe('ENBR 17 → ENSB 09');
    expect(onRouteLoad).toHaveBeenCalledWith(expect.stringMatching(/RUNWAY ROUTE ENBR 17 → ENSB 09 loaded/i));

    loadSpy.mockRestore();
  });

  it('disables loading the exact same runway endpoint as both origin and destination', () => {
    render(<RouteBuilderPanel />);

    fireEvent.change(screen.getByLabelText('Custom origin runway'), { target: { value: 'ENBR:17' } });
    fireEvent.change(screen.getByLabelText('Custom destination runway'), { target: { value: 'ENBR:17' } });

    expect((screen.getByRole('button', { name: /load route/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
