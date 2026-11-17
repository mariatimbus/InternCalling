# Frontend dependency review — 17 November 2026

The security branch retains Next.js and eslint-config-next 16.4.6. A scoped
npm override upgrades only typescript-estree's minimatch to patched 11.0.9;
legacy minimatch 3 consumers retain their existing API. Node 22 remains required.
No blanket `npm audit fix`, framework downgrade or production API change was used.

Validation: frontend lint, typecheck and webpack production build passed.
`npm audit --omit=dev` reports zero vulnerabilities. Full `npm audit` reports
14 high severity affected development-tooling packages, all tracing to picomatch
GHSA-fc5q-39xc-vjpf. These counts include propagation through dependent packages;
they are not 14 separate underlying advisories. The minimatch advisory is resolved.

The upstream picomatch advisory lists no patched version as of this review:
https://github.com/advisories/GHSA-fc5q-39xc-vjpf
The affected dependency tree is ESLint tooling; application source does not import
picomatch/micromatch/minimatch or accept glob patterns for these tools. ESLint
operates on repository-controlled configuration. This limits the observed exposure
but does not constitute a clean full dependency audit. Do not run this tooling
against untrusted glob configuration. Track an upstream fix and rerun the audit.
The existing security CI high-severity gate is expected to remain red until resolved;
no audit suppression or gate relaxation is included. Publication is for review,
not a release approval.

Root npm audit and locked production Python pip-audit were clean. Secrets/history
and exact-diff scans are separate mandatory pre-push checks.
