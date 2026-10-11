export const WORKSPACE_MODES = [
  { id: 'briefing', label: 'Briefing' },
  { id: 'flight', label: 'Flight' },
  { id: 'debrief', label: 'Debrief' },
] as const;

export type WorkspaceMode = (typeof WORKSPACE_MODES)[number]['id'];
