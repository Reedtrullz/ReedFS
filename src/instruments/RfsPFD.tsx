import type { CSSProperties } from 'react';
import { useSimStore } from '../store/simStore';
import { computeDerived } from '../sim/physics/derived';
import { quatToEuler } from '../sim/physics/quaternion';
import { deriveDisplayFmaTruth } from '../sim/systems/fmaTruth';
import { routeStatusToNavOutput, type RouteStatusSnapshot } from '../sim/systems/navigation';
import { computeVNAV } from '../sim/systems/vnav';
import { resolveGuidanceTargets, type SharedGuidanceTargets } from '../sim/systems/guidanceTargets';
import { maybeFindPerformanceCardForScenario, type B737VSpeeds } from '../sim/data/performance/b737PerformanceCards';
import { takeoffCueText } from '../sim/takeoffCue';
import type { AircraftState } from '../sim/types';
import type { FlightPlan } from '@shared/types/fmc';

const glass: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(9,14,18,0.95), rgba(2,5,7,0.92))',
  border: '1px solid rgba(120,180,210,0.45)',
  boxShadow: '0 0 18px rgba(0,0,0,0.55)',
  color: '#e8f8ff',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

function modeText(value: string | undefined): string {
  return value && value.length > 0 ? value : 'OFF';
}

function tapeTicks(center: number, step: number, radius: number, min = 0): number[] {
  const base = Math.round(center / step) * step;
  const ticks: number[] = [];
  for (let i = -radius; i <= radius; i += 1) {
    const value = base + i * step;
    if (value >= min && !ticks.includes(value)) ticks.push(value);
  }
  return ticks;
}

function FmaCell({ label, value }: { label: string; value: string }) {
  const active = value !== 'OFF';
  return (
    <div
      style={{
        flex: 1,
        borderLeft: '1px solid rgba(120,180,210,0.25)',
        padding: '5px 8px',
        minWidth: 0,
      }}
    >
      <div style={{ color: '#7fa6b7', fontSize: 10, letterSpacing: 1.4 }}>{label}</div>
      <div style={{ color: active ? '#6dff8d' : '#95a6ad', fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  );
}

function TakeoffReferenceStrip({ cue, vSpeeds }: { cue: string | null; vSpeeds: B737VSpeeds | undefined }) {
  if (!cue && !vSpeeds) return null;

  return (
    <div
      aria-label="PFD takeoff reference"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        borderBottom: '1px solid rgba(120,180,210,0.22)',
        background: 'rgba(0,0,0,0.34)',
        color: '#e8f8ff',
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.6,
      }}
    >
      <span style={{ color: '#9ddcff' }}>TAKEOFF REF</span>
      {cue && <span style={{ color: '#ffd84a', flex: 1 }}>{cue}</span>}
      {vSpeeds && (
        <span style={{ display: 'flex', gap: 8, marginLeft: 'auto', color: '#ffffff', whiteSpace: 'nowrap' }}>
          <span>V1 {vSpeeds.v1Kt}</span>
          <span>VR {vSpeeds.vrKt}</span>
          <span>V2 {vSpeeds.v2Kt}</span>
        </span>
      )}
    </div>
  );
}

function finiteTargetText(value: number | null | undefined, empty: string): string {
  return Number.isFinite(value) ? `${Math.round(value as number)}` : empty;
}

function headingTargetText(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '---';
  const wrapped = ((Math.round(value as number) % 360) + 360) % 360;
  return String(wrapped).padStart(3, '0');
}

function verticalSpeedTargetText(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '----';
  const rounded = Math.round(value as number);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function signedDegreesText(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}°`;
}

function headingErrorDeg(targetDeg: number, currentDeg: number): number {
  let error = targetDeg - currentDeg;
  while (error > 180) error -= 360;
  while (error < -180) error += 360;
  return error;
}

function finiteNumber(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? (value as number) : null;
}

type FlightDirectorMode = 'HDG_SEL' | 'LNAV' | 'ALT_HOLD' | 'VS' | 'VNAV' | 'VNAV_PTH' | 'ALT*';
type VnavFlightDirectorMode = Extract<FlightDirectorMode, 'VNAV' | 'VNAV_PTH' | 'ALT*'>;

interface FlightDirectorAxisCue {
  commandDeg: number;
  mode: FlightDirectorMode;
}

export interface FlightDirectorCue {
  roll: FlightDirectorAxisCue | null;
  pitch: FlightDirectorAxisCue | null;
}

export interface FlightDirectorCueInput {
  enabled: boolean;
  lateralMode: string;
  verticalMode: string;
  currentHeadingDeg: number;
  currentRollDeg: number;
  currentPitchDeg: number;
  currentVerticalSpeedFpm: number;
  altitudeFt: number;
  selectedHeadingDeg: number | null | undefined;
  selectedAltitudeFt: number | null | undefined;
  selectedVerticalSpeedFpm: number | null | undefined;
  aircraft: AircraftState;
  flightPlan: FlightPlan | null;
  routeStatus: RouteStatusSnapshot | null;
  guidanceTargets?: SharedGuidanceTargets | null;
}

const VNAV_FD_MODES: ReadonlySet<VnavFlightDirectorMode> = new Set(['VNAV', 'VNAV_PTH', 'ALT*']);

function isVnavFlightDirectorMode(mode: string): mode is VnavFlightDirectorMode {
  return VNAV_FD_MODES.has(mode as VnavFlightDirectorMode);
}

function verticalSpeedTargetWithAltitudeCapture(
  targetVerticalSpeedFpm: number,
  selectedAltitudeFt: number | null | undefined,
  altitudeFt: number,
): number {
  const selectedAltitude = finiteNumber(selectedAltitudeFt);
  if (selectedAltitude === null || selectedAltitude <= 0) return targetVerticalSpeedFpm;

  const altitudeDeltaFt = selectedAltitude - altitudeFt;
  const captureWindowFt = 500;
  const enteringCaptureWindow = Math.abs(altitudeDeltaFt) < captureWindowFt * 2
    && ((targetVerticalSpeedFpm > 0 && altitudeDeltaFt <= captureWindowFt)
      || (targetVerticalSpeedFpm < 0 && altitudeDeltaFt >= -captureWindowFt));
  if (!enteringCaptureWindow) return targetVerticalSpeedFpm;

  return targetVerticalSpeedFpm * Math.max(0, Math.abs(altitudeDeltaFt) / captureWindowFt);
}

function rollCommandForHeadingTarget(targetHeadingDeg: number, currentHeadingDeg: number, currentRollDeg: number): number {
  const targetBankDeg = clampValue(headingErrorDeg(targetHeadingDeg, currentHeadingDeg) * 0.28, -30, 30);
  return clampValue(targetBankDeg - currentRollDeg, -30, 30);
}

function pitchCommandForAltitudeTarget(targetAltitudeFt: number, altitudeFt: number, currentPitchDeg: number): number {
  const targetPitchDeg = clampValue((targetAltitudeFt - altitudeFt) * 0.004, -10, 15);
  return clampValue(targetPitchDeg - currentPitchDeg, -10, 10);
}

function pitchCommandForVerticalSpeedTarget(targetVerticalSpeedFpm: number, currentVerticalSpeedFpm: number, currentPitchDeg: number): number {
  const targetPitchDeg = clampValue((targetVerticalSpeedFpm - currentVerticalSpeedFpm) * 0.00015, -8, 15);
  return clampValue(targetPitchDeg - currentPitchDeg, -10, 10);
}

export function deriveFlightDirectorCue(input: FlightDirectorCueInput): FlightDirectorCue {
  if (!input.enabled) return { roll: null, pitch: null };

  const sharedTargets = input.guidanceTargets;
  let roll: FlightDirectorAxisCue | null = null;
  if (sharedTargets) {
    if (sharedTargets.lateral) {
      roll = {
        commandDeg: rollCommandForHeadingTarget((sharedTargets.lateral.targetHeadingRad * 180) / Math.PI, input.currentHeadingDeg, input.currentRollDeg),
        mode: sharedTargets.lateral.mode,
      };
    }
  } else if (input.lateralMode === 'HDG_SEL') {
    const selectedHeading = finiteNumber(input.selectedHeadingDeg);
    if (selectedHeading !== null) {
      roll = {
        commandDeg: rollCommandForHeadingTarget(selectedHeading, input.currentHeadingDeg, input.currentRollDeg),
        mode: 'HDG_SEL',
      };
    }
  } else if (input.lateralMode === 'LNAV' && input.routeStatus) {
    const nav = routeStatusToNavOutput(input.routeStatus, { maxInterceptDeg: 25 });
    if (nav) {
      roll = {
        commandDeg: rollCommandForHeadingTarget((nav.desiredTrack * 180) / Math.PI, input.currentHeadingDeg, input.currentRollDeg),
        mode: 'LNAV',
      };
    }
  }

  let pitch: FlightDirectorAxisCue | null = null;
  if (sharedTargets) {
    const target = sharedTargets.vertical;
    if (target?.mode === 'ALT_HOLD' && Number.isFinite(target.targetAltitudeFt)) {
      pitch = {
        commandDeg: pitchCommandForAltitudeTarget(target.targetAltitudeFt as number, input.altitudeFt, input.currentPitchDeg),
        mode: target.mode,
      };
    } else if (target && (target.mode === 'VS' || target.mode === 'VNAV_PTH' || target.mode === 'ALT*') && Number.isFinite(target.targetVerticalSpeedFpm)) {
      pitch = {
        commandDeg: pitchCommandForVerticalSpeedTarget(target.targetVerticalSpeedFpm as number, input.currentVerticalSpeedFpm, input.currentPitchDeg),
        mode: target.mode,
      };
    }
  } else if (input.verticalMode === 'ALT_HOLD') {
    const selectedAltitude = finiteNumber(input.selectedAltitudeFt);
    if (selectedAltitude !== null && selectedAltitude > 0) {
      pitch = {
        commandDeg: pitchCommandForAltitudeTarget(selectedAltitude, input.altitudeFt, input.currentPitchDeg),
        mode: 'ALT_HOLD',
      };
    }
  } else if (input.verticalMode === 'VS') {
    const selectedVerticalSpeed = finiteNumber(input.selectedVerticalSpeedFpm);
    if (selectedVerticalSpeed !== null) {
      const targetVerticalSpeed = verticalSpeedTargetWithAltitudeCapture(
        selectedVerticalSpeed,
        input.selectedAltitudeFt,
        input.altitudeFt,
      );
      pitch = {
        commandDeg: pitchCommandForVerticalSpeedTarget(targetVerticalSpeed, input.currentVerticalSpeedFpm, input.currentPitchDeg),
        mode: 'VS',
      };
    }
  } else if (isVnavFlightDirectorMode(input.verticalMode) && input.flightPlan && input.routeStatus) {
    const nav = routeStatusToNavOutput(input.routeStatus, { maxInterceptDeg: 25 });
    if (nav) {
      const vnav = computeVNAV(input.aircraft, input.flightPlan, nav);
      if (vnav.available && vnav.altitudeConstraint && vnav.lifecycle !== 'ARMED') {
        pitch = {
          commandDeg: pitchCommandForVerticalSpeedTarget(vnav.targetVs, input.currentVerticalSpeedFpm, input.currentPitchDeg),
          mode: input.verticalMode,
        };
      }
    }
  }

  return { roll, pitch };
}

function FlightDirectorBars({ cue }: { cue: FlightDirectorCue }) {
  if (cue.pitch === null && cue.roll === null) return null;

  return (
    <div aria-label="Flight director command bars" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {cue.pitch !== null && (
        <div
          aria-label="Flight director pitch bar"
          data-testid="fd-pitch-command"
          data-mode={cue.pitch.mode}
          style={{
            position: 'absolute',
            top: `calc(50% - ${cue.pitch.commandDeg * 4}px)`,
            left: '24%',
            right: '24%',
            height: 4,
            background: '#ff4df3',
            boxShadow: '0 0 9px rgba(255,77,243,0.95)',
            borderRadius: 3,
          }}
        >
          <span style={{ position: 'absolute', right: 0, top: -15, color: '#ffb8fb', fontSize: 10, fontWeight: 900 }}>
            FD PITCH {signedDegreesText(cue.pitch.commandDeg)}
          </span>
        </div>
      )}
      {cue.roll !== null && (
        <div
          aria-label="Flight director roll bar"
          data-testid="fd-roll-command"
          data-mode={cue.roll.mode}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 5,
            height: 76,
            background: '#ff4df3',
            boxShadow: '0 0 9px rgba(255,77,243,0.95)',
            borderRadius: 3,
            transform: `translate(-50%, -50%) rotate(${cue.roll.commandDeg}deg)`,
            transformOrigin: 'center',
          }}
        >
          <span style={{ position: 'absolute', left: 9, top: -14, color: '#ffb8fb', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>
            FD ROLL {signedDegreesText(cue.roll.commandDeg)}
          </span>
        </div>
      )}
    </div>
  );
}

function McpTargetStrip({
  visible,
  speed,
  speedLabel = 'SEL SPD',
  heading,
  altitude,
  verticalSpeed,
}: {
  visible: boolean;
  speed: number | null | undefined;
  speedLabel?: string;
  heading: number | null | undefined;
  altitude: number | null | undefined;
  verticalSpeed: number | null | undefined;
}) {
  if (!visible) return null;

  const items = [
    `${speedLabel} ${finiteTargetText(speed, '---')}`,
    `SEL HDG ${headingTargetText(heading)}`,
    `SEL ALT ${finiteTargetText(altitude, '-----')}`,
    `SEL VS ${verticalSpeedTargetText(verticalSpeed)}`,
  ];

  return (
    <div
      aria-label="PFD MCP selected targets"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 4,
        padding: '5px 10px',
        borderBottom: '1px solid rgba(120,180,210,0.22)',
        background: 'rgba(0,0,0,0.26)',
        color: '#7fffa0',
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: 0.6,
      }}
    >
      {items.map((item) => (
        <span key={item} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
          {item}
        </span>
      ))}
    </div>
  );
}

function targetBugPositionPercent(selectedValue: number, ticks: number[]): number | null {
  if (!Number.isFinite(selectedValue) || ticks.length < 2) return null;
  const min = Math.min(...ticks);
  const max = Math.max(...ticks);
  if (selectedValue < min || selectedValue > max || max <= min) return null;
  const normalized = (selectedValue - min) / (max - min);
  return 100 - normalized * 100;
}

function Tape({
  label,
  value,
  unit,
  ticks,
  align,
  selectedBug,
}: {
  label: string;
  value: number;
  unit: string;
  ticks: number[];
  align: 'left' | 'right';
  selectedBug?: { ariaLabel: string; label: string; value: number | null | undefined };
}) {
  const selectedBugValue = Number.isFinite(selectedBug?.value) ? Math.round(selectedBug?.value as number) : null;
  const selectedBugTop = selectedBugValue === null ? null : targetBugPositionPercent(selectedBugValue, ticks);

  return (
    <div
      aria-label={label === 'IAS' ? 'Airspeed tape' : 'Altitude tape'}
      style={{
        ...glass,
        width: 104,
        height: 292,
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '7px 8px 4px', color: '#9ddcff', fontSize: 13, fontWeight: 800, letterSpacing: 1.2 }}>
        {label}
      </div>
      <div
        style={{
          margin: '0 8px',
          padding: '3px 6px',
          border: '1px solid #ffd84a',
          borderRadius: 4,
          color: '#ffffff',
          background: 'rgba(0,0,0,0.76)',
          fontSize: 28,
          fontWeight: 900,
          textAlign: align,
          lineHeight: 1.1,
        }}
      >
        {Math.round(value)}
      </div>
      <div style={{ color: '#7fa6b7', fontSize: 10, textAlign: align, padding: '2px 10px 4px' }}>{unit}</div>
      <div style={{ position: 'relative', flex: 1, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 2,
            background: '#ffd84a',
            boxShadow: '0 0 8px rgba(255,216,74,0.9)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column-reverse', height: '100%', justifyContent: 'space-around' }}>
          {ticks.map((tick) => (
            <div
              key={tick}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
                gap: 6,
                padding: '0 8px',
                color: tick % (label === 'IAS' ? 20 : 1000) === 0 ? '#ffffff' : '#9db2bc',
                fontSize: tick % (label === 'IAS' ? 20 : 1000) === 0 ? 13 : 11,
                fontWeight: 700,
              }}
            >
              {align === 'left' && <span style={{ width: 15, height: 1, background: '#9db2bc' }} />}
              <span>{tick}</span>
              {align === 'right' && <span style={{ width: 15, height: 1, background: '#9db2bc' }} />}
            </div>
          ))}
        </div>
        {selectedBug && selectedBugValue !== null && selectedBugTop !== null && (
          <div
            aria-label={selectedBug.ariaLabel}
            style={{
              position: 'absolute',
              top: `${selectedBugTop}%`,
              transform: 'translateY(-50%)',
              [align === 'right' ? 'right' : 'left']: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              color: '#ff4df3',
              fontSize: 10,
              fontWeight: 900,
              textShadow: '0 0 5px rgba(255,77,243,0.85)',
              whiteSpace: 'nowrap',
            }}
          >
            {align === 'right' && <span style={{ fontSize: 14, lineHeight: 1 }}>◀</span>}
            <span>{selectedBug.label} {selectedBugValue}</span>
            {align === 'left' && <span style={{ fontSize: 14, lineHeight: 1 }}>▶</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function useFmaText(kind: 'thrustActive' | 'lateralActive' | 'verticalActive' | 'autopilotStatus') {
  return useSimStore((s) => modeText(deriveDisplayFmaTruth(s.apState, {
    aircraft: s.aircraft,
    flightPlan: s.flightPlan,
    routeStatus: s.routeStatus,
  })[kind]));
}

function useManagedSpeedKt(): number | null {
  return useSimStore((s) => {
    const truth = deriveDisplayFmaTruth(s.apState, {
      aircraft: s.aircraft,
      flightPlan: s.flightPlan,
      routeStatus: s.routeStatus,
    }) as ReturnType<typeof deriveDisplayFmaTruth> & { managedSpeedKt?: number };
    return finiteNumber(truth.managedSpeedKt);
  });
}

export function RfsPFD() {
  const flightPlan = useSimStore((s) => s.flightPlan);
  const routeStatus = useSimStore((s) => s.routeStatus);
  const apStateForGuidance = useSimStore((s) => s.apState);
  const ias = useSimStore((s) => Math.max(0, computeDerived(s.aircraft, s.wind).ias));
  const altitude = useSimStore((s) => Math.max(0, s.aircraft.position.alt));
  const latitude = useSimStore((s) => s.aircraft.position.lat);
  const longitude = useSimStore((s) => s.aircraft.position.lon);
  const velocityU = useSimStore((s) => s.aircraft.velocity.u);
  const velocityV = useSimStore((s) => s.aircraft.velocity.v);
  const velocityW = useSimStore((s) => s.aircraft.velocity.w);
  const vs = useSimStore((s) => computeDerived(s.aircraft, s.wind).vs);
  const pitch = useSimStore((s) => {
    const euler = quatToEuler(s.aircraft.quaternion);
    return (euler.theta * 180) / Math.PI;
  });
  const roll = useSimStore((s) => {
    const euler = quatToEuler(s.aircraft.quaternion);
    return (euler.phi * 180) / Math.PI;
  });
  const hdg = useSimStore((s) => {
    const euler = quatToEuler(s.aircraft.quaternion);
    return ((euler.psi * 180) / Math.PI + 360) % 360;
  });
  const radioAltitude = useSimStore((s) => {
    const ground = s.aircraft.ground;
    if (!ground) return null;
    const aglFt = Number.isFinite(ground.aglFt)
      ? ground.aglFt
      : s.aircraft.position.alt - ground.groundAltFt;
    if (!Number.isFinite(aglFt) || aglFt < 0 || aglFt >= 2500) return null;
    return Math.floor(aglFt);
  });
  const thrustMode = useFmaText('thrustActive');
  const lateralMode = useFmaText('lateralActive');
  const verticalMode = useFmaText('verticalActive');
  const autopilotMode = useFmaText('autopilotStatus');
  const hasMcpTargets = useSimStore((s) => s.apState != null);
  const selectedSpeed = useSimStore((s) => s.apState?.boeing.speed ?? null);
  const managedSpeed = useManagedSpeedKt();
  const displaySpeed = finiteNumber(selectedSpeed) ?? managedSpeed;
  const displaySpeedIsManaged = finiteNumber(selectedSpeed) === null && managedSpeed !== null;
  const selectedHeading = useSimStore((s) => s.apState?.boeing.heading ?? null);
  const selectedAltitude = useSimStore((s) => s.apState?.boeing.altitude ?? null);
  const selectedVerticalSpeed = useSimStore((s) => s.apState?.boeing.verticalSpeed ?? null);
  const flightDirectorEnabled = useSimStore((s) => Boolean(s.apState?.boeing.fdLeft || s.apState?.boeing.fdRight));
  const selectedScenarioId = useSimStore((s) => s.selectedScenarioId);
  const flightPhase = useSimStore((s) => s.aircraft.flightPhase);
  const takeoffCue = useSimStore((s) => {
    if (!s.aircraft.ground) return null;
    const derived = computeDerived(s.aircraft, s.wind);
    return takeoffCueText(s.aircraft, derived.ias, s.selectedScenarioId);
  });
  const vSpeeds = maybeFindPerformanceCardForScenario(selectedScenarioId)?.vSpeeds;
  const showTakeoffReference = takeoffCue != null || flightPhase === 'PARKED' || flightPhase === 'TAKEOFF';
  const aircraftForVnav = {
    position: { lat: latitude, lon: longitude, alt: altitude },
    velocity: { u: velocityU, v: velocityV, w: velocityW },
    flightPhase,
  } as AircraftState;
  const sharedGuidanceTargets = resolveGuidanceTargets({
    aircraft: aircraftForVnav,
    apState: apStateForGuidance,
    flightPlan,
    routeStatus,
  });
  const fdCue = deriveFlightDirectorCue({
    enabled: flightDirectorEnabled,
    lateralMode,
    verticalMode,
    currentHeadingDeg: hdg,
    currentRollDeg: roll,
    currentPitchDeg: pitch,
    currentVerticalSpeedFpm: vs,
    altitudeFt: altitude,
    selectedHeadingDeg: selectedHeading,
    selectedAltitudeFt: selectedAltitude,
    selectedVerticalSpeedFpm: selectedVerticalSpeed,
    aircraft: aircraftForVnav,
    flightPlan,
    routeStatus,
    guidanceTargets: sharedGuidanceTargets,
  });

  return (
    <section
      aria-label="Primary flight display"
      style={{
        ...glass,
        position: 'fixed',
        bottom: 24,
        right: 188,
        zIndex: 100,
        width: 492,
        borderRadius: 10,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderBottom: '1px solid rgba(120,180,210,0.35)',
          background: 'rgba(0,0,0,0.48)',
        }}
      >
        <div style={{ width: 48, padding: '5px 8px', color: '#9ddcff', fontSize: 12, fontWeight: 900, letterSpacing: 1.5 }}>
          FMA
        </div>
        <FmaCell label="THR" value={thrustMode} />
        <FmaCell label="ROLL" value={lateralMode} />
        <FmaCell label="PITCH" value={verticalMode} />
        <FmaCell label="AP" value={autopilotMode} />
      </div>
      <McpTargetStrip
        visible={hasMcpTargets}
        speed={displaySpeed}
        speedLabel={displaySpeedIsManaged ? 'MAN SPD' : 'SEL SPD'}
        heading={selectedHeading}
        altitude={selectedAltitude}
        verticalSpeed={selectedVerticalSpeed}
      />
      {showTakeoffReference && <TakeoffReferenceStrip cue={takeoffCue} vSpeeds={vSpeeds} />}

      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'stretch' }}>
        <Tape
          label="IAS"
          value={ias}
          unit="KT"
          ticks={tapeTicks(ias, 10, 7)}
          align="right"
          selectedBug={hasMcpTargets ? {
            ariaLabel: displaySpeedIsManaged ? 'Airspeed managed bug' : 'Airspeed selected bug',
            label: 'SPD BUG',
            value: displaySpeed,
          } : undefined}
        />

        <div
          aria-label="Attitude and heading display"
          style={{
            ...glass,
            flex: 1,
            minWidth: 0,
            borderRadius: 8,
            height: 292,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '7px 10px 4px', color: '#9ddcff', fontSize: 13, fontWeight: 800, letterSpacing: 1.2 }}>
            ATT
          </div>
          <div style={{ position: 'relative', flex: 1, overflow: 'hidden', background: '#112534' }}>
            <div
              style={{
                position: 'absolute',
                inset: -80,
                transform: `translateY(${pitch * 4}px) rotate(${-roll}deg)`,
                transformOrigin: 'center',
              }}
            >
              <div style={{ height: '50%', background: 'linear-gradient(#2176b8, #54a9db)' }} />
              <div style={{ height: '50%', background: 'linear-gradient(#6f4829, #9b6434)' }} />
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: '#ffffff' }} />
              {[-20, -10, 10, 20].map((deg) => (
                <div
                  key={deg}
                  style={{
                    position: 'absolute',
                    top: `calc(50% - ${deg * 4}px)`,
                    left: '36%',
                    width: '28%',
                    height: 1,
                    background: '#ffffff',
                  }}
                />
              ))}
            </div>
            <div style={{ position: 'absolute', top: '50%', left: '18%', right: '18%', height: 3, background: '#ffd84a' }} />
            <div style={{ position: 'absolute', top: 'calc(50% - 10px)', left: '50%', width: 3, height: 20, background: '#ffd84a' }} />
            <FlightDirectorBars cue={fdCue} />
            <div style={{ position: 'absolute', left: 12, bottom: 10, color: '#ffffff', fontSize: 13, fontWeight: 800 }}>
              P {pitch.toFixed(1)}°
            </div>
            <div style={{ position: 'absolute', right: 12, bottom: 10, color: '#ffffff', fontSize: 13, fontWeight: 800 }}>
              R {roll.toFixed(1)}°
            </div>
            {radioAltitude !== null && (
              <div
                aria-label="Radio altitude"
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 9,
                  transform: 'translateX(-50%)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'rgba(0,0,0,0.55)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: 0.6,
                }}
              >
                RA {radioAltitude}
              </div>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderTop: '1px solid rgba(120,180,210,0.25)',
              background: 'rgba(0,0,0,0.45)',
            }}
          >
            <span style={{ color: '#9ddcff', fontSize: 13, fontWeight: 800 }}>HDG</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.05 }}>
              <span style={{ color: '#ffffff', fontSize: 26, fontWeight: 900 }}>{hdg.toFixed(0).padStart(3, '0')}°</span>
              {hasMcpTargets && Number.isFinite(selectedHeading) && (
                <span aria-label="Heading selected bug" style={{ color: '#ff4df3', fontSize: 10, fontWeight: 900 }}>
                  HDG BUG {headingTargetText(selectedHeading)}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
              <span style={{ color: '#9ddcff', fontSize: 13, fontWeight: 800 }}>VS {vs.toFixed(0)}</span>
              {hasMcpTargets && Number.isFinite(selectedVerticalSpeed) && (
                <span aria-label="Vertical speed selected bug" style={{ color: '#ff4df3', fontSize: 10, fontWeight: 900 }}>
                  VS BUG {verticalSpeedTargetText(selectedVerticalSpeed)}
                </span>
              )}
            </span>
          </div>
        </div>

        <Tape
          label="ALT"
          value={altitude}
          unit="FT"
          ticks={tapeTicks(altitude, 500, 5)}
          align="left"
          selectedBug={hasMcpTargets ? { ariaLabel: 'Altitude selected bug', label: 'ALT BUG', value: selectedAltitude } : undefined}
        />
      </div>
    </section>
  );
}
