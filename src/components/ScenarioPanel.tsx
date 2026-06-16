import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { SCENARIOS } from '../sim/scenarios';
import { scenarioSaveSlotIdFromName } from '../store/scenarioPersistence';
import { useSimStore } from '../store/simStore';

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 14,
  left: 14,
  zIndex: 110,
  width: 'min(330px, 25vw)',
  maxHeight: 'calc(100vh - 28px)',
  overflowY: 'auto',
  background: 'rgba(2, 8, 12, 0.82)',
  border: '1px solid rgba(157,220,255,0.35)',
  borderRadius: 8,
  color: '#e8f8ff',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  padding: 12,
  boxShadow: '0 0 18px rgba(0,0,0,0.55)',
};

const buttonStyle: CSSProperties = {
  background: 'rgba(157,220,255,0.12)',
  color: '#e8f8ff',
  border: '1px solid rgba(157,220,255,0.35)',
  borderRadius: 4,
  padding: '4px 8px',
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const fieldStyle: CSSProperties = {
  width: '100%',
  marginTop: 6,
  background: 'rgba(0,0,0,0.72)',
  color: '#ffffff',
  border: '1px solid rgba(157,220,255,0.45)',
  borderRadius: 4,
  padding: '7px 8px',
  fontFamily: 'inherit',
};

function scenarioName(id: string): string {
  return SCENARIOS.find((candidate) => candidate.id === id)?.name ?? id;
}

function formatSlotTime(savedAtIso: string): string {
  const parsed = Date.parse(savedAtIso);
  if (Number.isNaN(parsed)) return savedAtIso;
  return new Date(parsed).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function noopRefreshScenarioSaveSlots(): void {
  // App-level tests sometimes provide partial mocked store state without persistence actions.
}

export function ScenarioPanel() {
  const selectedScenarioId = useSimStore((s) => s.selectedScenarioId);
  const status = useSimStore((s) => s.status);
  const guidance = useSimStore((s) => s.guidance);
  const scenarioSaveSlots = useSimStore((s) => s.scenarioSaveSlots ?? []);
  const setScenario = useSimStore((s) => s.setScenario);
  const setTutorialStep = useSimStore((s) => s.setTutorialStep);
  const saveScenarioState = useSimStore((s) => s.saveScenarioState);
  const loadScenarioState = useSimStore((s) => s.loadScenarioState);
  const refreshScenarioSaveSlots = useSimStore((s) => s.refreshScenarioSaveSlots ?? noopRefreshScenarioSaveSlots);
  const persistenceMessage = useSimStore((s) => s.scenarioPersistenceMessage);
  const [slotName, setSlotName] = useState('Default save');
  const [selectedSlotId, setSelectedSlotId] = useState('default');
  const [pendingOverwriteSlotId, setPendingOverwriteSlotId] = useState<string | null>(null);
  const tutorial = guidance.tutorial;
  const currentStep = guidance.activeTutorialStep;
  const scenario = SCENARIOS.find((candidate) => candidate.id === selectedScenarioId) ?? SCENARIOS[0];
  const checklist = guidance.checklist;
  const coach = guidance.coachMessage;
  const pickerDisabled = status === 'running';
  const showPersistenceControls = status !== 'running';
  const selectedSlot = scenarioSaveSlots.find((slot) => slot.id === selectedSlotId) ?? scenarioSaveSlots[0] ?? null;
  const pendingOverwriteSlot = useMemo(
    () => scenarioSaveSlots.find((slot) => slot.id === pendingOverwriteSlotId) ?? null,
    [pendingOverwriteSlotId, scenarioSaveSlots],
  );

  useEffect(() => {
    refreshScenarioSaveSlots();
  }, [refreshScenarioSaveSlots]);

  function saveSlot(overwrite = false) {
    const name = slotName.trim() || 'Default save';
    const slotId = scenarioSaveSlotIdFromName(name);
    const existing = scenarioSaveSlots.find((slot) => slot.id === slotId);
    if (existing && !overwrite) {
      setPendingOverwriteSlotId(slotId);
      return;
    }
    saveScenarioState(undefined, { slotId, slotName: name, overwrite });
    setSelectedSlotId(slotId);
    setPendingOverwriteSlotId(null);
  }

  function loadSelectedSlot() {
    loadScenarioState(undefined, selectedSlot?.id ?? selectedSlotId);
  }

  return (
    <section aria-label="Scenario and tutorial" style={panelStyle}>
      <label htmlFor="scenario-picker" style={{ display: 'block', color: '#9ddcff', fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>
        Scenario
      </label>
      <select
        id="scenario-picker"
        value={selectedScenarioId}
        disabled={pickerDisabled}
        onChange={(event) => setScenario(event.currentTarget.value)}
        style={fieldStyle}
      >
        {SCENARIOS.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
        ))}
      </select>
      <div style={{ color: '#9db2bc', fontSize: 11, marginTop: 6 }}>{scenario.description}</div>

      {showPersistenceControls ? (
        <div aria-label="Scenario persistence controls" style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <label htmlFor="save-slot-name" style={{ color: '#9ddcff', fontSize: 11, fontWeight: 800 }}>
            Save slot name
          </label>
          <input
            id="save-slot-name"
            aria-label="Save slot name"
            value={slotName}
            onChange={(event) => {
              setSlotName(event.currentTarget.value);
              setPendingOverwriteSlotId(null);
            }}
            style={fieldStyle}
          />
          <label htmlFor="saved-scenario-slot" style={{ color: '#9ddcff', fontSize: 11, fontWeight: 800 }}>
            Saved scenario slot
          </label>
          <select
            id="saved-scenario-slot"
            aria-label="Saved scenario slot"
            value={selectedSlot?.id ?? ''}
            onChange={(event) => setSelectedSlotId(event.currentTarget.value)}
            style={fieldStyle}
          >
            {scenarioSaveSlots.length === 0 ? <option value="">No saved slots</option> : null}
            {scenarioSaveSlots.map((slot) => (
              <option key={slot.id} value={slot.id}>{slot.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button aria-label="Save scenario state" style={buttonStyle} onClick={() => saveSlot(false)}>
              SAVE
            </button>
            <button aria-label="Load saved scenario state" style={buttonStyle} onClick={loadSelectedSlot}>
              LOAD
            </button>
          </div>
          {pendingOverwriteSlot ? (
            <div style={{ color: '#ffd84a', fontSize: 11 }}>
              <div>Overwrite {pendingOverwriteSlot.name}?</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                <button aria-label={`Confirm overwrite ${pendingOverwriteSlot.name}`} style={buttonStyle} onClick={() => saveSlot(true)}>
                  CONFIRM
                </button>
                <button aria-label="Cancel overwrite" style={buttonStyle} onClick={() => setPendingOverwriteSlotId(null)}>
                  CANCEL
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {showPersistenceControls && persistenceMessage ? (
        <div role="status" style={{ color: '#ffd84a', fontSize: 11, marginTop: 6 }}>
          {persistenceMessage}
        </div>
      ) : null}
      {showPersistenceControls ? (
        <div aria-label="Saved scenario slots" style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {scenarioSaveSlots.map((slot) => (
            <div key={slot.id} style={{ border: '1px solid rgba(157,220,255,0.18)', borderRadius: 4, padding: 6, fontSize: 11 }}>
              <strong style={{ color: '#ffffff' }}>{slot.name}</strong>
              <div style={{ color: '#9db2bc' }}>
                {scenarioName(slot.selectedScenarioId)} · {slot.routeSummary} · restore {slot.restoreStatus} · {formatSlotTime(slot.savedAtIso)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 12, borderTop: '1px solid rgba(157,220,255,0.18)', paddingTop: 10 }}>
        <div style={{ color: '#9ddcff', fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>Tutorial</div>
        <div style={{ color: '#ffffff', fontSize: 15, fontWeight: 900, marginTop: 5 }}>{currentStep?.title ?? 'No guidance'}</div>
        <div style={{ color: '#cfe5ef', fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{currentStep?.body ?? 'This scenario has no tutorial guidance yet.'}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
          <button
            aria-label="Previous tutorial step"
            style={buttonStyle}
            disabled={tutorial.stepIndex <= 0}
            onClick={() => setTutorialStep(tutorial.stepIndex - 1)}
          >
            ◀
          </button>
          <div style={{ color: '#9db2bc', fontSize: 11 }}>
            Step {tutorial.stepIndex + 1} / {Math.max(1, tutorial.steps.length)}
          </div>
          <button
            aria-label="Next tutorial step"
            style={buttonStyle}
            disabled={tutorial.stepIndex >= tutorial.steps.length - 1}
            onClick={() => setTutorialStep(tutorial.stepIndex + 1)}
          >
            ▶
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, borderTop: '1px solid rgba(157,220,255,0.18)', paddingTop: 10 }}>
        <div style={{ color: '#9ddcff', fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>Checklist</div>
        <div style={{ display: 'grid', gap: 5, marginTop: 6 }}>
          {checklist.map((item) => (
            <div key={item.id} style={{ display: 'flex', gap: 7, alignItems: 'center', color: item.complete ? '#6dff8d' : '#ffd84a', fontSize: 12 }}>
              <span aria-hidden="true">{item.complete ? '✓' : '○'}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12, borderTop: '1px solid rgba(157,220,255,0.18)', paddingTop: 10 }}>
        <div style={{ color: '#9ddcff', fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>Coach</div>
        <div aria-label="Coach status" aria-live="polite" style={{ color: '#cfe5ef', fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{coach}</div>
      </div>
    </section>
  );
}
