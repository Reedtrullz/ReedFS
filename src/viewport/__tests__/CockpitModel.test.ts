import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { createCockpitModel } from '../CockpitModel';
import { cockpitCameraOffset } from '../CameraManager';
import { createAircraftModelQuaternion } from '../aircraftOrientation';

const REQUIRED_COCKPIT_PARTS = [
  'cockpitShell',
  'windshieldFrame',
  'leftWindshieldPane',
  'rightWindshieldPane',
  'glareshield',
  'mainPanel',
  'pfdCutout',
  'ndCutout',
  'mcpPanel',
  'yoke',
  'controlColumn',
  'throttleQuadrant',
  'leftSeat',
  'rightSeat',
] as const;

describe('createCockpitModel', () => {
  it('keeps the root at the aircraft origin so body-local cockpit offsets rotate with attitude', () => {
    const cockpit = createCockpitModel();

    expect(cockpit.position.x).toBe(0);
    expect(cockpit.position.y).toBe(0);
    expect(cockpit.position.z).toBe(0);
  });

  it('contains the minimum named first-person cockpit shell parts', () => {
    const cockpit = createCockpitModel();

    REQUIRED_COCKPIT_PARTS.forEach((partName) => {
      expect(cockpit.getObjectByName(partName), partName).toBeTruthy();
    });
  });

  it('keeps the windscreen forward of the main panel and above the glareshield', () => {
    const cockpit = createCockpitModel();
    const windshield = cockpit.getObjectByName('windshieldFrame');
    const panel = cockpit.getObjectByName('mainPanel');
    const glareshield = cockpit.getObjectByName('glareshield');

    expect(windshield?.position.y).toBeGreaterThan(panel?.position.y ?? Number.POSITIVE_INFINITY);
    expect(windshield?.position.z).toBeGreaterThan(glareshield?.position.z ?? Number.POSITIVE_INFINITY);
  });

  it('places pilot-facing controls inside the cockpit envelope', () => {
    const cockpit = createCockpitModel();
    const yoke = cockpit.getObjectByName('yoke');
    const throttle = cockpit.getObjectByName('throttleQuadrant');
    const eye = cockpitCameraOffset({ phi: 0, theta: 0, psi: 0 });

    expect(yoke?.position.y).toBeGreaterThan(eye.north - 3);
    expect(yoke?.position.y).toBeLessThan(eye.north);
    expect(Math.abs(yoke?.position.x ?? 99)).toBeLessThan(1.5);
    expect(throttle?.position.y).toBeLessThan(yoke?.position.y ?? -Infinity);
  });

  it('surrounds the CameraManager cockpit eye point instead of sitting behind it', () => {
    const cockpit = createCockpitModel();
    const bounds = new Box3().setFromObject(cockpit);
    const eye = cockpitCameraOffset({ phi: 0, theta: 0, psi: 0 });

    expect(bounds.containsPoint(new Vector3(eye.east, eye.north, eye.up))).toBe(true);
    expect(cockpit.getObjectByName('windshieldFrame')?.position.y).toBeGreaterThan(eye.north - cockpit.position.y);
  });

  it('keeps the cockpit eye inside the shell when the aircraft pitches or rolls', () => {
    const cockpit = createCockpitModel();
    const bounds = new Box3().setFromObject(cockpit);
    const attitude = { phi: 8 * Math.PI / 180, theta: 10 * Math.PI / 180, psi: 25 * Math.PI / 180 };
    const eye = cockpitCameraOffset(attitude);
    const inverseModelAttitude = createAircraftModelQuaternion(attitude).invert();
    const eyeInCockpitLocal = new Vector3(eye.east, eye.north, eye.up).applyQuaternion(inverseModelAttitude);

    expect(bounds.containsPoint(eyeInCockpitLocal)).toBe(true);
  });

  it('tags pilot controls with stable cockpit interaction metadata for future picking', () => {
    const cockpit = createCockpitModel();

    expect(cockpit.getObjectByName('throttleLever1')?.userData.cockpitInteraction.id).toBe('throttle-levers');
    expect(cockpit.getObjectByName('throttleLever2')?.userData.cockpitInteraction.id).toBe('throttle-levers');
    expect(cockpit.getObjectByName('flapLever')?.userData.cockpitInteraction.id).toBe('flap-lever');
    expect(cockpit.getObjectByName('gearLever')?.userData.cockpitInteraction.id).toBe('gear-lever');
    expect(cockpit.getObjectByName('speedbrakeLever')?.userData.cockpitInteraction.id).toBe('speedbrake-lever');
  });
});
