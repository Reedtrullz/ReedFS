import { describe, it, expect, vi } from 'vitest';

vi.mock('../store/simStore', () => {
  const state = {
    aircraft: {
      position: { lat: 0, lon: 0, alt: 0 },
      attitude: { phi: 0, theta: 0, psi: 0 },
      velocity: { u: 0, v: 0, w: 0 },
      angularVel: { p: 0, q: 0, r: 0 },
      config: { flapSetting: 0, gearDown: true, spoilersDeployed: false, speedBrake: 0 },
      engines: [
        { n1: 0, n2: 0, egt: 0, fuelFlow: 0, thrust: 0, running: false },
        { n1: 0, n2: 0, egt: 0, fuelFlow: 0, thrust: 0, running: false },
      ],
      fuel: { totalFuel: 0, fuelFlowTotal: 0, centerTank: 0, leftTank: 0, rightTank: 0 },
      grossWeight: 0, cg: 0, simTime: 0, flightPhase: 'PARKED' as const,
    },
    status: 'stopped' as const,
    inputs: { elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0, flapLever: 0, gearLever: 'DOWN' as const, spoilers: 0, brake: 0 },
    tick: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    reset: vi.fn(),
    setInput: vi.fn(),
  };
  const mock = Object.assign(
    vi.fn((sel: any) => (sel ? sel(state) : state)),
    {
      getState: vi.fn(() => state),
      subscribe: vi.fn(() => vi.fn()),
    }
  );
  return { useSimStore: mock };
});

vi.mock('../sim/physics/derived', () => ({
  computeDerived: vi.fn(() => ({
    ias: 0, tas: 0, gs: 0, vs: 0, mach: 0, aoa: 0,
  })),
}));

const mockFlyTo = vi.fn();
const mockDestroy = vi.fn();
const mockPostRenderAdd = vi.fn();
const mockPostRenderRemove = vi.fn();

vi.mock('cesium', () => ({
  Ion: { defaultAccessToken: '' },
  Viewer: class {
    destroy = mockDestroy;
    camera = { flyTo: mockFlyTo };
    scene = {
      postRender: {
        addEventListener: mockPostRenderAdd,
        removeEventListener: mockPostRenderRemove,
      },
      screenSpaceCameraController: { enableInputs: true },
    };
  },
  Cartesian3: { fromDegrees: vi.fn(() => ({ x: 0, y: 0, z: 0 })) },
  Math: { toRadians: (d: number) => (d * Math.PI) / 180 },
  Terrain: { fromWorldTerrain: vi.fn(() => ({})) },
}));

vi.mock('three', () => ({
  BoxGeometry: vi.fn(function() {}),
  MeshStandardMaterial: vi.fn(function() {}),
  Mesh: vi.fn(function() {}),
  AmbientLight: vi.fn(function() {}),
  DirectionalLight: vi.fn(function() { return { position: { set: vi.fn() } }; }),
}));

vi.mock('three-to-cesium', () => ({
  default: vi.fn(() => ({
    add: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
    threeScene: { add: vi.fn() },
  })),
}));

import { render, screen } from '@testing-library/react';
import { App } from '../App';

describe('App', () => {
  it('renders RFS label', () => {
    render(<App />);
    expect(screen.getByText('RFS — Phase 1.5')).toBeTruthy();
  });
});
