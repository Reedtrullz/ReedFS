import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AttitudeIndicator } from '../AttitudeIndicator';

function formatConsoleCalls(calls: unknown[][]) {
  return calls
    .map((args) => args.map((arg) => String(arg)).join(' '))
    .join('\n');
}

describe('AttitudeIndicator', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not return a freshly allocated Zustand selector snapshot on render', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<AttitudeIndicator />);

    expect(formatConsoleCalls(errorSpy.mock.calls as unknown[][])).not.toContain('getSnapshot should be cached');
  });
});
