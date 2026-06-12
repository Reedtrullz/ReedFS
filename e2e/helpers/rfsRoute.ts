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
  sequenced: boolean;
  altitudeFt: number;
  iasKt: number;
}

export interface RouteProofResult {
  initial: RouteProofSnapshot;
  final: RouteProofSnapshot;
  samples: RouteProofSnapshot[];
}

interface RouteProofSetup {
  initialPosition: { lat: number; lon: number };
  initialHeadingDeg: number;
  routeFrames?: number;
  sampleIntervalFrames: number;
  gates?: RouteProofGateSetup[];
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

async function flyKseaRouteProof(page: Page, setup: RouteProofSetup): Promise<RouteProofResult> {
  return page.evaluate(
    async ({ fixedStepSeconds, fixedStepMs, proofSetup }): Promise<RouteProofResult> => {
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
        fromIdent: string | null;
        nextWaypointIdent: string | null;
        distanceToNextNm: number | null;
        desiredTrackDegTrue: number | null;
        crossTrackErrorM: number | null;
        sequenced: boolean;
      }

      interface BrowserDerivedState {
        ias: number;
      }

      interface BrowserSimState {
        aircraft: BrowserAircraftState;
        inputs: BrowserControlInputs;
        apState: BrowserAutopilotState | null;
        flightPlan: BrowserFlightPlan | null;
        activeLegIndex: number | null;
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
      const initialAltitudeFt = 5_000;
      let timestamp = performance.now();

      if (fixedStepSeconds <= 0) throw new Error(`Invalid fixed-step duration: ${fixedStepSeconds}`);
      if (!proofSetup.gates && (!proofSetup.routeFrames || proofSetup.routeFrames <= 0)) throw new Error(`Invalid route frame count: ${proofSetup.routeFrames}`);
      if (proofSetup.sampleIntervalFrames <= 0) throw new Error(`Invalid route sample interval: ${proofSetup.sampleIntervalFrames}`);
      for (const gate of proofSetup.gates ?? []) {
        if (gate.routeFrames <= 0) throw new Error(`Invalid gate frame count: ${gate.routeFrames}`);
        if (!Number.isInteger(gate.targetActiveLegIndex) || gate.targetActiveLegIndex < 0) {
          throw new Error(`Invalid target active leg index: ${gate.targetActiveLegIndex}`);
        }
      }

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
      apState.boeing.heading = proofSetup.initialHeadingDeg;
      apState.boeing.altitude = initialAltitudeFt;

      useSimStore.getState().setScenario('ksea-tutorial');
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

      const configureAircraft = (position: { lat: number; lon: number }, headingDeg: number): void => {
        const routeHeadingRad = toRad(headingDeg);
        useSimStore.setState((state) => {
          const aircraft = structuredClone(state.aircraft);
          aircraft.position = { lat: position.lat, lon: position.lon, alt: initialAltitudeFt };
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
      };

      configureAircraft(proofSetup.initialPosition, proofSetup.initialHeadingDeg);

      useSimStore.getState().setFlightPlan(flightPlan);
      useSimStore.getState().setApState(apState);

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
          sequenced: route.sequenced,
          altitudeFt: state.aircraft.position.alt,
          iasKt: derived.ias,
        };
      };
      const samples: RouteProofSnapshot[] = [snapshot()];

      const tickOnce = (): void => {
        timestamp += fixedStepMs;
        useSimStore.getState().tick(timestamp);
      };

      const runFrames = (routeFrames: number): void => {
        for (let frame = 1; frame <= routeFrames; frame += 1) {
          tickOnce();

          if (frame % proofSetup.sampleIntervalFrames === 0 || frame === routeFrames) {
            samples.push(snapshot());
          }
        }
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
