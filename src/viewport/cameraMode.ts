import type { SimStatus } from '../store/simStore';

export type CameraMode = 'chase' | 'cockpit' | 'tower';

export function shouldAutoFollowCamera(status: SimStatus, mode: CameraMode): boolean {
  switch (mode) {
    case 'chase':
    case 'cockpit':
    case 'tower':
      return status === 'running';
  }
}
