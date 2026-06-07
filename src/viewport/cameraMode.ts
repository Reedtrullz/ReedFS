import type { SimStatus } from '../sim/simulationStatus';

export type CameraMode = 'chase' | 'cockpit' | 'tower' | 'free';

export function shouldAutoFollowCamera(_status: SimStatus, mode: CameraMode): boolean {
  switch (mode) {
    case 'chase':
    case 'cockpit':
    case 'tower':
      return true;
    case 'free':
      return false;
  }
}

export function nextCameraMode(mode: CameraMode): CameraMode {
  switch (mode) {
    case 'chase':
      return 'cockpit';
    case 'cockpit':
      return 'tower';
    case 'tower':
      return 'free';
    case 'free':
      return 'chase';
  }
}
