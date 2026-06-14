import { useSimStore } from '../store/simStore';
import { selectTelemetryViewModel } from '../store/selectors';

export function Telemetry() {
  const vm = useSimStore(selectTelemetryViewModel);

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
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>SIM: {vm.status.toUpperCase()}</div>
      {vm.takeoffCue && <div style={{ fontWeight: 'bold', color: '#ff0', marginBottom: 4 }}>{vm.takeoffCue}</div>}
      {row('ALT', `${vm.altitudeFt.toFixed(0)} ft`)}
      {row('IAS', `${vm.iasKt.toFixed(0)} kt`)}
      {row('TAS', `${vm.tasKt.toFixed(0)} kt`)}
      {row('GS', `${vm.groundSpeedKt.toFixed(0)} kt`)}
      {row('VS', `${vm.verticalSpeedFpm.toFixed(0)} fpm`)}
      {row('MACH', `M${vm.mach.toFixed(3)}`)}
      {row('HDG', `${vm.headingDeg.toFixed(1)}°`)}
      {row('PTCH', `${vm.pitchDeg.toFixed(1)}°`)}
      {row('ROLL', `${vm.rollDeg.toFixed(1)}°`)}
      {row('AOA', `${(vm.aoaRad * 180 / Math.PI).toFixed(1)}°`)}
      {row('N1', `L:${vm.leftN1.toFixed(1)}% R:${vm.rightN1.toFixed(1)}%`)}
      {row('FUEL', `${vm.totalFuelKg.toFixed(0)} kg`)}
      {row('GW', `${vm.grossWeightKg.toFixed(0)} kg`)}
      {row('FLAPS', `${vm.flapSetting}°`)}
      {row('GEAR', vm.gearDown ? 'DN' : 'UP')}
    </div>
  );
}
