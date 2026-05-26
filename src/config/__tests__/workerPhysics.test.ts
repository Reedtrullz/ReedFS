import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isWorkerPhysicsEnabled,
  resolveWorkerPhysicsConfig,
  WORKER_PHYSICS_ENV_FLAG,
} from '../workerPhysics';

function envWithWorkerPhysicsFlag(value: string | boolean | undefined): Record<string, string | boolean | undefined> {
  return { [WORKER_PHYSICS_ENV_FLAG]: value };
}

describe('worker physics config', () => {
  beforeEach(() => {
    vi.stubEnv(WORKER_PHYSICS_ENV_FLAG, undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to disabled main-thread physics when the flag is absent', () => {
    expect(resolveWorkerPhysicsConfig({})).toEqual({
      enabled: false,
      source: 'default',
      reason: expect.stringContaining('default-off'),
    });
    expect(isWorkerPhysicsEnabled({})).toBe(false);
  });

  it.each(['1', 'true', 'TRUE', 'yes', 'on', 'enabled', true])(
    'enables worker physics for explicit true token %s',
    (value) => {
      expect(resolveWorkerPhysicsConfig(envWithWorkerPhysicsFlag(value))).toEqual({
        enabled: true,
        source: 'env',
        rawValue: String(value),
      });
      expect(isWorkerPhysicsEnabled(envWithWorkerPhysicsFlag(value))).toBe(true);
    },
  );

  it.each(['0', 'false', 'FALSE', 'no', 'off', 'disabled', '', false])(
    'keeps worker physics disabled for explicit false token %s',
    (value) => {
      expect(resolveWorkerPhysicsConfig(envWithWorkerPhysicsFlag(value))).toEqual({
        enabled: false,
        source: 'env',
        rawValue: String(value),
      });
      expect(isWorkerPhysicsEnabled(envWithWorkerPhysicsFlag(value))).toBe(false);
    },
  );

  it('falls back safely/off with a reason for invalid tokens', () => {
    const config = resolveWorkerPhysicsConfig(envWithWorkerPhysicsFlag('maybe'));

    expect(config).toEqual({
      enabled: false,
      source: 'env',
      rawValue: 'maybe',
      reason: expect.stringContaining(WORKER_PHYSICS_ENV_FLAG),
    });
    expect(config.reason).toContain('invalid');
    expect(config.reason).toContain('main-thread physics');
    expect(isWorkerPhysicsEnabled(envWithWorkerPhysicsFlag('maybe'))).toBe(false);
  });

  it('reads the Vite runtime env by default', () => {
    vi.stubEnv(WORKER_PHYSICS_ENV_FLAG, 'yes');
    expect(resolveWorkerPhysicsConfig()).toEqual({
      enabled: true,
      source: 'env',
      rawValue: 'yes',
    });
    expect(isWorkerPhysicsEnabled()).toBe(true);
  });
});
