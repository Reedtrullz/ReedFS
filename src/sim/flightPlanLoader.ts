import type { FlightPlan, FlightPlanWaypoint } from '@shared/types/fmc';
import { createRouteSourceFromFlightPlan, type RouteSource } from './fms/routeAdapter';
import type { FlightScenario } from './scenarios';
import {
  ENGM_AUTOLAND_APPROACH,
  KPDX_RUNWAY_10R_APPROACH,
  orientedRunwayByAirportAndId,
  type RunwayGeoPoint,
  type RunwayReference,
  type RunwayApproachFixReference,
  type RunwayThresholdApproachReference,
} from '../viewport/runwayData';

export const ENVA_ENGM_APPROACH_CONTRACT = {
  id: 'enva-engm-engm-19r-synthetic',
  originScenarioId: 'enva-tutorial',
  originAirport: 'ENVA',
  destinationAirport: ENGM_AUTOLAND_APPROACH.airport,
  runway: ENGM_AUTOLAND_APPROACH.runwayId,
  initialApproachFixIdent: ENGM_AUTOLAND_APPROACH.initialApproachFix.ident,
  finalApproachFixIdent: ENGM_AUTOLAND_APPROACH.finalApproachFix.ident,
  thresholdIdent: ENGM_AUTOLAND_APPROACH.threshold.ident,
  coordinateSource: ENGM_AUTOLAND_APPROACH.coordinateSource,
  sourceNote: ENGM_AUTOLAND_APPROACH.sourceNote,
} as const;

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
  ENGM: { lat: 60.1939, lon: 11.1004, coordinateSource: 'synthetic' },
  ENVA: { lat: 63.4583, lon: 10.9101, coordinateSource: 'synthetic' },
  KSEA: { lat: 47.45, lon: -122.31, coordinateSource: 'synthetic' },
  KPDX: { lat: 45.59, lon: -122.60, coordinateSource: 'synthetic' },
};

const EARTH_RADIUS_M = 6371000;
const M_PER_NM = 1852;

export interface RunwayRouteRequest {
  originAirport: string;
  originRunway: string;
  destinationAirport: string;
  destinationRunway: string;
}

export interface RunwayRouteResolution {
  originRunway: RunwayReference;
  destinationRunway: RunwayReference;
}

export interface RunwayRouteBuildResult {
  flightPlan: FlightPlan;
  runways: RunwayRouteResolution;
}

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

function toRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

function toDeg(radians: number): number {
  return radians * 180 / Math.PI;
}

function normalizeLon(degrees: number): number {
  return ((degrees + 540) % 360) - 180;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundAltitude(value: number): number {
  return Math.round(value / 100) * 100;
}

function pointFromBearingDistance(origin: RunwayGeoPoint, bearingDeg: number, distanceNm: number, altFt = origin.altFt): RunwayGeoPoint {
  const angularDistance = distanceNm * M_PER_NM / EARTH_RADIUS_M;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lon1 = toRad(origin.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  return {
    lat: roundCoordinate(toDeg(lat2)),
    lon: roundCoordinate(normalizeLon(toDeg(lon2))),
    altFt,
  };
}

function interpolatePoint(from: RunwayGeoPoint, to: RunwayGeoPoint, fraction: number, altFt: number): RunwayGeoPoint {
  return {
    lat: roundCoordinate(from.lat + (to.lat - from.lat) * fraction),
    lon: roundCoordinate(from.lon + (to.lon - from.lon) * fraction),
    altFt,
  };
}

function distanceNm(from: Pick<RunwayGeoPoint, 'lat' | 'lon'>, to: Pick<RunwayGeoPoint, 'lat' | 'lon'>): number {
  const meanLat = toRad((from.lat + to.lat) / 2);
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  return Math.hypot(dLon * Math.cos(meanLat), dLat) * EARTH_RADIUS_M / M_PER_NM;
}

function runwayWaypointIdent(airport: string, runway: string, suffix: string): string {
  return `${airport}${runway.replace(/[^A-Z0-9]/gi, '')}_${suffix}`.toUpperCase();
}

function manualWaypoint(
  ident: string,
  point: RunwayGeoPoint,
  options: Partial<Pick<FlightPlanWaypoint, 'altitudeConstraint' | 'speedConstraint' | 'legType'>> = {},
): FlightPlanWaypoint {
  return {
    ident,
    lat: point.lat,
    lon: point.lon,
    coordinateSource: 'manual',
    discontinuity: false,
    ...options,
  };
}

function cruiseAltitudeFt(distance: number, origin: RunwayReference, destination: RunwayReference): number {
  const terrainFloorFt = Math.max(origin.elevationFt, destination.elevationFt) + 5000;
  const distanceBasedFt = distance < 45 ? 6000 : distance < 140 ? 12000 : distance < 320 ? 22000 : 32000;
  return Math.min(36000, Math.max(roundAltitude(terrainFloorFt), distanceBasedFt));
}

function resolveRunways(request: RunwayRouteRequest): RunwayRouteResolution {
  const originRunway = orientedRunwayByAirportAndId(request.originAirport.toUpperCase(), request.originRunway.toUpperCase());
  const destinationRunway = orientedRunwayByAirportAndId(request.destinationAirport.toUpperCase(), request.destinationRunway.toUpperCase());
  if (!originRunway) throw new Error(`Unsupported origin runway ${request.originAirport} ${request.originRunway}`);
  if (!destinationRunway) throw new Error(`Unsupported destination runway ${request.destinationAirport} ${request.destinationRunway}`);
  return { originRunway, destinationRunway };
}

export function createRunwayToRunwayFlight(request: RunwayRouteRequest): FlightPlan {
  return createRunwayToRunwayFlightWithRunways(request).flightPlan;
}

export function createRunwayToRunwayFlightWithRunways(request: RunwayRouteRequest): RunwayRouteBuildResult {
  const runways = resolveRunways(request);
  const { originRunway, destinationRunway } = runways;
  const distance = distanceNm(originRunway.start, destinationRunway.start);
  const cruiseAltFt = cruiseAltitudeFt(distance, originRunway, destinationRunway);
  const departureAltFt = Math.min(cruiseAltFt, Math.max(originRunway.elevationFt + 2500, 3000));
  const descentAltFt = Math.max(destinationRunway.elevationFt + 3500, Math.min(cruiseAltFt - 2000, 8000));
  const finalAltFt = Math.max(destinationRunway.elevationFt + 1800, destinationRunway.elevationFt + Math.round(318 * 6));
  const departureFixDistanceNm = Math.max(4, Math.min(10, distance * 0.18));
  const finalFixDistanceNm = Math.max(5, Math.min(8, distance * 0.2));
  const destinationThreshold = destinationRunway.start;
  const finalFix = pointFromBearingDistance(
    destinationThreshold,
    destinationRunway.headingDeg + 180,
    finalFixDistanceNm,
    finalAltFt,
  );

  const originIdent = runwayWaypointIdent(originRunway.airport, originRunway.id, 'DEP');
  const departureIdent = runwayWaypointIdent(originRunway.airport, originRunway.id, 'CLB');
  const enrouteIdent = `${originRunway.airport}${destinationRunway.airport}_ENR`;
  const descentIdent = runwayWaypointIdent(destinationRunway.airport, destinationRunway.id, 'DES');
  const finalIdent = runwayWaypointIdent(destinationRunway.airport, destinationRunway.id, 'FAF');
  const thresholdIdent = runwayWaypointIdent(destinationRunway.airport, destinationRunway.id, 'RWY');

  const waypoints: FlightPlanWaypoint[] = [
    manualWaypoint(originIdent, originRunway.start, {
      legType: 'IF',
      altitudeConstraint: { type: 'AT', altitude: originRunway.elevationFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: 180 },
    }),
    manualWaypoint(
      departureIdent,
      pointFromBearingDistance(originRunway.start, originRunway.headingDeg, departureFixDistanceNm, departureAltFt),
      {
        legType: 'TF',
        altitudeConstraint: { type: 'AT_OR_ABOVE', altitude: departureAltFt },
        speedConstraint: { type: 'AT_OR_BELOW', speed: 230 },
      },
    ),
    manualWaypoint(
      enrouteIdent,
      interpolatePoint(originRunway.start, destinationThreshold, 0.48, cruiseAltFt),
      {
        legType: 'TF',
        altitudeConstraint: { type: 'AT_OR_ABOVE', altitude: cruiseAltFt },
        speedConstraint: { type: 'AT_OR_BELOW', speed: 300 },
      },
    ),
    manualWaypoint(
      descentIdent,
      interpolatePoint(originRunway.start, finalFix, 0.78, descentAltFt),
      {
        legType: 'TF',
        altitudeConstraint: { type: 'AT_OR_BELOW', altitude: descentAltFt },
        speedConstraint: { type: 'AT_OR_BELOW', speed: 250 },
      },
    ),
    manualWaypoint(finalIdent, finalFix, {
      legType: 'TF',
      altitudeConstraint: { type: 'AT_OR_BELOW', altitude: finalAltFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: 170 },
    }),
    manualWaypoint(thresholdIdent, destinationThreshold, {
      legType: 'RW',
      altitudeConstraint: { type: 'AT', altitude: destinationRunway.elevationFt },
      speedConstraint: { type: 'AT_OR_BELOW', speed: 145 },
    }),
  ];

  const flightPlan: FlightPlan = {
    origin: originRunway.airport,
    destination: destinationRunway.airport,
    flightNumber: 'RFSANY',
    route: waypoints.map((waypoint) => waypoint.ident).join(' '),
    waypoints,
  };

  return { flightPlan, runways };
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

export function createEnvaEngmFlight(): FlightPlan {
  const approach = ENGM_AUTOLAND_APPROACH;

  return {
    origin: ENVA_ENGM_APPROACH_CONTRACT.originAirport,
    destination: ENVA_ENGM_APPROACH_CONTRACT.destinationAirport,
    flightNumber: 'RFS194',
    route: [
      'ENVA',
      'RFSNOR',
      approach.initialApproachFix.ident,
      approach.finalApproachFix.ident,
      approach.threshold.ident,
    ].join(' '),
    waypoints: [
      airportWaypoint('ENVA'),
      {
        ident: 'RFSNOR',
        lat: 61.65,
        lon: 11.03,
        coordinateSource: 'synthetic',
        discontinuity: false,
        altitudeConstraint: { type: 'AT_OR_BELOW', altitude: 14000 },
        speedConstraint: { type: 'AT_OR_BELOW', speed: 280 },
      },
      approachFixWaypoint(approach.initialApproachFix, 'IF'),
      approachFixWaypoint(approach.finalApproachFix, 'TF'),
      thresholdWaypoint(approach.threshold),
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

export function createEnvaEngmRouteSource(): RouteSource {
  return createRouteSourceFromFlightPlan(createEnvaEngmFlight(), {
    id: 'canned:enva-engm',
    type: 'canned',
    label: `${ENVA_ENGM_APPROACH_CONTRACT.originAirport} to ${ENVA_ENGM_APPROACH_CONTRACT.destinationAirport} runway ${ENVA_ENGM_APPROACH_CONTRACT.runway} canned route`,
    limitations: [
      'Adapter wraps the current RFMS shared FlightPlan shape; CDU route editing UI is not implemented yet.',
      `${ENVA_ENGM_APPROACH_CONTRACT.destinationAirport} ${ENVA_ENGM_APPROACH_CONTRACT.runway} approach waypoints are synthetic training fixtures for RFS only, not official procedure data.`,
      'ENGM 19R is the selected synthetic autoland runway for this RFS training route.',
      'RFMS shared dependency remains a sibling checkout via @shared path mapping.',
    ],
  });
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

export function createRunwayToRunwayRouteSource(request: RunwayRouteRequest): RouteSource {
  const { flightPlan, runways } = createRunwayToRunwayFlightWithRunways(request);
  return createRouteSourceFromFlightPlan(flightPlan, {
    id: `generated:${runways.originRunway.airport}-${runways.originRunway.id}:${runways.destinationRunway.airport}-${runways.destinationRunway.id}`,
    type: 'manual',
    label: `${runways.originRunway.airport} runway ${runways.originRunway.id} to ${runways.destinationRunway.airport} runway ${runways.destinationRunway.id} generated route`,
    limitations: [
      'Generated RFS route uses the selected simulator runway references (OurAirports endpoint geometry only where the runway is marked as such) plus synthetic training climb, enroute, descent, final, and threshold constraints.',
      'LNAV/VNAV/SPD can use the generated constraints, but APP/G/S/autoland remains available only on explicitly supported synthetic approach fixtures.',
      'Generated route waypoints are not official procedures, SIDs, STARs, ILS, RNAV, terrain, obstacle, or certified navigation data.',
    ],
  });
}

export function createDefaultFlightForScenario(scenario: FlightScenario): FlightPlan | null {
  if (scenario.id === ENVA_ENGM_APPROACH_CONTRACT.originScenarioId) {
    return createEnvaEngmFlight();
  }

  switch (scenario.runway.airport.toUpperCase()) {
    case 'KSEA':
      return createKseaKpdxFlight();
    default:
      return null;
  }
}
