import type { FlightPlan, FlightPlanWaypoint } from '@shared/types/fmc';
import { createRouteSourceFromFlightPlan, type RouteSource } from './fms/routeAdapter';
import type { FlightScenario } from './scenarios';
import { KPDX_RUNWAY_10R_APPROACH, type RunwayApproachFixReference, type RunwayThresholdApproachReference } from '../viewport/runwayData';

export const KSEA_KPDX_APPROACH_CONTRACT = {
  id: 'ksea-kpdx-kpdx-10r-synthetic',
  originAirport: 'KSEA',
  destinationAirport: KPDX_RUNWAY_10R_APPROACH.airport,
  destinationScenarioId: 'kpdx-tutorial',
  runway: KPDX_RUNWAY_10R_APPROACH.runwayId,
  initialApproachFixIdent: KPDX_RUNWAY_10R_APPROACH.initialApproachFix.ident,
  finalApproachFixIdent: KPDX_RUNWAY_10R_APPROACH.finalApproachFix.ident,
  thresholdIdent: KPDX_RUNWAY_10R_APPROACH.threshold.ident,
  coordinateSource: KPDX_RUNWAY_10R_APPROACH.coordinateSource,
  sourceNote: KPDX_RUNWAY_10R_APPROACH.sourceNote,
} as const;

const AIRPORT_COORDS: Record<string, Pick<FlightPlanWaypoint, 'lat' | 'lon' | 'coordinateSource'>> = {
  ENVA: { lat: 63.4583, lon: 10.9101, coordinateSource: 'synthetic' },
  KSEA: { lat: 47.45, lon: -122.31, coordinateSource: 'synthetic' },
  KPDX: { lat: 45.59, lon: -122.60, coordinateSource: 'synthetic' },
};

function airportWaypoint(ident: string): FlightPlanWaypoint {
  return {
    ident,
    discontinuity: false,
    ...AIRPORT_COORDS[ident.toUpperCase()],
  };
}

function approachFixWaypoint(fix: RunwayApproachFixReference, legType: string): FlightPlanWaypoint {
  return {
    ident: fix.ident,
    lat: fix.point.lat,
    lon: fix.point.lon,
    coordinateSource: 'synthetic',
    discontinuity: false,
    legType,
    altitudeConstraint: { type: 'AT', altitude: fix.point.altFt },
    speedConstraint: { type: 'AT_OR_BELOW', speed: fix.speedKt },
  };
}

function thresholdWaypoint(threshold: RunwayThresholdApproachReference): FlightPlanWaypoint {
  return {
    ident: threshold.ident,
    lat: threshold.point.lat,
    lon: threshold.point.lon,
    coordinateSource: 'synthetic',
    discontinuity: false,
    legType: 'RW',
    altitudeConstraint: { type: 'AT', altitude: threshold.point.altFt },
    speedConstraint: { type: 'AT_OR_BELOW', speed: threshold.speedKt },
  };
}

export function createDirectFlight(origin: string, destination: string): FlightPlan {
  return {
    origin,
    destination,
    flightNumber: '',
    route: `${origin} ${destination}`,
    waypoints: [
      airportWaypoint(origin),
      airportWaypoint(destination),
    ],
  };
}

export function createKseaKpdxFlight(): FlightPlan {
  const approach = KPDX_RUNWAY_10R_APPROACH;

  return {
    origin: KSEA_KPDX_APPROACH_CONTRACT.originAirport,
    destination: KSEA_KPDX_APPROACH_CONTRACT.destinationAirport,
    flightNumber: 'RFS123',
    route: [
      'KSEA',
      'OLM',
      'BTG',
      approach.initialApproachFix.ident,
      approach.finalApproachFix.ident,
      approach.threshold.ident,
    ].join(' '),
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, coordinateSource: 'synthetic', discontinuity: false },
      { ident: 'OLM', lat: 46.97, lon: -122.90, coordinateSource: 'synthetic', discontinuity: false },
      {
        ident: 'BTG',
        lat: 45.75,
        lon: -122.59,
        coordinateSource: 'synthetic',
        discontinuity: false,
        altitudeConstraint: { type: 'AT_OR_BELOW', altitude: 12000 },
        speedConstraint: { type: 'AT_OR_BELOW', speed: 280 },
      },
      approachFixWaypoint(approach.initialApproachFix, 'IF'),
      approachFixWaypoint(approach.finalApproachFix, 'TF'),
      thresholdWaypoint(approach.threshold),
    ],
  };
}

export function createKseaKpdxRouteSource(): RouteSource {
  return createRouteSourceFromFlightPlan(createKseaKpdxFlight(), {
    id: 'canned:ksea-kpdx',
    type: 'canned',
    label: `${KSEA_KPDX_APPROACH_CONTRACT.originAirport} to ${KSEA_KPDX_APPROACH_CONTRACT.destinationAirport} runway ${KSEA_KPDX_APPROACH_CONTRACT.runway} canned route`,
    limitations: [
      'Adapter wraps the current RFMS shared FlightPlan shape; CDU route editing UI is not implemented yet.',
      `${KSEA_KPDX_APPROACH_CONTRACT.destinationAirport} ${KSEA_KPDX_APPROACH_CONTRACT.runway} approach waypoints are synthetic training fixtures for RFS only, not official procedure data.`,
      'RFMS shared dependency remains a sibling checkout via @shared path mapping.',
    ],
  });
}

export function createDefaultFlightForScenario(scenario: FlightScenario): FlightPlan | null {
  switch (scenario.runway.airport.toUpperCase()) {
    case 'KSEA':
      return createKseaKpdxFlight();
    default:
      return null;
  }
}
