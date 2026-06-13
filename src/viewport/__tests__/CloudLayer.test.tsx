import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { RefObject } from 'react';
import type { MetarData } from '../../sim/weather';

const { addedBillboards, primitiveAdd, primitiveRemove, fromDegrees } = vi.hoisted(() => ({
  addedBillboards: [] as Array<{ position: { lon: number; lat: number; alt: number }; scale: number }>,
  primitiveAdd: vi.fn((collection: unknown) => collection),
  primitiveRemove: vi.fn(),
  fromDegrees: vi.fn((lon: number, lat: number, alt: number) => ({ lon, lat, alt })),
}));

vi.mock('cesium', () => ({
  BillboardCollection: class {
    add(entity: { position: { lon: number; lat: number; alt: number }; scale: number }) {
      addedBillboards.push(entity);
      return entity;
    }
  },
  Cartesian3: { fromDegrees },
  HeightReference: { NONE: 'NONE' },
}));

import { CloudLayer } from '../CloudLayer';

function installCanvasStub(): () => void {
  const gradient = { addColorStop: vi.fn() };
  const context = {
    createRadialGradient: vi.fn(() => gradient),
    fillRect: vi.fn(),
    fillStyle: '',
  };
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  return () => spy.mockRestore();
}

function viewerRef(): RefObject<unknown> {
  return {
    current: {
      scene: {
        primitives: {
          add: primitiveAdd,
          remove: primitiveRemove,
        },
      },
    },
  };
}

const metar: MetarData = {
  windDir: 120,
  windSpeed: 8,
  temperature: 21,
  visibility: 9999,
  qnh: 1012,
  clouds: [{ cover: 'SCT', base: 4_500 }],
};

describe('CloudLayer', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    addedBillboards.length = 0;
  });

  it('uses the scenario cloud seed and anchor for deterministic cloud billboard layout', async () => {
    const restoreCanvas = installCanvasStub();
    let randomValue = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      randomValue = (randomValue + 0.271828) % 1;
      return randomValue;
    });

    async function renderSignature() {
      addedBillboards.length = 0;
      const view = render(
        <CloudLayer
          viewerRef={viewerRef() as RefObject<never>}
          metar={metar}
          cloudSeed={4242}
          cloudAnchor={{ lat: 45.5965, lon: -122.6001 }}
        />,
      );
      await waitFor(() => expect(addedBillboards.length).toBe(9));
      const signature = addedBillboards.map((billboard) => ({
        position: billboard.position,
        scale: billboard.scale,
      }));
      view.unmount();
      return signature;
    }

    try {
      const first = await renderSignature();
      const second = await renderSignature();

      expect(second).toEqual(first);
      expect(first.some((billboard) => (
        Math.abs(billboard.position.lat - 45.5965) < 1e-9
        && Math.abs(billboard.position.lon - -122.6001) < 1e-9
      ))).toBe(true);
      expect(first[0].position.alt).toBeCloseTo(4_500 * 0.3048, 6);
    } finally {
      restoreCanvas();
    }
  });
});
