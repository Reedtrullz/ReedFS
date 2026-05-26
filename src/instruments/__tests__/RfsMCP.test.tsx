import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RfsMCP } from '../RfsMCP';
import { useSimStore } from '../../store/simStore';

describe('RfsMCP', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('first SPD click creates AP state and honestly engages SPEED', () => {
    render(<RfsMCP />);

    fireEvent.click(screen.getByRole('button', { name: 'SPD' }));

    const ap = useSimStore.getState().apState;
    expect(ap).not.toBeNull();
    expect(ap?.truth.autopilotStatus).toBe('CMD_A');
    expect(ap?.truth.thrustActive).toBe('SPEED');
    expect(ap?.boeing.speedMode).toBe(true);
  });

  it('first VS click creates AP state and engages VS with a safe zero-fpm default', () => {
    render(<RfsMCP />);

    fireEvent.click(screen.getByRole('button', { name: 'VS' }));

    const ap = useSimStore.getState().apState;
    expect(ap).not.toBeNull();
    expect(ap?.truth.autopilotStatus).toBe('CMD_A');
    expect(ap?.truth.verticalActive).toBe('VS');
    expect(ap?.boeing.vs).toBe(true);
    expect(ap?.boeing.verticalSpeed).toBe(0);
  });

  it('does not render a clickable VNAV button when VNAV availability is not gated', () => {
    render(<RfsMCP />);

    expect(screen.queryByRole('button', { name: 'VNAV' })).toBeNull();
  });
});
