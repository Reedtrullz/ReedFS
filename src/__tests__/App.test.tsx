import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// Mock Web Audio API (not available in jsdom)
const mockAudioContexts: MockAudioContext[] = [];
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
  state: AudioContextState = 'suspended';
  close = vi.fn(async () => { this.state = 'closed'; });
  resume = vi.fn(async () => { this.state = 'running'; });

  constructor() {
    mockAudioContexts.push(this);
  }
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

const { mockSetInput, mockApplyInputActions, mockStart, mockStartTakeoffRoll, mockAbortTakeoff, mockPause, mockResume, mockReset, mockSetScenario, mockSetTutorialStep, mockSetFlightPlan, mockSetApState } = vi.hoisted(() => ({
  mockSetInput: vi.fn(),
  mockApplyInputActions: vi.fn(),
  mockStart: vi.fn(),
  mockStartTakeoffRoll: vi.fn(),
  mockAbortTakeoff: vi.fn(),
  mockPause: vi.fn(),
  mockResume: vi.fn(),
  mockReset: vi.fn(),
  mockSetScenario: vi.fn(),
  mockSetTutorialStep: vi.fn(),
  mockSetFlightPlan: vi.fn(),
  mockSetApState: vi.fn(),
}));

vi.mock('../store/simStore', () => {
  const apState = {
    boeing: {
      courseL: 0,
      courseR: 0,
      speed: null,
      mach: null,
      heading: 0,
      altitude: 10000,
      verticalSpeed: null,
      fdLeft: false,
      fdRight: false,
      autothrottleArm: true,
      n1: false,
      speedMode: false,
      lnav: false,
      vnav: false,
      lvlChg: false,
      hdgSel: false,
      vorLoc: false,
      app: false,
      altHold: true,
      vs: false,
      cmdA: true,
      cmdB: false,
      cwsA: false,
      cwsB: false,
    },
    airbus: {
      speed: null,
      speedManaged: false,
      heading: null,
      headingManaged: false,
      altitude: 10000,
      altitudeManaged: false,
      verticalSpeed: null,
      fpa: null,
      fd1: false,
      fd2: false,
      athr: false,
      ap1: false,
      ap2: false,
      loc: false,
      appr: false,
      exped: false,
      hdgTrkMode: 'HDG_VS' as const,
      metricAltitude: false,
      speedMachMode: 'SPD' as const,
    },
    truth: {
      lateralActive: 'HDG_SEL' as const,
      verticalActive: 'ALT_HOLD' as const,
      thrustActive: 'OFF' as const,
      autopilotStatus: 'CMD_A' as const,
      lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
    },
  };
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
    selectedScenarioId: 'ksea-tutorial',
    flightPlan: null,
    activeLegIndex: null,
    routeStatus: {
      routeName: 'KSEA→KPDX',
      routeValid: true,
      lnavAvailable: true,
      lnavUnavailableReason: null,
      activeLegIndex: 0,
      activeLegCount: 2,
      fromWaypointIndex: 0,
      toWaypointIndex: 1,
      fromIdent: 'KSEA',
      nextWaypointIdent: 'OLM',
      distanceToNextM: 49300,
      distanceToNextNm: 26.6,
      desiredTrackRad: 2.95,
      desiredTrackDegTrue: 169,
      etaMinutes: 7.1,
      waypointReached: false,
      sequenced: false,
    },
    apState,
    guidance: {
      scenarioId: 'ksea-tutorial',
      phase: 'preflight' as const,
      tutorial: {
        scenarioId: 'ksea-tutorial',
        stepIndex: 0,
        steps: [
          { id: 'line-up', title: 'Line up and configure', body: 'Start on KSEA 16L with flaps 5.' },
          { id: 'advance-thrust', title: 'Advance thrust smoothly', body: 'Advance thrust and track centerline.' },
        ],
      },
      activeTutorialStep: { id: 'line-up', title: 'Line up and configure', body: 'Start on KSEA 16L with flaps 5.' },
      checklist: [
        { id: 'flaps', label: 'Flaps set for takeoff', complete: true, detail: 'Need flaps 5' },
      ],
      coachMessage: 'Checklist complete. Press START ROLL when ready.',
      alerts: [],
    },
    inputs: { elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0, flapLever: 0, gearLever: 'DOWN' as const, spoilers: 0, brake: 0, leftBrake: 0, rightBrake: 0 },
    effectiveControls: { elevator: 0, aileron: 0, rudder: 0, throttle1: 0, throttle2: 0, flapLever: 0, gearLever: 'DOWN' as const, spoilers: 0, brake: 0, leftBrake: 0, rightBrake: 0 },
    tick: vi.fn(),
    start: mockStart,
    startTakeoffRoll: mockStartTakeoffRoll,
    abortTakeoff: mockAbortTakeoff,
    pause: mockPause,
    resume: mockResume,
    reset: mockReset,
    setInput: mockSetInput,
    applyInputActions: mockApplyInputActions,
    setScenario: mockSetScenario,
    setTutorialStep: mockSetTutorialStep,
    setFlightPlan: mockSetFlightPlan,
    setApState: mockSetApState,
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
const mockCancelFlight = vi.fn();
const mockSetView = vi.fn();
const mockLookAt = vi.fn();
const mockDestroy = vi.fn();
const mockPostRenderAdd = vi.fn();
const mockPostRenderRemove = vi.fn();
const mockPreRenderAdd = vi.fn();
const mockPreRenderRemove = vi.fn();
const mockEntityAdd = vi.fn((entity) => entity);
const mockEntityRemove = vi.fn();

vi.mock('cesium', () => ({
  Ion: { defaultAccessToken: '' },
  Viewer: class {
    destroy = mockDestroy;
    camera = {
      flyTo: mockFlyTo,
      cancelFlight: mockCancelFlight,
      setView: mockSetView,
      lookAt: mockLookAt,
    };
    scene = {
      postRender: {
        addEventListener: mockPostRenderAdd,
        removeEventListener: mockPostRenderRemove,
      },
      preRender: {
        addEventListener: mockPreRenderAdd,
        removeEventListener: mockPreRenderRemove,
      },
      screenSpaceCameraController: { enableInputs: true },
      globe: { enableLighting: true },
      skyAtmosphere: { show: true },
      primitives: { add: vi.fn(() => ({})), remove: vi.fn() },
    };
    entities = { add: mockEntityAdd, remove: mockEntityRemove };
  },
  Cartesian3: class {
    constructor(public x = 0, public y = 0, public z = 0) {}
    static fromDegrees = vi.fn(() => ({ x: 0, y: 0, z: 0 }));
    static fromDegreesArrayHeights = vi.fn((positions: number[]) => positions);
    static normalize = vi.fn((vector) => vector);
  },
  Matrix4: class {
    static IDENTITY = {};
    static multiplyByPoint = vi.fn(() => ({ x: 0, y: 0, z: 0 }));
    static multiplyByPointAsVector = vi.fn(() => ({ x: 0, y: 0, z: 0 }));
  },
  Cartesian2: class {
    constructor(public x: number, public y: number) {}
  },
  Color: {
    WHITE: { withAlpha: vi.fn(() => 'white-alpha') },
    YELLOW: { withAlpha: vi.fn(() => 'yellow-alpha') },
    BLACK: { withAlpha: vi.fn(() => 'black-alpha') },
    DARKGRAY: { withAlpha: vi.fn(() => 'darkgray-alpha') },
    GRAY: { withAlpha: vi.fn(() => 'gray-alpha') },
    ORANGE: { withAlpha: vi.fn(() => 'orange-alpha') },
    CYAN: { withAlpha: vi.fn(() => 'cyan-alpha') },
  },
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
  const vec = function (x = 0, y = 0, z = 0) {
    const vector = {
      x,
      y,
      z,
      set: vi.fn(),
      clone: vi.fn(),
      normalize: vi.fn(),
      applyQuaternion: vi.fn(),
    };
    vector.clone.mockReturnValue(vector);
    vector.normalize.mockReturnValue(vector);
    vector.applyQuaternion.mockReturnValue(vector);
    return vector;
  };
  const quat = function () {
    const quaternion = { setFromRotationMatrix: vi.fn(), normalize: vi.fn() };
    quaternion.setFromRotationMatrix.mockReturnValue(quaternion);
    quaternion.normalize.mockReturnValue(quaternion);
    return quaternion;
  };
  const mat4 = function () {
    const matrix = { makeBasis: vi.fn() };
    matrix.makeBasis.mockReturnValue(matrix);
    return matrix;
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
    Vector3: vi.fn(vec),
    Quaternion: vi.fn(quat),
    Matrix4: vi.fn(mat4),
  };
});

vi.mock('three-to-cesium', () => ({
  default: vi.fn(() => ({
    add: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
    threeScene: { add: vi.fn(), children: [] },
    threeCamera: {},
    threeRenderer: {
      domElement: {
        style: { pointerEvents: 'none' },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 100, height: 100 })),
      },
    },
  })),
}));

vi.mock('../viewport/CesiumViewport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../viewport/CesiumViewport')>();
  return {
    ...actual,
    CesiumViewport: vi.fn(actual.CesiumViewport),
  };
});

vi.mock('../config/cesium', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/cesium')>();
  return {
    ...actual,
    initCesium: vi.fn(() => actual.getCesiumScenePolicy('')),
  };
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ThreeToCesium from 'three-to-cesium';
import { App } from '../App';
import { useSimStore } from '../store/simStore';
import { CesiumViewport } from '../viewport/CesiumViewport';

const defaultAppTestApState = structuredClone(useSimStore.getState().apState);

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAudioContexts.length = 0;
    useSimStore.getState().apState = structuredClone(defaultAppTestApState);
    useSimStore.getState().status = 'stopped';
    useSimStore.getState().selectedScenarioId = 'ksea-tutorial';
    useSimStore.getState().aircraft.position = { lat: 47.45, lon: -122.31, alt: 432 };
    useSimStore.getState().aircraft.flightPhase = 'PARKED';
    delete (useSimStore.getState().aircraft as { ground?: unknown }).ground;
  });

  afterEach(() => {
    cleanup();
  });

  it('hides debug overlays by default while keeping the flight instrument overlay available', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'OVL: FLIGHT' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'HDG' })).toBeTruthy();
    expect(screen.queryByText('RFS — Flight Test Build')).toBeNull();
    expect(screen.queryByText('Controls')).toBeNull();
    expect(screen.queryByText(/SIM:/)).toBeNull();
    expect(screen.queryByText(/FPS/)).toBeNull();
  });

  it('mounts route status with the flight instruments overlay', () => {
    render(<App />);

    expect(screen.getByLabelText('Route status')).toBeTruthy();
    expect(screen.getByText('KSEA→KPDX')).toBeTruthy();
    expect(screen.getByText(/KSEA → OLM/)).toBeTruthy();
  });

  it('shows degraded scenery status and passes the degraded policy to the viewport when Ion is unavailable', () => {
    render(<App />);

    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/SCENERY DEGRADED/i);
    expect(status.textContent).toMatch(/VITE_CESIUM_ION_TOKEN/i);

    const viewportProps = vi.mocked(CesiumViewport).mock.calls[0][0];
    expect(viewportProps.scenePolicy).toMatchObject({
      mode: 'degraded',
      terrain: 'ellipsoid',
      osmBuildings: false,
      token: null,
    });
    expect(viewportProps.scenePolicy?.reason).toMatch(/VITE_CESIUM_ION_TOKEN/);
  });

  it('LOAD PLAN creates and stores the default route for compatible KSEA scenarios', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'LOAD PLAN' }));

    expect(mockSetFlightPlan).toHaveBeenCalledTimes(1);
    expect(mockSetFlightPlan).toHaveBeenCalledWith(expect.objectContaining({ origin: 'KSEA', destination: 'KPDX' }));
  });

  it('LOAD PLAN keeps NO ROUTE and does not arm route AP modes for the default ENVA scenario', () => {
    const store = useSimStore.getState();
    store.selectedScenarioId = 'enva-tutorial';
    store.aircraft.position = { lat: 63.4583, lon: 10.9101, alt: 40 };

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'LOAD PLAN' }));

    expect(mockSetFlightPlan).toHaveBeenCalledTimes(1);
    expect(mockSetFlightPlan).toHaveBeenCalledWith(null);
    expect(mockSetApState).not.toHaveBeenCalled();
  });

  it('tracks Z/X differential brake keys in the live input path and clears them on blur and cleanup', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback): number => {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    const flushRaf = (timestamp: number) => {
      const pendingCallbacks = rafCallbacks.splice(0);
      act(() => {
        pendingCallbacks.forEach((callback) => callback(timestamp));
      });
    };

    try {
      const view = render(<App />);
      mockApplyInputActions.mockClear();
      mockSetInput.mockClear();

      fireEvent.keyDown(window, { key: 'z' });
      fireEvent.keyDown(window, { key: 'x' });
      flushRaf(1000);

      expect(mockApplyInputActions).toHaveBeenCalledWith(
        expect.objectContaining({ leftBrake: 1, rightBrake: 1 }),
        expect.any(Number),
      );

      fireEvent.blur(window);
      const blurClear = mockSetInput.mock.calls.at(-1)?.[0];
      expect(blurClear).toEqual(expect.objectContaining({
        rudder: 0,
        brake: 0,
        leftBrake: 0,
        rightBrake: 0,
      }));
      expect(blurClear).not.toHaveProperty('elevator');
      expect(blurClear).not.toHaveProperty('aileron');

      mockApplyInputActions.mockClear();
      flushRaf(1016);
      const clearedActions = mockApplyInputActions.mock.calls.at(-1)?.[0];
      expect(clearedActions).not.toHaveProperty('leftBrake');
      expect(clearedActions).not.toHaveProperty('rightBrake');

      mockSetInput.mockClear();
      view.unmount();
      const cleanupClear = mockSetInput.mock.calls.at(-1)?.[0];
      expect(cleanupClear).toEqual(expect.objectContaining({
        rudder: 0,
        brake: 0,
        leftBrake: 0,
        rightBrake: 0,
      }));
      expect(cleanupClear).not.toHaveProperty('elevator');
      expect(cleanupClear).not.toHaveProperty('aileron');
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it('clears held Z/X differential brakes when the document becomes hidden', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback): number => {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
    const visibilityStateSpy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    const flushRaf = (timestamp: number) => {
      const pendingCallbacks = rafCallbacks.splice(0);
      act(() => {
        pendingCallbacks.forEach((callback) => callback(timestamp));
      });
    };

    try {
      render(<App />);
      mockApplyInputActions.mockClear();
      mockSetInput.mockClear();

      fireEvent.keyDown(window, { key: 'z' });
      fireEvent.keyDown(window, { key: 'x' });
      flushRaf(1000);

      expect(mockApplyInputActions).toHaveBeenCalledWith(
        expect.objectContaining({ leftBrake: 1, rightBrake: 1 }),
        expect.any(Number),
      );

      mockSetInput.mockClear();
      fireEvent(document, new Event('visibilitychange'));
      const visibilityClear = mockSetInput.mock.calls.at(-1)?.[0];
      expect(visibilityClear).toEqual(expect.objectContaining({
        rudder: 0,
        brake: 0,
        leftBrake: 0,
        rightBrake: 0,
      }));
      expect(visibilityClear).not.toHaveProperty('elevator');
      expect(visibilityClear).not.toHaveProperty('aileron');

      mockApplyInputActions.mockClear();
      flushRaf(1016);
      const clearedActions = mockApplyInputActions.mock.calls.at(-1)?.[0];
      expect(clearedActions).not.toHaveProperty('leftBrake');
      expect(clearedActions).not.toHaveProperty('rightBrake');
    } finally {
      visibilityStateSpy.mockRestore();
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it('LOAD PLAN does not engage VNAV on the default route when no VNAV constraint exists', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'LOAD PLAN' }));

    expect(mockSetApState).toHaveBeenCalledTimes(1);
    const nextApState = mockSetApState.mock.calls[0][0];
    expect(nextApState.truth.lateralActive).toBe('LNAV');
    expect(nextApState.truth.thrustActive).toBe('SPEED');
    expect(nextApState.truth.verticalActive).toBe('ALT_HOLD');
    expect(nextApState.boeing.lnav).toBe(true);
    expect(nextApState.boeing.speedMode).toBe(true);
    expect(nextApState.boeing.vnav).toBe(false);
    expect(nextApState.boeing.altHold).toBe(true);
  });

  it('LOAD PLAN creates and annunciates safe AP defaults when AP state is null', () => {
    useSimStore.getState().apState = null;
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'LOAD PLAN' }));

    expect(mockSetFlightPlan).toHaveBeenCalledTimes(1);
    expect(mockSetApState).toHaveBeenCalledTimes(1);
    const nextApState = mockSetApState.mock.calls[0][0];
    expect(nextApState.truth.lateralActive).toBe('LNAV');
    expect(nextApState.truth.thrustActive).toBe('SPEED');
    expect(nextApState.truth.verticalActive).toBe('ALT_HOLD');
    expect(nextApState.truth.autopilotStatus).toBe('CMD_A');
    expect(nextApState.boeing.lnav).toBe(true);
    expect(nextApState.boeing.speedMode).toBe(true);
    expect(nextApState.boeing.altHold).toBe(true);
    expect(nextApState.boeing.vnav).toBe(false);
    expect(nextApState.boeing.vs).toBe(false);
    expect(nextApState.boeing.hdgSel).toBe(false);
    expect(nextApState.boeing.n1).toBe(false);
    expect(nextApState.boeing.autothrottleArm).toBe(true);
  });

  it('LOAD PLAN only stores the route during a running takeoff instead of auto-commanding AP modes', () => {
    const store = useSimStore.getState();
    store.status = 'running';
    store.aircraft.flightPhase = 'TAKEOFF';
    Object.assign(store.aircraft, {
      ground: {
        onRunway: true,
        weightOnWheels: true,
        aglFt: 0,
        groundAltFt: 432,
        normalForceN: 600_000,
        contact: 'gear',
        stations: [],
      },
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'LOAD PLAN' }));

    expect(mockSetFlightPlan).toHaveBeenCalledTimes(1);
    expect(mockSetApState).not.toHaveBeenCalled();
  });

  it('uses a single Three/Cesium overlay canvas for the aircraft only', () => {
    render(<App />);

    expect(ThreeToCesium).toHaveBeenCalledTimes(1);
  });

  it('mounts the Cesium-native runway layer', () => {
    render(<App />);

    expect(mockEntityAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'runway-pavement-KSEA-16L' }));
    expect(mockEntityAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'runway-centerline-KSEA-16L' }));
  });

  it('switches from exterior aircraft layer to cockpit layer in cockpit mode', () => {
    render(<App />);
    const cameraButton = screen.getByRole('button', { name: 'CAM: CHASE' });

    fireEvent.click(cameraButton);

    expect(screen.getByRole('button', { name: 'CAM: COCKPIT' })).toBeTruthy();
    expect(ThreeToCesium).toHaveBeenCalledTimes(2);
  });

  it('calls startTakeoffRoll from the START ROLL button', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'START ROLL' }));

    expect(mockStartTakeoffRoll).toHaveBeenCalledTimes(1);
  });

  it('shows ABORT during a running rollout and calls abortTakeoff without pausing', () => {
    const store = useSimStore.getState();
    store.status = 'running';
    store.aircraft.flightPhase = 'TAKEOFF';

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'ABORT' }));

    expect(mockAbortTakeoff).toHaveBeenCalledTimes(1);
    expect(mockPause).not.toHaveBeenCalled();
  });

  it('starts audio only from the explicit AUDIO control', async () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'AUDIO: OFF' })).toBeTruthy();
    expect(mockAudioContexts).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'AUDIO: OFF' }));

    expect(await screen.findByRole('button', { name: 'AUDIO: ON' })).toBeTruthy();
    expect(mockAudioContexts).toHaveLength(1);
    expect(mockAudioContexts[0].resume).toHaveBeenCalledTimes(1);
  });

  it('cycles camera and overlay modes from keyboard shortcuts', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.getByRole('button', { name: 'CAM: COCKPIT' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'o' });
    expect(screen.getByRole('button', { name: 'OVL: MINIMAL' })).toBeTruthy();
  });

  it('cycles overlays from flight to minimal to debug', () => {
    render(<App />);
    const overlayButton = screen.getByRole('button', { name: 'OVL: FLIGHT' });

    fireEvent.click(overlayButton);
    expect(screen.getByRole('button', { name: 'OVL: MINIMAL' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'HDG' })).toBeNull();
    expect(screen.queryByText('Controls')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'OVL: MINIMAL' }));
    expect(screen.getByRole('button', { name: 'OVL: DEBUG' })).toBeTruthy();
    expect(screen.getByText('RFS — Flight Test Build')).toBeTruthy();
    expect(screen.getByText('Controls')).toBeTruthy();
    expect(screen.getByText(/SIM:/)).toBeTruthy();
  });
});
