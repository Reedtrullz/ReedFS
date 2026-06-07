import { describe, expect, it } from 'vitest';
import {
  ENVA_RUNWAYS,
  KPDX_RUNWAYS,
  KSEA_RUNWAY_16L,
  KSEA_RUNWAYS,
  SUPPORTED_RUNWAYS,
  runwayByAirportAndId,
} from '../runwayData';

describe('runwayData', () => {
  it('preserves the KSEA runway catalog', () => {
    expect(KSEA_RUNWAYS).toHaveLength(3);
    expect(KSEA_RUNWAYS).toContain(KSEA_RUNWAY_16L);
    expect(KSEA_RUNWAYS.map((runway) => runway.id)).toEqual(['16L', '16C', '16R']);
    expect(runwayByAirportAndId('KSEA', '16L')).toBe(KSEA_RUNWAY_16L);
  });

  it('adds the KPDX runway catalog', () => {
    expect(KPDX_RUNWAYS).toHaveLength(3);
    expect(KPDX_RUNWAYS.map((runway) => runway.id)).toEqual(['10L', '10R', '03']);
    expect(KPDX_RUNWAYS.map((runway) => runway.oppositeId)).toEqual(['28R', '28L', '21']);
  });

  it('exports ENVA, KSEA and KPDX references as supported runways', () => {
    expect(SUPPORTED_RUNWAYS).toEqual([...ENVA_RUNWAYS, ...KSEA_RUNWAYS, ...KPDX_RUNWAYS]);
  });

  it('finds KPDX 10R by primary and opposite runway ids', () => {
    const kpdx10R = KPDX_RUNWAYS.find((runway) => runway.id === '10R');

    expect(kpdx10R).toBeDefined();
    expect(runwayByAirportAndId('KPDX', '10R')).toBe(kpdx10R);
    expect(runwayByAirportAndId('KPDX', '28L')).toBe(kpdx10R);
  });
});
