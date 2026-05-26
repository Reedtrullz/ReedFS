import type { AircraftState, ControlInputs } from '../sim/types';

const ENGINE_SPIN_RATE_RAD_PER_SECOND = 40;
const MAX_FLAP_DEFLECTION_RAD = 40 * Math.PI / 180;
const MAX_AILERON_DEFLECTION_RAD = 22 * Math.PI / 180;
const MAX_ELEVATOR_DEFLECTION_RAD = 25 * Math.PI / 180;
const MAX_RUDDER_DEFLECTION_RAD = 25 * Math.PI / 180;
const COMPRESSED_GEAR_SCALE_Z = 0.7;

type AircraftVisualAircraft = Pick<AircraftState, 'engines' | 'simTime' | 'ground' | 'config'> & {
  electrical?: Pick<AircraftState['electrical'], 'batteryVolts' | 'acBusPowered'>;
};

export interface AircraftVisualState {
  gear: {
    visible: boolean;
    extensionFraction: number;
    compressionScaleZ: number;
  };
  flaps: {
    deflectionRad: number;
  };
  controls: {
    leftAileronRad: number;
    rightAileronRad: number;
    leftElevatorRad: number;
    rightElevatorRad: number;
    rudderRad: number;
  };
  fans: {
    leftRotationRad: number;
    rightRotationRad: number;
  };
  lights: {
    navVisible: boolean;
    beaconVisible: boolean;
    landingVisible: boolean;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizedControls(aircraft: AircraftVisualAircraft, controls?: Partial<ControlInputs>): ControlInputs {
  return {
    elevator: controls?.elevator ?? 0,
    aileron: controls?.aileron ?? 0,
    rudder: controls?.rudder ?? 0,
    throttle1: controls?.throttle1 ?? 0,
    throttle2: controls?.throttle2 ?? 0,
    flapLever: controls?.flapLever ?? aircraft.config.flapSetting,
    gearLever: controls?.gearLever ?? (aircraft.config.gearDown ? 'DOWN' : 'UP'),
    spoilers: controls?.spoilers ?? 0,
    brake: controls?.brake ?? 0,
  };
}

function isPowered(aircraft: AircraftVisualAircraft): boolean {
  const electrical = aircraft.electrical;
  if (!electrical) return true;
  return electrical.acBusPowered || electrical.batteryVolts > 20;
}

function gearExtensionFraction(configGearDown: boolean, lever: ControlInputs['gearLever']): number {
  if (configGearDown && lever === 'DOWN') return 1;
  if (!configGearDown && lever === 'UP') return 0;
  // No dedicated transition timer exists yet. A lever/actual-position mismatch is the
  // deterministic visual transition fraction until the gear system models transit time.
  return 0.5;
}

export function createAircraftVisualState(
  aircraft: AircraftVisualAircraft,
  controls?: Partial<ControlInputs>,
): AircraftVisualState {
  const effective = normalizedControls(aircraft, controls);
  const extensionFraction = gearExtensionFraction(aircraft.config.gearDown, effective.gearLever);
  const gearVisible = extensionFraction > 0;
  const onCompressibleGear = extensionFraction >= 0.95 && aircraft.ground.weightOnWheels && aircraft.ground.aglFt < 5;
  const powerAvailable = isPowered(aircraft);
  const simSeconds = aircraft.simTime / 1000;
  const beaconPhaseSeconds = ((simSeconds % 1) + 1) % 1;

  const flapFraction = clamp(effective.flapLever / 40, 0, 1);
  const aileron = clamp(effective.aileron, -1, 1);
  const elevator = clamp(effective.elevator, -1, 1);
  const rudder = clamp(effective.rudder, -1, 1);

  return {
    gear: {
      visible: gearVisible,
      extensionFraction,
      compressionScaleZ: onCompressibleGear ? COMPRESSED_GEAR_SCALE_Z : 1,
    },
    flaps: {
      deflectionRad: flapFraction * MAX_FLAP_DEFLECTION_RAD,
    },
    controls: {
      leftAileronRad: aileron * MAX_AILERON_DEFLECTION_RAD,
      rightAileronRad: -aileron * MAX_AILERON_DEFLECTION_RAD,
      leftElevatorRad: elevator * MAX_ELEVATOR_DEFLECTION_RAD,
      rightElevatorRad: elevator * MAX_ELEVATOR_DEFLECTION_RAD,
      rudderRad: rudder * MAX_RUDDER_DEFLECTION_RAD,
    },
    fans: {
      leftRotationRad: simSeconds * clamp((aircraft.engines[0]?.n1 ?? 0) / 100, 0, 1.1) * ENGINE_SPIN_RATE_RAD_PER_SECOND,
      rightRotationRad: simSeconds * clamp((aircraft.engines[1]?.n1 ?? 0) / 100, 0, 1.1) * ENGINE_SPIN_RATE_RAD_PER_SECOND,
    },
    lights: {
      navVisible: powerAvailable,
      beaconVisible: powerAvailable && beaconPhaseSeconds < 0.5,
      landingVisible: powerAvailable && gearVisible,
    },
  };
}
