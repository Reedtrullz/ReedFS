// Generic dry-air reference, separate from the aircraft's placeholder FDM groups.
export const USSA_1976_CONSTANTS = {
  seaLevelTemperatureK: 288.15,
  seaLevelPressurePa: 101325,
  standardGravityMs2: 9.80665,
  geopotentialEarthRadiusM: 6356766,
  universalGasConstantJPerKmolK: 8314.32,
  dryAirMolarMassKgPerKmol: 28.9644,
  heatCapacityRatio: 1.4,
  sutherlandCoefficient: 1.458e-6,
  // Eq.51 explicitly specifies 110.4 K; Table 2 displays a rounded 110 K.
  sutherlandTemperatureK: 110.4,
} as const;

export const USSA_1976_LAYERS = [
  { baseGeopotentialM: 0, lapseKPerM: -0.0065 },
  { baseGeopotentialM: 11000, lapseKPerM: 0 },
  { baseGeopotentialM: 20000, lapseKPerM: 0.001 },
] as const;

export const USSA_1976_DATA = {
  schemaVersion: 1,
  dataVersion: '1.0.0',
  id: 'ussa-1976-lower-atmosphere',
  sourcePacket: {
    id: 'noaa-nasa-usaf-ussa-1976-lower-atmosphere',
    title: 'U.S. Standard Atmosphere, 1976',
    publisher: 'NOAA / NASA / USAF',
    published: '1976-10-01',
    report: 'NASA-TM-X-74335 / NOAA-S/T-76-1562',
    url: 'https://ntrs.nasa.gov/citations/19770009539',
    pdfSha256: '23eb6b68346d4abc6071fc598872d51c40cf8c613d1a5d1006c6261bcd09dcea',
    permission: 'NASA NTRS: Public distribution; Work of the US Government, Public Use Permitted. Numeric facts and derived equations only; no source PDF embedded.',
    dataGroup: 'weather/atmosphere',
    confidence: 'derived-from-source',
    sourceQuality: 'public-reference',
    lastReviewed: '2026-10-08',
    citation: 'Printed pp.2–4 Tables 2/4; p.8 Eq.18; p.9 M0; p.12 Eq.33; p.15 Eq.42; p.18 Eq.50; p.19 Eq.51. Independent Tables I/III holdouts: pp.53/55/59/61/63 and 100/103/107/109/111.',
    claimBoundary: 'Generic dry homogeneous standard atmosphere within the stated altitude domain; derived from USSA 1976. Not an observed weather sounding, aircraft calibration, certified Boeing/AFM data or training qualification. Weather offsets and out-of-domain extrapolation are engineering approximations.',
  },
  applicability: {
    minGeometricAltitudeM: -1000,
    maxGeopotentialAltitudeM: 32000,
    altitudeInput: 'geometric meters, converted to geopotential meters with Eq.18',
    gas: 'dry homogeneous air',
  },
  constants: USSA_1976_CONSTANTS,
  layers: USSA_1976_LAYERS,
} as const;
