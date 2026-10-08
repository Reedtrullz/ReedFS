import { afterEach, describe, expect, it, vi } from 'vitest';
import { USSA_1976_DATA } from '../../data/atmosphere/ussa-1976.v1';
import { B737_800_FDM } from '../../data/aircraft/b737-800-fdm.v1';

afterEach(() => { vi.doUnmock('../../data/atmosphere/ussa-1976.v1'); vi.resetModules(); });

describe('atmosphere source ownership', () => {
  it('keeps the permitted generic packet distinct from aircraft placeholders', () => {
    const packet = USSA_1976_DATA.sourcePacket;
    expect(packet.id).toBe('noaa-nasa-usaf-ussa-1976-lower-atmosphere');
    expect(packet.dataGroup).toBe('weather/atmosphere');
    expect(packet.confidence).toBe('derived-from-source');
    expect(packet.sourceQuality).toBe('public-reference');
    expect(packet.url).toBe('https://ntrs.nasa.gov/citations/19770009539');
    expect(packet.permission).toContain('Public Use Permitted');
    expect(packet.citation).toContain('Eq.18');
    expect(packet.claimBoundary).toContain('engineering approximations');
    expect(packet.pdfSha256).toMatch(/^[a-f0-9]{64}$/);
    for (const group of [B737_800_FDM.aero, B737_800_FDM.engine, B737_800_FDM.configuration, B737_800_FDM.ground, ...B737_800_FDM.gearStations]) {
      expect(group.sourceQuality).toBe('gameplay-calibrated');
      expect(group.sourceRefs).not.toContain(packet.id);
    }
  });

  it('standard and weather consumers read the versioned shell instead of duplicated constants', async () => {
    vi.resetModules();
    const data = structuredClone(USSA_1976_DATA);
    const constants = { ...data.constants, seaLevelTemperatureK: 300, seaLevelPressurePa: 90000,
      dryAirMolarMassKgPerKmol: 20, heatCapacityRatio: 1.6, sutherlandCoefficient: 2e-6, sutherlandTemperatureK: 120 };
    vi.doMock('../../data/atmosphere/ussa-1976.v1', () => ({
      USSA_1976_CONSTANTS: constants, USSA_1976_LAYERS: data.layers, USSA_1976_DATA: { ...data, constants },
    }));
    const { isaAtAltitude, atmosphereForDensityAltitude } = await import('../atmosphere');
    const gasConstant = 8314.32 / 20;
    const standard = isaAtAltitude(0);
    expect(standard.tempK).toBe(300); expect(standard.pressurePa).toBe(90000);
    expect(standard.density).toBeCloseTo(90000 / (gasConstant * 300), 12);
    expect(standard.speedOfSound).toBeCloseTo(Math.sqrt(1.6 * gasConstant * 300), 12);
    expect(standard.viscosity).toBeCloseTo(2e-6 * 300 ** 1.5 / 420, 12);
    expect(atmosphereForDensityAltitude(0, { qnhHpa: 900, surfaceTemperatureC: 26.85 })).toEqual(standard);
  });
});
