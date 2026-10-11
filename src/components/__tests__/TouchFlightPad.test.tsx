import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '../../store/simStore';
import { TouchFlightPad } from '../TouchFlightPad';

function pilotInputs() {
  return useSimStore.getState().pilotInputs;
}

function pointerDown(target: HTMLElement, clientX: number, clientY: number) {
  fireEvent.pointerDown(target, { clientX, clientY, buttons: 1, pointerId: 1, pointerType: 'mouse' });
}

function pointerMove(target: HTMLElement, clientX: number, clientY: number) {
  fireEvent.pointerMove(target, { clientX, clientY, buttons: 1, pointerId: 1, pointerType: 'mouse' });
}

function mockRect(element: HTMLElement, width: number, height: number) {
  element.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height,
    toJSON: () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }),
  });
}

describe('TouchFlightPad', () => {
  beforeEach(() => {
    useSimStore.setState({ pilotInputs: { ...useSimStore.getState().pilotInputs, elevator: 0, aileron: 0, rudder: 0 } });
  });

  it('maps pad position to pitch and roll axes', () => {
    render(<TouchFlightPad />);
    const pad = screen.getByLabelText('Touch pitch and roll pad');
    mockRect(pad, 280, 200);
    pointerDown(pad, 10, 10);
    expect(pilotInputs().elevator).toBeLessThan(0);
    expect(pilotInputs().aileron).toBeLessThan(0);
    fireEvent.pointerUp(pad);
    expect(pilotInputs().elevator).toBe(0);
    expect(pilotInputs().aileron).toBe(0);
  });

  it('maps rudder pad horizontal position to rudder and releases cleanly', () => {
    render(<TouchFlightPad />);
    const rudder = screen.getByLabelText('Touch rudder pad');
    mockRect(rudder, 120, 54);
    pointerDown(rudder, 10, 20);
    expect(pilotInputs().rudder).toBeLessThan(0);
    pointerMove(rudder, 300, 20);
    expect(pilotInputs().rudder).toBeGreaterThan(0);
    fireEvent.pointerUp(rudder);
    expect(pilotInputs().rudder).toBe(0);
  });

  it('pointer cancel neutralizes yoke and rudder', () => {
    render(<TouchFlightPad />);
    const pad = screen.getByLabelText('Touch pitch and roll pad');
    mockRect(pad, 280, 200);
    pointerDown(pad, 20, 20);
    const rudder = screen.getByLabelText('Touch rudder pad');
    mockRect(rudder, 120, 54);
    pointerDown(rudder, 10, 20);
    fireEvent.pointerCancel(pad);
    expect(pilotInputs().elevator).toBe(0);
    expect(pilotInputs().aileron).toBe(0);
    expect(pilotInputs().rudder).toBe(0);
  });

  it('hover without buttons does not move the yoke on mouse pointers', () => {
    render(<TouchFlightPad />);
    const pad = screen.getByLabelText('Touch pitch and roll pad');
    mockRect(pad, 280, 200);
    fireEvent.pointerMove(pad, { clientX: 10, clientY: 10, buttons: 0, pointerId: 1, pointerType: 'mouse' });
    expect(pilotInputs().elevator).toBe(0);
    expect(pilotInputs().aileron).toBe(0);
  });
});
