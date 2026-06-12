import type { Page } from '@playwright/test';

export interface RouteProofSnapshot {
  routeName: string;
  lnavAvailable: boolean;
  activeLegIndex: number;
  distanceToNextNm: number;
  desiredTrackDegTrue: number | null;
  crossTrackErrorM: number | null;
  lateralActive: string;
  fmaLateralActive: string;
  altitudeFt: number;
  iasKt: number;
}

export interface RouteProofResult {
  initial: RouteProofSnapshot;
  final: RouteProofSnapshot;
  samples: RouteProofSnapshot[];
}

const FIXED_STEP_SECONDS = 1 / 60;
const FIXED_STEP_MS = 1000 / 60;
const ROUTE_FRAMES = 60 * 35;

export async function flyKseaRouteWithLnav(page: Page): Promise<RouteProofResult> {
  return page.evaluate(
    async ({ fixedStepSeconds, fixedStepMs, routeFrames }): Promise<RouteProofResult> => {
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
        distanceToNextNm: number | null;
        desiredTrackDegTrue: number | null;
        crossTrackErrorM: number | null;
      }

      interface BrowserDerivedState {
        ias: number;
      }

      interface BrowserSimState {
        aircraft: BrowserAircraftState;
        inputs: BrowserControlInputs;
        apState: BrowserAutopilotState | null;
        flightPlan: BrowserFlightPlan | null;
        routeStatus: BrowserRouteStatus;
        wind: unknown;
        status: string;
        lastFrameTime: number;
        fixedStepAccumulatorSeconds: number;
        droppedSimulationTimeSeconds: number;
        setScenario: (scenarioId: string) => void;
        setInput: (partial: Partial<BrowserControlInputs>) => void;
        setFlightPlan: (fp: BrowserFlightPlan | null) => void;
        setApState: (ap: BrowserAutopilotState | null) => void;
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
        ) => { lateralActive: string };
      };
      const { eulerToQuat } = (await import(quaternionModule)) as { eulerToQuat: (phi: number, theta: number, psi: number) => unknown };

      const toRad = (deg: number): number => deg * Math.PI / 180;
      const flightPlan = createKseaKpdxFlight();
      const routeHeadingRad = toRad(219);
      const initialAltitudeFt = 5_000;
      let timestamp = performance.now();

      if (fixedStepSeconds <= 0) throw new Error(`Invalid fixed-step duration: ${fixedStepSeconds}`);

      const apState = createDefaultAutopilotState();
      apState.truth.autopilotStatus = 'CMD_A';
      apState.truth.lateralActive = 'LNAV';
      apState.truth.verticalActive = 'ALT_HOLD';
      apState.truth.thrustActive = 'SPEED';
      apState.boeing.cmdA = true;
      apState.boeing.cmdB = false;
      apState.boeing.cwsA = false;
      apState.boeing.cwsB = false;
      apState.boeing.lnav = true;
      apState.boeing.hdgSel = false;
      apState.boeing.altHold = true;
      apState.boeing.vnav = false;
      apState.boeing.speedMode = true;
      apState.boeing.n1 = false;
      apState.boeing.autothrottleArm = true;
      apState.boeing.speed = 230;
      apState.boeing.heading = 219;
      apState.boeing.altitude = initialAltitudeFt;

      useSimStore.getState().setScenario('ksea-tutorial');
      useSimStore.getState().setFlightPlan(flightPlan);
      useSimStore.getState().setInput({
        elevator: 0,
        aileron: 0,
        rudder: 0,
        throttle1: 0.55,
        throttle2: 0.55,
        flapLever: 0,
        gearLever: 'UP',
        spoilers: 0,
        brake: 0,
        leftBrake: 0,
        rightBrake: 0,
      });

      useSimStore.setState((state) => {
        const aircraft = structuredClone(state.aircraft);
        aircraft.position = { lat: 47.445, lon: -122.315, alt: initialAltitudeFt };
        aircraft.velocity = { u: 118, v: 0, w: 0 };
        aircraft.attitude = { phi: 0, theta: 0, psi: routeHeadingRad };
        aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
        aircraft.angularVel = { p: 0, q: 0, r: 0 };
        aircraft.config = {
          ...aircraft.config,
          gearDown: false,
          flapSetting: 0,
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
          aglFt: 4_500,
          groundAltFt: 500,
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
        aircraft.flightPhase = 'CRUISE';

        return {
          aircraft,
          status: 'running',
          lastFrameTime: timestamp,
          fixedStepAccumulatorSeconds: 0,
          droppedSimulationTimeSeconds: 0,
        };
      });

      useSimStore.getState().setFlightPlan(flightPlan);
      useSimStore.getState().setApState(apState);

      const snapshot = (): RouteProofSnapshot => {
        const state = useSimStore.getState();
        const route = state.routeStatus;
        const fma = deriveDisplayFmaTruth(state.apState, {
          aircraft: state.aircraft,
          flightPlan,
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
          distanceToNextNm: route.distanceToNextNm,
          desiredTrackDegTrue: route.desiredTrackDegTrue,
          crossTrackErrorM: route.crossTrackErrorM,
          lateralActive: state.apState?.truth.lateralActive ?? 'OFF',
          fmaLateralActive: fma.lateralActive,
          altitudeFt: state.aircraft.position.alt,
          iasKt: derived.ias,
        };
      };

      const samples: RouteProofSnapshot[] = [snapshot()];

      for (let frame = 1; frame <= routeFrames; frame += 1) {
        timestamp += fixedStepMs;
        useSimStore.getState().tick(timestamp);

        if (frame % 300 === 0 || frame === routeFrames) {
          samples.push(snapshot());
        }
      }

      return { initial: samples[0], final: samples[samples.length - 1], samples };
    },
    { fixedStepSeconds: FIXED_STEP_SECONDS, fixedStepMs: FIXED_STEP_MS, routeFrames: ROUTE_FRAMES },
  );
}
