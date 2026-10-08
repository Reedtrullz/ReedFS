import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import reference from './fixtures/wmm2025-reference.json';
import { WMM_2025_COEFFICIENTS, WMM_COEFFICIENT_SHA256 } from '../data/navigation/wmm2025';
import { decimalYearUtc, magneticFieldBand, wmm2025Field, fromTrueHeading, toTrueHeading } from '../magneticHeading';

describe('pinned WMM2025 numeric and input qualification', () => {
  it('binds the embedded numeric table to the independently pinned source rows', () => {
    expect(WMM_COEFFICIENT_SHA256).toBe(reference.coefficients.sourceSha256);
    expect(WMM_2025_COEFFICIENTS).toHaveLength(90);
    expect(createHash('sha256').update(JSON.stringify(WMM_2025_COEFFICIENTS)).digest('hex')).toBe(reference.coefficients.canonicalNumericRowsSha256);
  });
  it.each(reference.cases)('matches independently printed fields at $decimalYear/$latitudeDeg/$heightAboveEllipsoidKm', (row) => {
    const year = Math.floor(row.decimalYear);
    const utcMs = Date.UTC(year, 0, 1) + (row.decimalYear - year) * (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1));
    const result = wmm2025Field({ ...row, utcMs });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    for (const key of ['northNt', 'eastNt', 'downNt', 'horizontalNt', 'totalNt'] as const) {
      expect(Math.abs(result[key] - row.expected[key])).toBeLessThanOrEqual(0.05 + 1e-8);
    }
    for (const key of ['inclinationDeg', 'declinationEastDeg'] as const) {
      expect(Math.abs(result[key] - row.expected[key])).toBeLessThanOrEqual(0.005 + 1e-8);
    }
    expect(result.modelId).toBe('wmm-2025/noaa-legacy-harmonics/v1');
  });

  it('uses actual UTC year length and the full2025..2029 interval', () => {
    expect(decimalYearUtc(Date.UTC(2028, 6, 2))).toBe(2028.5);
    expect(decimalYearUtc(Date.UTC(2027, 6, 2, 12))).toBe(2027.5);
    const input = { latitudeDeg: 47.45, longitudeDeg: -122.31, heightAboveEllipsoidKm: 0 };
    expect(wmm2025Field({ ...input, utcMs: Date.UTC(2025, 0, 1) }).ok).toBe(true);
    expect(wmm2025Field({ ...input, utcMs: Date.UTC(2029, 11, 31, 23, 59, 59) }).ok).toBe(true);
    expect(wmm2025Field({ ...input, utcMs: Date.UTC(2025, 0, 1) - 1 })).toMatchObject({ ok: false, reason: 'unsupported-epoch' });
    expect(wmm2025Field({ ...input, utcMs: Date.UTC(2030, 0, 1) })).toMatchObject({ ok: false, reason: 'unsupported-epoch' });
  });

  it('uses current2000/6000nT blackout and caution bands, including exact boundaries', () => {
    expect([NaN, Infinity, -1, 0, 1999.999].map(magneticFieldBand)).toEqual(Array(5).fill('unavailable'));
    expect([2000, 5999.999].map(magneticFieldBand)).toEqual(['caution', 'caution']);
    expect(magneticFieldBand(6000)).toBe('normal');
    expect(wmm2025Field({ latitudeDeg: 90, longitudeDeg: 0, heightAboveEllipsoidKm: 0, utcMs: Date.UTC(2026, 0, 1) }))
      .toMatchObject({ ok: false, reason: 'blackout' });
  });

  it('keeps the dateline equivalent and rejects invalid inputs without model substitution', () => {
    const input = { latitudeDeg: 45, longitudeDeg: 180, heightAboveEllipsoidKm: 0, utcMs: Date.UTC(2026, 0, 1) };
    const east = wmm2025Field(input), west = wmm2025Field({ ...input, longitudeDeg: -180 });
    if (!east.ok || !west.ok) throw new Error('Expected valid dateline points');
    expect(east.declinationEastDeg).toBeCloseTo(west.declinationEastDeg, 10);
    for (const patch of [{ latitudeDeg: NaN }, { latitudeDeg: 90.01 }, { longitudeDeg: -180.01 }, { utcMs: NaN },
      { heightAboveEllipsoidKm: Infinity }, { heightAboveEllipsoidKm: -1.01 }, { heightAboveEllipsoidKm: 100.01 }]) {
      expect(wmm2025Field({ ...input, ...patch }).ok).toBe(false);
    }
  });
});

describe('explicit east-positive reference conversion', () => {
  it('converts a nonzero supplied variation once, with sign/wrap and true roundtrip', () => {
    expect(toTrueHeading({ reference: 'magnetic', degrees: 350, variationEastDeg: 20 })).toBe(10);
    expect(fromTrueHeading(10, 'magnetic', 20)).toBe(350);
    expect(toTrueHeading({ reference: 'magnetic', degrees: 10, variationEastDeg: -20 })).toBe(350);
    expect(toTrueHeading({ reference: 'true', degrees: 10 })).toBe(10);
    expect(fromTrueHeading(10, 'true', null)).toBe(10);
    // The converted bare scalar cannot be passed through the tagged boundary again.
    expect(toTrueHeading(10)).toBeNull();
  });

  it('rejects missing/unknown references, unusable variation and nonfinite values', () => {
    for (const input of [null, { degrees: 90 }, { reference: 'grid', degrees: 90 }, { reference: 'true', degrees: NaN },
      { reference: 'magnetic', degrees: 90 }, { reference: 'magnetic', degrees: 90, variationEastDeg: Infinity },
      { reference: 'magnetic', degrees: 90, variationEastDeg: 181 }]) expect(toTrueHeading(input)).toBeNull();
    expect(fromTrueHeading(90, 'magnetic', null)).toBeNull();
    expect(fromTrueHeading(NaN, 'true', null)).toBeNull();
  });
});
