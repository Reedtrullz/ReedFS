import { describe, it, expect, beforeEach } from 'vitest';
import {
  composeEffectiveControls,
  computeAutopilotCommands,
  computeAutopilotCommandsForState,
  computeAutopilotCommandsWithControllerState,
  createAutopilotControllerState,
  resetAutopilotPID,
  resolveAutopilotTargets,
} from '../autopilot';
import { createInitialState, B737_800_SPEC } from '../../types';
import type { AutopilotCommands, ControlInputs } from '../../types';
import type { AutopilotState, LateralMode, ThrustMode, VerticalMode } from '@shared/autopilot/autopilotTypes';
import type { FlightPlan } from '@shared/types/fmc';
import type { WindInfo } from '../../weather';
import { computeDerived } from '../../physics/derived';
import { createNoRouteStatus, computeRouteStatus, type RouteStatusSnapshot } from '../navigation';
import { deriveEffectiveAutoflightTruth } from '../effectiveAutoflightTruth';

beforeEach(() => resetAutopilotPID());

const M_PER_NM = 1852;

function routeWithFutureDescentConstraint(): FlightPlan {
  return {
    origin: 'KSEA',
    destination: 'KPDX',
    flightNumber: 'TST214',
    route: 'KSEA OLM BTG KPDX',
    waypoints: [
      { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
      { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false },
      { ident: 'BTG', lat: 45.75, lon: -122.59, discontinuity: false, altitudeConstraint: { type: 'AT_OR_BELOW', altitude: 12000 }, speedConstraint: { type: 'AT_OR_BELOW', speed: 280 } },
      { ident: 'KPDX', lat: 45.59, lon: -122.6, discontinuity: false },
    ],
  };
}

function routeStatusBeforeTod(): RouteStatusSnapshot {
  return {
    ...createNoRouteStatus(),
    routeName: 'KSEA→KPDX',
    routeValid: true,
    routeComplete: false,
    lnavAvailable: true,
    lnavUnavailableReason: null,
    activeLegIndex: 0,
    activeLegCount: 3,
    fromWaypointIndex: 0,
    toWaypointIndex: 1,
    fromIdent: 'KSEA',
    nextWaypointIdent: 'OLM',
    distanceToNextM: 160 * M_PER_NM,
    distanceToNextNm: 160,
    desiredTrackRad: 0,
    desiredTrackDegTrue: 0,
    crossTrackErrorM: 0,
    alongTrackM: 0,
    legLengthM: 180 * M_PER_NM,
    waypointReached: false,
    sequenced: false,
  };
}

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

describe('computeAutopilotCommandsForState effective truth gating', () => {
  it('does not command AP pitch or roll when CMD_A is unbacked but preserves backed A/T SPEED', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    ap.boeing.cmdA = false;
    ap.boeing.hdgSel = true;
    ap.boeing.altHold = true;
    ap.boeing.speedMode = true;
    ap.boeing.autothrottleArm = true;
    const commands = computeAutopilotCommandsForState(s, ap, null, 1 / 60, null, createNoRouteStatus());
    expect(commands.elevator).toBeUndefined();
    expect(commands.aileron).toBeUndefined();
    expect(commands.throttle1).toBeGreaterThan(0);
    expect(commands.throttle2).toBe(commands.throttle1);
  });

  it('does not command controls when CMD_A and A/T truth are both unbacked', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    ap.boeing.cmdA = false;
    ap.boeing.hdgSel = true;
    ap.boeing.altHold = true;
    ap.boeing.speedMode = false;
    ap.boeing.autothrottleArm = false;
    const commands = computeAutopilotCommandsForState(s, ap, null, 1 / 60, null, createNoRouteStatus());
    expect(commands).toEqual({});
  });

  it('does not command throttle when SPEED truth is not backed by speedMode', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 50;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    ap.boeing.hdgSel = true;
    ap.boeing.altHold = true;
    ap.boeing.speedMode = false;
    ap.boeing.autothrottleArm = true;
    const commands = computeAutopilotCommandsForState(s, ap, null, 1 / 60, null, createNoRouteStatus());
    expect(commands.elevator).toBeDefined();
    expect(commands.aileron).toBeDefined();
    expect(commands.throttle1).toBeUndefined();
    expect(commands.throttle2).toBeUndefined();
  });

  it('does not command LNAV or VNAV axes when the route is unavailable', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV', 'OFF');
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;
    const commands = computeAutopilotCommandsForState(s, ap, null, 1 / 60, null, createNoRouteStatus());
    expect(commands.aileron).toBeUndefined();
    expect(commands.elevator).toBeUndefined();
    expect(commands.throttle1).toBeUndefined();
    expect(commands.throttle2).toBeUndefined();
  });

  it('does not command elevator for lateral-only CMD_A with PITCH OFF', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 5000;
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'OFF', 'SPEED');
    ap.boeing.lnav = true;
    ap.boeing.speedMode = true;
    ap.boeing.autothrottleArm = true;
    const flightPlan = routeWithFutureDescentConstraint();
    const routeStatus = routeStatusBeforeTod();

    const commands = computeAutopilotCommandsForState(s, ap, flightPlan, 1 / 60, 0, routeStatus);

    expect(commands.aileron).toBeDefined();
    expect(commands.elevator).toBeUndefined();
    expect(commands.throttle1).toBeDefined();
    expect(commands.throttle2).toBe(commands.throttle1);
  });

  it('commands pitch capture instead of ALT_HOLD while descending below selected altitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 9_650;
    s.velocity.u = 128.6;
    s.velocity.w = 12;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    ap.boeing.hdgSel = true;
    ap.boeing.altHold = true;
    ap.boeing.altitude = 10_000;
    ap.boeing.speedMode = true;
    ap.boeing.autothrottleArm = true;

    const truth = deriveEffectiveAutoflightTruth(ap, { aircraft: s, flightPlan: null, routeStatus: createNoRouteStatus() });
    const commands = computeAutopilotCommandsForState(s, ap, null, 1 / 60, null, createNoRouteStatus());

    expect(truth.verticalActive).toBe('ALT*');
    expect(commands.elevator).toBeLessThan(0);
  });

  it('keeps VNAV armed before TOD without commanding pitch or falling back to MCP altitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.alt = 30000;
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV', 'SPEED');
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;
    ap.boeing.speedMode = true;
    ap.boeing.autothrottleArm = true;
    ap.boeing.altitude = 5000;
    const flightPlan = routeWithFutureDescentConstraint();
    const routeStatus = routeStatusBeforeTod();

    const truth = deriveEffectiveAutoflightTruth(ap, { aircraft: s, flightPlan, routeStatus });
    const commands = computeAutopilotCommandsForState(s, ap, flightPlan, 1 / 60, 0, routeStatus);

    expect(truth.verticalActive).toBe('VNAV');
    expect(commands.elevator).toBeUndefined();
  });

  it('does not command VNAV pitch when the active leg has no actionable VNAV constraint', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.45; s.position.lon = -122.31; s.position.alt = 7000; s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV', 'OFF');
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;
    const fp: FlightPlan = { origin:'KSEA', destination:'KPDX', flightNumber:'TST791', route:'KSEA OLM', waypoints:[{ ident:'KSEA', lat:47.45, lon:-122.31, discontinuity:false }, { ident:'OLM', lat:46.97, lon:-122.9, discontinuity:false }] };
    const commands = computeAutopilotCommandsForState(s, ap, fp, 1 / 60, 0);
    expect(commands.aileron).toBeDefined();
    expect(commands.elevator).toBeUndefined();
  });

  it('does not command VOR_LOC aileron even when the mode is backed', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    const ap = makeAp('VOR_LOC', 'OFF', 'OFF');
    ap.boeing.vorLoc = true;

    const commands = computeAutopilotCommandsForState(s, ap, null, 1 / 60, null, createNoRouteStatus());

    expect(commands.aileron).toBeUndefined();
  });

  it('does not command LVL_CHG elevator even when the mode is backed', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 128.6;
    const ap = makeAp('OFF', 'LVL_CHG', 'OFF');
    ap.boeing.lvlChg = true;

    const commands = computeAutopilotCommandsForState(s, ap, null, 1 / 60, null, createNoRouteStatus());

    expect(commands.elevator).toBeUndefined();
  });
});

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
  it('SPEED mode uses IAS with tailwind instead of raw body speed', () => {
    const s = createInitialState(B737_800_SPEC);
    s.attitude.psi = 0;
    s.position.alt = 0;
    s.velocity.u = 250 / 1.944;
    s.velocity.v = 0;
    s.velocity.w = 0;
    s.ground.weightOnWheels = false;
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    ap.boeing.speed = 250;
    ap.boeing.hdgSel = true;
    ap.boeing.altHold = true;
    ap.boeing.speedMode = true;
    ap.boeing.autothrottleArm = true;
    const tailwind: WindInfo = { dir: 180, speed: 20 };

    const displayedIas = computeDerived(s, tailwind).ias;
    const commands = computeAutopilotCommandsForState(s, ap, null, 1, null, createNoRouteStatus(), tailwind);

    expect(displayedIas).toBeLessThan(240);
    expect(commands.throttle1).toBeGreaterThan(0.5);
    expect(commands.throttle2).toBe(commands.throttle1);
  });

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

  it('does not leak controller state into an independent runtime command stream', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 50; // far below target, raw SPEED demand would saturate.
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');

    const firstIndependentCommand = computeAutopilotCommands(s, ap, 0, 10000, 300, 1 / 60);
    for (let i = 0; i < 12; i++) {
      computeAutopilotCommands(s, ap, 0, 10000, 300, 1 / 60);
    }
    const secondIndependentCommand = computeAutopilotCommands(s, ap, 0, 10000, 300, 1 / 60);

    expect(secondIndependentCommand.throttle1).toBeCloseTo(firstIndependentCommand.throttle1 ?? 0, 8);
    expect(secondIndependentCommand.throttle2).toBe(secondIndependentCommand.throttle1);
  });

  it('advances only the supplied serializable controller state', () => {
    const s = createInitialState(B737_800_SPEC);
    s.velocity.u = 50; // far below target, raw SPEED demand would saturate.
    const ap = makeAp('HDG_SEL', 'ALT_HOLD', 'SPEED');
    const initialControllerState = createAutopilotControllerState();

    const first = computeAutopilotCommandsWithControllerState(
      s, ap, 0, 10000, 300, 1 / 60, undefined, undefined, null, initialControllerState,
    );
    const second = computeAutopilotCommandsWithControllerState(
      s, ap, 0, 10000, 300, 1 / 60, undefined, undefined, null, first.controllerState,
    );
    const independent = computeAutopilotCommandsWithControllerState(
      s, ap, 0, 10000, 300, 1 / 60, undefined, undefined, null, createAutopilotControllerState(),
    );

    expect(initialControllerState).toEqual(createAutopilotControllerState());
    expect(second.commands.throttle1).toBeGreaterThan(first.commands.throttle1 ?? 0);
    expect(independent.commands.throttle1).toBeCloseTo(first.commands.throttle1 ?? 0, 8);
    expect(JSON.parse(JSON.stringify(second.controllerState))).toEqual(second.controllerState);
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

    expect(targets.targetAltFt).toBe(s.position.alt);
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
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;
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

  it('does not command VNAV pitch for a speed-only VNAV constraint', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.45;
    s.position.lon = -122.31;
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV', 'SPEED');
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;
    ap.boeing.speed = null;
    ap.boeing.speedMode = true;
    ap.boeing.autothrottleArm = true;
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'OLM',
      flightNumber: 'TST794',
      route: 'KSEA OLM',
      waypoints: [
        { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
        { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false, speedConstraint: { type: 'AT_OR_BELOW', speed: 210 } },
      ],
    };

    const targets = resolveAutopilotTargets(s, ap, fp, 0);
    const commands = computeAutopilotCommandsForState(s, ap, fp, 1 / 60, 0);

    expect(targets.targetSpeedKt).toBe(210);
    expect(targets.targetVerticalSpeedFpm).toBeUndefined();
    expect(commands.elevator).toBeUndefined();
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
    // VNAV with no actionable constraint is not effective vertical guidance.
    expect(commands.elevator).toBeUndefined();
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

  it('keeps the VNAV managed capture altitude through effective ALT_HOLD instead of reverting to MCP altitude', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.45;
    s.position.lon = -122.31;
    s.position.alt = 10020;
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV', 'SPEED');
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;
    ap.boeing.altitude = 30000;
    const fp: FlightPlan = {
      origin: 'KSEA',
      destination: 'KPDX',
      flightNumber: 'TST795',
      route: 'KSEA OLM',
      waypoints: [
        { ident: 'KSEA', lat: 47.45, lon: -122.31, discontinuity: false },
        { ident: 'OLM', lat: 46.97, lon: -122.9, discontinuity: false, altitudeConstraint: { type: 'AT', altitude: 10000 } },
      ],
    };
    const routeStatus = computeRouteStatus(s, fp, 0);
    const truth = deriveEffectiveAutoflightTruth(ap, { aircraft: s, flightPlan: fp, routeStatus });

    expect(truth.verticalActive).toBe('ALT_HOLD');
    const targets = resolveAutopilotTargets(s, { ...ap, truth }, fp, 0, routeStatus);
    const commands = computeAutopilotCommandsForState(s, ap, fp, 1 / 60, 0, routeStatus);

    expect(targets.targetAltFt).toBe(10000);
    expect(targets.targetAltFt).not.toBe(30000);
    expect(commands.elevator).toBeGreaterThanOrEqual(0);
  });

  it('uses VNAV_PTH active mode as a path-tracking VNAV command', () => {
    const s = createInitialState(B737_800_SPEC);
    s.position.lat = 47.45;
    s.position.lon = -122.31;
    s.position.alt = 5000;
    s.velocity.u = 128.6;
    const ap = makeAp('LNAV', 'VNAV_PTH', 'SPEED');
    ap.boeing.lnav = true;
    ap.boeing.vnav = true;
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
