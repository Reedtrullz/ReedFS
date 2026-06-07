import type { FlightPlan, FlightPlanWaypoint } from '@shared/types/fmc';
import type { FlightScenario } from './scenarios';

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
  return {
    origin: 'KSEA',
    destination: 'KPDX',
    flightNumber: 'RFS123',
    route: 'KSEA OLM BTG KPDX',
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, coordinateSource: 'synthetic', discontinuity: false },
      { ident: 'OLM', lat: 46.97, lon: -122.90, coordinateSource: 'synthetic', discontinuity: false },
      { ident: 'BTG', lat: 45.75, lon: -122.59, coordinateSource: 'synthetic', discontinuity: false },
      { ident: 'KPDX', lat: 45.59, lon: -122.60, coordinateSource: 'synthetic', discontinuity: false },
    ],
  };
}

export function createDefaultFlightForScenario(scenario: FlightScenario): FlightPlan | null {
  switch (scenario.runway.airport.toUpperCase()) {
    case 'KSEA':
      return createKseaKpdxFlight();
    default:
      return null;
  }
}
