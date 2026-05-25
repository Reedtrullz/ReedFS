import type { FlightPlan } from '@shared/types/fmc';

export function createDirectFlight(origin: string, destination: string): FlightPlan {
  return {
    origin,
    destination,
    flightNumber: '',
    route: `${origin} ${destination}`,
    waypoints: [
      { ident: origin, discontinuity: false },
      { ident: destination, discontinuity: false },
    ],
  };
}

export function createKseaKpdxFlight(): FlightPlan {
  return {
    origin: 'KSEA',
    destination: 'KPDX',
    flightNumber: 'RFS123',
    route: 'KSEA KPDX',
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
      { ident: 'KPDX', lat: 45.59, lon: -122.60, discontinuity: false },
    ],
  };
}
