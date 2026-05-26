import { DEFAULT_CONTROL_BINDINGS, controlBindingLabels } from '../input/controlBindings';

export function ControlsHelp() {
  const labels = controlBindingLabels(DEFAULT_CONTROL_BINDINGS);
  return (
    <div
      style={{
        position: 'fixed',
        left: 20,
        bottom: 70,
        zIndex: 100,
        background: 'rgba(0,0,0,0.75)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.5,
        padding: '8px 10px',
        border: '1px solid rgba(0,255,0,0.35)',
        borderRadius: 4,
        pointerEvents: 'none',
        maxWidth: 300,
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Controls</div>
      <div>{labels.pitch} pitch</div>
      <div>{labels.roll} roll · {labels.rudder} rudder</div>
      <div>{labels.throttle} throttle</div>
      <div>{labels.trim} trim · {labels.brake} brake · {labels.flaps} flaps</div>
      <div>{labels.gear} gear after positive rate</div>
      <div>ABORT button: idle thrust + brakes for rejected takeoff</div>
      <div>{labels.camera} camera modes</div>
      <div>{labels.overlay} overlay modes</div>
    </div>
  );
}
