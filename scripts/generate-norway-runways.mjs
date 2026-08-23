import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { log as logInfo } from 'node:console';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const RUNWAYS_URL = 'https://davidmegginson.github.io/ourairports-data/runways.csv';
const INCLUDED_AIRPORT_TYPES = new Set(['small_airport', 'medium_airport', 'large_airport']);
const PREFERRED_RUNWAY_DIRECTIONS = new Map([
  ['ENGM:01L:19R', '19R'],
  ['ENGM:01R:19L', '19L'],
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'src/viewport/norwayRunwayData.generated.ts');

function readSource(sourcePathEnv, url) {
  if (sourcePathEnv) {
    return fs.readFileSync(sourcePathEnv, 'utf8');
  }
  return download(url);
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Unable to download ${url}: HTTP ${response.statusCode}`));
        response.resume();
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((entry) => entry.length === header.length)
    .map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index]])));
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toRad(degrees) {
  return degrees * Math.PI / 180;
}

function toDeg(radians) {
  return radians * 180 / Math.PI;
}

function rounded(value, decimals) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function normalizeHeading(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function distanceMeters(from, to) {
  const radiusM = 6_371_000;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(to.lon - from.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(from, to) {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeHeading(toDeg(Math.atan2(y, x)));
}

function runwayHasCompleteEndpoints(runway) {
  const values = [
    finiteNumber(runway.le_latitude_deg),
    finiteNumber(runway.le_longitude_deg),
    finiteNumber(runway.he_latitude_deg),
    finiteNumber(runway.he_longitude_deg),
  ];
  if (!values.every((value) => value !== null)) return false;
  const [leLat, leLon, heLat, heLon] = values;
  const endpointsAreZeroPlaceholders = Math.abs(leLat) < 0.000001
    && Math.abs(leLon) < 0.000001
    && Math.abs(heLat) < 0.000001
    && Math.abs(heLon) < 0.000001;
  return !endpointsAreZeroPlaceholders;
}

function runwayHasUsableSurface(runway) {
  const surface = (runway.surface ?? '').toLowerCase();
  return !surface.includes('water') && !surface.includes('ice');
}

function runwayHasPositiveDimensions(runway) {
  const lengthFt = finiteNumber(runway.length_ft);
  const widthFt = finiteNumber(runway.width_ft);
  return lengthFt !== null && lengthFt > 0 && widthFt !== null && widthFt > 0;
}

function directionForRunway(airport, runway) {
  const preferred = PREFERRED_RUNWAY_DIRECTIONS.get(`${airport.ident}:${runway.le_ident}:${runway.he_ident}`);
  if (preferred === runway.he_ident) return 'he-to-le';
  return 'le-to-he';
}

function runwayRow(airport, runway) {
  const le = {
    lat: finiteNumber(runway.le_latitude_deg),
    lon: finiteNumber(runway.le_longitude_deg),
  };
  const he = {
    lat: finiteNumber(runway.he_latitude_deg),
    lon: finiteNumber(runway.he_longitude_deg),
  };
  const elevationFt = finiteNumber(airport.elevation_ft) ?? 0;
  const widthM = (finiteNumber(runway.width_ft) ?? 100) * 0.3048;
  const direction = directionForRunway(airport, runway);
  const start = direction === 'he-to-le' ? he : le;
  const end = direction === 'he-to-le' ? le : he;
  const id = direction === 'he-to-le' ? runway.he_ident : runway.le_ident;
  const oppositeId = direction === 'he-to-le' ? runway.le_ident : runway.he_ident;

  return [
    runway.id,
    airport.ident,
    id,
    oppositeId,
    rounded(start.lat, 6),
    rounded(start.lon, 6),
    rounded(end.lat, 6),
    rounded(end.lon, 6),
    rounded(elevationFt, 1),
    rounded(bearingDegrees(start, end), 1),
    rounded(distanceMeters(start, end), 0),
    rounded(widthM, 1),
  ];
}

function stringifyRow(row) {
  return `  ${JSON.stringify(row)},`;
}

function generateModule(rows, metadata) {
  return `// Generated by scripts/generate-norway-runways.mjs from OurAirports CSV data.
// Do not hand-edit rows; rerun the generator after reviewing source changes.

export type NorwayRunwayRow = readonly [
  sourceId: string,
  airport: string,
  id: string,
  oppositeId: string,
  lat: number,
  lon: number,
  endLat: number,
  endLon: number,
  altFt: number,
  headingDeg: number,
  lengthM: number,
  widthM: number,
];

export const NORWAY_RUNWAY_SOURCE = ${JSON.stringify(metadata, null, 2)} as const;

export const NORWAY_RUNWAY_SOURCE_NOTE =
  'OurAirports public-domain runway endpoint geometry; not official AIP/procedure data and not certified for navigation.' as const;

export const NORWAY_RUNWAY_ROWS = [
${rows.map(stringifyRow).join('\n')}
] as const satisfies readonly NorwayRunwayRow[];

export const NORWAY_AIRPORT_IDENTS = [...new Set(NORWAY_RUNWAY_ROWS.map((row) => row[1]))] as const;

export type NorwayAirportIdent = typeof NORWAY_AIRPORT_IDENTS[number];
`;
}

const [airportsText, runwaysText] = await Promise.all([
  readSource(process.env.AIRPORTS_CSV_PATH, AIRPORTS_URL),
  readSource(process.env.RUNWAYS_CSV_PATH, RUNWAYS_URL),
]);
const airports = parseCsv(airportsText);
const runways = parseCsv(runwaysText);
const norwayAirports = airports.filter((airport) => airport.iso_country === 'NO' || airport.iso_country === 'SJ');
const norwayAirportById = new Map(norwayAirports.map((airport) => [airport.id, airport]));
const rows = runways
  .filter((runway) => {
    const airport = norwayAirportById.get(runway.airport_ref);
    return airport
      && INCLUDED_AIRPORT_TYPES.has(airport.type)
      && runway.closed !== '1'
      && runwayHasUsableSurface(runway)
      && runwayHasPositiveDimensions(runway)
      && runwayHasCompleteEndpoints(runway);
  })
  .map((runway) => runwayRow(norwayAirportById.get(runway.airport_ref), runway))
  .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

const airportCount = new Set(rows.map((row) => row[1])).size;
const metadata = {
  sourceName: 'OurAirports',
  airportsUrl: AIRPORTS_URL,
  runwaysUrl: RUNWAYS_URL,
  generatedAt: new Date().toISOString(),
  isoCountry: 'NO/SJ',
  includedAirportTypes: [...INCLUDED_AIRPORT_TYPES].sort(),
  excludedAirportTypes: ['closed', 'heliport', 'seaplane_base'],
  airportCount,
  runwayCount: rows.length,
  filtering: 'Norway/Svalbard airports with type small_airport, medium_airport, or large_airport and open non-water/non-ice runway rows with positive dimensions and complete non-zero endpoint coordinates.',
  limitations: 'Public-domain community data; excludes heliports, seaplane bases, closed airports, closed runway rows, water/ice surfaces, rows without complete runway endpoints, and 0/0 endpoint placeholders.',
};

fs.writeFileSync(outputPath, generateModule(rows, metadata));
logInfo(`Generated ${rows.length} Norway runway rows across ${airportCount} airports at ${outputPath}`);
