import { useEffect, useRef, useState } from 'react';

export function FPSMonitor() {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);
  const lastTime = useRef(performance.now());

  useEffect(() => {
    let raf: number;
    const update = () => {
      frames.current++;
      const now = performance.now();
      if (now - lastTime.current >= 1000) {
        setFps(frames.current);
        frames.current = 0;
        lastTime.current = now;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 10,
        right: 10,
        zIndex: 200,
        color: fps > 50 ? '#0f0' : fps > 30 ? '#ff0' : '#f00',
        fontFamily: 'monospace',
        fontSize: 12,
        pointerEvents: 'none',
        background: 'rgba(0,0,0,0.6)',
        padding: '2px 6px',
        borderRadius: 3,
      }}
    >
      {fps} FPS
    </div>
  );
}
