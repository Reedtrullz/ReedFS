import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../AudioEngine';

class FakeGainNode {
  gain = { value: 0 };
  connections: unknown[] = [];

  connect(destination: unknown): unknown {
    this.connections.push(destination);
    return destination;
  }

  disconnect = vi.fn();
}

interface FakeAudioContext {
  state: AudioContextState;
  destination: unknown;
  createdGains: FakeGainNode[];
  resume: ReturnType<typeof vi.fn<() => Promise<void>>>;
  close: ReturnType<typeof vi.fn<() => Promise<void>>>;
  createGain: ReturnType<typeof vi.fn<() => GainNode>>;
}

function createFakeAudioContext(initialState: AudioContextState = 'suspended'): FakeAudioContext {
  const context: FakeAudioContext = {
    state: initialState,
    destination: { kind: 'destination' },
    createdGains: [],
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    close: vi.fn(async () => {
      context.state = 'closed';
    }),
    createGain: vi.fn(() => {
      const node = new FakeGainNode();
      context.createdGains.push(node);
      return node as unknown as GainNode;
    }),
  };
  return context;
}

describe('AudioEngine lifecycle', () => {
  it('constructs audio buses without starting or resuming the context', () => {
    const context = createFakeAudioContext('suspended');
    const engine = new AudioEngine({ contextFactory: () => context as unknown as AudioContext });

    expect(engine.status).toEqual({ started: false, disposed: false, contextState: 'suspended' });
    expect(context.resume).not.toHaveBeenCalled();
    expect(context.createdGains).toHaveLength(3);
    expect(engine.master.gain.value).toBe(0.5);
    expect(engine.engineBus.gain.value).toBe(0.8);
    expect(engine.cockpitBus.gain.value).toBe(0.6);
  });

  it('starts suspended audio explicitly and only resumes once', async () => {
    const context = createFakeAudioContext('suspended');
    const engine = new AudioEngine({ contextFactory: () => context as unknown as AudioContext });

    await engine.start();
    await engine.start();

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(engine.status).toEqual({ started: true, disposed: false, contextState: 'running' });
  });

  it('marks a running context as started without resuming it', async () => {
    const context = createFakeAudioContext('running');
    const engine = new AudioEngine({ contextFactory: () => context as unknown as AudioContext });

    await engine.start();

    expect(context.resume).not.toHaveBeenCalled();
    expect(engine.status.started).toBe(true);
    expect(engine.status.contextState).toBe('running');
  });

  it('closes the context at most once when disposed', async () => {
    const context = createFakeAudioContext('suspended');
    const engine = new AudioEngine({ contextFactory: () => context as unknown as AudioContext });

    await engine.dispose();
    await engine.dispose();

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(engine.status).toEqual({ started: false, disposed: true, contextState: 'closed' });
  });
});
