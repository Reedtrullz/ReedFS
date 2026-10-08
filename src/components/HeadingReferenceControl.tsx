import { useHeadingReferenceStore } from '../store/headingReferenceStore';
import { useSimStore } from '../store/simStore';
import { pfdObservation } from '../store/selectors';
import { headingDisplayContext } from '../sim/headingDisplay';

export function HeadingReferenceControl() {
  const reference = useHeadingReferenceStore((s) => s.reference);
  const setReference = useHeadingReferenceStore((s) => s.setReference);
  const detail = useSimStore((s) => {
    const context = headingDisplayContext(pfdObservation(s).aircraft, reference);
    if (context.unavailableReason) return `MAG unavailable: ${context.unavailableReason}. Headings show TRUE; magnetic heading edits are disabled.`;
    if (context.reference === 'true') return 'Headings show true north.';
    return `WMM2025, epoch ${context.decimalYear?.toFixed(4)}; variation ${context.variationEastDeg?.toFixed(2)}° east. ${context.caution ? 'CAUTION: weak horizontal field. ' : ''}SFC uses 0 km above the WGS84 ellipsoid, including in flight.`;
  });
  return <details style={{ marginTop: 8, fontSize: 11 }}>
    <summary>Heading reference: {reference === 'true' ? 'TRUE' : 'MAG surface'}</summary>
    <label style={{ display: 'block', marginTop: 6 }}>Heading reference
      <select aria-label="Heading reference" value={reference} onChange={(event) => setReference(event.currentTarget.value)} style={{ marginLeft: 6 }}>
        <option value="true">True north</option><option value="magnetic">Magnetic surface estimate</option>
      </select>
    </label>
    <p aria-label="Heading reference details">{detail}</p>
    <p>Magnetic estimates cover 2025–2029. Grid headings and aircraft-height corrections are unavailable. Route and telemetry bearings remain TRUE.</p>
  </details>;
}
