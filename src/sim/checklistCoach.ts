import type { AircraftState, ControlInputs } from './types';
import type { FlightScenario } from './scenarios';
import type { SimStatus } from './simulationStatus';

type GuidanceChecklistPhase = 'preflight' | 'takeoff-roll' | 'rotation' | 'rejected-takeoff' | 'positive-rate' | 'climb';

export interface ChecklistItem {
  id: string;
  label: string;
  complete: boolean;
  detail: string;
}

function nearlyEqual(a: number, b: number, epsilon = 0.15): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function buildTakeoffChecklist(
  scenario: FlightScenario,
  aircraft: AircraftState,
  controls: ControlInputs,
): ChecklistItem[] {
  return [
    {
      id: 'flaps',
      label: 'Flaps set for takeoff',
      complete: nearlyEqual(controls.flapLever, scenario.flapSetting) && nearlyEqual(aircraft.config.flapSetting, scenario.flapSetting),
      detail: `Need flaps ${scenario.flapSetting}`,
    },
    {
      id: 'gear',
      label: 'Gear down',
      complete: controls.gearLever === 'DOWN' && aircraft.config.gearDown,
      detail: 'Keep gear down until positive rate',
    },
    {
      id: 'trim',
      label: 'Stabilizer trim set',
      complete: nearlyEqual(aircraft.config.stabilizerTrimUnits, scenario.stabilizerTrimUnits, 0.25),
      detail: `Target ${scenario.stabilizerTrimUnits.toFixed(1)} units`,
    },
    {
      id: 'speedbrakes',
      label: 'Speedbrakes retracted',
      complete: controls.spoilers <= 0.05 && !aircraft.config.spoilersDeployed,
      detail: 'Spoilers down for takeoff',
    },
  ];
}

export function buildGuidanceChecklist(
  scenario: FlightScenario,
  aircraft: AircraftState,
  controls: ControlInputs,
  phase: GuidanceChecklistPhase,
): ChecklistItem[] {
  if (phase === 'positive-rate') {
    return [
      {
        id: 'positive-rate',
        label: 'Positive rate established',
        complete: !aircraft.ground.weightOnWheels && aircraft.ground.aglFt > 10,
        detail: 'Confirm climb before retracting gear',
      },
      {
        id: 'gear-up-after-positive-rate',
        label: 'Gear up after positive rate',
        complete: controls.gearLever === 'UP' && !aircraft.config.gearDown,
        detail: 'Select gear UP after positive rate',
      },
    ];
  }

  if (phase === 'climb') {
    return [
      {
        id: 'positive-rate',
        label: 'Positive rate established',
        complete: !aircraft.ground.weightOnWheels && aircraft.ground.aglFt > 10,
        detail: 'Maintain stable climb',
      },
      {
        id: 'gear-up',
        label: 'Gear up',
        complete: controls.gearLever === 'UP' && !aircraft.config.gearDown,
        detail: 'Gear should be up in initial climb',
      },
      {
        id: 'flaps-takeoff',
        label: 'Takeoff flaps still set',
        complete: nearlyEqual(aircraft.config.flapSetting, scenario.flapSetting),
        detail: `Keep flaps ${scenario.flapSetting} until cleanup altitude`,
      },
    ];
  }

  return buildTakeoffChecklist(scenario, aircraft, controls);
}

export function coachMessageForState(
  status: SimStatus,
  aircraft: AircraftState,
  controls: ControlInputs,
  scenario?: FlightScenario,
): string {
  const throttle = Math.max(controls.throttle1, controls.throttle2);

  if (status !== 'running') {
    if (scenario) {
      const firstIncomplete = buildTakeoffChecklist(scenario, aircraft, controls).find((item) => !item.complete);
      if (firstIncomplete) return `${firstIncomplete.label}: ${firstIncomplete.detail}.`;
    }
    return 'Checklist complete. Press START ROLL when ready.';
  }

  const rejectedTakeoff = aircraft.flightPhase === 'TAKEOFF' && controls.brake >= 0.8 && throttle <= 0.2 && controls.spoilers >= 0.95;
  if (rejectedTakeoff) return 'Rejected takeoff: hold brakes, keep centerline, and use RESET once stopped.';

  if (aircraft.ground.weightOnWheels && scenario) {
    const checklist = buildTakeoffChecklist(scenario, aircraft, controls);
    const needsFlaps = checklist.some((item) => item.id === 'flaps' && !item.complete);
    const needsTrim = checklist.some((item) => item.id === 'trim' && !item.complete);
    if (aircraft.flightPhase === 'TAKEOFF' && (needsFlaps || needsTrim) && throttle < 0.2) {
      return `Set flaps ${scenario.flapSetting}, trim ${scenario.stabilizerTrimUnits.toFixed(1)}, then advance takeoff thrust smoothly.`;
    }
    const firstIncomplete = checklist.find((item) => !item.complete);
    if (firstIncomplete) return `${firstIncomplete.label}: ${firstIncomplete.detail}.`;
  }

  if (throttle < 0.9) return 'Set takeoff thrust smoothly, then keep the runway centerline.';
  if (aircraft.ground.weightOnWheels) return 'Track centerline, monitor IAS, and rotate gently at VR.';
  if (aircraft.config.gearDown) return 'Positive rate: raise the gear and hold a stable climb attitude.';
  return 'Climb stable. Keep pitch changes small and follow the next tutorial step.';
}
