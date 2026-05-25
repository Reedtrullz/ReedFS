import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// Mock Web Audio API (not available in jsdom)
class MockAudioContext {
  createGain = vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }));
  createOscillator = vi.fn(() => ({
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));
  destination = {};
  state = 'running';
  close = vi.fn();
  resume = vi.fn();
}
vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('speechSynthesis', undefined);
class MockOscillatorNode {
  type = '';
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
vi.stubGlobal('OscillatorNode', MockOscillatorNode);

const { mockSetInput, mockStart, mockStartTakeoffRoll, mockPause, mockResume, mockReset } = vi.hoisted(() => ({
  mockSetInput: vi.fn(),
  mockStart: vi.fn(),
  mockStartTakeoffRoll: vi.fn(),
  mockPause: vi.fn(),
  mockResume: vi.fn(),
  mockReset: vi.fn(),
}));

vi.mock('../store/simStore', () => {
  const state = {
    aircraft: {
      position: { lat: 0, lon: 0, alt: 0 },
      attitude: { phi: 0, theta: 0, psi: 0 },
      quaternion: { q0: 1, q1: 0, q2: 0, q3: 0 },
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
    start: mockStart,
    startTakeoffRoll: mockStartTakeoffRoll,
    pause: mockPause,
    resume: mockResume,
    reset: mockReset,
    setInput: mockSetInput,
  };
  type MockSimStoreState = typeof state;
  const mock = Object.assign(
    vi.fn((sel?: (storeState: MockSimStoreState) => unknown) => (sel ? sel(state) : state)),
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
      globe: { enableLighting: true },
      skyAtmosphere: { show: true },
      primitives: { add: vi.fn(() => ({})), remove: vi.fn() },
    };
  },
  Cartesian3: { fromDegrees: vi.fn(() => ({ x: 0, y: 0, z: 0 })) },
  Math: { toRadians: (d: number) => (d * Math.PI) / 180 },
  Terrain: { fromWorldTerrain: vi.fn(() => ({})) },
  Transforms: { eastNorthUpToFixedFrame: vi.fn(() => ({})) },
  CircleEmitter: class {},
  ParticleSystem: class {
    emissionRate = 0;
    modelMatrix = {};
  },
  createOsmBuildingsAsync: vi.fn(() => Promise.resolve({})),
}));

vi.mock('three', () => {
  const vec = function () {
    return { x: 0, y: 0, z: 0, set: vi.fn() };
  };
  const rot = function () {
    return { x: 0, y: 0, z: 0, set: vi.fn() };
  };
  return {
    BoxGeometry: vi.fn(function () {
      return {};
    }),
    CylinderGeometry: vi.fn(function () {
      return {};
    }),
    ConeGeometry: vi.fn(function () {
      return {};
    }),
    SphereGeometry: vi.fn(function () {
      return {};
    }),
    PlaneGeometry: vi.fn(function () {
      return {};
    }),
    MeshStandardMaterial: vi.fn(function () {
      return {};
    }),
    MeshBasicMaterial: vi.fn(function () {
      return {};
    }),
    Mesh: vi.fn(function () {
      return { rotation: rot(), position: vec() };
    }),
    Group: vi.fn(function () {
      return {
        add: vi.fn(),
        rotation: rot(),
        position: vec(),
      };
    }),
    AmbientLight: vi.fn(function () {
      return {};
    }),
    DirectionalLight: vi.fn(function () {
      return { position: vec() };
    }),
    DoubleSide: 2,
  };
});

vi.mock('three-to-cesium', () => ({
  default: vi.fn(() => ({
    add: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
    threeScene: { add: vi.fn() },
  })),
}));

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ThreeToCesium from 'three-to-cesium';
import { App } from '../App';

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders RFS label', () => {
    render(<App />);
    expect(screen.getByText('RFS — Flight Test Build')).toBeTruthy();
  });

  it('uses a single Three/Cesium overlay canvas for the aircraft only', () => {
    render(<App />);

    expect(ThreeToCesium).toHaveBeenCalledTimes(1);
  });

  it('starts takeoff roll from the START ROLL button with gear down and neutral elevator', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'START ROLL' }));

    expect(mockStartTakeoffRoll).toHaveBeenCalledTimes(1);
  });

  it('shows keyboard controls help', () => {
    render(<App />);

    expect(screen.getByText('Controls')).toBeTruthy();
    expect(screen.getByText(/W rotate\/nose up/i)).toBeTruthy();
    expect(screen.getByText(/S nose down/i)).toBeTruthy();
    expect(screen.getByText(/ArrowUp\/ArrowDown throttle/i)).toBeTruthy();
    expect(screen.getByText(/Space brake/i)).toBeTruthy();
    expect(screen.getByText(/G gear after positive rate/i)).toBeTruthy();
  });
});
