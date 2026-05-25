const T0 = 288.15; // K at MSL
const P0 = 101325; // Pa
const LAPSE = -0.0065; // K/m troposphere
const G = 9.80665;
const R = 287.058;
const GAMMA = 1.4;
const TROPOPAUSE_M = 11000;
const TROPOPAUSE_K = 216.65;
const FT_TO_M = 0.3048;
const STRATOSPHERE_TOP_M = 20000;
const STRAT_LAPSE = 0.001; // K/m (slight warming)

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
  const altM = altFt * FT_TO_M;
  let tempK: number;
  let pressPa: number;

  if (altM <= TROPOPAUSE_M) {
    tempK = T0 + LAPSE * altM;
    pressPa = P0 * Math.pow(tempK / T0, -G / (R * LAPSE));
  } else if (altM <= STRATOSPHERE_TOP_M) {
    tempK = TROPOPAUSE_K;
    const pTropo = P0 * Math.pow(TROPOPAUSE_K / T0, -G / (R * LAPSE));
    pressPa = pTropo * Math.exp(-G / (R * TROPOPAUSE_K) * (altM - TROPOPAUSE_M));
  } else {
    const dAlt = altM - STRATOSPHERE_TOP_M;
    tempK = TROPOPAUSE_K + STRAT_LAPSE * dAlt;
    const pStratoTop = (() => {
      const pTropo = P0 * Math.pow(TROPOPAUSE_K / T0, -G / (R * LAPSE));
      return pTropo * Math.exp(-G / (R * TROPOPAUSE_K) * (STRATOSPHERE_TOP_M - TROPOPAUSE_M));
    })();
    pressPa = pStratoTop * Math.pow(tempK / TROPOPAUSE_K, -G / (R * STRAT_LAPSE));
  }

  const density = pressPa / (R * tempK);
  const speedOfSound = Math.sqrt(GAMMA * R * tempK);
  const viscosity = 1.458e-6 * Math.pow(tempK, 1.5) / (tempK + 110.4);

  return {
    tempK, tempC: tempK - 273.15,
    pressurePa: pressPa, pressureHpa: pressPa / 100,
    density, speedOfSound, viscosity,
  };
}
