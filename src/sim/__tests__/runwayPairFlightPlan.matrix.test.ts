import { describe, expect, it } from 'vitest';
import { createRunwayToRunwayFlightWithRunways } from '../flightPlanLoader';
import { createAircraftStateForRunway } from '../scenarios';
import { B737_800_SPEC } from '../types';
import { computeRouteStatus, getInitialActiveLegIndex, routeStatusToNavOutput } from '../systems/navigation';
import { SUPPORTED_RUNWAYS, orientedRunwayByAirportAndId, type RunwayReference } from '../../viewport/runwayData';

interface RunwayDirection {
  key: string;
  airport: string;
  runwayId: string;
  runway: RunwayReference;
}

function allRunwayDirections(): RunwayDirection[] {
  const seen = new Set<string>();
  const directions: RunwayDirection[] = [];

  for (const runway of SUPPORTED_RUNWAYS) {
    for (const runwayId of [runway.id, runway.oppositeId]) {
      const key = `${runway.airport}:${runwayId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const oriented = orientedRunwayByAirportAndId(runway.airport, runwayId);
      if (!oriented) throw new Error(`Missing oriented runway ${key}`);
      directions.push({ key, airport: runway.airport, runwayId, runway: oriented });
    }
  }

  return directions;
}

describe('runway-pair generated flight-plan matrix', () => {
  it('builds finite route-compatible LNAV/VNAV/SPD training routes for every ordered distinct supported runway endpoint pair', () => {
    const directions = allRunwayDirections();
    const failures: string[] = [];
    const originAircraft = new Map<string, ReturnType<typeof createAircraftStateForRunway>>();
    let checkedPairs = 0;

    for (const origin of directions) {
      const cachedAircraft = createAircraftStateForRunway(B737_800_SPEC, origin.runway);
      cachedAircraft.velocity.u = 80;
      originAircraft.set(origin.key, cachedAircraft);

      for (const destination of directions) {
        if (origin.key === destination.key) continue;
        checkedPairs += 1;

        try {
          const { flightPlan, runways } = createRunwayToRunwayFlightWithRunways({
            originAirport: origin.airport,
            originRunway: origin.runwayId,
            destinationAirport: destination.airport,
            destinationRunway: destination.runwayId,
          });
          const first = flightPlan.waypoints[0];
          const final = flightPlan.waypoints.at(-1);

          if (runways.originRunway.id !== origin.runwayId) failures.push(`${origin.key} -> ${destination.key}: origin runway id ${runways.originRunway.id}`);
          if (runways.destinationRunway.id !== destination.runwayId) failures.push(`${origin.key} -> ${destination.key}: destination runway id ${runways.destinationRunway.id}`);
          if (flightPlan.origin !== origin.airport) failures.push(`${origin.key} -> ${destination.key}: origin airport ${flightPlan.origin}`);
          if (flightPlan.destination !== destination.airport) failures.push(`${origin.key} -> ${destination.key}: destination airport ${flightPlan.destination}`);
          if (flightPlan.waypoints.length !== 6) failures.push(`${origin.key} -> ${destination.key}: waypoint count ${flightPlan.waypoints.length}`);
          if (!first || first.lat !== origin.runway.start.lat || first.lon !== origin.runway.start.lon || first.legType !== 'IF') {
            failures.push(`${origin.key} -> ${destination.key}: first waypoint not at origin threshold`);
          }
          if (!final || final.lat !== destination.runway.start.lat || final.lon !== destination.runway.start.lon || final.legType !== 'RW') {
            failures.push(`${origin.key} -> ${destination.key}: final waypoint not at destination threshold`);
          }
          if (getInitialActiveLegIndex(flightPlan) !== 0) failures.push(`${origin.key} -> ${destination.key}: initial leg not 0`);

          for (const waypoint of flightPlan.waypoints) {
            if (!Number.isFinite(waypoint.lat) || !Number.isFinite(waypoint.lon)) {
              failures.push(`${origin.key} -> ${destination.key}: non-finite waypoint ${waypoint.ident}`);
            }
            if (waypoint.discontinuity) failures.push(`${origin.key} -> ${destination.key}: discontinuity ${waypoint.ident}`);
            if (waypoint.coordinateSource !== 'manual') failures.push(`${origin.key} -> ${destination.key}: non-manual source ${waypoint.ident}`);
            if (!waypoint.altitudeConstraint) failures.push(`${origin.key} -> ${destination.key}: missing altitude constraint ${waypoint.ident}`);
            if (!waypoint.speedConstraint) failures.push(`${origin.key} -> ${destination.key}: missing speed constraint ${waypoint.ident}`);
          }

          const aircraft = originAircraft.get(origin.key)!;
          const routeStatus = computeRouteStatus(aircraft, flightPlan, getInitialActiveLegIndex(flightPlan));
          if (!routeStatus.routeValid) failures.push(`${origin.key} -> ${destination.key}: route invalid`);
          if (!routeStatus.lnavAvailable) failures.push(`${origin.key} -> ${destination.key}: LNAV unavailable ${routeStatus.lnavUnavailableReason}`);
          if (routeStatus.lnavUnavailableReason !== null) failures.push(`${origin.key} -> ${destination.key}: unavailable reason ${routeStatus.lnavUnavailableReason}`);
          if (routeStatus.activeLegIndex !== 0) failures.push(`${origin.key} -> ${destination.key}: active leg ${routeStatus.activeLegIndex}`);
          if (routeStatus.fromIdent !== first.ident) failures.push(`${origin.key} -> ${destination.key}: from ident ${routeStatus.fromIdent}`);
          if (routeStatus.nextWaypointIdent !== flightPlan.waypoints[1].ident) failures.push(`${origin.key} -> ${destination.key}: next ident ${routeStatus.nextWaypointIdent}`);
          if ((routeStatus.distanceToNextNm ?? 0) <= 0) failures.push(`${origin.key} -> ${destination.key}: non-positive DTG`);
          if (!Number.isFinite(routeStatus.desiredTrackDegTrue)) failures.push(`${origin.key} -> ${destination.key}: non-finite track`);
          if (routeStatusToNavOutput(routeStatus) === null) failures.push(`${origin.key} -> ${destination.key}: nav output unavailable`);
        } catch (error) {
          failures.push(`${origin.key} -> ${destination.key}: ${(error as Error).message}`);
        }
      }
    }

    expect(checkedPairs).toBe(directions.length * (directions.length - 1));
    expect(failures.slice(0, 50)).toEqual([]);
  });
});
