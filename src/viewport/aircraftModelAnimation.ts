import * as THREE from 'three';
import type { AircraftState } from '../sim/types';

const ENGINE_SPIN_RATE_RAD_PER_SECOND = 40;

export function applyAircraftModelAnimations(model: THREE.Object3D, aircraft: Pick<AircraftState, 'engines' | 'simTime' | 'position' | 'config'>): void {
  applyEngineFanSpin(model, aircraft);
  applyGearCompression(model, aircraft);
}

function applyEngineFanSpin(model: THREE.Object3D, aircraft: Pick<AircraftState, 'engines' | 'simTime'>): void {
  const engineNames = ['leftEngine', 'rightEngine'];
  engineNames.forEach((name, index) => {
    const engine = model.getObjectByName(name);
    if (!engine) return;
    const n1 = aircraft.engines[index]?.n1 ?? 0;
    engine.rotation.y = aircraft.simTime * n1 * ENGINE_SPIN_RATE_RAD_PER_SECOND;
  });
}

function applyGearCompression(model: THREE.Object3D, aircraft: Pick<AircraftState, 'position' | 'config'>): void {
  const onGround = aircraft.position.alt < 100 && aircraft.config.gearDown;
  model.traverse((child) => {
    if (!child.name.includes('Gear')) return;
    child.scale.z = onGround ? 0.7 : 1.0;
  });
}
