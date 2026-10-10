# RFS Agent Workflow

Engineering-system contract for autonomous and human work on this repository.
Owner: Reidar. Canonical planning state lives in GitHub Issues plus the
Engineering Roadmap Project. The per-issue design ledger is
`docs/plans/2026-10-08-rfs-all-issues-ledger.md`.

## Planning schema

- Status: Intake -> Ready -> In Progress -> In Review -> Done (Blocked as needed)
- Priority: P0 / P1 / P2 / P3
- Phase: Immediate / Foundation / Near-term / Medium-term / Advanced / Stretch
- Effort: XS / S / M / L / XL
- Confidence: Confirmed / Strong evidence / Needs validation

Issues are canonical work items; PRs are canonical implementations; the
Project mirrors lifecycle state. Issues are never deleted; closure preserves
history.

## Campaign protocol (all-issues completion, 2026-10)

1. One issue, one PR, branch `codex/rfs-<NN>-<slug>` off current master in the
   dedicated worktree.
2. Read the issue body and its ledger brief before implementing; revalidate
   against current master and skip already-covered items.
3. Local gates before push: tsc, lint, vitest, build, bundle, targeted tests.
4. PR body closes the issue (`Closes #NN`) and records evidence and non-claims.
5. CI-serialized queue: one PR in CI at a time. Sharded e2e (3 shards) plus
   the visual and PWA suites cover every PR.
6. Auto-merge is pre-authorized: green-or-disclosed CI plus full-diff
   self-review permits immediate merge. Any new, non-fixture CI failure blocks
   merge until fixed on the branch.
7. Known fixture family (heading-reference, route-descent long-horizon,
   debug-help visual): a failure matching the documented family after exactly
   one rerun attempt is disclosed on the PR and does not block merge. No test
   weakening and no timeout raises, ever.
8. After merge: verify issue closed as COMPLETED, Project item Done, append a
   ledger section with evidence and non-claims. Partial satisfaction keeps the
   issue open with a residual comment.
9. Wave boundaries: reconcile Project state, run one full local
   `npm run check`, log to Obsidian and Mnemosyne before the next wave.

## Standing boundaries

- The primary checkout and its stashes are never touched; all campaign work
  happens in the dedicated worktree.
- Commits use `--no-gpg-sign` (unattended 1Password signing hangs).
- No Boeing proprietary data; public-source FDM qualification carries
  per-value provenance (source + retrieval date); unsourceable values keep the
  provisional placeholder notice.
- Exploration issues deliver the bounded artifact their ledger brief defines;
  no production runtime commitment without owner acceptance.

