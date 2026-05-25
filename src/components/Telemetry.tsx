import { useSimStore } from '../store/simStore';
import { computeDerived } from '../sim/physics/derived';
import { quatToEuler } from '../sim/physics/quaternion';

export function Telemetry() {
  const aircraft = useSimStore((s) => s.aircraft);
  const wind = useSimStore((s) => s.wind);
  const status = useSimStore((s) => s.status);
  const d = computeDerived(aircraft, wind);
  const euler = quatToEuler(aircraft.quaternion);
  const hdgDeg = (euler.psi * 180) / Math.PI;
  const pitchDeg = (euler.theta * 180) / Math.PI;
  const rollDeg = (euler.phi * 180) / Math.PI;

  const row = (label: string, value: string) => (
    <div><span style={{ opacity: 0.5 }}>{label}:</span> {value}</div>
  );

  return (
    <div style={{
      position: 'fixed', top: 10, left: 10, zIndex: 100,
      background: 'rgba(0,0,0,0.85)', color: '#0f0',
      fontFamily: 'monospace', fontSize: 12, padding: 10,
      borderRadius: 4, lineHeight: 1.7, minWidth: 260,
      pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>SIM: {status.toUpperCase()}</div>
      {row('ALT', `${aircraft.position.alt.toFixed(0)} ft`)}
      {row('IAS', `${d.ias.toFixed(0)} kt`)}
      {row('TAS', `${d.tas.toFixed(0)} kt`)}
      {row('GS', `${d.gs.toFixed(0)} kt`)}
      {row('VS', `${d.vs.toFixed(0)} fpm`)}
      {row('MACH', `M${d.mach.toFixed(3)}`)}
      {row('HDG', `${hdgDeg.toFixed(1)}°`)}
      {row('PTCH', `${pitchDeg.toFixed(1)}°`)}
      {row('ROLL', `${rollDeg.toFixed(1)}°`)}
      {row('AOA', `${(d.aoa * 180 / Math.PI).toFixed(1)}°`)}
      {row('N1', `L:${aircraft.engines[0].n1.toFixed(1)}% R:${aircraft.engines[1].n1.toFixed(1)}%`)}
      {row('FUEL', `${aircraft.fuel.totalFuel.toFixed(0)} kg`)}
      {row('GW', `${aircraft.grossWeight.toFixed(0)} kg`)}
      {row('FLAPS', `${aircraft.config.flapSetting}°`)}
      {row('GEAR', aircraft.config.gearDown ? 'DN' : 'UP')}
    </div>
  );
}
