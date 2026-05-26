export function ControlsHelp() {
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
      <div>W rotate/nose up · S nose down</div>
      <div>A/D roll · Q/E rudder</div>
      <div>ArrowUp/ArrowDown throttle</div>
      <div>[ / ] trim · Space brake · F flaps</div>
      <div>G gear after positive rate</div>
      <div>CAM cycles chase/cockpit/tower</div>
      <div>OVL cycles flight/minimal/debug</div>
    </div>
  );
}
