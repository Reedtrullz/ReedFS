import type { Page } from '@playwright/test';

export interface RouteProofSnapshot {
  routeName: string;
  lnavAvailable: boolean;
  activeLegIndex: number;
  fromIdent: string | null;
  nextWaypointIdent: string | null;
  distanceToNextNm: number;
  desiredTrackDegTrue: number | null;
  crossTrackErrorM: number | null;
  lateralActive: string;
  fmaLateralActive: string;
  autopilotStatus: string;
  fmaAutopilotStatus: string;
  thrustActive: string;
  fmaThrustActive: string;
  verticalActive: string;
  fmaVerticalActive: string;
  sequenced: boolean;
  altitudeFt: number;
  aglFt: number;
  iasKt: number;
  verticalSpeedFpm: number;
  weightOnWheels: boolean;
  gearDown: boolean;
  gearLever: 'UP' | 'DOWN';
  flapSetting: number;
  flightPhase: string;
  guidancePhase: string;
  pilotInputs: RouteProofControlSnapshot;
  effectiveControls: RouteProofControlSnapshot;
  apCommandCount: number;
}

export interface RouteResetProofSnapshot {
  flightPlan: null;
  activeLegIndex: null;
  apStateCleared: boolean;
  routeName: string;
  lnavAvailable: boolean;
  lateralActive: string;
  fmaLateralActive: string;
  autopilotStatus: string;
  fmaAutopilotStatus: string;
  thrustActive: string;
  fmaThrustActive: string;
  verticalActive: string;
  fmaVerticalActive: string;
  weightOnWheels: boolean;
  flightPhase: string;
  guidancePhase: string;
  status: string;
  pilotInputs: RouteProofControlSnapshot;
  effectiveControls: RouteProofControlSnapshot;
  apCommandCount: number;
}

export interface RouteProofResult {
  initial: RouteProofSnapshot;
  final: RouteProofSnapshot;
  samples: RouteProofSnapshot[];
}

export interface RouteConfiguredApproachProofResult {
  initial: RouteProofSnapshot;
  configuredApproach: RouteProofSnapshot;
  samples: RouteProofSnapshot[];
}

export interface RouteManualHandoffProofResult {
  configuredApproach: RouteProofSnapshot;
  manualHandoff: RouteProofSnapshot;
  samples: RouteProofSnapshot[];
}

export interface RouteManualHandoffResetProofResult {
  configuredApproach: RouteProofSnapshot;
  manualHandoff: RouteProofSnapshot;
  reset: RouteResetProofSnapshot;
  samples: RouteProofSnapshot[];
}

export interface RouteProofControlSnapshot {
  elevator: number;
  aileron: number;
  rudder: number;
  throttle1: number;
  throttle2: number;
  flapLever: number;
  gearLever: 'UP' | 'DOWN';
  spoilers: number;
  brake: number;
  leftBrake?: number;
  rightBrake?: number;
}

interface RouteProofControlSetup {
  elevator: number;
  aileron: number;
  rudder: number;
  throttle1: number;
  throttle2: number;
  flapLever: number;
  gearLever: 'UP' | 'DOWN';
  spoilers: number;
  brake: number;
  leftBrake?: number;
  rightBrake?: number;
}

interface RouteConfiguredApproachSetup {
  routeFrames: number;
  sampleIntervalFrames: number;
  controls: Partial<RouteProofControlSetup>;
}

interface RouteManualHandoffSetup {
  elevator: number;
}

interface RouteProofSetup {
  initialPosition: { lat: number; lon: number };
  initialHeadingDeg: number;
  initialPitchDeg?: number;
  initialAltitudeFt?: number;
  initialGroundAltFt?: number;
  initialAglFt?: number;
  initialVelocity?: { u: number; v: number; w: number };
  initialGearDown?: boolean;
  initialFlapSetting?: number;
  initialFlightPhase?: string;
  initialControls?: Partial<RouteProofControlSetup>;
  seedActiveLegIndex?: number;
  autopilotVerticalActive?: string;
  autopilotAltHold?: boolean;
  autopilotSpeedKt?: number;
  routeFrames?: number;
  sampleIntervalFrames: number;
  gates?: RouteProofGateSetup[];
  configuredApproach?: RouteConfiguredApproachSetup;
  manualHandoff?: RouteManualHandoffSetup;
  resetAfterManualHandoff?: boolean;
}

interface RouteProofGateSetup {
  targetActiveLegIndex: number;
  routeFrames: number;
  reposition?: {
    position: { lat: number; lon: number };
    headingDeg: number;
  };
}

const FIXED_STEP_SECONDS = 1 / 60;
const FIXED_STEP_MS = 1000 / 60;
const ROUTE_FRAMES = 60 * 35;
const FIRST_SEQUENCE_FRAMES = 60 * 12;
const SECOND_SEQUENCE_FRAMES = 60 * 8;
const ROUTE_SAMPLE_INTERVAL_FRAMES = 300;
const SEQUENCE_SAMPLE_INTERVAL_FRAMES = 30;

const KSEA_ROUTE_PROOF: RouteProofSetup = {
  initialPosition: { lat: 47.445, lon: -122.315 },
  initialHeadingDeg: 219,
  routeFrames: ROUTE_FRAMES,
  sampleIntervalFrames: ROUTE_SAMPLE_INTERVAL_FRAMES,
};

const KSEA_FIRST_SEQUENCE_PROOF: RouteProofSetup = {
  initialPosition: { lat: 46.9844, lon: -122.8823 },
  initialHeadingDeg: 219.86151626593303,
  routeFrames: FIRST_SEQUENCE_FRAMES,
  sampleIntervalFrames: SEQUENCE_SAMPLE_INTERVAL_FRAMES,
};

const KSEA_SECOND_SEQUENCE_PROOF: RouteProofSetup = {
  initialPosition: { lat: 45.7622, lon: -122.5931 },
  initialHeadingDeg: 170.05376346096932,
  routeFrames: SECOND_SEQUENCE_FRAMES,
  sampleIntervalFrames: SEQUENCE_SAMPLE_INTERVAL_FRAMES,
};

const KSEA_MULTI_GATE_PROGRESSION_PROOF: RouteProofSetup = {
  initialPosition: KSEA_FIRST_SEQUENCE_PROOF.initialPosition,
  initialHeadingDeg: KSEA_FIRST_SEQUENCE_PROOF.initialHeadingDeg,
  sampleIntervalFrames: SEQUENCE_SAMPLE_INTERVAL_FRAMES,
  gates: [
    {
      targetActiveLegIndex: 1,
      routeFrames: FIRST_SEQUENCE_FRAMES,
    },
    {
      targetActiveLegIndex: 2,
      routeFrames: SECOND_SEQUENCE_FRAMES,
      reposition: {
        position: KSEA_SECOND_SEQUENCE_PROOF.initialPosition,
        headingDeg: KSEA_SECOND_SEQUENCE_PROOF.initialHeadingDeg,
      },
    },
  ],
};

const KSEA_FINAL_ROUTE_CONFIGURED_APPROACH_PROOF: RouteProofSetup = {
  initialPosition: { lat: 45.69, lon: -122.596 },
  initialHeadingDeg: 183.5,
  initialPitchDeg: -1.5,
  initialAltitudeFt: 3_500,
  initialGroundAltFt: 50,
  initialAglFt: 3_450,
  initialVelocity: { u: 96, v: 0, w: 1.5 },
  initialGearDown: false,
  initialFlapSetting: 5,
  initialFlightPhase: 'DESCENT',
  initialControls: {
    elevator: 0.22,
    aileron: 0,
    rudder: 0,
    throttle1: 0.35,
    throttle2: 0.35,
    flapLever: 5,
    gearLever: 'UP',
    spoilers: 0,
    brake: 0,
    leftBrake: 0,
    rightBrake: 0,
  },
  seedActiveLegIndex: 2,
  autopilotVerticalActive: 'OFF',
  autopilotAltHold: false,
  autopilotSpeedKt: 180,
  sampleIntervalFrames: 60,
  configuredApproach: {
    routeFrames: 60 * 45,
    sampleIntervalFrames: 60,
    controls: {
      flapLever: 30,
      gearLever: 'DOWN',
      brake: 0,
      leftBrake: 0,
      rightBrake: 0,
      spoilers: 0,
    },
  },
};

const KSEA_FINAL_ROUTE_MANUAL_HANDOFF_PROOF: RouteManualHandoffSetup = {
  elevator: -0.35,
};

async function flyKseaRouteProof(page: Page, setup: RouteProofSetup & { configuredApproach: RouteConfiguredApproachSetup; manualHandoff: RouteManualHandoffSetup; resetAfterManualHandoff: true }): Promise<RouteManualHandoffResetProofResult>;
async function flyKseaRouteProof(page: Page, setup: RouteProofSetup & { configuredApproach: RouteConfiguredApproachSetup; manualHandoff: RouteManualHandoffSetup }): Promise<RouteManualHandoffProofResult>;
async function flyKseaRouteProof(page: Page, setup: RouteProofSetup & { configuredApproach: RouteConfiguredApproachSetup }): Promise<RouteConfiguredApproachProofResult>;
async function flyKseaRouteProof(page: Page, setup: RouteProofSetup): Promise<RouteProofResult>;
async function flyKseaRouteProof(page: Page, setup: RouteProofSetup): Promise<RouteProofResult | RouteConfiguredApproachProofResult | RouteManualHandoffProofResult | RouteManualHandoffResetProofResult> {
  return page.evaluate(
    async ({ fixedStepSeconds, fixedStepMs, proofSetup }): Promise<RouteProofResult | RouteConfiguredApproachProofResult | RouteManualHandoffProofResult | RouteManualHandoffResetProofResult> => {
      interface BrowserAircraftState {
        position: { lat: number; lon: number; alt: number };
        velocity: { u: number; v: number; w: number };
        attitude: { phi: number; theta: number; psi: number };
        quaternion: unknown;
        angularVel: { p: number; q: number; r: number };
        config: { gearDown: boolean; flapSetting: number; spoilersArmed: boolean; spoilersDeployed: boolean; speedBrake: number };
        engines: [{ n1: number; n2: number; egt: number; fuelFlow: number; thrust: number; running: boolean }, { n1: number; n2: number; egt: number; fuelFlow: number; thrust: number; running: boolean }];
        ground: {
          aglFt: number;
          groundAltFt: number;
          weightOnWheels: boolean;
          normalForceN: number;
          contact: string;
          onRunway: boolean;
          gearStations: Array<{ compressionM: number; normalForceN: number; weightOnWheel: boolean }>;
        };
        flightPhase: string;
      }

      interface BrowserControlInputs {
        elevator: number;
        aileron: number;
        rudder: number;
        throttle1: number;
        throttle2: number;
        flapLever: number;
        gearLever: 'UP' | 'DOWN';
        spoilers: number;
        brake: number;
        leftBrake?: number;
        rightBrake?: number;
      }

      type BrowserAutopilotCommands = Partial<Pick<BrowserControlInputs, 'elevator' | 'aileron' | 'throttle1' | 'throttle2'>>;

      interface BrowserAutopilotState {
        boeing: {
          speed: number | null;
          heading: number;
          altitude: number;
          autothrottleArm: boolean;
          speedMode: boolean;
          lnav: boolean;
          vnav: boolean;
          altHold: boolean;
          hdgSel: boolean;
          n1: boolean;
          cmdA: boolean;
          cmdB: boolean;
          cwsA: boolean;
          cwsB: boolean;
        };
        truth: {
          lateralActive: string;
          verticalActive: string;
          thrustActive: string;
          autopilotStatus: string;
        };
      }

      interface BrowserFlightPlan {
        origin: string;
        destination: string;
        waypoints: unknown[];
      }

      interface BrowserRouteStatus {
        routeName: string;
        lnavAvailable: boolean;
        activeLegIndex: number | null;
        fromIdent: string | null;
        nextWaypointIdent: string | null;
        distanceToNextNm: number | null;
        desiredTrackDegTrue: number | null;
        crossTrackErrorM: number | null;
        sequenced: boolean;
      }

      interface BrowserDerivedState {
        ias: number;
        vs: number;
      }

      interface BrowserGuidanceState {
        phase: string;
      }

      interface BrowserSimState {
        aircraft: BrowserAircraftState;
        inputs: BrowserControlInputs;
        pilotInputs: BrowserControlInputs;
        apCommands: BrowserAutopilotCommands;
        effectiveControls: BrowserControlInputs;
        apState: BrowserAutopilotState | null;
        flightPlan: BrowserFlightPlan | null;
        activeLegIndex: number | null;
        routeStatus: BrowserRouteStatus;
        wind: unknown;
        guidance: BrowserGuidanceState;
        status: string;
        lastFrameTime: number;
        fixedStepAccumulatorSeconds: number;
        droppedSimulationTimeSeconds: number;
        setScenario: (scenarioId: string) => void;
        setInput: (partial: Partial<BrowserControlInputs>) => void;
        setFlightPlan: (fp: BrowserFlightPlan | null) => void;
        setApState: (ap: BrowserAutopilotState | null) => void;
        reset: () => void;
        tick: (timestamp: number) => void;
      }

      interface BrowserSimStore {
        getState: () => BrowserSimState;
        setState: (partial: Partial<BrowserSimState> | ((state: BrowserSimState) => Partial<BrowserSimState>)) => void;
      }

      const simStoreModule = '/src/store/simStore.ts';
      const flightPlanModule = '/src/sim/flightPlanLoader.ts';
      const autopilotModule = '/src/instruments/defaultAutopilotState.ts';
      const derivedModule = '/src/sim/physics/derived.ts';
      const fmaTruthModule = '/src/sim/systems/fmaTruth.ts';
      const quaternionModule = '/src/sim/physics/quaternion.ts';

      const { useSimStore } = (await import(simStoreModule)) as { useSimStore: BrowserSimStore };
      const { createKseaKpdxFlight } = (await import(flightPlanModule)) as { createKseaKpdxFlight: () => BrowserFlightPlan };
      const { createDefaultAutopilotState } = (await import(autopilotModule)) as { createDefaultAutopilotState: () => BrowserAutopilotState };
      const { computeDerived } = (await import(derivedModule)) as { computeDerived: (aircraft: BrowserAircraftState, wind: unknown) => BrowserDerivedState };
      const { deriveDisplayFmaTruth } = (await import(fmaTruthModule)) as {
        deriveDisplayFmaTruth: (
          apState: BrowserAutopilotState | null,
          context: { aircraft: BrowserAircraftState; flightPlan: BrowserFlightPlan | null; routeStatus: BrowserRouteStatus },
        ) => { autopilotStatus: string; lateralActive: string; verticalActive: string; thrustActive: string };
      };
      const { eulerToQuat } = (await import(quaternionModule)) as { eulerToQuat: (phi: number, theta: number, psi: number) => unknown };

      const toRad = (deg: number): number => deg * Math.PI / 180;
      const flightPlan = createKseaKpdxFlight();
      const initialAltitudeFt = proofSetup.initialAltitudeFt ?? 5_000;
      const initialGroundAltFt = proofSetup.initialGroundAltFt ?? 500;
      const initialAglFt = proofSetup.initialAglFt ?? initialAltitudeFt - initialGroundAltFt;
      const initialFlapSetting = proofSetup.initialFlapSetting ?? 0;
      const initialGearDown = proofSetup.initialGearDown ?? false;
      const initialVelocity = proofSetup.initialVelocity ?? { u: 118, v: 0, w: 0 };
      let timestamp = performance.now();

      if (fixedStepSeconds <= 0) throw new Error(`Invalid fixed-step duration: ${fixedStepSeconds}`);
      if (!proofSetup.gates && !proofSetup.configuredApproach && (!proofSetup.routeFrames || proofSetup.routeFrames <= 0)) throw new Error(`Invalid route frame count: ${proofSetup.routeFrames}`);
      if (proofSetup.sampleIntervalFrames <= 0) throw new Error(`Invalid route sample interval: ${proofSetup.sampleIntervalFrames}`);
      if (proofSetup.configuredApproach) {
        if (proofSetup.configuredApproach.routeFrames <= 0) throw new Error(`Invalid configured approach frame count: ${proofSetup.configuredApproach.routeFrames}`);
        if (proofSetup.configuredApproach.sampleIntervalFrames <= 0) throw new Error(`Invalid configured approach sample interval: ${proofSetup.configuredApproach.sampleIntervalFrames}`);
      }
      for (const gate of proofSetup.gates ?? []) {
        if (gate.routeFrames <= 0) throw new Error(`Invalid gate frame count: ${gate.routeFrames}`);
        if (!Number.isInteger(gate.targetActiveLegIndex) || gate.targetActiveLegIndex < 0) {
          throw new Error(`Invalid target active leg index: ${gate.targetActiveLegIndex}`);
        }
      }

      const apState = createDefaultAutopilotState();
      apState.truth.autopilotStatus = 'CMD_A';
      apState.truth.lateralActive = 'LNAV';
      apState.truth.verticalActive = proofSetup.autopilotVerticalActive ?? 'ALT_HOLD';
      apState.truth.thrustActive = 'SPEED';
      apState.boeing.cmdA = true;
      apState.boeing.cmdB = false;
      apState.boeing.cwsA = false;
      apState.boeing.cwsB = false;
      apState.boeing.lnav = true;
      apState.boeing.hdgSel = false;
      apState.boeing.altHold = proofSetup.autopilotAltHold ?? true;
      apState.boeing.vnav = false;
      apState.boeing.speedMode = true;
      apState.boeing.n1 = false;
      apState.boeing.autothrottleArm = true;
      apState.boeing.speed = proofSetup.autopilotSpeedKt ?? 230;
      apState.boeing.heading = proofSetup.initialHeadingDeg;
      apState.boeing.altitude = initialAltitudeFt;

      useSimStore.getState().setScenario('ksea-tutorial');
      useSimStore.getState().setInput({
        elevator: 0,
        aileron: 0,
        rudder: 0,
        throttle1: 0.55,
        throttle2: 0.55,
        flapLever: initialFlapSetting,
        gearLever: initialGearDown ? 'DOWN' : 'UP',
        spoilers: 0,
        brake: 0,
        leftBrake: 0,
        rightBrake: 0,
        ...proofSetup.initialControls,
      });

      const configureAircraft = (position: { lat: number; lon: number }, headingDeg: number): void => {
        const routeHeadingRad = toRad(headingDeg);
        const pitchRad = toRad(proofSetup.initialPitchDeg ?? 0);
        useSimStore.setState((state) => {
          const aircraft = structuredClone(state.aircraft);
          aircraft.position = { lat: position.lat, lon: position.lon, alt: initialAltitudeFt };
          aircraft.velocity = initialVelocity;
          aircraft.attitude = { phi: 0, theta: pitchRad, psi: routeHeadingRad };
          aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
          aircraft.angularVel = { p: 0, q: 0, r: 0 };
          aircraft.config = {
            ...aircraft.config,
            gearDown: initialGearDown,
            flapSetting: initialFlapSetting,
            spoilersArmed: false,
            spoilersDeployed: false,
            speedBrake: 0,
          };
          aircraft.engines = [
            { ...aircraft.engines[0], n1: 62, n2: 66, egt: 720, running: true },
            { ...aircraft.engines[1], n1: 62, n2: 66, egt: 720, running: true },
          ];
          aircraft.ground = {
            ...aircraft.ground,
            aglFt: initialAglFt,
            groundAltFt: initialGroundAltFt,
            weightOnWheels: false,
            normalForceN: 0,
            contact: 'none',
            onRunway: false,
            gearStations: aircraft.ground.gearStations.map((station) => ({
              ...station,
              compressionM: 0,
              normalForceN: 0,
              weightOnWheel: false,
            })),
          };
          aircraft.flightPhase = proofSetup.initialFlightPhase ?? 'CRUISE';

          return {
            aircraft,
            status: 'running',
            lastFrameTime: timestamp,
            fixedStepAccumulatorSeconds: 0,
            droppedSimulationTimeSeconds: 0,
          };
        });
      };

      configureAircraft(proofSetup.initialPosition, proofSetup.initialHeadingDeg);

      useSimStore.getState().setFlightPlan(flightPlan);
      if (proofSetup.seedActiveLegIndex !== undefined) {
        useSimStore.setState({ activeLegIndex: proofSetup.seedActiveLegIndex });
      }
      useSimStore.getState().setApState(apState);
      if (proofSetup.seedActiveLegIndex !== undefined) {
        useSimStore.getState().setInput({
          flapLever: proofSetup.initialControls?.flapLever ?? initialFlapSetting,
          gearLever: proofSetup.initialControls?.gearLever ?? (initialGearDown ? 'DOWN' : 'UP'),
          brake: proofSetup.initialControls?.brake ?? 0,
          leftBrake: proofSetup.initialControls?.leftBrake ?? 0,
          rightBrake: proofSetup.initialControls?.rightBrake ?? 0,
          spoilers: proofSetup.initialControls?.spoilers ?? 0,
        });
      }

      const controlSnapshot = (controls: BrowserControlInputs): RouteProofControlSnapshot => ({
        elevator: controls.elevator,
        aileron: controls.aileron,
        rudder: controls.rudder,
        throttle1: controls.throttle1,
        throttle2: controls.throttle2,
        flapLever: controls.flapLever,
        gearLever: controls.gearLever,
        spoilers: controls.spoilers,
        brake: controls.brake,
        leftBrake: controls.leftBrake,
        rightBrake: controls.rightBrake,
      });

      const snapshot = (): RouteProofSnapshot => {
        const state = useSimStore.getState();
        const route = state.routeStatus;
        const fma = deriveDisplayFmaTruth(state.apState, {
          aircraft: state.aircraft,
          flightPlan: state.flightPlan,
          routeStatus: route,
        });
        const derived = computeDerived(state.aircraft, state.wind);

        if (route.activeLegIndex === null || route.distanceToNextNm === null) {
          throw new Error(`Expected active KSEA route status, received ${JSON.stringify(route)}`);
        }

        return {
          routeName: route.routeName,
          lnavAvailable: route.lnavAvailable,
          activeLegIndex: route.activeLegIndex,
          fromIdent: route.fromIdent,
          nextWaypointIdent: route.nextWaypointIdent,
          distanceToNextNm: route.distanceToNextNm,
          desiredTrackDegTrue: route.desiredTrackDegTrue,
          crossTrackErrorM: route.crossTrackErrorM,
          lateralActive: state.apState?.truth.lateralActive ?? 'OFF',
          fmaLateralActive: fma.lateralActive,
          autopilotStatus: state.apState?.truth.autopilotStatus ?? 'OFF',
          fmaAutopilotStatus: fma.autopilotStatus,
          thrustActive: state.apState?.truth.thrustActive ?? 'OFF',
          fmaThrustActive: fma.thrustActive,
          verticalActive: state.apState?.truth.verticalActive ?? 'OFF',
          fmaVerticalActive: fma.verticalActive,
          sequenced: route.sequenced,
          altitudeFt: state.aircraft.position.alt,
          aglFt: state.aircraft.ground.aglFt,
          iasKt: derived.ias,
          verticalSpeedFpm: derived.vs,
          weightOnWheels: state.aircraft.ground.weightOnWheels,
          gearDown: state.aircraft.config.gearDown,
          gearLever: state.inputs.gearLever,
          flapSetting: state.aircraft.config.flapSetting,
          flightPhase: state.aircraft.flightPhase,
          guidancePhase: state.guidance.phase,
          pilotInputs: controlSnapshot(state.pilotInputs),
          effectiveControls: controlSnapshot(state.effectiveControls),
          apCommandCount: Object.keys(state.apCommands).length,
        };
      };

      const resetSnapshot = (): RouteResetProofSnapshot => {
        const state = useSimStore.getState();
        const route = state.routeStatus;
        const fma = deriveDisplayFmaTruth(state.apState, {
          aircraft: state.aircraft,
          flightPlan: state.flightPlan,
          routeStatus: route,
        });

        if (state.flightPlan !== null || state.activeLegIndex !== null) {
          throw new Error(`Expected reset KSEA route state to be cleared, received ${JSON.stringify({ flightPlan: state.flightPlan, activeLegIndex: state.activeLegIndex, route }, null, 2)}`);
        }

        return {
          flightPlan: state.flightPlan,
          activeLegIndex: state.activeLegIndex,
          apStateCleared: state.apState === null,
          routeName: route.routeName,
          lnavAvailable: route.lnavAvailable,
          lateralActive: state.apState?.truth.lateralActive ?? 'OFF',
          fmaLateralActive: fma.lateralActive,
          autopilotStatus: state.apState?.truth.autopilotStatus ?? 'OFF',
          fmaAutopilotStatus: fma.autopilotStatus,
          thrustActive: state.apState?.truth.thrustActive ?? 'OFF',
          fmaThrustActive: fma.thrustActive,
          verticalActive: state.apState?.truth.verticalActive ?? 'OFF',
          fmaVerticalActive: fma.verticalActive,
          weightOnWheels: state.aircraft.ground.weightOnWheels,
          flightPhase: state.aircraft.flightPhase,
          guidancePhase: state.guidance.phase,
          status: state.status,
          pilotInputs: controlSnapshot(state.pilotInputs),
          effectiveControls: controlSnapshot(state.effectiveControls),
          apCommandCount: Object.keys(state.apCommands).length,
        };
      };
      const samples: RouteProofSnapshot[] = [];

      const tickOnce = (): void => {
        timestamp += fixedStepMs;
        useSimStore.getState().tick(timestamp);
      };

      if (proofSetup.seedActiveLegIndex !== undefined) {
        tickOnce();
      }

      samples.push(snapshot());

      const runFrames = (routeFrames: number): void => {
        for (let frame = 1; frame <= routeFrames; frame += 1) {
          tickOnce();

          if (frame % proofSetup.sampleIntervalFrames === 0 || frame === routeFrames) {
            samples.push(snapshot());
          }
        }
      };

      const runConfiguredApproach = (approachSetup: RouteConfiguredApproachSetup, initial: RouteProofSnapshot): RouteProofSnapshot => {
        useSimStore.getState().setInput(approachSetup.controls);

        for (let frame = 1; frame <= approachSetup.routeFrames; frame += 1) {
          tickOnce();
          const current = snapshot();

          if (frame % approachSetup.sampleIntervalFrames === 0 || frame === approachSetup.routeFrames) {
            samples.push(current);
          }

          if (
            current.routeName === 'KSEA→KPDX'
            && current.activeLegIndex === 2
            && current.fromIdent === 'BTG'
            && current.nextWaypointIdent === 'KPDX'
            && current.lnavAvailable
            && current.fmaLateralActive === 'LNAV'
            && current.autopilotStatus === 'CMD_A'
            && current.fmaAutopilotStatus === 'CMD_A'
            && current.thrustActive === 'SPEED'
            && current.fmaThrustActive === 'SPEED'
            && current.verticalActive === 'OFF'
            && current.fmaVerticalActive === 'OFF'
            && current.distanceToNextNm < initial.distanceToNextNm - 0.5
            && current.altitudeFt < initial.altitudeFt - 100
            && current.aglFt < initial.aglFt - 100
            && current.gearDown
            && current.gearLever === 'DOWN'
            && current.flapSetting >= 25
            && !current.weightOnWheels
            && current.guidancePhase === 'approach'
            && current.flightPhase !== 'LANDED'
          ) {
            if (samples[samples.length - 1] !== current) samples.push(current);
            return current;
          }
        }

        throw new Error(`KSEA final route configured approach proof did not reach target state: ${JSON.stringify({ initial, current: snapshot(), samples }, null, 2)}`);
      };

      const runManualHandoff = (handoffSetup: RouteManualHandoffSetup): RouteProofSnapshot => {
        useSimStore.getState().setInput({ elevator: handoffSetup.elevator });
        tickOnce();

        const current = snapshot();
        samples.push(current);

        if (
          current.routeName === 'KSEA→KPDX'
          && current.activeLegIndex === 2
          && current.fromIdent === 'BTG'
          && current.nextWaypointIdent === 'KPDX'
          && current.lnavAvailable
          && current.autopilotStatus === 'OFF'
          && current.fmaAutopilotStatus === 'OFF'
          && current.lateralActive === 'OFF'
          && current.fmaLateralActive === 'OFF'
          && current.verticalActive === 'OFF'
          && current.fmaVerticalActive === 'OFF'
          && current.thrustActive === 'OFF'
          && current.fmaThrustActive === 'OFF'
          && current.apCommandCount === 0
          && current.pilotInputs.elevator === current.effectiveControls.elevator
          && current.pilotInputs.aileron === current.effectiveControls.aileron
          && current.pilotInputs.throttle1 === current.effectiveControls.throttle1
          && current.pilotInputs.throttle2 === current.effectiveControls.throttle2
          && !current.weightOnWheels
          && current.flightPhase !== 'LANDED'
        ) {
          return current;
        }

        throw new Error(`KSEA final route manual handoff proof did not reach target state: ${JSON.stringify({ current, samples }, null, 2)}`);
      };

      const runGate = (gate: NonNullable<RouteProofSetup['gates']>[number]): void => {
        if (gate.reposition) {
          configureAircraft(gate.reposition.position, gate.reposition.headingDeg);
        }

        const startingLeg = useSimStore.getState().routeStatus.activeLegIndex;
        if (startingLeg === gate.targetActiveLegIndex) {
          throw new Error(`KSEA route gate already at target leg ${gate.targetActiveLegIndex}: ${JSON.stringify(snapshot())}`);
        }

        for (let frame = 1; frame <= gate.routeFrames; frame += 1) {
          const previousLeg = useSimStore.getState().routeStatus.activeLegIndex;
          tickOnce();
          const currentLeg = useSimStore.getState().routeStatus.activeLegIndex;

          if (currentLeg !== previousLeg || frame % proofSetup.sampleIntervalFrames === 0 || frame === gate.routeFrames) {
            samples.push(snapshot());
          }

          if (currentLeg === gate.targetActiveLegIndex) return;
          if (currentLeg !== null && currentLeg > gate.targetActiveLegIndex) {
            throw new Error(`KSEA route gate skipped target leg ${gate.targetActiveLegIndex}: ${JSON.stringify(snapshot())}`);
          }
        }

        throw new Error(`KSEA route gate did not reach target leg ${gate.targetActiveLegIndex}: ${JSON.stringify(samples, null, 2)}`);
      };

      if (proofSetup.gates) {
        for (const gate of proofSetup.gates) {
          runGate(gate);
        }
      } else if (proofSetup.configuredApproach) {
        const configuredApproach = runConfiguredApproach(proofSetup.configuredApproach, samples[0]);
        if (proofSetup.manualHandoff) {
          const manualHandoff = runManualHandoff(proofSetup.manualHandoff);
          if (proofSetup.resetAfterManualHandoff) {
            useSimStore.getState().reset();
            const reset = resetSnapshot();
            if (
              reset.routeName === 'NO ROUTE'
              && !reset.lnavAvailable
              && reset.apStateCleared
              && reset.autopilotStatus === 'OFF'
              && reset.fmaAutopilotStatus === 'OFF'
              && reset.lateralActive === 'OFF'
              && reset.fmaLateralActive === 'OFF'
              && reset.verticalActive === 'OFF'
              && reset.fmaVerticalActive === 'OFF'
              && reset.thrustActive === 'OFF'
              && reset.fmaThrustActive === 'OFF'
              && reset.apCommandCount === 0
              && reset.status === 'stopped'
              && reset.guidancePhase === 'preflight'
              && reset.weightOnWheels
            ) {
              return { configuredApproach, manualHandoff, reset, samples };
            }
            throw new Error(`KSEA final route manual handoff reset proof did not reach target state: ${JSON.stringify({ reset, samples }, null, 2)}`);
          }
          return { configuredApproach, manualHandoff, samples };
        }
        return { initial: samples[0], configuredApproach, samples };
      } else {
        runFrames(proofSetup.routeFrames ?? 0);
      }

      return { initial: samples[0], final: samples[samples.length - 1], samples };
    },
    { fixedStepSeconds: FIXED_STEP_SECONDS, fixedStepMs: FIXED_STEP_MS, proofSetup: setup },
  );
}

export async function flyKseaRouteWithLnav(page: Page): Promise<RouteProofResult> {
  return flyKseaRouteProof(page, KSEA_ROUTE_PROOF);
}

export async function flyKseaRouteThroughFirstSequence(page: Page): Promise<RouteProofResult> {
  return flyKseaRouteProof(page, KSEA_FIRST_SEQUENCE_PROOF);
}

export async function flyKseaRouteThroughSecondSequence(page: Page): Promise<RouteProofResult> {
  return flyKseaRouteProof(page, KSEA_SECOND_SEQUENCE_PROOF);
}

export async function flyKseaRouteThroughMultiGateProgression(page: Page): Promise<RouteProofResult> {
  return flyKseaRouteProof(page, KSEA_MULTI_GATE_PROGRESSION_PROOF);
}

export async function flyKseaFinalRouteToConfiguredApproach(page: Page): Promise<RouteConfiguredApproachProofResult> {
  if (!KSEA_FINAL_ROUTE_CONFIGURED_APPROACH_PROOF.configuredApproach) {
    throw new Error('KSEA configured approach proof setup is missing configured approach settings.');
  }
  return flyKseaRouteProof(page, KSEA_FINAL_ROUTE_CONFIGURED_APPROACH_PROOF as RouteProofSetup & { configuredApproach: RouteConfiguredApproachSetup });
}

export async function flyKseaFinalRouteApproachToManualHandoff(page: Page): Promise<RouteManualHandoffProofResult> {
  if (!KSEA_FINAL_ROUTE_CONFIGURED_APPROACH_PROOF.configuredApproach) {
    throw new Error('KSEA configured approach proof setup is missing configured approach settings.');
  }
  return flyKseaRouteProof(page, {
    ...KSEA_FINAL_ROUTE_CONFIGURED_APPROACH_PROOF,
    manualHandoff: KSEA_FINAL_ROUTE_MANUAL_HANDOFF_PROOF,
  } as RouteProofSetup & { configuredApproach: RouteConfiguredApproachSetup; manualHandoff: RouteManualHandoffSetup });
}

export async function flyKseaFinalRouteApproachManualHandoffAndReset(page: Page): Promise<RouteManualHandoffResetProofResult> {
  if (!KSEA_FINAL_ROUTE_CONFIGURED_APPROACH_PROOF.configuredApproach) {
    throw new Error('KSEA configured approach proof setup is missing configured approach settings.');
  }
  return flyKseaRouteProof(page, {
    ...KSEA_FINAL_ROUTE_CONFIGURED_APPROACH_PROOF,
    manualHandoff: KSEA_FINAL_ROUTE_MANUAL_HANDOFF_PROOF,
    resetAfterManualHandoff: true,
  } as RouteProofSetup & { configuredApproach: RouteConfiguredApproachSetup; manualHandoff: RouteManualHandoffSetup; resetAfterManualHandoff: true });
}
