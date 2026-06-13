import type {
  AircraftSpec,
  AircraftState,
  BodyStationPosition,
  BodyVelocity,
  GearStationId,
  GearStationState,
  GeoPosition,
} from '../types';
import type { GroundSurfaceSample } from '../runwaySurface';
import { bodyToNed, type NedVelocity } from '../physics/frames';
import { ecefToGeodetic, enuToEcef, geodeticToEcef } from '../physics/geodesy';

const FT_TO_M = 0.3048;
const M_TO_FT = 1 / FT_TO_M;

export interface WheelStationContactGeometry {
  station: GearStationState;
  wheelCenterBodyM: BodyStationPosition;
  wheelContactBodyM: BodyStationPosition;
  wheelCenterOffsetNedM: NedVelocity;
  wheelContactOffsetNedM: NedVelocity;
  wheelCenterPosition: GeoPosition;
  wheelContactPosition: GeoPosition;
  groundAltFt: number;
  runwayClearanceM: number;
  runwayPenetrationM: number;
  runwayNormalVelocityMps: number;
  runwayNormalSinkRateMps: number;
  onPreparedRunway: boolean;
}

export interface WheelContactGeometry {
  surface: GroundSurfaceSample;
  runwayNormalSinkRateMps: number;
  stations: WheelStationContactGeometry[];
}

function stationContactBodyPoint(station: GearStationState): BodyStationPosition {
  return {
    x: station.positionBodyM.x,
    y: station.positionBodyM.y,
    z: station.positionBodyM.z + station.wheelRadiusM,
  };
}

function positionFromLocalNed(position: GeoPosition, offsetNedM: NedVelocity): GeoPosition {
  const ref = geodeticToEcef(position.lat, position.lon, position.alt * FT_TO_M);
  const ecef = enuToEcef(
    { e: offsetNedM.east, n: offsetNedM.north, u: -offsetNedM.down },
    ref,
    position.lat,
    position.lon,
  );
  const geodetic = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
  return {
    lat: geodetic.lat,
    lon: geodetic.lon,
    alt: geodetic.alt * M_TO_FT,
  };
}

function bodyOffsetToNed(offsetBodyM: BodyStationPosition, state: AircraftState): NedVelocity {
  return bodyToNed({ u: offsetBodyM.x, v: offsetBodyM.y, w: offsetBodyM.z }, state.attitude);
}

function stationBodyVelocityMps(state: AircraftState, offsetBodyM: BodyStationPosition): BodyVelocity {
  const { p, q, r } = state.angularVel;
  const { x, y, z } = offsetBodyM;
  return {
    u: state.velocity.u + q * z - r * y,
    v: state.velocity.v + r * x - p * z,
    w: state.velocity.w + p * y - q * x,
  };
}

function computeStationContactGeometry(
  state: AircraftState,
  surface: GroundSurfaceSample,
  station: GearStationState,
): WheelStationContactGeometry {
  const wheelCenterBodyM = station.positionBodyM;
  const wheelContactBodyM = stationContactBodyPoint(station);
  const wheelCenterOffsetNedM = bodyOffsetToNed(wheelCenterBodyM, state);
  const wheelContactOffsetNedM = bodyOffsetToNed(wheelContactBodyM, state);
  const runwayClearanceM = (state.position.alt - surface.groundAltFt) * FT_TO_M - wheelContactOffsetNedM.down;
  const stationVelocityNed = bodyToNed(stationBodyVelocityMps(state, wheelContactBodyM), state.attitude);

  return {
    station,
    wheelCenterBodyM,
    wheelContactBodyM,
    wheelCenterOffsetNedM,
    wheelContactOffsetNedM,
    wheelCenterPosition: positionFromLocalNed(state.position, wheelCenterOffsetNedM),
    wheelContactPosition: positionFromLocalNed(state.position, wheelContactOffsetNedM),
    groundAltFt: surface.groundAltFt,
    runwayClearanceM,
    runwayPenetrationM: Math.max(0, -runwayClearanceM),
    runwayNormalVelocityMps: stationVelocityNed.down,
    runwayNormalSinkRateMps: Math.max(0, stationVelocityNed.down),
    onPreparedRunway: surface.onRunway,
  };
}

export function computeWheelContactGeometry(
  state: AircraftState,
  _spec: AircraftSpec,
  surface: GroundSurfaceSample,
): WheelContactGeometry {
  const aircraftVelocityNed = bodyToNed(state.velocity, state.attitude);
  return {
    surface,
    runwayNormalSinkRateMps: Math.max(0, aircraftVelocityNed.down),
    stations: state.ground.gearStations.map((station) => computeStationContactGeometry(state, surface, station)),
  };
}

export function stationContactById(
  geometry: WheelContactGeometry,
  id: GearStationId,
): WheelStationContactGeometry {
  const station = geometry.stations.find((candidate) => candidate.station.id === id);
  if (!station) {
    throw new Error(`Wheel contact geometry missing gear station ${id}`);
  }
  return station;
}
