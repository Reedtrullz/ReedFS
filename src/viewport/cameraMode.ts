import type { SimStatus } from '../store/simStore';

export type CameraMode = 'chase' | 'cockpit' | 'tower';

export function shouldAutoFollowCamera(status: SimStatus, _mode: CameraMode): boolean {
  return status === 'running';
}
