import { useEffect, useRef } from 'react';
import { useSimStore } from '../store/simStore';

export function useSimLoop() {
  const tickRef = useRef(useSimStore.getState().tick);

  useEffect(() => {
    const unsub = useSimStore.subscribe((s) => { tickRef.current = s.tick; });
    let raf: number;
    const loop = (ts: number) => { tickRef.current(ts); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); unsub(); };
  }, []);
}
