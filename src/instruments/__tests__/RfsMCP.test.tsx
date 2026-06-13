import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RfsMCP } from '../RfsMCP';
import { RfsPFD } from '../RfsPFD';
import { createDefaultAutopilotState } from '../defaultAutopilotState';
import { useSimStore } from '../../store/simStore';
import { eulerToQuat } from '../../sim/physics/quaternion';
import { createKseaKpdxFlight } from '../../sim/flightPlanLoader';
import { computeRouteStatus } from '../../sim/systems/navigation';
import { deriveEffectiveAutoflightTruth } from '../../sim/systems/effectiveAutoflightTruth';
import { computeDerived } from '../../sim/physics/derived';
import { ktToMs } from '../../sim/physics/units';

function setVnavBackedKseaRoute(): void {
  const flightPlan = createKseaKpdxFlight();
  const aircraft = structuredClone(useSimStore.getState().aircraft);
  aircraft.position.lat = 46.97;
  aircraft.position.lon = -122.90;
  aircraft.position.alt = 18_000;
  aircraft.velocity.u = 128.6;
  const routeStatus = computeRouteStatus(aircraft, flightPlan, 1);

  useSimStore.setState({
    aircraft,
    flightPlan,
    activeLegIndex: routeStatus.activeLegIndex,
    routeStatus,
  });
}

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
    expect(ap?.boeing.cmdA).toBe(false);
    expect(ap?.boeing.cmdB).toBe(false);
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
    expect(screen.getByText('FD ROLL +0.0°')).toBeTruthy();
    expect(screen.getByLabelText('Flight director pitch bar')).toBeTruthy();
    expect(screen.getByText('FD PITCH +0.0°')).toBeTruthy();
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

  it('does not highlight SPEED when raw SPEED truth is not backed by speedMode', () => {
    const ap = createDefaultAutopilotState();
    ap.truth.autopilotStatus = 'CMD_A';
    ap.boeing.cmdA = true;
    ap.truth.thrustActive = 'SPEED';
    ap.boeing.autothrottleArm = true;
    ap.boeing.speedMode = false;
    useSimStore.getState().setApState(ap);

    render(<RfsMCP />);

    expect(screen.getByRole('button', { name: 'SPD' })).toHaveStyle({ background: '#333' });
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
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.position.alt = 432;
    aircraft.attitude = { phi: 0, theta: 0, psi: 163 * Math.PI / 180 };
    aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
    aircraft.velocity = { u: ktToMs(149), v: 0, w: 0 };
    useSimStore.setState({ aircraft, wind: null });
    const expectedSpeed = Math.round(Math.max(0, computeDerived(aircraft).ias));

    render(<RfsMCP />);

    fireEvent.click(screen.getByRole('button', { name: 'SPD +5' }));

    const ap = useSimStore.getState().apState;
    expect(ap).not.toBeNull();
    expect(ap?.boeing.speed).toBe(expectedSpeed + 5);
    expect(ap?.truth.thrustActive).toBe('OFF');
    expect(screen.getByText(`SPD ${expectedSpeed + 5}`)).toBeTruthy();
  });

  it('edits selected MCP heading altitude and vertical-speed targets from current aircraft state', () => {
    const aircraft = structuredClone(useSimStore.getState().aircraft);
    aircraft.position.alt = 12_432;
    aircraft.attitude = { phi: 0, theta: 0, psi: 163 * Math.PI / 180 };
    aircraft.quaternion = eulerToQuat(aircraft.attitude.phi, aircraft.attitude.theta, aircraft.attitude.psi);
    aircraft.velocity = { u: ktToMs(220), v: 0, w: 0 };
    useSimStore.setState({ aircraft, wind: null });
    const seededHeading = Math.round(aircraft.attitude.psi * 180 / Math.PI);
    const seededAltitude = Math.round(aircraft.position.alt / 100) * 100;

    render(<RfsMCP />);

    fireEvent.click(screen.getByRole('button', { name: 'HDG -5' }));
    fireEvent.click(screen.getByRole('button', { name: 'ALT +1000' }));
    fireEvent.click(screen.getByRole('button', { name: 'VS +100' }));

    const ap = useSimStore.getState().apState;
    expect(ap?.boeing.heading).toBe(seededHeading - 5);
    expect(ap?.boeing.altitude).toBe(seededAltitude + 1000);
    expect(ap?.boeing.verticalSpeed).toBe(100);
    expect(screen.getByText(`HDG ${String(seededHeading - 5).padStart(3, '0')}`)).toBeTruthy();
    expect(screen.getByText(`ALT ${seededAltitude + 1000}`)).toBeTruthy();
    expect(screen.getByText('VS +100')).toBeTruthy();
  });

  it('does not render a VNAV button when no VNAV backing is available', () => {
    render(<RfsMCP />);

    expect(screen.queryByRole('button', { name: 'VNAV' })).toBeNull();
  });

  it('renders a backed VNAV button for an available constrained route and engages Boeing VNAV truth', () => {
    setVnavBackedKseaRoute();
    render(<RfsMCP />);

    const vnav = screen.getByRole('button', { name: 'VNAV' });
    fireEvent.click(vnav);

    const state = useSimStore.getState();
    const ap = state.apState;
    expect(ap).not.toBeNull();
    expect(ap?.truth.autopilotStatus).toBe('CMD_A');
    expect(ap?.truth.verticalActive).toBe('VNAV');
    expect(ap?.boeing.cmdA).toBe(true);
    expect(ap?.boeing.vnav).toBe(true);
    expect(ap?.boeing.altHold).toBe(false);
    expect(ap?.boeing.vs).toBe(false);

    const effective = deriveEffectiveAutoflightTruth(ap, state);
    expect(effective.verticalActive).toBe('VNAV_PTH');
    expect(vnav).toHaveStyle({ background: '#0a0' });
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
