# Route edit UI (RFMS-backed)

Roadmap P2 item: the tested `fms/routeAdapter.ts` seam (route sources, staged
DIRECT_TO, DISCONTINUITY, undo, EXEC) gets a visible cockpit workflow.

## Scope

- Store-owned `routeEditSession` on the sim store, initialized by
  `setFlightPlan` / `setFlightPlanAtRunway`, cleared by `reset`.
- Actions: `stageDirectTo(ident)`, `stageInsertDiscontinuity(afterIndex)`,
  `undoRouteEditOperation()`, `executeRouteEdit()`. EXEC commits the draft via
  `setFlightPlan` so active leg, route status, and guidance recompute exactly
  like any other plan load. Unknown waypoint idents stage an error message
  instead of throwing.
- New `RouteEditPanel` component in the top-left layout zone: waypoint list
  (draft-aware, discontinuity rows marked), per-row DIRECT TO and insert
  buttons, UNDO/EXEC controls, pending-operation count, and an honest
  LNAV-blocked readback when the plan contains a discontinuity.
- E2E visible-control proof: load KSEA route, stage DIRECT TO BTG, EXEC,
  verify the active leg and route status reflect the edit; stage + undo clears
  the draft; an unknown ident surfaces a visible error.

## Non-goals

- No alphanumeric CDU scratchpad; buttons drive the same adapter the CDU
  would. A scratchpad can wrap these actions later.
- No new adapter operations; the seam is already unit-covered.
