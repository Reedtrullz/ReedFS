# Contributing to RFS

Thanks for helping improve RFS. The project goal is a credible, playable, browser-native Boeing 737-800 simulator with honest avionics/autoflight truth, testable physics, and a releaseable OSS posture.

## Local setup

RFS expects Node 22 and a sibling RFMS/RFMC checkout for shared avionics types:

```text
/Users/reidar/Projectos/RFS
/Users/reidar/Projectos/RFMS/shared
```

```bash
cd /Users/reidar/Projectos/RFS
source ~/.nvm/nvm.sh && nvm use 22
npm install --legacy-peer-deps
npm run dev -- --host 127.0.0.1
```

Do not commit real `.env` values or Cesium Ion tokens. Use `.env.local` for local Vite settings.

## Quality gates

Before opening a PR, run the same local gate used by CI:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run check
```

For browser/player changes, also run the visual/e2e suite when practical:

```bash
CI=1 npm run test:visual
```

If Docker is part of the change, verify a local Docker build when a Docker daemon is available. If the daemon is unavailable, state that explicitly instead of claiming a Docker smoke pass.

## Development expectations

- Preserve user and maintainer work; check `git status --short --branch` before making changes.
- Add or update tests before implementation when fixing bugs or closing planned tasks.
- Keep simulator truth honest: PFD/MCP/FMA/AP/FMS displays must match actual command backing.
- Do not call seeded, route-leg, local-only, or partial proofs a full flight, full route, CI pass, deployment, or live success.
- Keep physics constants moving toward source-lineaged B737-800 data and document placeholder/gameplay values honestly.
- Keep release hardening checks updated when CI, Docker, nginx, action pins, bundle budgets, or deployment contracts change.

## Pull request checklist

A good PR includes:

- A concise description of the bug, feature, or gap being addressed.
- The exact commands run and whether they passed.
- A proof boundary section: what the evidence proves and what it does **not** prove.
- Screenshots or telemetry for user-facing flight-sim changes when useful.
- No secrets, no generated local artifacts, and no unrelated dogfood/review outputs.

## Reporting issues

Use GitHub issues for simulator bugs, usability gaps, documentation gaps, and feature requests. Use `SECURITY.md` for vulnerability reports or suspected secret exposure.
