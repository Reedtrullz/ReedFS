import { useEffect, useRef, useState } from 'react';
import type { FramePhase } from '../runtime/frameScheduler';

export interface FPSMonitorProps {
  registerFrameEffect: (effect: FramePhase) => () => void;
}

export function FPSMonitor({ registerFrameEffect }: FPSMonitorProps) {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);
  const lastTime = useRef(0);

  useEffect(() => {
    lastTime.current = performance.now();
    const updateFps: FramePhase = ({ timestamp }) => {
      frames.current++;
      if (timestamp - lastTime.current >= 1000) {
        setFps(frames.current);
        frames.current = 0;
        lastTime.current = timestamp;
      }
    };
    return registerFrameEffect(updateFps);
  }, [registerFrameEffect]);

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
