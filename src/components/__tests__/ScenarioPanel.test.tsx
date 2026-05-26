import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScenarioPanel } from '../ScenarioPanel';
import { useSimStore } from '../../store/simStore';
import { KSEA_LIGHT_PATTERN_SCENARIO, KSEA_TUTORIAL_SCENARIO } from '../../sim/scenarios';

describe('ScenarioPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSimStore.getState().setScenario(KSEA_TUTORIAL_SCENARIO.id);
    useSimStore.getState().reset();
  });

  it('renders a scenario picker and the active tutorial step', () => {
    render(<ScenarioPanel />);

    expect(screen.getByLabelText('Scenario')).toBeTruthy();
    expect(screen.getByText(KSEA_TUTORIAL_SCENARIO.name)).toBeTruthy();
    expect(screen.getByText('Tutorial')).toBeTruthy();
    expect(screen.getByText('Line up and configure')).toBeTruthy();
    expect(screen.getByText('Checklist')).toBeTruthy();
    expect(screen.getByText('Coach')).toBeTruthy();
    expect(screen.getByText('Flaps set for takeoff')).toBeTruthy();
  });

  it('changes scenario and resets tutorial guidance', () => {
    render(<ScenarioPanel />);

    fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: KSEA_LIGHT_PATTERN_SCENARIO.id } });

    expect(useSimStore.getState().selectedScenarioId).toBe(KSEA_LIGHT_PATTERN_SCENARIO.id);
    expect(useSimStore.getState().guidance.scenarioId).toBe(KSEA_LIGHT_PATTERN_SCENARIO.id);
    expect(screen.getByText('Pattern setup')).toBeTruthy();
  });

  it('renders tutorial, checklist, and coach data from unified guidance', () => {
    const injectedStep = {
      id: 'guidance-injected-step',
      title: 'Guidance supplied tutorial',
      body: 'This step came directly from the unified guidance state.',
    };
    useSimStore.setState((state) => ({
      guidance: {
        ...state.guidance,
        tutorial: { ...state.guidance.tutorial, stepIndex: 0, steps: [injectedStep] },
        activeTutorialStep: injectedStep,
        checklist: [{ id: 'guidance-only', label: 'Guidance-owned checklist item', complete: false, detail: 'Injected detail' }],
        coachMessage: 'Guidance-owned coach message.',
      },
    }));

    render(<ScenarioPanel />);

    expect(screen.getByText('Guidance supplied tutorial')).toBeTruthy();
    expect(screen.getByText('Guidance-owned checklist item')).toBeTruthy();
    expect(screen.getByText('Guidance-owned coach message.')).toBeTruthy();
    expect(screen.queryByText('Flaps set for takeoff')).toBeNull();
  });

  it('can step through tutorial guidance without changing scenario setup', () => {
    render(<ScenarioPanel />);
    const next = screen.getByRole('button', { name: 'Next tutorial step' });

    fireEvent.click(next);

    expect(useSimStore.getState().selectedScenarioId).toBe(KSEA_TUTORIAL_SCENARIO.id);
    expect(useSimStore.getState().guidance.tutorial.stepIndex).toBe(1);
    expect(screen.getByText(/Step 2/i)).toBeTruthy();
  });

  it('saves and loads scenario state from the panel controls', () => {
    render(<ScenarioPanel />);
    fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: KSEA_LIGHT_PATTERN_SCENARIO.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Save scenario state' }));

    fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: KSEA_TUTORIAL_SCENARIO.id } });
    expect(useSimStore.getState().selectedScenarioId).toBe(KSEA_TUTORIAL_SCENARIO.id);

    fireEvent.click(screen.getByRole('button', { name: 'Load saved scenario state' }));

    expect(useSimStore.getState().selectedScenarioId).toBe(KSEA_LIGHT_PATTERN_SCENARIO.id);
    expect(screen.getByText(/saved scenario loaded/i)).toBeTruthy();
  });

  it('shows a load warning when saved scenario data is corrupt', () => {
    window.localStorage.setItem('rfs.scenarioSnapshot.v1', '{not valid json');
    render(<ScenarioPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Load saved scenario state' }));

    expect(screen.getByText(/ignored saved scenario/i)).toBeTruthy();
  });
});
