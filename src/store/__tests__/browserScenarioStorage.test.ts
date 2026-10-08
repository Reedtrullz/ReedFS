import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSimStore } from '../simStore';
import { SCENARIO_SAVE_KEY } from '../scenarioPersistence';
import { withBrowserScenarioSaveLock } from '../browserScenarioStorage';

const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
afterEach(() => { window.name = ''; if (descriptor) Object.defineProperty(navigator, 'locks', descriptor); else Reflect.deleteProperty(navigator, 'locks'); });

describe('browser save authority', () => {
  it('fails closed without Web Locks and retains the pending save without changing storage', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    localStorage.setItem(SCENARIO_SAVE_KEY, 'preserved');
    useSimStore.getState().reset();
    useSimStore.getState().saveScenarioState();
    await vi.waitFor(() => expect(useSimStore.getState().scenarioPersistenceMessage).toMatch(/does not support save locks/));
    expect(localStorage.getItem(SCENARIO_SAVE_KEY)).toBe('preserved');
    expect(useSimStore.getState().pendingScenarioSave).not.toBeNull();
  });
  it('rejects a companion window before acquiring a write lock', async () => {
    window.name = 'rfs-companion';
    const request = vi.fn();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    const operation = vi.fn();
    await expect(withBrowserScenarioSaveLock(operation)).rejects.toThrow(/Companion windows/);
    expect(request).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });
});
