export interface TakeoffEnvelope {
  name: string;
  grossWeightKg: number;
  flapSetting: number;
  fieldElevationFt: number;
  targetSpeedAt20sKt: [number, number];
  targetVrKt: [number, number];
  initialClimbVsFpm: [number, number];
  initialClimbAoADeg: [number, number];
}

export const b737TakeoffProfiles: TakeoffEnvelope[] = [
  {
    name: 'Light takeoff - low payload/fuel, flaps 5',
    grossWeightKg: 50_000,
    flapSetting: 5,
    fieldElevationFt: 432, // KSEA runway elevation used by the current ground model
    targetSpeedAt20sKt: [135, 160],
    targetVrKt: [135, 150],
    initialClimbVsFpm: [1_500, 5_000],
    initialClimbAoADeg: [0.1, 5],
  },
  {
    name: 'Medium takeoff - default tutorial weight, flaps 5',
    grossWeightKg: 62_300,
    flapSetting: 5,
    fieldElevationFt: 432, // KSEA runway elevation used by the current ground model
    targetSpeedAt20sKt: [105, 135],
    targetVrKt: [145, 155],
    initialClimbVsFpm: [800, 4_000],
    initialClimbAoADeg: [1, 7],
  },
  {
    name: 'Heavy takeoff - near MTOW, flaps 5',
    grossWeightKg: 78_000,
    flapSetting: 5,
    fieldElevationFt: 432, // KSEA runway elevation used by the current ground model
    targetSpeedAt20sKt: [80, 110],
    targetVrKt: [165, 175],
    initialClimbVsFpm: [500, 3_500],
    initialClimbAoADeg: [2, 9],
  },
];
