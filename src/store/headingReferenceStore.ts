import { create } from 'zustand';
import type { HeadingReference } from '../sim/magneticHeading';

/** Presentation only: no flight-state action, persistence, or command side effect. */
export const useHeadingReferenceStore = create<{
  reference: HeadingReference;
  setReference: (value: unknown) => boolean;
}>((set) => ({
  reference: 'true',
  setReference: (value) => {
    if (value !== 'true' && value !== 'magnetic') return false;
    set({ reference: value }); return true;
  },
}));
