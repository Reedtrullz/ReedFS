import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AutopilotState } from '@shared/autopilot/autopilotTypes';
import { RfsPFD } from '../RfsPFD';
import { useSimStore } from '../../store/simStore';

function apStateWithModes(): AutopilotState {
  return {
    boeing: {
      courseL: 0,
      courseR: 0,
      speed: 250,
      mach: null,
      heading: 180,
      altitude: 10000,
      verticalSpeed: null,
      fdLeft: true,
      fdRight: true,
      autothrottleArm: true,
      n1: false,
      speedMode: true,
      lnav: true,
      vnav: true,
      lvlChg: false,
      hdgSel: false,
      vorLoc: false,
      app: false,
      altHold: false,
      vs: false,
      cmdA: true,
      cmdB: false,
      cwsA: false,
      cwsB: false,
    },
    airbus: {
      speed: null,
      speedManaged: false,
      heading: null,
      headingManaged: false,
      altitude: 10000,
      altitudeManaged: false,
      verticalSpeed: null,
      fpa: null,
      fd1: false,
      fd2: false,
      athr: false,
      ap1: false,
      ap2: false,
      loc: false,
      appr: false,
      exped: false,
      hdgTrkMode: 'HDG_VS',
      metricAltitude: false,
      speedMachMode: 'SPD',
    },
    truth: {
      thrustActive: 'SPEED',
      lateralActive: 'LNAV',
      verticalActive: 'VNAV',
      autopilotStatus: 'CMD_A',
      lastModeChangeTimestamps: { thrust: 0, lateral: 0, vertical: 0 },
    },
  };
}

describe('RfsPFD', () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it('renders a readable PFD frame with labeled speed, altitude, attitude, and heading sections', () => {
    render(<RfsPFD />);

    expect(screen.getByLabelText('Primary flight display')).toBeTruthy();
    expect(screen.getByLabelText('Airspeed tape')).toBeTruthy();
    expect(screen.getByLabelText('Altitude tape')).toBeTruthy();
    expect(screen.getByText('IAS')).toBeTruthy();
    expect(screen.getByText('ALT')).toBeTruthy();
    expect(screen.getByText('ATT')).toBeTruthy();
    expect(screen.getByText('HDG')).toBeTruthy();
  });

  it('shows FMA truth modes instead of burying autopilot status in debug telemetry', () => {
    useSimStore.getState().setApState(apStateWithModes());

    render(<RfsPFD />);

    expect(screen.getByText('FMA')).toBeTruthy();
    expect(screen.getByText('SPEED')).toBeTruthy();
    expect(screen.getByText('LNAV')).toBeTruthy();
    expect(screen.getByText('VNAV')).toBeTruthy();
    expect(screen.getByText('CMD_A')).toBeTruthy();
  });
});
