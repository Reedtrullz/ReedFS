import type { SimStatus } from './simulationStatus';
import { buildGuidanceChecklist, coachMessageForState, type ChecklistItem } from './checklistCoach';
import type { FlightScenario, ScenarioTutorialStep } from './scenarios';
import type { AircraftState, ControlInputs } from './types';
import {
  clampTutorialStepIndex,
  createTutorialState,
  currentTutorialStep,
  type TutorialState,
} from './tutorialState';

export type GuidancePhase = 'preflight' | 'takeoff-roll' | 'rotation' | 'rejected-takeoff' | 'positive-rate' | 'climb';

export interface GuidanceNotice {
  id: string;
  level: 'info' | 'caution' | 'warning';
  message: string;
}

export interface GuidanceState {
  scenarioId: string;
  phase: GuidancePhase;
  tutorial: TutorialState;
  activeTutorialStep: ScenarioTutorialStep | null;
  checklist: ChecklistItem[];
  coachMessage: string;
  alerts: GuidanceNotice[];
}

export interface GuidanceStateInput {
  scenario: FlightScenario;
  status: SimStatus;
  aircraft: AircraftState;
  controls: ControlInputs;
  tutorialStepIndex?: number;
}

const MS_TO_KT = 1.94384449;
const ROTATION_SPEED_KT = 135;
const ROTATION_PITCH_RAD = 5 * Math.PI / 180;

export function deriveGuidancePhase(
  status: SimStatus,
  aircraft: AircraftState,
  controls: ControlInputs,
): GuidancePhase {
  if (status === 'stopped') return 'preflight';

  const airborne = !aircraft.ground.weightOnWheels || aircraft.ground.aglFt > 5;
  if (airborne) {
    return aircraft.config.gearDown || controls.gearLever === 'DOWN' ? 'positive-rate' : 'climb';
  }

  const speedKt = Math.max(0, aircraft.velocity.u) * MS_TO_KT;
  const rejectedTakeoff = status === 'running'
    && aircraft.flightPhase === 'TAKEOFF'
    && controls.brake >= 0.8
    && Math.max(controls.throttle1, controls.throttle2) <= 0.2
    && controls.spoilers >= 0.95;
  if (rejectedTakeoff) return 'rejected-takeoff';

  if (speedKt >= ROTATION_SPEED_KT || aircraft.attitude.theta >= ROTATION_PITCH_RAD) return 'rotation';

  const takeoffThrust = Math.max(controls.throttle1, controls.throttle2) >= 0.9;
  if (status === 'running' || aircraft.flightPhase === 'TAKEOFF' || takeoffThrust) return 'takeoff-roll';

  return 'preflight';
}

function tutorialStepIndexForPhase(scenario: FlightScenario, phase: GuidancePhase): number {
  const preferredStepId = (() => {
    switch (phase) {
      case 'preflight':
        return 'line-up';
      case 'takeoff-roll':
      case 'rotation':
      case 'rejected-takeoff':
        return 'advance-thrust';
      case 'positive-rate':
      case 'climb':
        return 'rotate-positive-rate';
      default:
        return 'line-up';
    }
  })();

  const index = scenario.tutorialSteps.findIndex((step) => step.id === preferredStepId);
  return index >= 0 ? index : 0;
}

export function buildGuidanceState({
  scenario,
  status,
  aircraft,
  controls,
  tutorialStepIndex,
}: GuidanceStateInput): GuidanceState {
  const phase = deriveGuidancePhase(status, aircraft, controls);
  const baseTutorial = createTutorialState(scenario);
  const requestedTutorialStepIndex = tutorialStepIndex ?? tutorialStepIndexForPhase(scenario, phase);
  const tutorial: TutorialState = {
    ...baseTutorial,
    stepIndex: clampTutorialStepIndex(baseTutorial, requestedTutorialStepIndex),
  };

  return {
    scenarioId: scenario.id,
    phase,
    tutorial,
    activeTutorialStep: currentTutorialStep(tutorial),
    checklist: buildGuidanceChecklist(scenario, aircraft, controls, phase),
    coachMessage: coachMessageForState(status, aircraft, controls, scenario),
    alerts: [],
  };
}

export const createGuidanceState = buildGuidanceState;

export function rebuildGuidanceState(
  _current: GuidanceState,
  input: Omit<GuidanceStateInput, 'tutorialStepIndex'> & { tutorialStepIndex?: number },
): GuidanceState {
  return buildGuidanceState({
    ...input,
    tutorialStepIndex: input.tutorialStepIndex,
  });
}
