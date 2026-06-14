import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import appSource from '../App.tsx?raw';

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

const { mockSetInput, mockApplyInputActions, mockStart, mockStartTakeoffRoll, mockAbortTakeoff, mockPause, mockResume, mockReset, mockSetScenario, mockSetTutorialStep, mockSetFlightPlan, mockSetApState, mockSetWind, mockFetchMetar, mockCloudLayer } = vi.hoisted(() => ({
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
  mockSetWind: vi.fn(),
  mockFetchMetar: vi.fn(async () => null),
  mockCloudLayer: vi.fn(() => null),
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
      config: { flapSetting: 0, gearDown: true, spoilersDeployed: false, speedBrake: 0, stabilizerTrimUnits: 5 },
      engines: [
        { n1: 0, n2: 0, egt: 0, fuelFlow: 0, thrust: 0, running: false },
        { n1: 0, n2: 0, egt: 0, fuelFlow: 0, thrust: 0, running: false },
      ],
      fuel: { totalFuel: 0, fuelFlowTotal: 0, centerTank: 0, leftTank: 0, rightTank: 0 },
      grossWeight: 0, cg: 0, simTime: 0, flightPhase: 'PARKED' as const,
    },
    status: 'stopped' as const,
    selectedScenarioId: 'ksea-tutorial',
    wind: { dir: 180, speed: 0, gustSeed: 1601 },
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
    setWind: mockSetWind,
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
    isDestroyed = vi.fn(() => false);
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
    getCesiumScenePolicy: vi.fn(() => actual.getCesiumScenePolicy('')),
    initCesium: vi.fn(() => actual.getCesiumScenePolicy('')),
  };
});

vi.mock('../instruments/RfsPFD', () => ({
  RfsPFD: () => <div aria-label="Primary flight display" />,
}));

vi.mock('../instruments/RfsMCP', () => ({
  RfsMCP: () => <button type="button">HDG</button>,
}));

vi.mock('../components/Telemetry', () => ({
  Telemetry: () => <div>SIM: TEST</div>,
}));

vi.mock('../components/ControlsHelp', () => ({
  ControlsHelp: () => <div>Controls</div>,
}));

vi.mock('../components/ControlsSettings', () => ({
  ControlsSettings: () => <div aria-label="Controls settings" />,
}));

vi.mock('../components/AttitudeIndicator', () => ({
  AttitudeIndicator: () => <div aria-label="Attitude indicator" />,
}));

vi.mock('../sim/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sim/weather')>();
  return {
    ...actual,
    fetchMetar: mockFetchMetar,
  };
});

vi.mock('../viewport/CloudLayer', () => ({
  CloudLayer: mockCloudLayer,
}));

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ThreeToCesium from 'three-to-cesium';
import { App } from '../App';
import { useSimStore } from '../store/simStore';
import { CesiumViewport } from '../viewport/CesiumViewport';
import { SCENARIOS } from '../sim/scenarios';

const defaultAppTestApState = structuredClone(useSimStore.getState().apState);

async function settleLazyImports(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('App', () => {
  it('delegates simulator shell composition to RfsShell instead of owning feature surfaces inline', () => {
    expect(appSource).toMatch(/<RfsShell\b/);
    expect(appSource).not.toMatch(/<RfsLayout\b|<CesiumViewport\b|<ScenarioPanel\b|<BottomControlBar\b/);
  });

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

  it('starts one centralized app frame loop for input, simulation, render/effects, and audio scheduling', async () => {
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 101);
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    render(<App />);
    await settleLazyImports();

    expect(requestFrame).toHaveBeenCalledTimes(1);

    cleanup();
    expect(cancelFrame).toHaveBeenCalledTimes(1);
  });

  it('hides debug overlays by default while keeping the flight instrument overlay available', async () => {
    render(<App />);
    await settleLazyImports();

    expect(screen.getByRole('button', { name: 'OVL: FLIGHT' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'HDG' })).toBeTruthy();
    expect(screen.queryByText('RFS — Flight Test Build')).toBeNull();
    expect(screen.queryByText('Controls')).toBeNull();
    expect(screen.queryByText(/SIM:/)).toBeNull();
    expect(screen.queryByText(/FPS/)).toBeNull();
  });

  it('fetches METAR weather from the selected scenario station instead of hard-coded KSEA', async () => {
    const kpdxScenario = SCENARIOS.find((scenario) => scenario.runway.airport === 'KPDX');
    expect(kpdxScenario).toBeDefined();
    useSimStore.getState().selectedScenarioId = kpdxScenario!.id;

    render(<App />);

    await waitFor(() => expect(mockFetchMetar).toHaveBeenCalledWith('KPDX'));
  });

  it('mounts route status with the flight instruments overlay', () => {
    render(<App />);

    expect(screen.getByLabelText('Route status')).toBeTruthy();
    expect(screen.getByText('KSEA→KPDX')).toBeTruthy();
    expect(screen.getByText(/KSEA → OLM/)).toBeTruthy();
  });

  it('shows degraded scenery status and passes the degraded policy to the viewport when Ion is unavailable', async () => {
    render(<App />);
    await settleLazyImports();

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
    expect(mockSetApState).not.toHaveBeenCalled();
    expect(screen.queryByText(/no default route/i)).toBeNull();
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
    expect(screen.getByText(/no default route/i)).toBeTruthy();
  });

  it('LOAD PLAN clears stale no-route feedback after loading a compatible KSEA route', () => {
    const store = useSimStore.getState();
    store.selectedScenarioId = 'enva-tutorial';

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'LOAD PLAN' }));
    expect(screen.getByText(/no default route/i)).toBeTruthy();

    store.selectedScenarioId = 'ksea-tutorial';
    fireEvent.click(screen.getByRole('button', { name: 'LOAD PLAN' }));

    expect(mockSetFlightPlan).toHaveBeenLastCalledWith(expect.objectContaining({ origin: 'KSEA', destination: 'KPDX' }));
    expect(screen.queryByText(/no default route/i)).toBeNull();
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

  it('LOAD PLAN does not engage AP modes on the default route while stopped', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'LOAD PLAN' }));

    expect(mockSetFlightPlan).toHaveBeenCalledWith(expect.objectContaining({ origin: 'KSEA', destination: 'KPDX' }));
    expect(mockSetApState).not.toHaveBeenCalled();
  });

  it('LOAD PLAN stores the route without creating AP state when AP state is null', () => {
    useSimStore.getState().apState = null;
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'LOAD PLAN' }));

    expect(mockSetFlightPlan).toHaveBeenCalledTimes(1);
    expect(mockSetFlightPlan).toHaveBeenCalledWith(expect.objectContaining({ origin: 'KSEA', destination: 'KPDX' }));
    expect(mockSetApState).not.toHaveBeenCalled();
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
    expect(mockSetFlightPlan).toHaveBeenCalledWith(expect.objectContaining({ origin: 'KSEA', destination: 'KPDX' }));
    expect(mockSetApState).not.toHaveBeenCalled();
  });

  it('defers viewer-dependent layers until the Cesium viewer is ready', async () => {
    const defaultViewportImplementation = vi.mocked(CesiumViewport).getMockImplementation();
    vi.mocked(CesiumViewport).mockImplementation(() => <div data-testid="pending-viewport" />);

    try {
      render(<App />);
      await settleLazyImports();

      expect(screen.getByTestId('pending-viewport')).toBeTruthy();
      expect(ThreeToCesium).not.toHaveBeenCalled();
      expect(mockEntityAdd).not.toHaveBeenCalled();
    } finally {
      if (defaultViewportImplementation) vi.mocked(CesiumViewport).mockImplementation(defaultViewportImplementation);
    }
  });

  it('uses a single Three/Cesium overlay canvas for the aircraft only', async () => {
    render(<App />);
    await settleLazyImports();

    await waitFor(() => expect(ThreeToCesium).toHaveBeenCalledTimes(1));
  });

  it('mounts the Cesium-native runway layer', async () => {
    render(<App />);
    await settleLazyImports();

    await waitFor(() => {
      expect(mockEntityAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'runway-pavement-KSEA-16L' }));
      expect(mockEntityAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'runway-centerline-KSEA-16L' }));
    });
  });

  it('switches from exterior aircraft layer to cockpit layer in cockpit mode', async () => {
    render(<App />);
    await settleLazyImports();
    const cameraButton = screen.getByRole('button', { name: 'CAM: CHASE' });

    fireEvent.click(cameraButton);
    await settleLazyImports();

    expect(screen.getByRole('button', { name: 'CAM: COCKPIT' })).toBeTruthy();
    await waitFor(() => expect(ThreeToCesium).toHaveBeenCalledTimes(2));
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

  it('cycles overlays from flight to minimal to debug', async () => {
    render(<App />);
    await settleLazyImports();
    const overlayButton = screen.getByRole('button', { name: 'OVL: FLIGHT' });

    fireEvent.click(overlayButton);
    expect(screen.getByRole('button', { name: 'OVL: MINIMAL' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'HDG' })).toBeNull();
    expect(screen.queryByText('Controls')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'OVL: MINIMAL' }));
    await settleLazyImports();
    expect(screen.getByRole('button', { name: 'OVL: DEBUG' })).toBeTruthy();
    expect(screen.getByText('RFS — Flight Test Build')).toBeTruthy();
    expect(await screen.findByText('Controls')).toBeTruthy();
    expect(await screen.findByText(/SIM:/)).toBeTruthy();
  });
});
