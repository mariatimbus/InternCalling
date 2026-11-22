# B4: minimal Next.js security update

17 November 2026; original InternCalling-B3 worktree, feature/bianca-profile-resume-hub.
No staging, commit, push, backend/environment or hosted-setting changes.

## Advisory and update choice

Publisher advisory GHSA-mfr8-8qww-v76h / CVE-2026-119790 affects Next.js >=16.3.0 <=16.4.4; 16.4.5 is patched:
https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h

The publisher's 16.4.5 release is the first compatible patched release in this checkout's 16.4 line:
https://github.com/vercel/next.js/releases/tag/v16.4.5

Current npm advisory data was queried before the update. The installed version was 16.4.2; the advisory range excludes 16.4.5. The post-update production audit reports no known vulnerabilities.

Both direct Next packages are pinned to exactly 16.4.5 for a reproducible, minimal patch:
- next: 16.4.2 -> 16.4.5
- eslint-config-next: 16.4.2 -> 16.4.5

The coupled eslint-plugin-next, @next/env and platform SWC packages align automatically to 16.4.5. Lockfile comparison shows twelve package-version changes, all in this Next family, with no additions/removals or unrelated version upgrades.

Registry peer metadata confirms compatibility with the unchanged installed React/react-dom 19.3.1, ESLint 9.39.5, TypeScript 5.9.3 and Node 24.22.0. No React, Supabase, Tailwind or backend dependencies were upgraded.

## Package-manager workflow

apps/web is independently managed with npm and its own package-lock.json, as described in apps/web/README.md. Root manifests/lockfiles are unchanged.

From apps/web, the update was performed with:
~~~powershell
npm install --save-exact next@16.4.5 eslint-config-next@16.4.5 --no-audit --no-fund
~~~

Audits were then run explicitly, separately for production and the full dependency tree. No npm audit fix, force upgrade, security-control bypass, allowScripts approval or installed toolchain-entrypoint modification was used.

## Verification

- Installed and locked next, eslint-config-next, @next/env, @next/eslint-plugin-next and Windows x64 SWC: all 16.4.5.
- npm ls next eslint-config-next react react-dom eslint typescript --depth=0: passed.
- Node auth/B4 suite: 66 passed, including recovery, profile editing, skills/autocomplete, completion, Resume links and the real-FastAPI/in-memory matching freshness integration.
- npm run lint: passed.
- npm run typecheck: passed.
- npm run build: passed on its first invocation after installing 16.4.5. The original SecurityFatalError / known-security-vulnerability warning did not appear. No retry was needed to call this fixed.
- npm audit --omit=dev --json: exit 0; zero vulnerabilities at every severity.
- npm audit --json: exit 1; seven moderate dependency entries, no low/high/critical entries. These are development-only findings described below.
- git diff --check plus new documentation whitespace review: passed.

The Node command used:
~~~powershell
node --test tests/auth.test.mjs tests/recovery.test.mjs tests/profile.test.mjs tests/profile-skills.test.mjs tests/skills-autocomplete.test.mjs tests/profile-completion.test.mjs tests/resume-link.test.mjs tests/matching-refresh.test.mjs
~~~

## Remaining development audit findings

The full audit identifies GHSA-g3hv-75wg-m249 / CVE-2026-118764: minimatch denial of service via globparts amplification.
https://github.com/advisories/GHSA-g3hv-75wg-m249

The relevant branch is:
eslint-config-next -> typescript-eslint -> @typescript-eslint/typescript-estree -> minimatch.

Installed/locked typescript-eslint remains 8.71.2; its nested minimatch remains 10.2.6. The advisory affects minimatch >=7.0.0 <11.0.1 and identifies 11.0.1 as patched. These versions predate this change and were preserved.

The seven audit entries are minimatch plus its six affected TypeScript ESLint ancestors, not seven independent Next.js advisories:
- minimatch
- @typescript-eslint/typescript-estree
- @typescript-eslint/parser
- @typescript-eslint/utils
- @typescript-eslint/type-utils
- @typescript-eslint/eslint-plugin
- typescript-eslint

npm reports a fix available, but no broad audit fix or unrelated lint-toolchain update was performed. A separate compatible TypeScript ESLint dependency update should be reviewed; production audit remains clean. This report does not claim the complete development tree is vulnerability-free.

## Running frontend and installation warnings

The pre-upgrade original frontend on localhost:3000 (listener PID 28940 at inspection) was left running. Installation succeeded, but npm could not remove one renamed old Windows SWC binary because that process still holds it. This is an ignored node_modules cleanup artifact, not the active installed 16.4.5 package. The production build did not require stopping it.

Restart that original frontend to load the patched runtime; no unrelated process should be stopped:
1. In its existing PowerShell terminal, press Ctrl+C.
2. From the original apps/web directory, run npm run dev -- --port 3000.

npm also warned that the existing unrs-resolver@1.12.2 postinstall is not covered by allowScripts. No trust/approval setting was changed; lint, typecheck, tests and build passed without approving it.

Real-service browser checks were not rerun or marked passed. No database mutation, catalog import or PDF setup occurred.

## Changed files and preservation

- apps/web/package.json
- apps/web/package-lock.json
- apps/web/docs/B4-next-security-update.md

All pre-existing application, test, documentation, catalog/importer and unrelated local changes are preserved. Generated next-env.d.ts is restored to its exact pre-task contents. Earlier B4 documents retain historical 16.4.2 warning records; this document records their resolution in the current dependency tree.
