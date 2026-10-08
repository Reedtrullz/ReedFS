import { createRoot } from 'react-dom/client';
import { RfsPFD } from '../../src/instruments/RfsPFD';
import { useSimStore } from '../../src/store/simStore';
import { createDefaultAutopilotState } from '../../src/instruments/defaultAutopilotState';
import { createSimulationRuntime, setSimulationRuntimeForTests, type AsyncSimulationRuntime } from '../../src/sim/simulationRuntime';
import type { SimulationStepInput } from '../../src/sim/simulationStep';

let release = () => {};
let cleanup = () => {};
let nativeResponses = 0;

async function settle() {
  const deadline = performance.now() + 10000;
  while (useSimStore.getState().asyncPhysicsInFlight) {
    if (performance.now() > deadline) throw new Error('native instrument fixture deadline');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export async function mountObservedPfd() {
  useSimStore.getState().reset(); useSimStore.getState().start();
  const s = useSimStore.getState(); const ap = createDefaultAutopilotState();
  ap.boeing.cmdA = true; ap.boeing.hdgSel = true; ap.boeing.altHold = true;
  ap.truth.autopilotStatus = 'CMD_A'; ap.truth.lateralActive = 'HDG_SEL'; ap.truth.verticalActive = 'ALT_HOLD';
  useSimStore.setState({ aircraft: { ...s.aircraft, position: { ...s.aircraft.position, alt: 5000 }, velocity: { u: 120, v: 0, w: 0 },
    ground: { ...s.aircraft.ground, weightOnWheels: false, aglFt: 4500 }, flightPhase: 'CRUISE' } });
  useSimStore.getState().setApState(ap);
  const created = createSimulationRuntime({ env: { VITE_RFS_WORKER_PHYSICS: '1' }, workerTimeoutMs: 10000,
    fallback: { kind: 'main-thread', step: () => { throw new Error('native instrument test forbids fallback'); } } });
  if (created.kind !== 'browser-worker') throw new Error('native instrument worker unavailable');
  const runtime = created as AsyncSimulationRuntime;
  const restore = setSimulationRuntimeForTests(runtime);
  useSimStore.getState().tickAsync(16); await settle();
  const element = document.createElement('div'); document.body.append(element);
  const root = createRoot(element); root.render(<RfsPFD />);
  cleanup = () => { root.unmount(); element.remove(); restore(); runtime.dispose?.(); };
  let defer = false;
  setSimulationRuntimeForTests({ kind: runtime.kind, step: runtime.step.bind(runtime), stepAsync: async (input: SimulationStepInput) => {
    const barrier = defer ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve();
    const result = await runtime.stepAsync(input); nativeResponses++;
    await barrier; return result;
  } });
  return { defer: () => { defer = true; } };
}

export function beginNewObservation() {
  const s = useSimStore.getState(); const ap = createDefaultAutopilotState(); ap.boeing.altitude = 23000;
  useSimStore.getState().setApState(ap);
  useSimStore.getState().setWeather({ ...s.weather!, qnhHpa: 980 });
  useSimStore.setState({ lastFrameTime: 16, fixedStepAccumulatorSeconds: 1 / 60 });
  useSimStore.getState().tickAsync(16);
}
export function releaseObservation() { release(); }
export function pauseObservation() { useSimStore.getState().pause(); }
export function disposeObservedPfd() { cleanup(); }
export function responseCount() { return nativeResponses; }
