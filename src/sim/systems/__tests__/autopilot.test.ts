import { describe, it, expect, beforeEach } from 'vitest';
import {
  composeEffectiveControls,
  computeAutopilotCommands,
  computeAutopilotCommandsForState,
  resetAutopilotPID,
  resolveAutopilotTargets,
} from '../autopilot';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { AutopilotCommands, ControlInputs } from '../../types';
import type { AutopilotState, LateralMode, ThrustMode, VerticalMode } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import { createNoRouteStatus, type RouteStatusSnapshot } from '../navigation';

beforeEach(() => resetAutopilotPID());

function makeAp(lateral: LateralMode, vertical: VerticalMode, thrust: ThrustMode): AutopilotState {
  return {
    boeing: { courseL:0,courseR:0,speed:null,mach:null,heading:0,altitude:0,verticalSpeed:null,
      fdLeft:false,fdRight:false,autothrottleArm:false,
      n1:false,speedMode:false,lnav:false,vnav:false,lvlChg:false,hdgSel:false,vorLoc:false,app:false,altHold:false,vs:false,
      cmdA:true,cmdB:false,cwsA:false,cwsB:false },
    airbus: { speed:null,speedManaged:false,heading:null,headingManaged:false,altitude:0,altitudeManaged:false,
      verticalSpeed:null,fpa:null,fd1:false,fd2:false,athr:false,ap1:false,ap2:false,
      loc:false,appr:false,exped:false,hdgTrkMode:'HDG_VS',metricAltitude:false,speedMachMode:'SPD' },
    truth: {
      lateralActive: lateral, verticalActive: vertical, thrustActive: thrust,
      autopilotStatus: 'CMD_A',
      lastModeChangeTimestamps: { thrust:0, lateral:0, vertical:0 },
    },
  };
}

function makeInputs(partial: Partial<ControlInputs> = {}): ControlInputs {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle1: 0,
    throttle2: 0,
    flapLever: 0,
    gearLever: 'UP',
    spoilers: 0,
    brake: 0,
    ...partial,
  };
}

describe('computeAutopilotCommands HDG_SEL', () => {
  it('commands right aileron to turn toward target heading', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6; // flying at 250kt
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    // aircraft heading = π (180°, pointing south), target = 0° (north)
    s.attitude.psi = Math.PI;
    const commands = computeAutopilotCommands(s, ap, 0, 10000, 250, 1/60);
    // To turn from 180° to 0°, the shortest path is right (clockwise), aileron negative
    expect(commands.aileron).toBeLessThan(0);
  });
});

describe('computeAutopilotCommands ALT_HOLD', () => {
  it('pitches up when below target altitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    s.position.alt = 9000; // 1000ft below target
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    const commands = computeAutopilotCommands(s, ap, 0, 10000, 250, 1/60);
    // Below target → pitch up → elevator negative
    expect(commands.elevator).toBeLessThan(0);
  });

  it('near zero elevator at target altitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    s.position.alt = 10000;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    const commands = computeAutopilotCommands(s, ap, 0, 10000, 250, 1/60);
    expect(Math.abs(commands.elevator ?? 0)).toBeLessThan(0.1);
  });
});

describe('computeAutopilotCommands SPEED', () => {
  it('advances throttle below target speed', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 100; // 194 kts, target 250
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    const commands = computeAutopilotCommands(s, ap, 0, 10000, 250, 1/60);
    expect(commands.throttle1).toBeGreaterThan(0);
  });

  it('rate-limits the first throttle command instead of jumping to full power', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 50; // far below target, raw SPEED demand would saturate.
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');

    const commands = computeAutopilotCommands(s, ap, 0, 10000, 300, 1/60);

    expect(commands.throttle1).toBeGreaterThan(0);
    expect(commands.throttle1).toBeLessThan(0.15);
    expect(commands.throttle2).toBe(commands.throttle1);
  });
});

describe('computeAutopilotCommands N1', () => {
  it('resolves a takeoff N1 target for N1 thrust mode', () => {
    const s = createInitialState(B737_800_SPEC);
    s.flightPhase = 'TAKEOFF';
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'N1');
    ap.boeing.autothrottleArm = true;

    const targets = resolveAutopilotTargets(s, ap);

    expect(targets.targetN1Percent).toBeGreaterThan(85);
    expect(targets.targetN1Percent).toBeLessThanOrEqual(95);
  });

  it('advances throttle toward target N1 without using SPEED error', () => {
    const s = createInitialState(B737_800_SPEC);
    s.flightPhase = 'TAKEOFF';
    s.velocity.u = 220;
    s.engines[0].n1 = 35;
    s.engines[1].n1 = 35;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'N1');
    ap.boeing.autothrottleArm = true;
    const targets = resolveAutopilotTargets(s, ap);

    const commands = computeAutopilotCommands(
      s,
      ap,
      targets.targetHeadingRad,
      targets.targetAltFt,
      100,
      1 / 60,
      targets.targetVerticalSpeedFpm,
      targets.targetN1Percent,
    );

    // TAKEOFF N1 target = 92%, current N1 = 35% → full throttle commanded
    expect(commands.throttle1).toBeGreaterThan(0.85);
    expect(commands.throttle2).toBe(commands.throttle1);
  });

  it('reduces throttle below the base cruise N1 throttle when actual N1 is above target', () => {
    const s = createInitialState(B737_800_SPEC);
    s.flightPhase = 'CRUISE';
    s.engines[0].n1 = 95;
    s.engines[1].n1 = 95;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'N1');
    ap.boeing.autothrottleArm = true;
    const targets = resolveAutopilotTargets(s, ap);

    const commands = computeAutopilotCommands(
      s, ap, targets.targetHeadingRad, targets.targetAltFt, 100, 1 / 60,
      targets.targetVerticalSpeedFpm, targets.targetN1Percent,
    );

    expect(commands.throttle1).toBeLessThan(0.6); // below cruise base due to high N1
    expect(commands.throttle2).toBe(commands.throttle1);
  });

  it('does not command N1 throttles when autothrottle is not armed even with an explicit target', () => {
    const s = createInitialState(B737_800_SPEC);
    s.flightPhase = 'TAKEOFF';
    s.engines[0].n1 = 35;
    s.engines[1].n1 = 35;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'N1');
    ap.boeing.autothrottleArm = false;

    const targets = resolveAutopilotTargets(s, ap);
    const commands = computeAutopilotCommands(
      s,
      ap,
      targets.targetHeadingRad,
      targets.targetAltFt,
      targets.targetSpeedKt,
      1 / 60,
      targets.targetVerticalSpeedFpm,
      92,
    );

    expect(targets.targetN1Percent).toBeUndefined();
    expect(commands.throttle1).toBeUndefined();
    expect(commands.throttle2).toBeUndefined();
  });
});

describe('computeAutopilotCommands VS', () => {
  it('commands bounded nose-up elevator on first VS engagement frame', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 20000;
    s.velocity.u = 128.6;
    s.velocity.w = 0;
    s.attitude.theta = 0;
    const ap = makeAp('HDG_SEL', 'VS', 'OFF');
    ap.boeing.verticalSpeed = 1000;
    ap.boeing.altitude = 30000; // prevent altitude capture from blending VS

    const targets = resolveAutopilotTargets(s, ap);
    const commands = computeAutopilotCommands(
      s,
      ap,
      targets.targetHeadingRad,
      targets.targetAltFt,
      targets.targetSpeedKt,
      1 / 60,
      targets.targetVerticalSpeedFpm,
    );

    expect(targets.targetVerticalSpeedFpm).toBe(1000);
    // First VS engagement should not full-deflect the elevator; derivative kick must be bounded.
    expect(commands.elevator).toBeLessThan(0);
    expect(commands.elevator).toBeGreaterThan(-0.5);
  });
});

describe('resolveAutopilotTargets VNAV', () => {
  it('uses VNAV target VS and commands elevator for a valid altitude constraint', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.45;
    s.position.lon = -122.31;
    s.position.alt = 5000;
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV', 'SPEED');
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: 'TST789',
      route: 'KSEA OLM',
      waypoints: [
        { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
        { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false, altitudeConstraint: { type: 'AT', altitude: 10000 } },
      ],
    };

    const targets = resolveAutopilotTargets(s, ap, fp, 0);
    const commands = computeAutopilotCommandsForState(s, ap, fp, 1 / 60, 0);

    expect(targets.targetAltFt).toBe(10000);
    expect(targets.targetVerticalSpeedFpm).toBeGreaterThan(0);
    expect(commands.elevator).toBeLessThan(0);
  });

  it('uses VNAV speed constraint for SPEED mode when no MCP speed is selected', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.45;
    s.position.lon = -122.31;
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV', 'SPEED');
    ap.boeing.speed = null;
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: 'TST790',
      route: 'KSEA OLM',
      waypoints: [
        { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
        { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false, speedConstraint: { type: 'AT_OR_BELOW', speed: 210 } },
      ],
    };

    const targets = resolveAutopilotTargets(s, ap, fp, 0);

    expect(targets.targetSpeedKt).toBe(210);
  });

  it('leaves altitude and VS targets unchanged when VNAV has no active constraint', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.45;
    s.position.lon = -122.31;
    s.position.alt = 7000;
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV', 'SPEED');
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: 'TST791',
      route: 'KSEA OLM',
      waypoints: [
        { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
        { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false },
      ],
    };

    const targets = resolveAutopilotTargets(s, ap, fp, 0);
    const commands = computeAutopilotCommandsForState(s, ap, fp, 1 / 60, 0);

    expect(targets.targetAltFt).toBe(s.position.alt);
    expect(targets.targetVerticalSpeedFpm).toBeUndefined();
    // Inner loop always provides elevator (wings level + pitch hold)
    expect(commands.elevator).toBeDefined();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'falls back to current heading and no VNAV target for invalid activeLegIndex %s',
    (invalidActiveLegIndex) => {
      const s = createInitialState(B737_800_SPEC);
      s.position.lat = 47.45;
      s.position.lon = -122.31;
      s.position.alt = 7000;
      s.attitude.psi = 1.23;
      s.velocity.u = 128.6;
      const ap = makeAp('LNAV', 'VNAV', 'SPEED');
      const fp: FlightPlan = {
        origin: 'KSEA',
        destination: 'KPDX',
        flightNumber: 'TST792',
        route: 'KSEA OLM',
        waypoints: [
          { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
          { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false, altitudeConstraint: { type: 'AT', altitude: 10000 } },
        ],
      };
      let targets: ReturnType<typeof resolveAutopilotTargets> | undefined;

      expect(() => {
        targets = resolveAutopilotTargets(s, ap, fp, invalidActiveLegIndex);
      }).not.toThrow();

      expect(targets?.targetHeadingRad).toBeCloseTo(s.attitude.psi, 12);
      expect(targets?.targetAltFt).toBe(s.position.alt);
      expect(targets?.targetVerticalSpeedFpm).toBeUndefined();
    },
  );

  it('uses VNAV_PTH active mode as a path-tracking VNAV command', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.45;
    s.position.lon = -122.31;
    s.position.alt = 5000;
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV_PTH', 'SPEED');
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: 'TST793',
      route: 'KSEA OLM',
      waypoints: [
        { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
        { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false, altitudeConstraint: { type: 'AT', altitude: 10000 } },
      ],
    };

    const targets = resolveAutopilotTargets(s, ap, fp, 0);
    const commands = computeAutopilotCommandsForState(s, ap, fp, 1 / 60, 0);

    expect(targets.targetVerticalSpeedFpm).toBeGreaterThan(0);
    expect(commands.elevator).toBeLessThan(0);
  });
});

describe('resolveAutopilotTargets LNAV', () => {
  it('resolves LNAV heading from provided route status with AP intercept correction', () => {
    const aircraft = createInitialState(B737_800_SPEC);
    aircraft.attitude.psi = 0;
    const ap = makeAp('LNAV', 'ALT_HOLD', 'SPEED');
    ap.boeing.lnav = true;
    ap.boeing.hdgSel = false;

    const routeStatus: RouteStatusSnapshot = {
      ...createNoRouteStatus(),
      routeName: 'KSEA→KPDX',
      routeValid: true,
      lnavAvailable: true,
      lnavUnavailableReason: null,
      activeLegIndex: 0,
      activeLegCount: 1,
      fromWaypointIndex: 0,
      toWaypointIndex: 1,
      fromIdent: 'KSEA',
      nextWaypointIdent: 'OLM',
      distanceToNextM: 18_520,
      distanceToNextNm: 10,
      desiredTrackRad: Math.PI / 2,
      desiredTrackDegTrue: 90,
      crossTrackErrorM: 1_852,
      alongTrackM: 5_000,
      legLengthM: 18_520,
      waypointReached: false,
      sequenced: false,
    };

    const targets = resolveAutopilotTargets(aircraft, ap, null, null, routeStatus);

    expect(targets.targetHeadingRad * 180 / Math.PI).toBeCloseTo(65, 5);
  });

  it('commands an intercept angle back toward the active route leg when right of course', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.05;
    s.position.lon = -121.98;
    s.attitude.psi = 0;
    const ap = makeAp('LNAV', 'ALT_HOLD', 'SPEED');
    const fp: FlightPlan = {
      origin: 'ORIG',
      destination: 'DEST',
      flightNumber: 'TST789',
      route: 'ORIG DEST',
      waypoints: [
        { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
        { ident: 'DEST', lat: 47.2, lon: -122.0, discontinuity: false },
      ],
    };

    const targets = resolveAutopilotTargets(s, ap, fp, 0);
    const signedInterceptRad = ((targets.targetHeadingRad + Math.PI) % (2 * Math.PI)) - Math.PI;

    expect(signedInterceptRad).toBeLessThan(-5 * Math.PI / 180);
    expect(signedInterceptRad).toBeGreaterThan(-30 * Math.PI / 180);
  });

  it('uses the anticipated active leg before overflying a route turn', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.185;
    s.position.lon = -122.0;
    s.attitude.psi = 0;
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'ALT_HOLD', 'SPEED');
    const fp: FlightPlan = {
      origin: 'ORIG',
      destination: 'DEST',
      flightNumber: 'TST124',
      route: 'ORIG MID DEST',
      waypoints: [
        { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
        { ident: 'MID', lat: 47.2, lon: -122.0, discontinuity: false },
        { ident: 'DEST', lat: 47.2, lon: -121.8, discontinuity: false },
      ],
    };

    const targets = resolveAutopilotTargets(s, ap, fp, 0);

    expect(targets.targetHeadingRad).toBeGreaterThan(60 * Math.PI / 180);
    expect(targets.targetHeadingRad).toBeLessThan(90 * Math.PI / 180);
  });

  it('uses the active route leg to target the next waypoint instead of the from waypoint', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.1;
    s.position.lon = -122.0;
    s.attitude.psi = 0;
    const ap = makeAp('LNAV', 'ALT_HOLD', 'SPEED');
    const fp: FlightPlan = {
      origin: 'ORIG',
      destination: 'DEST',
      flightNumber: 'TST123',
      route: 'ORIG MID DEST',
      waypoints: [
        { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
        { ident: 'MID', lat: 47.1, lon: -122.0, discontinuity: false },
        { ident: 'DEST', lat: 47.1, lon: -121.9, discontinuity: false },
      ],
    };

    const targets = resolveAutopilotTargets(s, ap, fp, 1);

    expect(targets.targetHeadingRad).toBeCloseTo(Math.PI / 2, 1);
  });

  it('keeps current heading when route status marks LNAV unavailable for a discontinuity', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.1;
    s.position.lon = -122.0;
    s.attitude.psi = 0;
    const ap = makeAp('LNAV', 'ALT_HOLD', 'SPEED');
    const fp: FlightPlan = {
      origin: 'ORIG',
      destination: 'DEST',
      flightNumber: 'TST456',
      route: 'ORIG DISCO DEST',
      waypoints: [
        { ident: 'ORIG', lat: 47.0, lon: -122.0, discontinuity: false },
        { ident: 'DISCO', discontinuity: true },
        { ident: 'DEST', lat: 47.1, lon: -121.9, discontinuity: false },
      ],
    };

    const targets = resolveAutopilotTargets(s, ap, fp, 1);

    expect(targets.targetHeadingRad).toBeCloseTo(s.attitude.psi, 12);
  });
});

describe('composeEffectiveControls', () => {
  it('applies AP-owned axes without mutating pilot inputs', () => {
    const pilotInputs = makeInputs({
      elevator: 0.2,
      aileron: -0.2,
      rudder: 0.3,
      throttle1: 0.4,
      throttle2: 0.5,
      flapLever: 5,
      gearLever: 'DOWN',
      spoilers: 0.6,
      brake: 0.7,
    });
    const before = structuredClone(pilotInputs);
    const apCommands: AutopilotCommands = {
      elevator: -0.8,
      aileron: 0.9,
      throttle1: 0.65,
      throttle2: 0.66,
    };

    const effective = composeEffectiveControls(pilotInputs, apCommands, true);

    expect(pilotInputs).toEqual(before);
    expect(effective).not.toBe(pilotInputs);
    expect(effective).toEqual({
      ...before,
      elevator: -0.8,
      aileron: 0.9,
      throttle1: 0.65,
      throttle2: 0.66,
    });
  });

  it('leaves pilot controls effective when AP is off or manually overridden', () => {
    const pilotInputs = makeInputs({ elevator: 0.25, aileron: -0.25, throttle1: 0.2, throttle2: 0.3 });
    const apCommands: AutopilotCommands = { elevator: -0.7, aileron: 0.7, throttle1: 0.9, throttle2: 0.9 };

    expect(composeEffectiveControls(pilotInputs, apCommands, false)).toEqual(pilotInputs);
    expect(composeEffectiveControls(pilotInputs, apCommands, true, true)).toEqual(pilotInputs);
  });
});

describe('resetAutopilotPID', () => {
  it('clears accumulated PID state deterministically', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    s.position.alt = 9900;
    const ap = makeAp('OFF', 'ALT_HOLD', 'OFF');

    const first = computeAutopilotCommands(s, ap, 0, 10000, 250, 1).elevator;
    for (let i = 0; i < 10; i++) {
      computeAutopilotCommands(s, ap, 0, 10000, 250, 1);
    }

    resetAutopilotPID();

    const afterReset = computeAutopilotCommands(s, ap, 0, 10000, 250, 1).elevator;
    expect(afterReset).toBeCloseTo(first ?? 0, 12);
  });
});
