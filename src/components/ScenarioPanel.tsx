import { SCENARIOS } from '../sim/scenarios';
import { useSimStore } from '../store/simStore';

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 14,
  left: 14,
  zIndex: 110,
  width: 330,
  background: 'rgba(2, 8, 12, 0.82)',
  border: '1px solid rgba(157,220,255,0.35)',
  borderRadius: 8,
  color: '#e8f8ff',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  padding: 12,
  boxShadow: '0 0 18px rgba(0,0,0,0.55)',
};

const buttonStyle: React.CSSProperties = {
  background: 'rgba(157,220,255,0.12)',
  color: '#e8f8ff',
  border: '1px solid rgba(157,220,255,0.35)',
  borderRadius: 4,
  padding: '4px 8px',
  fontFamily: 'inherit',
  cursor: 'pointer',
};

export function ScenarioPanel() {
  const selectedScenarioId = useSimStore((s) => s.selectedScenarioId);
  const status = useSimStore((s) => s.status);
  const guidance = useSimStore((s) => s.guidance);
  const setScenario = useSimStore((s) => s.setScenario);
  const setTutorialStep = useSimStore((s) => s.setTutorialStep);
  const saveScenarioState = useSimStore((s) => s.saveScenarioState);
  const loadScenarioState = useSimStore((s) => s.loadScenarioState);
  const persistenceMessage = useSimStore((s) => s.scenarioPersistenceMessage);
  const tutorial = guidance.tutorial;
  const currentStep = guidance.activeTutorialStep;
  const scenario = SCENARIOS.find((candidate) => candidate.id === selectedScenarioId) ?? SCENARIOS[0];
  const checklist = guidance.checklist;
  const coach = guidance.coachMessage;
  const pickerDisabled = status === 'running';

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
        style={{
          width: '100%',
          marginTop: 6,
          background: 'rgba(0,0,0,0.72)',
          color: '#ffffff',
          border: '1px solid rgba(157,220,255,0.45)',
          borderRadius: 4,
          padding: '7px 8px',
          fontFamily: 'inherit',
        }}
      >
        {SCENARIOS.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
        ))}
      </select>
      <div style={{ color: '#9db2bc', fontSize: 11, marginTop: 6 }}>{scenario.description}</div>
      <div aria-label="Scenario persistence controls" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
        <button aria-label="Save scenario state" style={buttonStyle} onClick={() => saveScenarioState()}>
          SAVE
        </button>
        <button aria-label="Load saved scenario state" style={buttonStyle} onClick={() => loadScenarioState()}>
          LOAD
        </button>
      </div>
      {persistenceMessage ? (
        <div role="status" style={{ color: '#ffd84a', fontSize: 11, marginTop: 6 }}>
          {persistenceMessage}
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
