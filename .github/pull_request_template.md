## Summary

<!-- What changed and why? -->

## Acceptance evidence

<!-- List exact commands run and results. Example: `npm run check` PASS. -->

- [ ] `npm run check`
- [ ] Browser/visual proof if user-facing flight behavior changed
- [ ] Docker build/smoke if Docker, nginx, or deployment context changed

## Proof boundary / non-claims

<!-- Be explicit. Do not overclaim local, seeded, partial, pushed, CI, deployed, or live status. -->

This PR proves:

-

This PR does **not** prove:

-

## Simulator truth checklist

- [ ] PFD/MCP/FMA/AP/FMS displays match actual command backing.
- [ ] No hidden AP/A/T/FD authority is introduced while displays say OFF or unavailable.
- [ ] Any physics/FDM placeholder or gameplay tuning is documented and bounded by tests.

## Security and release checklist

- [ ] No secrets, local `.env` values, tokens, dogfood artifacts, or unrelated review outputs are included.
- [ ] CI/Docker/nginx/deployment changes update release-hardening checks when applicable.
- [ ] Public/live/deployed success is only claimed with actual endpoint/SHA/run evidence.
