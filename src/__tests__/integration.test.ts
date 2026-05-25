import { describe, it, expect, beforeEach } from 'vitest';
import { useSimStore } from '../store/simStore';
import { B737_800_SPEC } from '../sim/types';

describe('simulation integration', () => {
  beforeEach(() => useSimStore.getState().reset());

  it('airborne climb: spool → rotate → climb', () => {
    useSimStore.setState((s) => ({
      aircraft: {
        ...s.aircraft,
        position: { ...s.aircraft.position, alt: 5000 },
        velocity: { u: 128.6, v: 0, w: 0 },
        config: { ...s.aircraft.config, gearDown: false, flapSetting: 5 },
      },
    }));
    useSimStore.getState().setInput({
      throttle1: 1, throttle2: 1,
      elevator: -0.5, gearLever: 'UP', flapLever: 5,
    });
    useSimStore.getState().start();

    const initialAlt = useSimStore.getState().aircraft.position.alt;
    const dt = 1 / 60;
    for (let i = 0; i < 180; i++) {
      useSimStore.getState().tick(1000 + i * dt * 1000);
    }

    const a = useSimStore.getState().aircraft;
    expect(a.engines[0].n1).toBeGreaterThan(80);
    expect(a.position.alt).toBeGreaterThan(initialAlt);
    expect(a.velocity.u).toBeGreaterThan(50);   // forward speed retained
    expect(a.attitude.theta).toBeGreaterThan(0.02); // nose up
    expect(a.config.gearDown).toBe(false);
    expect(a.fuel.totalFuel).toBeLessThan(B737_800_SPEC.maxFuel);
  });

  it('fuel decreases over time', () => {
    useSimStore.getState().setInput({ throttle1: 0.5, throttle2: 0.5, gearLever: 'UP' });
    useSimStore.getState().start();
    const fuelBefore = useSimStore.getState().aircraft.fuel.totalFuel;
    for (let i = 0; i < 300; i++) useSimStore.getState().tick(1000 + i * (1/60) * 1000);
    expect(useSimStore.getState().aircraft.fuel.totalFuel).toBeLessThan(fuelBefore);
  });
});
