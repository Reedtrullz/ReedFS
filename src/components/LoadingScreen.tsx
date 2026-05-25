export function LoadingScreen() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#0f0',
        fontFamily: 'monospace',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✈</div>
        <div style={{ fontSize: 20 }}>RFS Loading...</div>
      </div>
    </div>
  );
}
