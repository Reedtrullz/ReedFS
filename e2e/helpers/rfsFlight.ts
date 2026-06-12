import type { Page } from '@playwright/test';

export interface FlightSnapshot {
  iasKt: number;
  altitudeFt: number;
  aglFt: number;
  verticalSpeedFpm: number;
  weightOnWheels: boolean;
  gearDown: boolean;
  gearLever: 'UP' | 'DOWN';
  phase: string;
  coachMessage: string;
  checklistLabels: string[];
}

export interface LandingSnapshot {
  iasKt: number;
  groundSpeedKt: number;
  altitudeFt: number;
  aglFt: number;
  verticalSpeedFpm: number;
  weightOnWheels: boolean;
  onRunway: boolean;
  gearDown: boolean;
  gearLever: 'UP' | 'DOWN';
  flapSetting: number;
  status: string;
  flightPhase: string;
  groundContact: string;
  touchdownSinkRateMps: number;
  guidancePhase: string;
  autopilotCleared: boolean;
  routeCleared: boolean;
}

export interface LandingProofResult {
  approach: LandingSnapshot;
  touchdown: LandingSnapshot;
  rollout: LandingSnapshot;
  reset: LandingSnapshot;
}

export interface DescentLandingProofResult {
  descent: LandingSnapshot;
  configuredApproach: LandingSnapshot;
  touchdown: LandingSnapshot;
  rollout: LandingSnapshot;
  reset: LandingSnapshot;
}

type FlightHelperMode = 'configure' | 'fly';

const FIXED_STEP_SECONDS = 1 / 60;
const FIXED_STEP_MS = 1000 / 60;
const TAKEOFF_FLAPS = 5;
const TAKEOFF_TRIM_UNITS = 5;
const TRIM_DELTA_UNITS = 0.1;
const ROTATION_IAS_KT = 135;
const MAX_FLIGHT_FRAMES = 60 * 120;

async function runFlightHelper(page: Page, mode: FlightHelperMode): Promise<FlightSnapshot | null> {
  return page.evaluate(
    async ({
      fixedStepSeconds,
      fixedStepMs,
      takeoffFlaps,
      takeoffTrimUnits,
      trimDeltaUnits,
      rotationIasKt,
      maxFlightFrames,
      helperMode,
    }): Promise<FlightSnapshot | null> => {
      interface BrowserAircraftState {
        position: { alt: number };
        config: { gearDown: boolean; flapSetting: number; stabilizerTrimUnits: number };
        ground: { aglFt: number; weightOnWheels: boolean };
      }

      interface BrowserControlInputs {
        throttle1: number;
        throttle2: number;
        flapLever: number;
        gearLever: 'UP' | 'DOWN';
        elevator: number;
        brake: number;
        leftBrake?: number;
        rightBrake?: number;
        spoilers: number;
      }

      interface BrowserGuidanceState {
        phase: string;
        coachMessage: string;
        checklist: Array<{ label: string }>;
      }

      interface BrowserSimState {
        aircraft: BrowserAircraftState;
        inputs: BrowserControlInputs;
        wind: unknown;
        guidance: BrowserGuidanceState;
        startTakeoffRoll: () => void;
        reset: () => void;
        setInput: (partial: Partial<BrowserControlInputs>) => void;
        applyInputActions: (actions: { trimDelta?: number }, dt: number) => void;
        tick: (timestamp: number) => void;
      }

      interface BrowserSimStore {
        getState: () => BrowserSimState;
        setState: (partial: { lastFrameTime: number; fixedStepAccumulatorSeconds: number }) => void;
      }

      interface BrowserDerivedState {
        ias: number;
        vs: number;
      }

      const simStoreModule = '/src/store/simStore.ts';
      const derivedModule = '/src/sim/physics/derived.ts';
      const simStoreImport = (await import(simStoreModule)) as { useSimStore: BrowserSimStore };
      const derivedImport = (await import(derivedModule)) as {
        computeDerived: (aircraft: BrowserAircraftState, wind: unknown) => BrowserDerivedState;
      };
      const { useSimStore } = simStoreImport;
      const { computeDerived } = derivedImport;

      let timestamp = performance.now();

      const syncManualClock = (): void => {
        useSimStore.setState({
          lastFrameTime: timestamp,
          fixedStepAccumulatorSeconds: 0,
        });
      };

      const stepFrame = (): void => {
        timestamp += fixedStepMs;
        useSimStore.getState().tick(timestamp);
      };

      const snapshot = (): FlightSnapshot => {
        const state = useSimStore.getState();
        const derived = computeDerived(state.aircraft, state.wind);

        return {
          iasKt: derived.ias,
          altitudeFt: state.aircraft.position.alt,
          aglFt: state.aircraft.ground.aglFt,
          verticalSpeedFpm: derived.vs,
          weightOnWheels: state.aircraft.ground.weightOnWheels,
          gearDown: state.aircraft.config.gearDown,
          gearLever: state.inputs.gearLever,
          phase: state.guidance.phase,
          coachMessage: state.guidance.coachMessage,
          checklistLabels: state.guidance.checklist.map((item) => item.label),
        };
      };

      const setManualTakeoffConfiguration = (): void => {
        useSimStore.getState().reset();
        useSimStore.getState().startTakeoffRoll();
        useSimStore.getState().setInput({
          flapLever: takeoffFlaps,
          throttle1: 1,
          throttle2: 1,
          gearLever: 'DOWN',
          elevator: 0,
          brake: 0,
          leftBrake: 0,
          rightBrake: 0,
          spoilers: 0,
        });

        const trimSteps = Math.round(takeoffTrimUnits / trimDeltaUnits);
        for (let step = 0; step < trimSteps; step += 1) {
          useSimStore.getState().applyInputActions({ trimDelta: trimDeltaUnits }, fixedStepSeconds);
        }

        timestamp = performance.now();
        syncManualClock();
        stepFrame();
      };

      setManualTakeoffConfiguration();
      if (helperMode === 'configure') return null;

      let rotated = false;
      let gearRaised = false;
      let finalSnapshot = snapshot();

      for (let frame = 0; frame < maxFlightFrames; frame += 1) {
        const beforeTick = snapshot();

        if (!rotated && beforeTick.iasKt >= rotationIasKt) {
          useSimStore.getState().setInput({ elevator: -1 });
          rotated = true;
        }

        if (!gearRaised && !beforeTick.weightOnWheels) {
          useSimStore.getState().setInput({ elevator: 0, gearLever: 'UP' });
          gearRaised = true;
        }

        stepFrame();
        finalSnapshot = snapshot();

        if (!gearRaised && !finalSnapshot.weightOnWheels) {
          useSimStore.getState().setInput({ elevator: 0, gearLever: 'UP' });
          gearRaised = true;
          stepFrame();
          finalSnapshot = snapshot();
        }

        if (
          gearRaised &&
          finalSnapshot.phase === 'climb' &&
          finalSnapshot.aglFt > 200 &&
          finalSnapshot.verticalSpeedFpm > 0 &&
          !finalSnapshot.weightOnWheels &&
          !finalSnapshot.gearDown &&
          finalSnapshot.gearLever === 'UP'
        ) {
          useSimStore.getState().setInput({ elevator: 0 });
          return finalSnapshot;
        }
      }

      throw new Error(`Unable to reach clean climb: ${JSON.stringify(finalSnapshot)}`);
    },
    {
      fixedStepSeconds: FIXED_STEP_SECONDS,
      fixedStepMs: FIXED_STEP_MS,
      takeoffFlaps: TAKEOFF_FLAPS,
      takeoffTrimUnits: TAKEOFF_TRIM_UNITS,
      trimDeltaUnits: TRIM_DELTA_UNITS,
      rotationIasKt: ROTATION_IAS_KT,
      maxFlightFrames: MAX_FLIGHT_FRAMES,
      helperMode: mode,
    },
  );
}

export async function setManualTakeoffConfiguration(page: Page): Promise<void> {
  await runFlightHelper(page, 'configure');
}

export async function flyEnvaTakeoffToCleanClimb(page: Page): Promise<FlightSnapshot> {
  const snapshot = await runFlightHelper(page, 'fly');
  if (!snapshot) throw new Error('Flight helper did not return a snapshot.');
  return snapshot;
}

export async function flyApproachToLandingRolloutAndReset(page: Page): Promise<LandingProofResult> {
  return page.evaluate(async ({ fixedStepMs }): Promise<LandingProofResult> => {
    interface BrowserAircraftState {
      position: { lat: number; lon: number; alt: number };
      velocity: { u: number; v: number; w: number };
      attitude: { phi: number; theta: number; psi: number };
      quaternion: { q0: number; q1: number; q2: number; q3: number };
      angularVel: { p: number; q: number; r: number };
      config: {
        gearDown: boolean;
        flapSetting: number;
        spoilersArmed: boolean;
        spoilersDeployed: boolean;
        speedBrake: number;
        stabilizerTrimUnits: number;
      };
      engines: [
        { n1: number; n2: number; egt: number; fuelFlow: number; thrust: number; running: boolean },
        { n1: number; n2: number; egt: number; fuelFlow: number; thrust: number; running: boolean },
      ];
      ground: {
        aglFt: number;
        groundAltFt: number;
        weightOnWheels: boolean;
        normalForceN: number;
        lastTouchdownSinkRateMps: number;
        onRunway: boolean;
        contact: string;
        gearStations: Array<{ compressionM: number; normalForceN: number; weightOnWheel: boolean }>;
      };
      flightPhase: string;
    }

    interface BrowserControlInputs {
      throttle1: number;
      throttle2: number;
      flapLever: number;
      gearLever: 'UP' | 'DOWN';
      elevator: number;
      aileron: number;
      rudder: number;
      brake: number;
      leftBrake?: number;
      rightBrake?: number;
      spoilers: number;
    }

    interface BrowserGuidanceState {
      phase: string;
    }

    interface BrowserSimState {
      aircraft: BrowserAircraftState;
      inputs: BrowserControlInputs;
      pilotInputs: BrowserControlInputs;
      effectiveControls: BrowserControlInputs;
      status: string;
      wind: unknown;
      guidance: BrowserGuidanceState;
      apState: unknown | null;
      flightPlan: unknown | null;
      activeLegIndex: number | null;
      reset: () => void;
      setInput: (partial: Partial<BrowserControlInputs>) => void;
      setScenario: (scenarioId: string) => void;
      tick: (timestamp: number) => void;
    }

    type BrowserStorePatch = Partial<BrowserSimState & { lastFrameTime: number; fixedStepAccumulatorSeconds: number }>;
    interface BrowserSimStore {
      getState: () => BrowserSimState;
      setState: (partial: BrowserStorePatch | ((state: BrowserSimState) => BrowserStorePatch)) => void;
    }

    interface BrowserDerivedState {
      ias: number;
      gs: number;
      vs: number;
    }

    interface RunwayReference {
      start: { lat: number; lon: number; altFt: number };
      headingDeg: number;
      elevationFt: number;
    }

    const simStoreModule = '/src/store/simStore.ts';
    const derivedModule = '/src/sim/physics/derived.ts';
    const quaternionModule = '/src/sim/physics/quaternion.ts';
    const runwayDataModule = '/src/viewport/runwayData.ts';
    const simStoreImport = (await import(simStoreModule)) as { useSimStore: BrowserSimStore };
    const derivedImport = (await import(derivedModule)) as {
      computeDerived: (aircraft: BrowserAircraftState, wind: unknown) => BrowserDerivedState;
    };
    const quaternionImport = (await import(quaternionModule)) as {
      eulerToQuat: (phi: number, theta: number, psi: number) => BrowserAircraftState['quaternion'];
    };
    const runwayDataImport = (await import(runwayDataModule)) as { ENVA_RUNWAY_09: RunwayReference };
    const { useSimStore } = simStoreImport;
    const { computeDerived } = derivedImport;
    const { eulerToQuat } = quaternionImport;
    const { ENVA_RUNWAY_09 } = runwayDataImport;

    let timestamp = performance.now();
    const syncManualClock = (): void => {
      useSimStore.setState({ lastFrameTime: timestamp, fixedStepAccumulatorSeconds: 0 });
    };
    const stepFrame = (): void => {
      timestamp += fixedStepMs;
      useSimStore.getState().tick(timestamp);
    };
    const offsetRunwayPosition = (runway: RunwayReference, alongTrackM: number, lateralOffsetM: number): { lat: number; lon: number; alt: number } => {
      const headingRad = runway.headingDeg * Math.PI / 180;
      const northM = Math.cos(headingRad) * alongTrackM - Math.sin(headingRad) * lateralOffsetM;
      const eastM = Math.sin(headingRad) * alongTrackM + Math.cos(headingRad) * lateralOffsetM;
      const metersPerDegreeLat = 111_320;
      const metersPerDegreeLon = 111_320 * Math.cos(runway.start.lat * Math.PI / 180);
      return {
        lat: runway.start.lat + northM / metersPerDegreeLat,
        lon: runway.start.lon + eastM / metersPerDegreeLon,
        alt: runway.elevationFt,
      };
    };
    const snapshot = (): LandingSnapshot => {
      const state = useSimStore.getState();
      const derived = computeDerived(state.aircraft, state.wind);
      return {
        iasKt: derived.ias,
        groundSpeedKt: derived.gs,
        altitudeFt: state.aircraft.position.alt,
        aglFt: state.aircraft.ground.aglFt,
        verticalSpeedFpm: derived.vs,
        weightOnWheels: state.aircraft.ground.weightOnWheels,
        onRunway: state.aircraft.ground.onRunway,
        gearDown: state.aircraft.config.gearDown,
        gearLever: state.inputs.gearLever,
        flapSetting: state.aircraft.config.flapSetting,
        status: state.status,
        flightPhase: state.aircraft.flightPhase,
        groundContact: state.aircraft.ground.contact,
        touchdownSinkRateMps: state.aircraft.ground.lastTouchdownSinkRateMps,
        guidancePhase: state.guidance.phase,
        autopilotCleared: state.apState === null,
        routeCleared: state.flightPlan === null && state.activeLegIndex === null,
      };
    };

    useSimStore.getState().setScenario('enva-tutorial');
    useSimStore.getState().reset();

    const approachPosition = offsetRunwayPosition(ENVA_RUNWAY_09, 220, 0);
    const headingRad = ENVA_RUNWAY_09.headingDeg * Math.PI / 180;
    const pitchRad = 2 * Math.PI / 180;
    const approachControls: BrowserControlInputs = {
      throttle1: 0.22,
      throttle2: 0.22,
      flapLever: 30,
      gearLever: 'DOWN',
      elevator: 0,
      aileron: 0,
      rudder: 0,
      brake: 0,
      leftBrake: 0,
      rightBrake: 0,
      spoilers: 0,
    };

    useSimStore.setState((state) => {
      const aircraft = structuredClone(state.aircraft);
      aircraft.position = { ...approachPosition, alt: ENVA_RUNWAY_09.elevationFt + 120 };
      aircraft.attitude = { phi: 0, theta: pitchRad, psi: headingRad };
      aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
      aircraft.velocity = { u: 72, v: 0, w: 2.8 };
      aircraft.angularVel = { p: 0, q: 0, r: 0 };
      aircraft.config = {
        ...aircraft.config,
        gearDown: true,
        flapSetting: 30,
        spoilersArmed: false,
        spoilersDeployed: false,
        speedBrake: 0,
        stabilizerTrimUnits: 5,
      };
      aircraft.engines = [
        { ...aircraft.engines[0], n1: 38, n2: 42, egt: 580, fuelFlow: 0, thrust: 0, running: true },
        { ...aircraft.engines[1], n1: 38, n2: 42, egt: 580, fuelFlow: 0, thrust: 0, running: true },
      ];
      aircraft.ground = {
        ...aircraft.ground,
        aglFt: 120,
        groundAltFt: ENVA_RUNWAY_09.elevationFt,
        weightOnWheels: false,
        normalForceN: 0,
        lastTouchdownSinkRateMps: 0,
        onRunway: false,
        contact: 'none',
        gearStations: aircraft.ground.gearStations.map((station) => ({
          ...station,
          compressionM: 0,
          normalForceN: 0,
          weightOnWheel: false,
        })),
      };
      aircraft.flightPhase = 'APPROACH';

      return {
        aircraft,
        inputs: approachControls,
        pilotInputs: approachControls,
        effectiveControls: approachControls,
        apState: null,
        flightPlan: null,
        activeLegIndex: null,
        status: 'running',
        lastFrameTime: timestamp,
        fixedStepAccumulatorSeconds: 0,
      };
    });

    // Direct state seeding intentionally bypasses store actions; immediately
    // re-apply the same pilot controls through the store so guidance derives
    // from the seeded APPROACH/running aircraft before the first physics tick.
    useSimStore.getState().setInput(approachControls);

    syncManualClock();
    stepFrame();
    const approach = snapshot();
    if (approach.guidancePhase !== 'approach' || approach.weightOnWheels || approach.aglFt <= 50) {
      throw new Error(`Unable to seed airborne approach proof state: ${JSON.stringify(approach)}`);
    }

    let touchdown: LandingSnapshot | null = null;
    for (let frame = 0; frame < 60 * 45; frame += 1) {
      stepFrame();
      const current = snapshot();
      if (current.flightPhase === 'LANDED' && current.groundContact === 'gear' && current.weightOnWheels) {
        if (!current.onRunway || current.touchdownSinkRateMps >= 15) {
          throw new Error(`Touchdown outside scoped proof bounds: ${JSON.stringify(current)}`);
        }
        touchdown = current;
        break;
      }
    }
    if (!touchdown) throw new Error(`Unable to reach touchdown: ${JSON.stringify(snapshot())}`);

    useSimStore.getState().setInput({ throttle1: 0, throttle2: 0, brake: 1, leftBrake: 1, rightBrake: 1, spoilers: 1, elevator: 0 });
    let rollout = snapshot();
    for (let frame = 0; frame < 60 * 35; frame += 1) {
      stepFrame();
      rollout = snapshot();
      if (
        rollout.groundSpeedKt < touchdown.groundSpeedKt - 8
        && (rollout.guidancePhase === 'landing-rollout' || rollout.guidancePhase === 'landed')
      ) {
        break;
      }
    }
    if (rollout.groundSpeedKt >= touchdown.groundSpeedKt - 8) {
      throw new Error(`Unable to slow rollout under braking: ${JSON.stringify({ touchdown, rollout })}`);
    }

    useSimStore.getState().reset();
    const reset = snapshot();

    return { approach, touchdown, rollout, reset };
  }, { fixedStepMs: FIXED_STEP_MS });
}

export async function flyDescentApproachToLandingRolloutAndReset(page: Page): Promise<DescentLandingProofResult> {
  return page.evaluate(async ({ fixedStepMs }): Promise<DescentLandingProofResult> => {
    interface BrowserAircraftState {
      position: { lat: number; lon: number; alt: number };
      velocity: { u: number; v: number; w: number };
      attitude: { phi: number; theta: number; psi: number };
      quaternion: { q0: number; q1: number; q2: number; q3: number };
      angularVel: { p: number; q: number; r: number };
      config: {
        gearDown: boolean;
        flapSetting: number;
        spoilersArmed: boolean;
        spoilersDeployed: boolean;
        speedBrake: number;
        stabilizerTrimUnits: number;
      };
      engines: [
        { n1: number; n2: number; egt: number; fuelFlow: number; thrust: number; running: boolean },
        { n1: number; n2: number; egt: number; fuelFlow: number; thrust: number; running: boolean },
      ];
      ground: {
        aglFt: number;
        groundAltFt: number;
        weightOnWheels: boolean;
        normalForceN: number;
        lastTouchdownSinkRateMps: number;
        onRunway: boolean;
        contact: string;
        gearStations: Array<{ compressionM: number; normalForceN: number; weightOnWheel: boolean }>;
      };
      flightPhase: string;
    }

    interface BrowserControlInputs {
      throttle1: number;
      throttle2: number;
      flapLever: number;
      gearLever: 'UP' | 'DOWN';
      elevator: number;
      aileron: number;
      rudder: number;
      brake: number;
      leftBrake?: number;
      rightBrake?: number;
      spoilers: number;
    }

    interface BrowserGuidanceState {
      phase: string;
    }

    interface BrowserSimState {
      aircraft: BrowserAircraftState;
      inputs: BrowserControlInputs;
      pilotInputs: BrowserControlInputs;
      effectiveControls: BrowserControlInputs;
      status: string;
      wind: unknown;
      guidance: BrowserGuidanceState;
      apState: unknown | null;
      flightPlan: unknown | null;
      activeLegIndex: number | null;
      reset: () => void;
      setInput: (partial: Partial<BrowserControlInputs>) => void;
      setScenario: (scenarioId: string) => void;
      tick: (timestamp: number) => void;
    }

    type BrowserStorePatch = Partial<BrowserSimState & { lastFrameTime: number; fixedStepAccumulatorSeconds: number }>;
    interface BrowserSimStore {
      getState: () => BrowserSimState;
      setState: (partial: BrowserStorePatch | ((state: BrowserSimState) => BrowserStorePatch)) => void;
    }

    interface BrowserDerivedState {
      ias: number;
      gs: number;
      vs: number;
    }

    interface RunwayReference {
      start: { lat: number; lon: number; altFt: number };
      headingDeg: number;
      elevationFt: number;
    }

    const simStoreModule = '/src/store/simStore.ts';
    const derivedModule = '/src/sim/physics/derived.ts';
    const quaternionModule = '/src/sim/physics/quaternion.ts';
    const runwayDataModule = '/src/viewport/runwayData.ts';
    const simStoreImport = (await import(simStoreModule)) as { useSimStore: BrowserSimStore };
    const derivedImport = (await import(derivedModule)) as {
      computeDerived: (aircraft: BrowserAircraftState, wind: unknown) => BrowserDerivedState;
    };
    const quaternionImport = (await import(quaternionModule)) as {
      eulerToQuat: (phi: number, theta: number, psi: number) => BrowserAircraftState['quaternion'];
    };
    const runwayDataImport = (await import(runwayDataModule)) as { ENVA_RUNWAY_09: RunwayReference };
    const { useSimStore } = simStoreImport;
    const { computeDerived } = derivedImport;
    const { eulerToQuat } = quaternionImport;
    const { ENVA_RUNWAY_09 } = runwayDataImport;

    let timestamp = performance.now();
    const syncManualClock = (): void => {
      useSimStore.setState({ lastFrameTime: timestamp, fixedStepAccumulatorSeconds: 0 });
    };
    const stepFrame = (): void => {
      timestamp += fixedStepMs;
      useSimStore.getState().tick(timestamp);
    };
    const offsetRunwayPosition = (runway: RunwayReference, alongTrackM: number, lateralOffsetM: number): { lat: number; lon: number; alt: number } => {
      const headingRad = runway.headingDeg * Math.PI / 180;
      const northM = Math.cos(headingRad) * alongTrackM - Math.sin(headingRad) * lateralOffsetM;
      const eastM = Math.sin(headingRad) * alongTrackM + Math.cos(headingRad) * lateralOffsetM;
      const metersPerDegreeLat = 111_320;
      const metersPerDegreeLon = 111_320 * Math.cos(runway.start.lat * Math.PI / 180);
      return {
        lat: runway.start.lat + northM / metersPerDegreeLat,
        lon: runway.start.lon + eastM / metersPerDegreeLon,
        alt: runway.elevationFt,
      };
    };
    const snapshot = (): LandingSnapshot => {
      const state = useSimStore.getState();
      const derived = computeDerived(state.aircraft, state.wind);
      return {
        iasKt: derived.ias,
        groundSpeedKt: derived.gs,
        altitudeFt: state.aircraft.position.alt,
        aglFt: state.aircraft.ground.aglFt,
        verticalSpeedFpm: derived.vs,
        weightOnWheels: state.aircraft.ground.weightOnWheels,
        onRunway: state.aircraft.ground.onRunway,
        gearDown: state.aircraft.config.gearDown,
        gearLever: state.inputs.gearLever,
        flapSetting: state.aircraft.config.flapSetting,
        status: state.status,
        flightPhase: state.aircraft.flightPhase,
        groundContact: state.aircraft.ground.contact,
        touchdownSinkRateMps: state.aircraft.ground.lastTouchdownSinkRateMps,
        guidancePhase: state.guidance.phase,
        autopilotCleared: state.apState === null,
        routeCleared: state.flightPlan === null && state.activeLegIndex === null,
      };
    };

    useSimStore.getState().setScenario('enva-tutorial');
    useSimStore.getState().reset();

    const descentPosition = offsetRunwayPosition(ENVA_RUNWAY_09, -300, 0);
    const headingRad = ENVA_RUNWAY_09.headingDeg * Math.PI / 180;
    const pitchRad = 2 * Math.PI / 180;
    const seedControls: BrowserControlInputs = {
      throttle1: 0.65,
      throttle2: 0.65,
      flapLever: 5,
      gearLever: 'UP',
      elevator: -0.15,
      aileron: 0,
      rudder: 0,
      brake: 0,
      leftBrake: 0,
      rightBrake: 0,
      spoilers: 0,
    };

    useSimStore.setState((state) => {
      const aircraft = structuredClone(state.aircraft);
      aircraft.position = { ...descentPosition, alt: ENVA_RUNWAY_09.elevationFt + 301 };
      aircraft.attitude = { phi: 0, theta: pitchRad, psi: headingRad };
      aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
      aircraft.velocity = { u: 72, v: 0, w: 0.3 };
      aircraft.angularVel = { p: 0, q: 0, r: 0 };
      aircraft.config = {
        ...aircraft.config,
        gearDown: false,
        flapSetting: 5,
        spoilersArmed: false,
        spoilersDeployed: false,
        speedBrake: 0,
        stabilizerTrimUnits: 5,
      };
      aircraft.engines = [
        { ...aircraft.engines[0], n1: 38, n2: 42, egt: 580, fuelFlow: 0, thrust: 0, running: true },
        { ...aircraft.engines[1], n1: 38, n2: 42, egt: 580, fuelFlow: 0, thrust: 0, running: true },
      ];
      aircraft.ground = {
        ...aircraft.ground,
        aglFt: 301,
        groundAltFt: ENVA_RUNWAY_09.elevationFt,
        weightOnWheels: false,
        normalForceN: 0,
        lastTouchdownSinkRateMps: 0,
        onRunway: false,
        contact: 'none',
        gearStations: aircraft.ground.gearStations.map((station) => ({
          ...station,
          compressionM: 0,
          normalForceN: 0,
          weightOnWheel: false,
        })),
      };
      aircraft.flightPhase = 'DESCENT';

      return {
        aircraft,
        inputs: seedControls,
        pilotInputs: seedControls,
        effectiveControls: seedControls,
        apState: null,
        flightPlan: null,
        activeLegIndex: null,
        status: 'running',
        lastFrameTime: timestamp,
        fixedStepAccumulatorSeconds: 0,
      };
    });

    // Direct state seeding intentionally creates only the initial DESCENT state;
    // re-apply the same pilot controls through the store so guidance and derived
    // control slices are synchronized before the first proof snapshot.
    useSimStore.getState().setInput(seedControls);
    syncManualClock();
    stepFrame();
    const descent = snapshot();
    if (
      descent.flightPhase !== 'DESCENT'
      || descent.guidancePhase !== 'approach'
      || descent.weightOnWheels
      || descent.aglFt <= 300
      || !descent.autopilotCleared
      || !descent.routeCleared
    ) {
      throw new Error(`Unable to seed airborne descent proof state: ${JSON.stringify(descent)}`);
    }

    useSimStore.getState().setInput({
      throttle1: 0.65,
      throttle2: 0.65,
      flapLever: 30,
      gearLever: 'DOWN',
      brake: 0,
      leftBrake: 0,
      rightBrake: 0,
      spoilers: 0,
      elevator: -0.15,
    });

    let configuredApproach: LandingSnapshot | null = null;
    for (let frame = 0; frame < 60 * 18; frame += 1) {
      stepFrame();
      const current = snapshot();
      if (
        current.flightPhase === 'DESCENT'
        && current.guidancePhase === 'approach'
        && current.gearDown
        && current.gearLever === 'DOWN'
        && current.flapSetting >= 25
        && !current.weightOnWheels
        && current.aglFt < descent.aglFt - 20
        && current.verticalSpeedFpm < 0
      ) {
        configuredApproach = current;
        break;
      }
    }
    if (!configuredApproach) {
      throw new Error(`Unable to configure descent proof approach: ${JSON.stringify({ descent, current: snapshot() })}`);
    }

    let touchdown: LandingSnapshot | null = null;
    for (let frame = 0; frame < 60 * 70; frame += 1) {
      const beforeTick = snapshot();
      if (!beforeTick.weightOnWheels && beforeTick.aglFt < 120) {
        useSimStore.getState().setInput({ throttle1: 0.65, throttle2: 0.65, elevator: -0.8 });
      }
      stepFrame();
      const current = snapshot();
      if (current.flightPhase === 'LANDED' && current.groundContact === 'gear' && current.weightOnWheels) {
        if (!current.onRunway || current.touchdownSinkRateMps >= 15) {
          throw new Error(`Descent proof touchdown outside scoped proof bounds: ${JSON.stringify(current)}`);
        }
        touchdown = current;
        break;
      }
    }
    if (!touchdown) throw new Error(`Unable to reach touchdown from descent proof state: ${JSON.stringify(snapshot())}`);

    useSimStore.getState().setInput({ throttle1: 0, throttle2: 0, brake: 1, leftBrake: 1, rightBrake: 1, spoilers: 1, elevator: 0 });
    let rollout = snapshot();
    for (let frame = 0; frame < 60 * 35; frame += 1) {
      stepFrame();
      rollout = snapshot();
      if (
        rollout.groundSpeedKt < touchdown.groundSpeedKt - 8
        && (rollout.guidancePhase === 'landing-rollout' || rollout.guidancePhase === 'landed')
      ) {
        break;
      }
    }
    if (rollout.groundSpeedKt >= touchdown.groundSpeedKt - 8) {
      throw new Error(`Unable to slow descent proof rollout under braking: ${JSON.stringify({ touchdown, rollout })}`);
    }

    useSimStore.getState().reset();
    const reset = snapshot();

    return { descent, configuredApproach, touchdown, rollout, reset };
  }, { fixedStepMs: FIXED_STEP_MS });
}
