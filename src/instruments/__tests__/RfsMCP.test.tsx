import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RfsMCP } from '../RfsMCP';
import { RfsPFD } from '../RfsPFD';
import { useSimStore } from '../../store/simStore';
import { eulerToQuat } from '../../sim/physics/quaternion';

describe('RfsMCP', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('first FD L click creates AP state without engaging any autopilot mode', () => {
    render(<RfsMCP />);

    fireEvent.click(screen.getByRole('button', { name: 'FD L' }));

    const ap = useSimStore.getState().apState;
    expect(ap).not.toBeNull();
    expect(ap?.boeing.fdLeft).toBe(true);
    expect(ap?.boeing.fdRight).toBe(false);
    expect(ap?.truth.autopilotStatus).toBe('OFF');
    expect(ap?.truth.lateralActive).toBe('OFF');
    expect(ap?.truth.verticalActive).toBe('OFF');
    expect(ap?.truth.thrustActive).toBe('OFF');
    expect(screen.getByRole('button', { name: 'FD L' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles FD switches independently without clearing active MCP modes', () => {
    render(<RfsMCP />);

    fireEvent.click(screen.getByRole('button', { name: 'HDG' }));
    fireEvent.click(screen.getByRole('button', { name: 'FD L' }));
    fireEvent.click(screen.getByRole('button', { name: 'FD R' }));
    fireEvent.click(screen.getByRole('button', { name: 'FD L' }));

    const ap = useSimStore.getState().apState;
    expect(ap?.truth.autopilotStatus).toBe('CMD_A');
    expect(ap?.truth.lateralActive).toBe('HDG_SEL');
    expect(ap?.boeing.hdgSel).toBe(true);
    expect(ap?.boeing.fdLeft).toBe(false);
    expect(ap?.boeing.fdRight).toBe(true);
    expect(screen.getByRole('button', { name: 'FD L' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'FD R' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('lets the player enable PFD Flight Director bars from the MCP controls', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.position.alt = 9_000;
    aircraft.attitude = { phi: 0, theta: 0, psi: 180 * Math.PI / 180 };
    aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
    useSimStore.setState({ aircraft });

    render(
      <>
        <RfsMCP />
        <RfsPFD />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'FD L' }));
    fireEvent.click(screen.getByRole('button', { name: 'HDG' }));
    fireEvent.click(screen.getByRole('button', { name: 'ALT' }));

    expect(screen.getByLabelText('Flight director roll bar')).toBeTruthy();
    expect(screen.getByText('FD ROLL -30.0°')).toBeTruthy();
    expect(screen.getByLabelText('Flight director pitch bar')).toBeTruthy();
    expect(screen.getByText('FD PITCH +4.0°')).toBeTruthy();
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

  it('first N1 click creates AP state and honestly engages N1', () => {
    render(<RfsMCP />);

    fireEvent.click(screen.getByRole('button', { name: 'N1' }));

    const ap = useSimStore.getState().apState;
    expect(ap).not.toBeNull();
    expect(ap?.truth.autopilotStatus).toBe('CMD_A');
    expect(ap?.truth.thrustActive).toBe('N1');
    expect(ap?.boeing.autothrottleArm).toBe(true);
    expect(ap?.boeing.n1).toBe(true);
    expect(ap?.boeing.speedMode).toBe(false);
  });

  it('switches between SPD and N1 without leaving conflicting Boeing thrust flags', () => {
    render(<RfsMCP />);

    fireEvent.click(screen.getByRole('button', { name: 'SPD' }));
    fireEvent.click(screen.getByRole('button', { name: 'N1' }));

    let ap = useSimStore.getState().apState;
    expect(ap?.truth.thrustActive).toBe('N1');
    expect(ap?.boeing.n1).toBe(true);
    expect(ap?.boeing.speedMode).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'SPD' }));

    ap = useSimStore.getState().apState;
    expect(ap?.truth.thrustActive).toBe('SPEED');
    expect(ap?.boeing.n1).toBe(false);
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

  it('edits selected MCP speed target without engaging SPEED mode', () => {
    render(<RfsMCP />);

    fireEvent.click(screen.getByRole('button', { name: 'SPD +5' }));

    const ap = useSimStore.getState().apState;
    expect(ap).not.toBeNull();
    expect(ap?.boeing.speed).toBe(255);
    expect(ap?.truth.thrustActive).toBe('OFF');
    expect(screen.getByText('SPD 255')).toBeTruthy();
  });

  it('edits selected MCP heading altitude and vertical-speed targets', () => {
    render(<RfsMCP />);

    fireEvent.click(screen.getByRole('button', { name: 'HDG -5' }));
    fireEvent.click(screen.getByRole('button', { name: 'ALT +1000' }));
    fireEvent.click(screen.getByRole('button', { name: 'VS +100' }));

    const ap = useSimStore.getState().apState;
    expect(ap?.boeing.heading).toBe(355);
    expect(ap?.boeing.altitude).toBe(11000);
    expect(ap?.boeing.verticalSpeed).toBe(100);
    expect(screen.getByText('HDG 355')).toBeTruthy();
    expect(screen.getByText('ALT 11000')).toBeTruthy();
    expect(screen.getByText('VS +100')).toBeTruthy();
  });

  it('does not render a clickable VNAV button when VNAV availability is not gated', () => {
    render(<RfsMCP />);

    expect(screen.queryByRole('button', { name: 'VNAV' })).toBeNull();
  });

  it('disables LNAV with a visible reason when no compatible route is available', () => {
    render(<RfsMCP />);

    const lnav = screen.getByRole('button', { name: 'LNAV' });
    expect(lnav).toHaveProperty('disabled', true);
    expect(lnav.getAttribute('title')).toMatch(/no flight plan loaded/i);

    fireEvent.click(lnav);

    expect(useSimStore.getState().apState).toBeNull();
  });

  it('first LNAV click creates AP state when route guidance is available', () => {
    useSimStore.setState((s) => ({
      routeStatus: {
        ...s.routeStatus,
        routeName: 'KSEA→KPDX',
        routeValid: true,
        lnavAvailable: true,
        lnavUnavailableReason: null,
        activeLegIndex: 0,
        activeLegCount: 1,
        fromIdent: 'KSEA',
        nextWaypointIdent: 'KPDX',
        desiredTrackRad: 2.95,
        desiredTrackDegTrue: 169,
      },
    }));
    render(<RfsMCP />);

    fireEvent.click(screen.getByRole('button', { name: 'LNAV' }));

    const ap = useSimStore.getState().apState;
    expect(ap).not.toBeNull();
    expect(ap?.truth.autopilotStatus).toBe('CMD_A');
    expect(ap?.truth.lateralActive).toBe('LNAV');
    expect(ap?.boeing.lnav).toBe(true);
  });
});
