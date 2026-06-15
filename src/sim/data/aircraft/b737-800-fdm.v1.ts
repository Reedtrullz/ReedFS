import type { AeroModel } from '../../systems/AeroModel';
import { B737_800_AIRCRAFT_DATA } from './b737-800.v1';
import type { ConfigurationTransitModelData, EngineModelData, FdmLineageMetadata, FdmSourceMetadata, GearStationDefinition, GroundModelData } from './fdmTypes';

export const B737_800_FDM_DATA_VERSION = '1.0.0';

export interface VersionedAircraftFdmData {
  schemaVersion: 1;
  dataVersion: string;
  id: string;
  aircraftDataId: string;
  name: string;
  lineage: FdmLineageMetadata;
  aero: AeroModel & FdmSourceMetadata;
  configuration: ConfigurationTransitModelData;
  engine: EngineModelData;
  gearStations: GearStationDefinition[];
  ground: GroundModelData;
}

const RFS_PLACEHOLDER_SOURCE_ID = 'rfs-gameplay-calibrated-placeholder-v1';

const lineage: FdmLineageMetadata = {
  sourceReferences: [
    {
      id: RFS_PLACEHOLDER_SOURCE_ID,
      title: 'RFS gameplay-calibrated placeholder FDM constants',
      role: 'lineage',
      classification: 'gameplay-calibrated',
      confidence: 'low',
      notes: 'Values are RFS gameplay-calibrated placeholder engineering estimates migrated from the pre-lineage simulator constants. They are not certified Boeing data and must not be treated as aircraft operating or maintenance data.',
    },
  ],
  notes: [
    'Current B737-800 FDM values are RFS gameplay-calibrated placeholder engineering estimates, preserved to keep existing simulator behavior stable while adding data lineage.',
    'This dataset is not certified Boeing data and is not suitable for real-world flight operations, training, dispatch, maintenance, or engineering decisions.',
    'Future audited values should replace these constants with source-specific references and confidence levels per data group.',
  ],
};

const sourceReferenceIds = [RFS_PLACEHOLDER_SOURCE_ID];
const sourceRefsForSection = (): string[] => [...sourceReferenceIds];

const sourceMetadataFor = (sectionName: string): FdmSourceMetadata => ({
  sourceQuality: 'gameplay-calibrated',
  sourceRefs: sourceRefsForSection(),
  claimBoundary: `${sectionName} values are gameplay placeholders preserved for RFS simulator behavior only; they are not certified, not AFM data, not an AFM table, not Boeing-published operating data, and must not be used to claim real 737-800 performance fidelity.`,
  lastReviewed: '2026-06-13',
});

export const B737_800_FDM: VersionedAircraftFdmData = {
  schemaVersion: 1,
  dataVersion: B737_800_FDM_DATA_VERSION,
  id: 'b737-800-fdm',
  aircraftDataId: B737_800_AIRCRAFT_DATA.id,
  name: 'Boeing 737-800 RFS placeholder FDM',
  lineage,
  aero: {
    ...sourceMetadataFor('Aerodynamic coefficient and control-response'),
    // Flap polars are intentionally broad B737-ish gameplay values, not certification data.
    // They give the physics a finite CLmax, more drag with high-lift devices, and
    // flap-specific pitch moments so takeoff/climb tuning has real envelopes.
    flapPolars: [
      { detent: 0, alphaZeroLiftRad: -0.065, clAlpha: 5.5, clMax: 1.55, cd0: 0.020, k: 0.045, deltaCm: 0.0, stallDragRise: 0.55 },
      { detent: 1, alphaZeroLiftRad: -0.075, clAlpha: 5.55, clMax: 1.65, cd0: 0.022, k: 0.047, deltaCm: -0.005, stallDragRise: 0.60 },
      { detent: 5, alphaZeroLiftRad: -0.140, clAlpha: 5.45, clMax: 2.05, cd0: 0.030, k: 0.052, deltaCm: -0.020, stallDragRise: 0.75 },
      { detent: 15, alphaZeroLiftRad: -0.160, clAlpha: 5.30, clMax: 2.25, cd0: 0.058, k: 0.072, deltaCm: -0.060, stallDragRise: 0.95 },
      { detent: 30, alphaZeroLiftRad: -0.190, clAlpha: 5.10, clMax: 2.45, cd0: 0.095, k: 0.095, deltaCm: -0.110, stallDragRise: 1.20 },
      { detent: 40, alphaZeroLiftRad: -0.200, clAlpha: 5.00, clMax: 2.55, cd0: 0.125, k: 0.115, deltaCm: -0.145, stallDragRise: 1.35 },
    ],
    // Gameplay-calibrated placeholder: keeps gear-down initial-climb samples
    // below the documented P0 envelope until source-backed drag data replaces it.
    gearCd: 0.08,
    speedBrakeCd: 0.04,
    // Gameplay-calibrated placeholder: landing spoilers dump a substantial
    // fraction of positive wing lift so rollout/RTO braking receives realistic
    // wheel loading. Not AFM/Boeing data.
    speedBrakeLiftDumpFraction: 0.35,
    cm0: 0.08,
    cmAlpha: -1.2,
    cmElevator: -1.2,
    cmq: -36,
    clBeta: -0.08,
    clAileron: 0.06,
    clp: -0.4,
    cnBeta: 0.12,
    cnRudder: -0.07,
    cnr: -0.15,
    elevator: {
      maxDeflectionRad: 0.3,
      noseUpFadeStartRad: 8 * Math.PI / 180,
      noseUpFadeEndRad: 12.5 * Math.PI / 180,
    },
    stabilizerTrim: {
      minUnits: 0,
      maxUnits: 15,
      // Slightly below the migrated placeholder value to keep the VR-gated ENVA
      // tutorial climb inside the bounded manual initial-climb envelope after
      // ground-contact liftoff no longer releases early below VR.
      cmPerUnit: 0.01135,
    },
    sideForce: {
      cyBeta: -0.9,
      cyRudder: 0.15,
    },
    groundEffect: {
      liftReliefFactor: 0.03,
    },
  },
  configuration: {
    ...sourceMetadataFor('Landing gear and flap transit rates'),
    sourceReferenceIds: sourceRefsForSection(),
    // Gameplay placeholders: enough lag to make command-vs-actual visible without
    // blocking the current tutorial flow. Not AFM/Boeing timing data.
    flapRateDegPerSecond: 5,
    gearTransitSeconds: 6,
  },
  engine: {
    ...sourceMetadataFor('Engine spool, fuel-flow, and thrust-lapse model'),
    sourceReferenceIds: sourceRefsForSection(),
    // Legacy behavior moved into data: idle ~20% N1, TOGA ~100% N1, with slower
    // spool-down than spool-up. Placeholder values only; not certified engine data.
    idleN1Percent: 20,
    togaN1Percent: 100,
    idleN2Percent: 22,
    n2PerN1Percent: 1.05,
    spoolUpTimeConstantSeconds: 1.5,
    spoolDownTimeConstantSeconds: 3,
    n2TimeConstantSeconds: 0.6,
    idleEgtC: 350,
    egtPerN2PercentC: 5.5,
    highN2EgtReliefStartPercent: 80,
    highN2EgtReliefPerPercentC: 2,
    fuelSfcKgPerNewtonHour: 0.55 * 0.4536 / 4.4482216152605,
    // Lapse grid generated from the legacy placeholder density/Mach formula to
    // preserve current simulator behavior while making ownership data-driven.
    // OAT is documented per point, but current Task 19 intentionally does not
    // claim temperature interpolation; Task 25 binds weather/scenario metadata.
    thrustLapseTable: [
      { altitudeFt: 0, mach: 0.2, oatC: 15, lapseFactor: 1.000007 },
      { altitudeFt: 0, mach: 0.45, oatC: 15, lapseFactor: 0.912506 },
      { altitudeFt: 0, mach: 0.78, oatC: 15, lapseFactor: 0.796196 },
      { altitudeFt: 0, mach: 0.82, oatC: 15, lapseFactor: 0.778595 },
      { altitudeFt: 10_000, mach: 0.2, oatC: -5, lapseFactor: 0.808795 },
      { altitudeFt: 10_000, mach: 0.45, oatC: -5, lapseFactor: 0.738026 },
      { altitudeFt: 10_000, mach: 0.78, oatC: -5, lapseFactor: 0.643955 },
      { altitudeFt: 10_000, mach: 0.82, oatC: -5, lapseFactor: 0.629720 },
      { altitudeFt: 35_000, mach: 0.2, oatC: -54, lapseFactor: 0.440382 },
      { altitudeFt: 35_000, mach: 0.45, oatC: -54, lapseFactor: 0.401848 },
      { altitudeFt: 35_000, mach: 0.78, oatC: -54, lapseFactor: 0.350627 },
      { altitudeFt: 35_000, mach: 0.82, oatC: -54, lapseFactor: 0.342877 },
    ],
  },
  gearStations: [
    {
      ...sourceMetadataFor('Nose gear station'),
      id: 'nose',
      label: 'Nose gear',
      positionBodyM: { x: 15.2, y: 0, z: 2.25 },
      wheelRadiusM: 0.43,
      strutRestLengthM: 1.05,
      maxCompressionM: 0.32,
      springStiffnessNPerM: 400_000,
      staticLoadFraction: 0.10,
      brakeCapable: false,
      steerable: true,
      sourceReferenceIds: sourceRefsForSection(),
    },
    {
      ...sourceMetadataFor('Left main gear station'),
      id: 'leftMain',
      label: 'Left main gear',
      positionBodyM: { x: -2.8, y: -3.15, z: 2.45 },
      wheelRadiusM: 0.58,
      strutRestLengthM: 1.25,
      maxCompressionM: 0.50,
      springStiffnessNPerM: 800_000,
      staticLoadFraction: 0.45,
      brakeCapable: true,
      steerable: false,
      sourceReferenceIds: sourceRefsForSection(),
    },
    {
      ...sourceMetadataFor('Right main gear station'),
      id: 'rightMain',
      label: 'Right main gear',
      positionBodyM: { x: -2.8, y: 3.15, z: 2.45 },
      wheelRadiusM: 0.58,
      strutRestLengthM: 1.25,
      maxCompressionM: 0.50,
      springStiffnessNPerM: 800_000,
      staticLoadFraction: 0.45,
      brakeCapable: true,
      steerable: false,
      sourceReferenceIds: sourceRefsForSection(),
    },
  ],
  ground: {
    ...sourceMetadataFor('Ground handling, tire, brake, contact, and steering model'),
    sourceReferenceIds: sourceRefsForSection(),
    friction: {
      rollingFrictionCoefficient: 0.35 / 9.80665,
      maxBrakeCoefficient: 6.0 / 9.80665,
      maxBrakeFrictionCoefficient: 0.55,
      stopEpsilonMps: 0.05,
      breakawayThrottle: 0.05,
    },
    steering: {
      maxRudderPedalNosewheelSteeringRad: 7 * Math.PI / 180,
      fadeStartMps: 30,
      fadeEndMps: 70,
    },
    oleo: {
      dampingRatio: 0.35,
    },
    tire: {
      corneringStiffnessPerNormal: 3.2,
      maxSideFrictionCoefficient: 0.45,
      minSlipForwardSpeedMps: 2,
    },
    inertia: {
      yawInertiaKgM2: 4_610_000,
    },
    attitude: {
      minGroundPitchRad: 0,
      maxGroundPitchRad: 0.35,
      maxGroundRollRad: 0.2,
    },
    rotation: {
      // Gameplay-calibrated placeholder: trim/thrust may unload the nose, but
      // liftoff release still requires deliberate nose-up elevator input. Not
      // AFM/Boeing rotation law data.
      minimumElevatorInputForLiftoff: -0.2,
    },
    contact: {
      touchdownMinSinkRateMps: 0.25,
      touchdownAngularDamping: 0.35,
      bellySlideDecelMps2: 4.0,
      crashSlideDecelMps2: 9.0,
      bellyContactAngularRetentionPerSecond: 0.7,
      crashContactAngularRetentionPerSecond: 0.25,
    },
  },
};
