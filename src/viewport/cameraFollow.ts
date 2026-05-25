import type { Attitude } from '../sim/types';

export interface EnuOffset {
  east: number;
  north: number;
  up: number;
}

export function headingForwardEnu(headingRad: number): EnuOffset {
  return {
    east: Math.sin(headingRad),
    north: Math.cos(headingRad),
    up: 0,
  };
}

/**
 * Build an explicit ENU camera offset behind the aircraft nose.
 *
 * Cesium HeadingPitchRange has historically been easy to misread because its
 * heading is an offset convention, not an aircraft-body convention. A Cartesian
 * ENU offset makes the chase contract testable: camera offset dot nose-forward
 * must be negative, and the lateral component must be zero.
 */
export function chaseCameraOffset(
  attitude: Pick<Attitude, 'psi'>,
  rangeMeters = 300,
  lookDownRad = 15 * Math.PI / 180,
): EnuOffset {
  const forward = headingForwardEnu(attitude.psi);
  const horizontalRange = rangeMeters * Math.cos(lookDownRad);

  return {
    east: -forward.east * horizontalRange,
    north: -forward.north * horizontalRange,
    up: rangeMeters * Math.sin(lookDownRad),
  };
}
