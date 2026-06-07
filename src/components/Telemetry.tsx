import { useSimStore } from '../store/simStore';
import { computeDerived } from '../sim/physics/derived';
import { quatToEuler } from '../sim/physics/quaternion';
import { takeoffCueText } from '../sim/takeoffCue';

export function Telemetry() {
  const status = useSimStore((s) => s.status);
  const takeoffCue = useSimStore((s) => {
    const d = computeDerived(s.aircraft, s.wind);
    return takeoffCueText(s.aircraft, d.ias, s.selectedScenarioId);
  });
  const altitudeFt = useSimStore((s) => s.aircraft.position.alt);
  const iasKt = useSimStore((s) => computeDerived(s.aircraft, s.wind).ias);
  const tasKt = useSimStore((s) => computeDerived(s.aircraft, s.wind).tas);
  const groundSpeedKt = useSimStore((s) => computeDerived(s.aircraft, s.wind).gs);
  const verticalSpeedFpm = useSimStore((s) => computeDerived(s.aircraft, s.wind).vs);
  const mach = useSimStore((s) => computeDerived(s.aircraft, s.wind).mach);
  const aoaRad = useSimStore((s) => computeDerived(s.aircraft, s.wind).aoa);
  const headingDeg = useSimStore((s) => (quatToEuler(s.aircraft.quaternion).psi * 180) / Math.PI);
  const pitchDeg = useSimStore((s) => (quatToEuler(s.aircraft.quaternion).theta * 180) / Math.PI);
  const rollDeg = useSimStore((s) => (quatToEuler(s.aircraft.quaternion).phi * 180) / Math.PI);
  const leftN1 = useSimStore((s) => s.aircraft.engines[0].n1);
  const rightN1 = useSimStore((s) => s.aircraft.engines[1].n1);
  const totalFuelKg = useSimStore((s) => s.aircraft.fuel.totalFuel);
  const grossWeightKg = useSimStore((s) => s.aircraft.grossWeight);
  const flapSetting = useSimStore((s) => s.aircraft.config.flapSetting);
  const gearDown = useSimStore((s) => s.aircraft.config.gearDown);

  const row = (label: string, value: string) => (
    <div><span style={{ opacity: 0.5 }}>{label}:</span> {value}</div>
  );

  return (
    <div style={{
      position: 'fixed', top: 14, left: 360, zIndex: 100,
      background: 'rgba(0,0,0,0.85)', color: '#0f0',
      fontFamily: 'monospace', fontSize: 12, padding: 10,
      borderRadius: 4, lineHeight: 1.7, minWidth: 260,
      pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>SIM: {status.toUpperCase()}</div>
      {takeoffCue && <div style={{ fontWeight: 'bold', color: '#ff0', marginBottom: 4 }}>{takeoffCue}</div>}
      {row('ALT', `${altitudeFt.toFixed(0)} ft`)}
      {row('IAS', `${iasKt.toFixed(0)} kt`)}
      {row('TAS', `${tasKt.toFixed(0)} kt`)}
      {row('GS', `${groundSpeedKt.toFixed(0)} kt`)}
      {row('VS', `${verticalSpeedFpm.toFixed(0)} fpm`)}
      {row('MACH', `M${mach.toFixed(3)}`)}
      {row('HDG', `${headingDeg.toFixed(1)}°`)}
      {row('PTCH', `${pitchDeg.toFixed(1)}°`)}
      {row('ROLL', `${rollDeg.toFixed(1)}°`)}
      {row('AOA', `${(aoaRad * 180 / Math.PI).toFixed(1)}°`)}
      {row('N1', `L:${leftN1.toFixed(1)}% R:${rightN1.toFixed(1)}%`)}
      {row('FUEL', `${totalFuelKg.toFixed(0)} kg`)}
      {row('GW', `${grossWeightKg.toFixed(0)} kg`)}
      {row('FLAPS', `${flapSetting}°`)}
      {row('GEAR', gearDown ? 'DN' : 'UP')}
    </div>
  );
}
