export type SourceRole = 'aircraft' | 'aero' | 'gear' | 'ground' | 'lineage';

export type SourceClassification =
  | 'gameplay-calibrated'
  | 'placeholder-engineering-estimate'
  | 'public-reference'
  | 'manufacturer-published'
  | 'certified';

export type SourceConfidence = 'low' | 'medium' | 'high';

export interface SourceReference {
  id: string;
  title: string;
  role: SourceRole;
  classification: SourceClassification;
  confidence: SourceConfidence;
  notes: string;
  url?: string;
}

export interface FdmLineageMetadata {
  sourceReferences: SourceReference[];
  notes: string[];
}

export interface FdmSourceMetadata {
  sourceQuality: SourceClassification;
  /** Source ids into the parent FDM `lineage.sourceReferences` manifest. */
  sourceRefs: string[];
  claimBoundary: string;
  lastReviewed: string;
}

export type GearStationId = 'nose' | 'leftMain' | 'rightMain';

export interface BodyStationPositionData {
  x: number;
  y: number;
  z: number;
}

export interface GearStationDefinition extends FdmSourceMetadata {
  id: GearStationId;
  label: string;
  positionBodyM: BodyStationPositionData;
  wheelRadiusM: number;
  strutRestLengthM: number;
  maxCompressionM: number;
  springStiffnessNPerM: number;
  staticLoadFraction: number;
  brakeCapable: boolean;
  steerable: boolean;
  /** Legacy compatibility alias for runtime consumers that predate `sourceRefs`; keep consistent with `sourceRefs`. */
  sourceReferenceIds: string[];
}

export interface GroundModelData extends FdmSourceMetadata {
  /** Legacy compatibility alias for runtime consumers that predate `sourceRefs`; keep consistent with `sourceRefs`. */
  sourceReferenceIds: string[];
  friction: {
    rollingFrictionCoefficient: number;
    maxBrakeCoefficient: number;
    maxBrakeFrictionCoefficient: number;
    stopEpsilonMps: number;
    breakawayThrottle: number;
  };
  steering: {
    maxRudderPedalNosewheelSteeringRad: number;
    fadeStartMps: number;
    fadeEndMps: number;
  };
  oleo: {
    dampingRatio: number;
  };
  tire: {
    corneringStiffnessPerNormal: number;
    maxSideFrictionCoefficient: number;
    minSlipForwardSpeedMps: number;
  };
  inertia: {
    yawInertiaKgM2: number;
  };
  attitude: {
    minGroundPitchRad: number;
    maxGroundPitchRad: number;
    maxGroundRollRad: number;
  };
  contact: {
    touchdownMinSinkRateMps: number;
    touchdownAngularDamping: number;
    bellySlideDecelMps2: number;
    crashSlideDecelMps2: number;
    bellyContactAngularRetentionPerSecond: number;
    crashContactAngularRetentionPerSecond: number;
  };
}
