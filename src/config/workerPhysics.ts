export const WORKER_PHYSICS_ENV_FLAG = 'VITE_RFS_WORKER_PHYSICS' as const;
export const WORKER_PHYSICS_ENABLED_BY_DEFAULT = false as const;

export type WorkerPhysicsEnv = Record<string, string | boolean | undefined>;
export type WorkerPhysicsConfigSource = 'default' | 'env';

export interface WorkerPhysicsConfig {
  enabled: boolean;
  source: WorkerPhysicsConfigSource;
  rawValue?: string;
  reason?: string;
}

const ENABLED_WORKER_PHYSICS_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const DISABLED_WORKER_PHYSICS_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled', '']);

function rawValueToString(value: string | boolean): string {
  return String(value);
}

export function resolveWorkerPhysicsConfig(
  env: WorkerPhysicsEnv = import.meta.env,
): WorkerPhysicsConfig {
  const rawEnvValue = env[WORKER_PHYSICS_ENV_FLAG];

  if (typeof rawEnvValue === 'undefined') {
    return {
      enabled: WORKER_PHYSICS_ENABLED_BY_DEFAULT,
      source: 'default',
      reason: 'worker physics is default-off; main-thread physics remains the production runtime',
    };
  }

  const rawValue = rawValueToString(rawEnvValue);
  const normalizedValue = rawValue.trim().toLowerCase();

  if (ENABLED_WORKER_PHYSICS_VALUES.has(normalizedValue)) {
    return {
      enabled: true,
      source: 'env',
      rawValue,
    };
  }

  if (DISABLED_WORKER_PHYSICS_VALUES.has(normalizedValue)) {
    return {
      enabled: false,
      source: 'env',
      rawValue,
    };
  }

  return {
    enabled: false,
    source: 'env',
    rawValue,
    reason: `invalid ${WORKER_PHYSICS_ENV_FLAG} value "${rawValue}"; falling back to main-thread physics`,
  };
}

export function isWorkerPhysicsEnabled(env?: WorkerPhysicsEnv): boolean {
  return resolveWorkerPhysicsConfig(env).enabled;
}
