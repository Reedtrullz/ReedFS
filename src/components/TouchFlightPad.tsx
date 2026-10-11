import { useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useSimStore } from '../store/simStore';

const wrapStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 8,
  justifyContent: 'center',
  touchAction: 'none',
  width: '100%',
};

const padStyle: CSSProperties = {
  aspectRatio: '1.4 / 1',
  background: 'rgba(2, 8, 12, 0.82)',
  border: '1px solid rgba(157, 220, 255, 0.4)',
  borderRadius: 8,
  cursor: 'crosshair',
  flex: '0 1 220px',
  position: 'relative',
  touchAction: 'none',
  width: '100%',
};

const markerStyle: CSSProperties = {
  border: '2px solid rgba(157, 220, 255, 0.9)',
  borderRadius: '50%',
  height: 14,
  pointerEvents: 'none',
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  width: 14,
};

const rudderStyle: CSSProperties = {
  ...padStyle,
  aspectRatio: '2.2 / 1',
  flex: '0 1 120px',
};

function padAxis(element: HTMLElement, event: ReactPointerEvent<HTMLElement>) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  const x = clamp01((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = clamp01((event.clientY - rect.top) / rect.height) * 2 - 1;
  return { x, y };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function capturePointer(element: HTMLElement, pointerId: number) {
  if (typeof element.setPointerCapture === 'function') element.setPointerCapture(pointerId);
}

export function TouchFlightPad() {
  const setInput = useSimStore((s) => s.setInput);
  const markerRef = useRef<HTMLDivElement | null>(null);

  const moveMarker = (x: number, y: number) => {
    const marker = markerRef.current;
    if (!marker) return;
    marker.style.left = `${((x + 1) / 2) * 100}%`;
    marker.style.top = `${((y + 1) / 2) * 100}%`;
  };

  const centerMarker = () => moveMarker(0, 0);

  const neutralizeAll = () => {
    setInput({ elevator: 0, aileron: 0, rudder: 0 });
    centerMarker();
  };

  const activePointer = (event: ReactPointerEvent<HTMLElement>) =>
    event.pointerType !== 'mouse' || event.buttons !== 0;

  return (
    <div style={wrapStyle}>
      <div
        aria-label="Touch pitch and roll pad"
        onKeyDown={(event) => {
          if (event.key === 'Escape') neutralizeAll();
        }}
        onPointerCancel={neutralizeAll}
        onPointerDown={(event) => {
          capturePointer(event.currentTarget, event.pointerId);
          const { x, y } = padAxis(event.currentTarget, event);
          setInput({ elevator: y, aileron: x });
          moveMarker(x, y);
        }}
        onPointerMove={(event) => {
          if (!activePointer(event)) return;
          const { x, y } = padAxis(event.currentTarget, event);
          setInput({ elevator: y, aileron: x });
          moveMarker(x, y);
        }}
        onPointerUp={() => {
          setInput({ elevator: 0, aileron: 0 });
          centerMarker();
        }}
        role="application"
        style={padStyle}
        tabIndex={0}
      >
        <div ref={markerRef} style={{ ...markerStyle, left: '50%', top: '50%' }} />
      </div>
      <div
        aria-label="Touch rudder pad"
        onKeyDown={(event) => {
          if (event.key === 'Escape') neutralizeAll();
        }}
        onPointerCancel={neutralizeAll}
        onPointerDown={(event) => {
          capturePointer(event.currentTarget, event.pointerId);
          const { x } = padAxis(event.currentTarget, event);
          setInput({ rudder: x });
        }}
        onPointerMove={(event) => {
          if (!activePointer(event)) return;
          const { x } = padAxis(event.currentTarget, event);
          setInput({ rudder: x });
        }}
        onPointerUp={() => setInput({ rudder: 0 })}
        role="application"
        style={rudderStyle}
        tabIndex={0}
      />
    </div>
  );
}
