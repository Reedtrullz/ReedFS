import type { ScenarioWeatherMetadata } from '../weather';
import { USSA_1976_CONSTANTS as C, USSA_1976_LAYERS } from '../data/atmosphere/ussa-1976.v1';

const R = C.universalGasConstantJPerKmolK / C.dryAirMolarMassKgPerKmol;
const FT_TO_M = 0.3048;

export interface AtmoConditions {
  tempK: number;
  tempC: number;
  pressurePa: number;
  pressureHpa: number;
  density: number;
  speedOfSound: number;
  viscosity: number;
}

export function isaAtAltitude(altFt: number): AtmoConditions {
  const geometricM = altFt * FT_TO_M;
  const geopotentialM = C.geopotentialEarthRadiusM * geometricM / (C.geopotentialEarthRadiusM + geometricM);
  let tempK: number = C.seaLevelTemperatureK;
  let pressPa: number = C.seaLevelPressurePa;
  const layers = USSA_1976_LAYERS;
  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    // Continuing the last lapse outside the packet's domain is an engineering
    // extrapolation, not a claim to implement the remaining USSA layers.
    const top = layers[i + 1]?.baseGeopotentialM ?? geopotentialM;
    const deltaM = Math.min(geopotentialM, top) - layer.baseGeopotentialM;
    const nextTempK = tempK + layer.lapseKPerM * deltaM;
    pressPa *= layer.lapseKPerM === 0
      ? Math.exp(-C.standardGravityMs2 * deltaM / (R * tempK))
      : Math.pow(nextTempK / tempK, -C.standardGravityMs2 / (R * layer.lapseKPerM));
    tempK = nextTempK;
    if (geopotentialM <= top) break;
  }

  const density = pressPa / (R * tempK);
  const speedOfSound = Math.sqrt(C.heatCapacityRatio * R * tempK);
  const viscosity = viscosityForTemperature(tempK);

  return {
    tempK, tempC: tempK - 273.15,
    pressurePa: pressPa, pressureHpa: pressPa / 100,
    density, speedOfSound, viscosity,
  };
}

// Scenario weather is a surface pressure/temperature offset on the ISA profile,
// not a measured vertical sounding. All consumers share this same approximation.
export type DensityAltitudeWeather = Pick<ScenarioWeatherMetadata, 'qnhHpa' | 'surfaceTemperatureC'>;

function viscosityForTemperature(tempK: number): number {
  return C.sutherlandCoefficient * Math.pow(tempK, 1.5) / (tempK + C.sutherlandTemperatureK);
}

export function atmosphereForDensityAltitude(altFt: number, weather: DensityAltitudeWeather | null = null): AtmoConditions {
  const standard = isaAtAltitude(altFt);
  if (!weather) return standard;

  const qnhHpa = Number.isFinite(weather.qnhHpa) && weather.qnhHpa > 0 ? weather.qnhHpa : C.seaLevelPressurePa / 100;
  const surfaceTemperatureC = Number.isFinite(weather.surfaceTemperatureC) ? weather.surfaceTemperatureC : C.seaLevelTemperatureK - 273.15;
  const pressurePa = qnhHpa * 100 * (standard.pressurePa / C.seaLevelPressurePa);
  const isaSeaLevelDeltaK = (surfaceTemperatureC + 273.15) - C.seaLevelTemperatureK;
  const tempK = Math.max(150, standard.tempK + isaSeaLevelDeltaK);
  const density = pressurePa / (R * tempK);

  return {
    tempK,
    tempC: tempK - 273.15,
    pressurePa,
    pressureHpa: pressurePa / 100,
    density,
    speedOfSound: Math.sqrt(C.heatCapacityRatio * R * tempK),
    viscosity: viscosityForTemperature(tempK),
  };
}
