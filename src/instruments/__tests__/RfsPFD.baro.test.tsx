import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RfsPFD } from '../RfsPFD';
import { useBaroStore, type BaroSetting } from '../../store/baroStore';

const BASE: BaroSetting = { mode: 'qnh', qnhHpa: 1013.25, unit: 'hPa' };

describe('PFD barometric setting', () => {
  beforeEach(() => {
    useBaroStore.setState({ setting: { ...BASE } });
  });

  it('renders the knob display and four controls', () => {
    render(<RfsPFD />);
    expect(screen.getByLabelText('Altimeter barometric setting').textContent).toContain('QNH 1013');
    expect(screen.getByLabelText('Decrease barometric setting')).toBeTruthy();
    expect(screen.getByLabelText('Increase barometric setting')).toBeTruthy();
    expect(screen.getByLabelText('Toggle standard pressure')).toBeTruthy();
    expect(screen.getByLabelText('Toggle barometric unit')).toBeTruthy();
  });

  it('wrong setting moves the indicated altitude readout; weather is untouched', () => {
    render(<RfsPFD />);
    const readout = () => screen.getByLabelText('Observed altitude').textContent;
    const before = readout();
    fireEvent.click(screen.getByLabelText('Decrease barometric setting'));
    expect(readout()).not.toBe(before);
    expect(useBaroStore.getState().setting.qnhHpa).toBe(1012.25);
  });

  it('STD toggles the annunciation both ways', () => {
    render(<RfsPFD />);
    fireEvent.click(screen.getByLabelText('Toggle standard pressure'));
    expect(screen.getByLabelText('Altimeter barometric setting').textContent).toContain('STD');
    fireEvent.click(screen.getByLabelText('Toggle standard pressure'));
    expect(screen.getByLabelText('Altimeter barometric setting').textContent).toContain('QNH 1013');
  });

  it('unit toggle shows INHG conversion', () => {
    render(<RfsPFD />);
    fireEvent.click(screen.getByLabelText('Toggle barometric unit'));
    expect(screen.getByLabelText('Altimeter barometric setting').textContent).toContain('IN');
  });
});
