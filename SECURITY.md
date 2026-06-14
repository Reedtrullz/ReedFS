# Security Policy

RFS is a browser-native simulator delivered as static assets through nginx. It does not intentionally collect user data, and local `.env` files, Cesium tokens, SSH keys, or deployment credentials must never be committed.

## Supported versions

Security fixes are made on the default branch and included in the next published container image. Pre-release or historical branches are not separately supported unless a maintainer explicitly says otherwise.

## Reporting a vulnerability

Please do **not** open a public issue for exploitable vulnerabilities, leaked secrets, deployment bypasses, or supply-chain findings.

Preferred reporting path:

1. Open a private vulnerability report at <https://github.com/Reedtrullz/ReedFS/security/advisories/new>.
2. Include reproduction steps, affected files or endpoints, and any observed impact.
3. Avoid including real secrets in the report. If a secret exposure is suspected, describe where it appears and redact token values.

If GitHub private vulnerability reporting is unavailable, contact the maintainer through the GitHub profile and include a minimal non-public summary.

## Security scope

In scope:

- Static app security issues that affect users of `https://fly.reidar.tech`.
- CI/CD, Docker, nginx, release metadata, or deployment hardening regressions.
- Accidental secret exposure in source, build outputs, logs, or container context.
- Dependency or supply-chain issues that apply to the built RFS app.

Out of scope:

- Third-party Cesium Ion, browser, operating-system, GitHub, or VPS provider vulnerabilities unless RFS configuration directly causes the exposure.
- Non-sensitive simulator correctness bugs; please use a normal GitHub issue for those.
- Denial-of-service reports that require excessive traffic against the live deployment.

## Maintainer response expectations

The maintainer will triage credible reports as soon as practical, avoid public disclosure until a fix or mitigation is ready, and document security-relevant release notes without exposing reporters or secrets.
