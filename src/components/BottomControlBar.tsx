import type { SimStatus } from '../sim/simulationStatus';
import type { CameraMode } from '../viewport/cameraMode';
import type { OverlayMode } from '../viewport/overlayMode';
import { shouldShowFlightInstruments } from '../viewport/overlayMode';

export type AudioUiStatus = 'off' | 'starting' | 'on' | 'blocked';

export interface BottomControlBarProps {
  status: SimStatus;
  camMode: CameraMode;
  overlayMode: OverlayMode;
  audioEnabled: boolean;
  audioStatus: AudioUiStatus;
  routeLoadMessage: string | null;
  onStartRoll: () => void;
  onAbortTakeoff: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onNextCameraMode: () => void;
  onNextOverlayMode: () => void;
  onToggleAudio: () => void;
  onLoadPlan: () => void;
}

export function BottomControlBar({
  status,
  camMode,
  overlayMode,
  audioEnabled,
  audioStatus,
  routeLoadMessage,
  onStartRoll,
  onAbortTakeoff,
  onPause,
  onResume,
  onReset,
  onNextCameraMode,
  onNextOverlayMode,
  onToggleAudio,
  onLoadPlan,
}: BottomControlBarProps) {
  const audioButtonLabel = audioStatus === 'starting'
    ? 'AUDIO: STARTING'
    : audioStatus === 'blocked'
      ? 'AUDIO: BLOCKED'
      : audioEnabled
        ? 'AUDIO: ON'
        : 'AUDIO: OFF';

  return (
    <div style={controlsBarStyle}>
      {status === 'stopped' || status === 'paused' ? (
        <>
          <button onClick={onStartRoll} style={btnStyle}>START ROLL</button>
          {status === 'paused' && <button onClick={onResume} style={btnStyle}>RESUME</button>}
        </>
      ) : (
        <>
          <button onClick={onAbortTakeoff} style={abortBtnStyle}>ABORT</button>
          <button onClick={onPause} style={btnStyle}>PAUSE</button>
        </>
      )}
      <button onClick={onReset} style={btnStyle}>RESET</button>
      <button onClick={onNextCameraMode} style={btnStyle}>CAM: {camMode.toUpperCase()}</button>
      <button
        onClick={onNextOverlayMode}
        aria-pressed={shouldShowFlightInstruments(overlayMode)}
        style={btnStyle}
      >
        OVL: {overlayMode.toUpperCase()}
      </button>
      <button onClick={onToggleAudio} aria-pressed={audioEnabled} style={btnStyle}>{audioButtonLabel}</button>
      <button onClick={onLoadPlan} style={btnStyle}>LOAD PLAN</button>
      {routeLoadMessage && (
        <div aria-label="Route load result" aria-live="polite" role="status" style={routeLoadMessageStyle}>
          {routeLoadMessage}
        </div>
      )}
    </div>
  );
}

const controlsBarStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
};

const btnStyle: React.CSSProperties = {
  background: 'rgba(0,255,0,0.2)',
  color: '#0f0',
  border: '1px solid #0f0',
  padding: '8px 16px',
  fontFamily: 'monospace',
  cursor: 'pointer',
  fontSize: 14,
};

const abortBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'rgba(255,80,80,0.24)',
  color: '#ff7777',
  border: '1px solid #ff7777',
  fontWeight: 800,
};

const routeLoadMessageStyle: React.CSSProperties = {
  alignSelf: 'center',
  background: 'rgba(255,183,77,0.16)',
  border: '1px solid rgba(255,183,77,0.75)',
  borderRadius: 4,
  color: '#ffcf88',
  fontFamily: 'monospace',
  fontSize: 12,
  fontWeight: 800,
  padding: '6px 10px',
};
