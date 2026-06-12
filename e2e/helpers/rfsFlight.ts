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
