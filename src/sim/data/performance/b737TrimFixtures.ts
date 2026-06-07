export interface B737TrimFixture {
  id: string;
  description: string;
  altitudeFt: number;
  iasKt: number;
  grossWeightKg: number;
  cgPercentMac: number;
  flapSetting: number;
  gearDown: boolean;
  angleOfAttackRad: number;
  expectedTrimUnits: [number, number];
  expectedLiftToWeight: [number, number];
}

export const b737TrimFixtures: B737TrimFixture[] = [
  {
    id: 'b737-800-clean-220kt-10000ft',
    description: 'Clean pitch-trim fixture at moderate weight and 10,000 ft; lift/weight bounds capture the current RFS gameplay aero baseline after IAS-to-TAS conversion.',
    altitudeFt: 10_000,
    iasKt: 220,
    grossWeightKg: 65_000,
    cgPercentMac: 25,
    flapSetting: 0,
    gearDown: false,
    angleOfAttackRad: 0.09554,
    expectedTrimUnits: [2, 4],
    expectedLiftToWeight: [1.30, 1.40],
  },
];
