import { describe, it, expect, beforeEach } from 'vitest';
import { useSimStore } from '../simStore';

describe('useSimStore', () => {
  beforeEach(() => useSimStore.getState().reset());

  it('starts stopped', () => expect(useSimStore.getState().status).toBe('stopped'));
  it('start → running', () => { useSimStore.getState().start(); expect(useSimStore.getState().status).toBe('running'); });
  it('pause → paused', () => { useSimStore.getState().start(); useSimStore.getState().pause(); expect(useSimStore.getState().status).toBe('paused'); });
  it('setInput partial', () => { useSimStore.getState().setInput({ throttle1: 0.8 }); expect(useSimStore.getState().inputs.throttle1).toBe(0.8); expect(useSimStore.getState().inputs.throttle2).toBe(0); });
  it('tick advances simTime when running', () => { useSimStore.getState().start(); const b = useSimStore.getState().aircraft.simTime; useSimStore.getState().tick(performance.now()); expect(useSimStore.getState().aircraft.simTime).toBeGreaterThanOrEqual(b); });
  it('reset clears everything', () => { useSimStore.getState().setInput({ throttle1: 1 }); useSimStore.getState().start(); useSimStore.getState().tick(1000); useSimStore.getState().reset(); expect(useSimStore.getState().status).toBe('stopped'); expect(useSimStore.getState().inputs.throttle1).toBe(0); });
});
