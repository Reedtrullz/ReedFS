import { describe, it, expect, beforeEach } from 'vitest';
import { useSimStore } from '../store/simStore';
import { B737_800_SPEC } from '../sim/types';

describe('simulation integration', () => {
  beforeEach(() => useSimStore.getState().reset());

  it('takeoff: spool → rotate → climb', () => {
    useSimStore.getState().setInput({
      throttle1: 1, throttle2: 1,
      elevator: 0, gearLever: 'DOWN', flapLever: 5,
    });
    useSimStore.getState().start();

    const dt = 1 / 60;
    for (let i = 0; i < 600; i++) {
      if (i === 180) useSimStore.getState().setInput({ elevator: -0.4 }); // rotate at 3s
      if (i === 300) useSimStore.getState().setInput({ gearLever: 'UP' });  // gear up at 5s
      useSimStore.getState().tick(1000 + i * dt * 1000);
    }

    const a = useSimStore.getState().aircraft;
    expect(a.engines[0].n1).toBeGreaterThan(80);
    expect(a.position.alt).toBeGreaterThan(500);
    expect(a.velocity.u).toBeGreaterThan(50);   // forward speed
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
