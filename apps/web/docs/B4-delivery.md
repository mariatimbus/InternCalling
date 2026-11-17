# B4 expanded frontend delivery

Original complete `InternCalling-B3` worktree; branch `feature/bianca-profile-resume-hub`. Final verification: 18 November 2026. Status: **frontend ready for commit/review, with browser smoke checks pending**. Backend capabilities below are Maria/Dalia integration dependencies, not missing frontend implementations. No commit, staging, push or PR is performed by this delivery-preparation task.

## Delivered scope and connection status

| Area | A — connected to existing backend | B — frontend ready, awaiting backend | C — synthetic development preview |
| --- | --- | --- | --- |
| Profile | Authenticated GET profile; seven-field editor; changed-fields-only PATCH; deliberate null clearing; Cancel; validation; retained edits on failure; confirmed response shown | No new basic-profile endpoint required | Controlled component/transport fixtures; optional standalone browser scripts |
| Compact completion | Confirmed profile + saved skills; unknown data shows unavailable/retry | No new backend required | Tests cover confirmed updates, Cancel, failures and unknown state |
| Skills | Confirmed count/removable chips; immediate real add/remove; authoritative refresh; right-side grouped drawer; custom names; live full-array GET skills | Category/alias metadata may later replace local approved-JSON discovery adapter | Grouped picker, drawer, failure/retry and in-flight-close tests |
| Approved vocabulary | Import previously confirmed: 143 total records, all 140 approved names present, 132 inserted; existing records/associations preserved | Backend category associations and alias-aware matching are not implemented by this delivery | Importer tested only in disposable SQLite databases in this verification |
| Experience | Real Profile supports validated drafts; saving explicitly unavailable | Typed load/create/update/delete adapter, authenticated persistence | `/dev/experience` — temporary CRUD and failures |
| Projects | Validated drafts, technologies discovery separate from saved profile skills, safe links | Typed CRUD, revisions and technology associations | `/dev/projects` — temporary CRUD, failures/conflicts |
| Certificates | Validated drafts, partial dates, unknown versus non-expiring and safe links | Typed authenticated CRUD/revisions | `/dev/certificates` — temporary CRUD, failures/conflicts |
| Honours & Awards | Validated drafts and safe links | Typed authenticated CRUD/revisions | `/dev/honours` — temporary CRUD, failures/conflicts |
| Languages | Validated drafts; duplicate names; native separate from optional CEFR; self-reported proficiency | Typed authenticated CRUD/revisions | `/dev/languages` — temporary CRUD, failures/conflicts |
| Publications | Validated drafts; ordered authors, partial dates, DOI normalization and safe links | Typed authenticated CRUD/revisions | `/dev/publications` — temporary CRUD, failures/conflicts |
| Resume link | Real `resume_url` GET/PATCH; add/replace/remove; safe HTTP(S) URL validation; unsafe legacy links hidden | Link storage does not verify file availability | Existing link regression tests |
| PDF interface | Real Profile allows local selection and preliminary validation, filename/size and Cancel; upload explicitly unavailable; real link fallback preserved | Server byte/type/size validation, private object storage/metadata, ownership, replace/delete, authorized temporary access, cleanup | `/dev/resume-upload` — simulated upload, failures, cancel, replacement/access/delete; local object URLs only |
| Parsing review | Reusable review/correct/skip/explicit confirmation flow; no simulated parser connected to Profile | Parsing/status/result adapter, source/profile revisions and explicit persisted change-set confirmation | `/dev/resume-review` — authored synthetic proposals and in-memory confirmation |
| CV-first onboarding | Real introduction offers intended PDF path honestly unavailable; existing real manual onboarding remains functional; existing confirmed-data rules and auth/session guards preserved | Connect PDF upload, processing/review and atomic/idempotent confirmation before enabling CV completion | `/dev/onboarding` — Complete sample (default) and Incomplete extraction; persistent demo notice; manual/CV paths, conflicts and failures |
| Job-specific tailoring | Real Jobs keeps original opportunity link, details and matching; expandable tailoring entry truthfully unavailable | Grounded generation, separate drafts/revisions, approval and approved-content PDF delivery | `/dev/resume-tailoring` — fictional job/source, selection/order/wording review, manual edits, approval/export states; **fixed sample PDF unrelated to edited draft** |
| Jobs/navigation/auth | Complete sidebar/workspace, opportunity filters/details/application links; no-store matching requests; profile/skills actions invalidate Profile/Jobs, including reconciliation paths; B3 Supabase auth/recovery preserved | No matching algorithm or auth endpoint change | Existing auth, recovery, guards and isolated real-FastAPI scorer integration regressions |

Completion remains `Math.round(completed / 8 * 100)`: headline, bio, degree level, university, field of study, graduation year, location and at least one confirmed saved skill. Optional collections and resume links/PDFs do not count. Null/blank/whitespace/invalid values do not count; unknown reads do not become zero percent. Headline/bio/university/graduation year are not presented as current matching inputs. Current relevant inputs are degree eligibility, field fit, location and saved skills; not every edit must change a score.

Profile remains accessible after clearing a formerly required study/location value so users can repair it. Jobs and the other completion-gated data pages still use `requireCompletedAccount`; workspace layout retains authentication/ownership verification. This is an intentional B4 supporting change, not a relaxation of identity checks.

## Launch and local configuration

Use the existing npm workflow and a Node version supported by the locked tools (verified here on Node 24.22.0). For a new checkout, `npm ci` in `apps/web` installs the lockfile. The final follow-up refreshed only the compatible TypeScript ESLint security dependency subtree described below; no application dependencies were upgraded.

From PowerShell:

```powershell
Set-Location 'C:\Users\nan77\OneDrive\Desktop\OPPORTUNITY TRACKER\InternCalling-B3\apps\web'
npm run dev -- --hostname localhost --port 3000
```

If port 3000 is occupied, stop the original frontend in **its own terminal** using Ctrl+C before restarting. Do not stop unrelated processes or start the temporary reduced candidate. Real Profile/Jobs/manual onboarding require the configured existing backend and approved test account. Reuse the team's existing backend process; this task introduces no backend service.

Existing ignored local configuration supplies `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or supported anon-key fallback), and server-only `AUTH_APP_ORIGIN` for recovery. See [B3 setup](B3-auth-onboarding.md) and [recovery setup](password-recovery.md). No privileged/service-role key belongs in the frontend. No environment values/files are included in the delivery manifest or copied by this task.

Standalone development previews do not use real account writes. Open these URLs after `npm run dev`:

| Route | What to exercise |
| --- | --- |
| `http://localhost:3000/dev/experience` | Add/edit/delete, partial dates, Cancel and failure retry |
| `http://localhost:3000/dev/projects` | Technology drafts, safe links, CRUD/conflicts |
| `http://localhost:3000/dev/certificates` | Required fields, date ranges, non-expiring versus unknown |
| `http://localhost:3000/dev/honours` | Optional details, partial date, safe reference link |
| `http://localhost:3000/dev/languages` | Name duplicates, unspecified/CEFR/native transitions |
| `http://localhost:3000/dev/publications` | Author order, DOI/URL safety, partial dates |
| `http://localhost:3000/dev/resume-upload` | One non-empty PDF, 5 MiB preliminary limit; cancel/late response/replacement/delete/access failures |
| `http://localhost:3000/dev/resume-review` | Existing/proposed differences, edit/skip, collection add/update choices, explicit confirmation, conflicts |
| `http://localhost:3000/dev/onboarding` | Both labelled synthetic scenarios and both paths; replacement invalidates old proposals; scenario-switch Cancel retains drafts |
| `http://localhost:3000/dev/resume-tailoring` | Source references, missing requirement, edits/accept/reject/exclude/reorder, save/approve, sample download, conflicts/retries/cancel |

All preview state resets on refresh. No production samples, localStorage/IndexedDB persistence, PDF parsing, OCR, AI calls, automated applications or edited-content PDF generation are implemented. Local PDF preview URLs are not stored-object identities or signed URLs. The tailoring sample PDF is explicitly **not an export of the approved/edited resume**. All ten `/dev/*` routes must return 404 in production without demo content; legacy B3 `/preview/**` redirects are separate and preserved.

## Verification evidence and boundaries

Final automated checks run in this original worktree:

- `node --test tests/*.test.mjs`: **232 passed**. Covers B3 auth/recovery, profile partial PATCH/nulls/Cancel/save errors, confirmed completion, skills/drawer/discovery, six collections, links/PDF lifecycle, parsing review, CV onboarding, tailoring, matching freshness and production gating.
- `npm run lint`: passed; `npm run typecheck`: passed; `npm run build`: passed on Next.js 16.4.5. The existing Next patch and the compatible TypeScript ESLint remediation below are included as supporting changes. All 232 frontend tests, lint, typecheck and production build were rerun successfully after that remediation.
- From `apps/api`: `& '.\.venv\Scripts\python.exe' -m pytest tests/test_skills_catalog.py --no-cov -q`: **19 passed**, one existing Starlette/httpx deprecation warning. Only fresh in-memory/disposable SQLite test databases are used. No shared `--apply` or shared-data writes are run. Focused Ruff on the importer and its test file passes.
- `git diff --check` and separate whitespace/conflict-marker checks on proposed untracked delivery files pass. Proposed files are inspected for accidental credentials, real environment files and generated output; review findings are recorded in the manifest/security notes.
- Runtime verification before the dependency-only follow-up, on a temporary loopback production server (`127.0.0.1:3188`): **all ten `/dev/*` routes returned HTTP 404**, with no preview notice/controls/fictional job content in their responses. The verification server was stopped; no existing frontend was stopped. The post-remediation build and all route-gating unit tests passed; the HTTP/browser smoke was not repeated after the lint-tool update.
- Pre-remediation audit: **15 affected development entries (9 high, 6 moderate), two unique advisories**. After the compatible fix below: **14 high development entries, one unique advisory**, picomatch. The propagated severity/count change does not mean fourteen distinct vulnerabilities. Production audit was rerun after the update: exit 0, **zero vulnerabilities**. Full audit exits 1 for the disclosed unpatched development advisory. This supersedes earlier audit snapshots here and in B4-next-security-update.md.
- Proposed delivery secret review covers **140 explicit files**. Fifteen pattern hits were reviewed as intentional synthetic test sentinels/unsafe-URL validation fixtures (including rejected DOI URLs); no accidental real credential or real environment file was found in the proposed set. Matched values were not printed. Existing real `.env` and `apps/web/.env.local` paths remain ignored and were not read/changed. No new B4 commits exist to history-scan; a fresh exact-diff/history security pass is still required before any later push.
- Static local-import closure check: **zero missing imports** relative to B3 tracked files plus the proposed manifest. No excluded legacy demo/publication source is required by the included application modules. This is not a claim of an independently staged/clean-checkout build; staging/isolation was not requested.

**User-confirmed earlier on the original implementation:** Google/LinkedIn sign-in and session persistence after refresh; recovery email/callback, mismatched-password rejection, successful reset/new-password sign-in and rejection of the old password. For B4, grouped skill discovery and add/remove persistence after refresh were confirmed. The approved skills import outcome above was explicitly confirmed. These confirmations are not presented as new observations of every current screen.

**Earlier isolated browser evidence:** [profile editing](B4-profile-editing.md) records synthetic desktop/mobile checks of the original editor, partial PATCH, null clearing, persistence and guards. This is historical evidence for that iteration, not a fresh check of all expanded screens. No temporary review-candidate checks are used as evidence for this original delivery.

**This final pass:** browser inventory found Chrome, but returned `The browser access host is unavailable`. No fresh browser desktop/mobile/focus/screen-reader observation is claimed. Controlled tests execute form events, pending/error/retry/Cancel logic and the native drawer's focus/scroll contract; code inspection verifies semantic labels, responsive layouts and semantic rounded theme tokens. These do not replace actual browser keyboard/focus/layout checks. Visual PDF inspection remains pending. Real connected collection/upload/parser/tailoring checks await Maria/Dalia's adapters and approved test environments; this does not make their delivered frontend interfaces incomplete.

## Security remediation and remaining risk (18 November)

| Unique advisory | Before / affected path | Action and outcome |
| --- | --- | --- |
| [GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/advisories/GHSA-g3hv-75wg-m249), minimatch pattern amplification | `eslint-config-next@16.4.5 -> typescript-eslint@8.71.2 -> @typescript-eslint/typescript-estree@8.71.2 -> minimatch@10.2.6`. Affected >=7.0.0 <11.0.1; publisher patch 11.0.1. | **Resolved** by a compatible parent update to TypeScript ESLint 8.73.0, whose declared minimatch range starts at ^11.0.1; installed/locked minimatch is 11.0.9. The checked 8.72.0 parent still requests minimatch 10.x. Existing unaffected minimatch 3.1.5 consumers remain unchanged. |
| [GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), picomatch pattern backtracking | `eslint-config-next -> @next/eslint-plugin-next -> fast-glob@3.3.1 -> micromatch@4.0.8 -> picomatch@2.3.2`; also `eslint-import-resolver-typescript@3.10.1` and `@typescript-eslint/typescript-estree@8.73.0 -> tinyglobby@0.2.17 -> picomatch@4.0.7`, with `fdir@6.5.0` sharing that instance. | **Outstanding**: advisory affects <=4.0.7 and lists no patch; npm publisher versions stop at 4.0.7 when checked. Updating within supported ranges cannot eliminate it. No unsupported override/fork or suppression was added. |

The exact targeted command from `apps/web` was:

```powershell
npm update typescript-eslint --ignore-scripts --no-audit --no-fund
```

`eslint-config-next@16.4.5` already permits TypeScript ESLint ^8.56.0. Its 8.73.0 family stays within that declared range and is compatible with the installed Node 24.22.0, ESLint 9.39.5 and TypeScript 5.9.3. The visitor-keys Node requirement was already present before this update; it was not newly introduced. `package.json` and direct/runtime versions are unchanged by this follow-up. Only the lockfile's TypeScript ESLint subtree changed: eleven aligned 8.71.2 -> 8.73.0 entries, minimatch 10.2.6 -> 11.0.9, its new `@isaacs/nonrecursive-glob-match@1.1.0` dependency, and compatible subtree patch resolutions for ignore 7.0.12 -> 7.0.16, brace-expansion 5.0.12 -> 5.0.13 and semver 7.8.5 -> 7.8.6. The pre-existing Next-family 16.4.5 changes remain included. Installed and locked versions agree; no dependency entrypoint or trust configuration was edited.

Npm's offered root-level remediation for the remaining picomatch chain is **eslint-config-next 14.2.35**, marked SemVer-major relative to installed 16.4.5: a two-major downgrade that would decouple Next's lint configuration/plugin from Next 16 and change rule/peer compatibility. It was not applied automatically. It is not appropriate to force this downgrade, remove lint checks or substitute an unpublished version merely to obtain a clean audit. Recheck upstream releases and obtain Maria's explicit review before any incompatible lint-stack change.

Concrete exposure: these packages are development lint/configuration glob dependencies. Source inspection finds fast-glob in Next's lint root-directory resolution, tinyglobby in TypeScript project-list resolution and the import resolver's tsconfig include handling. Malicious glob patterns from repository/configuration inputs can exhaust CPU/memory in developer or CI jobs; the original minimatch issue additionally requires its affected optimization path. Normal profile/skills/job text and PDF selections are not wired to these lint glob APIs. Production audit contains neither advisory, but this does not establish immunity for build agents that install dev dependencies. Keep configuration changes reviewed and CI jobs bounded while awaiting a patch; no workflow/settings changes or warnings were suppressed here. The standalone lint command, typecheck and production build all passed, but that does not erase the outstanding advisory.

## Import history and project discrepancy

The completed approved import inserted **132** records; the catalog then contained **143**, including **all 140** approved names. Existing IDs/names and user/opportunity associations were preserved. These are previously confirmed results, not a newly executed database comparison. The earlier `inserted: -132` output was a reporting error from aggregating driver `rowcount=-1`, not negative inserts. The isolated-tested fix counts returned inserted IDs and leaves validation, conflict handling, transaction/rollback and association behavior unchanged. Do not rerun shared apply merely to test this correction. See [importer runbook](../../../database/seeds/SKILLS_CATALOG_IMPORTER.md).

Maria/Dalia must reconcile project/environment documentation before future shared work: the previously confirmed configured project is **`eabtzresfdzekvqpyrrx`**, while **`supabase/README.md` referenced `fnldapsomswemayxhayk`**. A shared pooler hostname is not a unique project ID. This task does not assume the README applies to only one environment, overwrite it or change hosted settings.

## Backend handoffs and recommended integration order

1. Confirm target environments, ownership model and common error/revision/idempotency contracts. Preserve existing IDs/associations. [Expanded hub](B4-expanded-hub-handoff.md), [grouped skills](B4-grouped-skills-handoff.md), [skills drawer](B4-skills-drawer.md). Category metadata is optional follow-up; approved vocabulary import is already complete. Alias discovery does not imply alias-aware matching.
2. Connect authenticated stable-ID, ordered, revision-aware CRUD for [Experience](B4-experience-handoff.md), [Projects](B4-projects-handoff.md), [Certificates](B4-certificates-handoff.md), [Honours & Awards](B4-honours-handoff.md), [Languages](B4-languages-handoff.md) and [Publications](B4-publications-handoff.md). Retain partial/nullable dates, explicit unknown versus non-expiring/native semantics, safe URLs, author ordering, validation, conflicts and retry behavior. Manual editing after parsing must remain possible. Proposed fields/routes are not agreed live endpoint contracts.
3. Connect [private PDF upload](B4-resume-upload-handoff.md): authenticated server byte/type/size validation (client limit currently 5 MiB, final server limit to agree), private storage/policies, metadata/revisions, temporary authorized viewing, replacement/removal, cancellation, orphan cleanup and concurrency. Preserve the [real link fallback](B4-resume-link.md) until a migration plan is agreed. Link URLs are not private object identities.
4. Connect [parsing review](B4-resume-review-handoff.md): authorized source resume, processing status/result/warnings, provenance, profile/resume revisions, explicit selected change set, atomic persistence where applicable, idempotent confirmation and conflicts. Missing extracted values must not erase saved data by default; collections require explicit add/update decisions. No fabricated facts/confidence scores.
5. Enable [CV-first onboarding](B4-cv-onboarding-handoff.md) only when upload, processing, review and persisted confirmation are available. Preserve real manual fallback and completion/guard rules; frontend drafts/synthetic confirmation cannot grant workspace access.
6. Connect [job-specific tailoring](B4-resume-tailoring-handoff.md): authorized job/source revisions, grounded proposals, separate draft persistence, exact-revision approval, invalidation after edits, approved-content PDF rendering and expiring authorized downloads. Export contents must match the immutable approved revision, order and exclusions. Never overwrite standard CV/Profile or auto-submit applications.

Further implementation/evidence: [profile editing](B4-profile-editing.md), [compact completion](B4-profile-completion.md), [profile skills](B4-profile-skills.md), [matching freshness](B4-matching-freshness.md), [Next security update](B4-next-security-update.md). Earlier subtask documents are dated snapshots; this delivery matrix supersedes their obsolete pending-import or initial neutral-card descriptions.

## Proposed commit scope and review base

The exact path manifest is [B4-commit-manifest.json](B4-commit-manifest.json): **140 included paths**, comprising 13 modified tracked paths and 127 new paths; **14 unrelated untracked paths explicitly excluded**. The five-path approved skills-catalog/importer exception is marked separately. The status-only `src/lib/env.ts` modification is additionally preserved/excluded because it has no textual diff. Generated `next-env.d.ts` changes are excluded/restored. All changes remain unstaged. Do not use a blanket `git add apps/web` or `git add .`.

Mixed supporting files have been reviewed against B3 HEAD:

- `next.config.ts`: include only the `node:path` import and repository-root Turbopack change needed to bundle the single approved JSON; keep existing public-auth credential validation.
- `package.json`/`package-lock.json`: include existing Next/eslint-config-next 16.4.5 alignment and the targeted compatible TypeScript ESLint 8.73.0 subtree/minimatch 11.0.9 changes above. No unrelated direct/runtime upgrade.
- Workspace layout/Profile page and API types: include B4 profile access after nullable clearing, full actual profile shape/validation and ProfileHub integration. Preserve authentication boundaries and completion guards on Jobs/other data pages.
- Onboarding page/form and `lib/onboarding.ts`: include real manual preservation plus injectable/demo hooks and CV introduction; completion predicate behavior remains unchanged.
- Shared Drawer: include explicit Skills sizing/keep-mounted/footer options; defaults for existing consumers remain unchanged.
- RecommendedJobs: include only the tailoring import/entry; original URL safeguards, match, details, selection and application link remain intact.
- Existing auth test and local protocol-double changes: include full-profile shape and B4 skills/profile failure/delay instrumentation; preserve recovery/auth behavior. No hosted configuration or production fixture import.
- These current textual hunks are all B4-supporting. If further unrelated edits appear before staging, select the described hunks rather than staging whole mixed files. `src/lib/env.ts` appears modified in status but has no textual diff; preserve/exclude it. Exclude generated `next-env.d.ts` path changes and all environment/generated artifacts.

After the authorized fetch on 18 November: HEAD remains **`7392bf3afb41874f3678e66607dd11e73423cf77`**, equal to local/remote B3 `feature/bianca-auth-onboarding`; B4 has **no upstream** and no B4 commits yet. Fetched `origin/develop` is **`201ac8dbedf46afb08a9e358c484872601d2918c`**. Git's merge base remains **`92426f72e5ce4afe58c75c1224feca67b2589f06`**, and raw ancestry is **1 ahead / 7 behind**, because B3 was squash-merged.

Authenticated GitHub confirms [B3 PR #42](https://github.com/mariatimbus/InternCalling/pull/42) was merged into develop on 17 November 2026 at 14:49:38 UTC, with squash commit `201ac8d` and original head `7392bf3`. The canonical repository is now `mariatimbus/InternCalling`; the existing old-name origin URL redirects successfully and was not modified. Initial connector calls using the old name returned 422/301; authenticated `gh pr view` followed the redirect, and the connector independently confirmed the merged metadata using the canonical name.

B3 integration is verified by content, not ancestry alone: **both full commits have stable patch ID `ff48b3e5dcb95d998066325507538fcb284975b4`**, and `git diff 7392bf3 201ac8d -- apps/web` is empty. The remaining 34 tree differences are newer backend ingestion/ATS code, tests, backend lockfile and ingestion documentation; none overlap the 140 proposed B4 paths.

**Recommended B4 PR base: `develop`.** This supersedes the earlier stacked-base recommendation. Before opening a clean B4 PR, separately authorize synchronization of the scoped committed B4 work with fetched develop: the current old merge base can still repeat B3 in a three-dot PR diff even though the resulting frontend trees match. No merge/rebase/reset/branch switch was performed here. No B4/develop textual path collision is currently indicated; this is not an executed integration/conflict test. Later integration must preserve those 34 ingestion-related changes and reverify the importer/frontend against the integrated backend. Other unmerged remote branches (profile-v2, matching, job tracker, security) are not assumed part of develop or incorporated automatically.

Excluded unrelated work is enumerated in the manifest: opportunity publication data/scripts, `docs/real-catalog.md`, old B3 scope notes and unused historical B2 demo components. They remain untouched in the original worktree. The complete real homepage/sidebar/opportunities implementation already exists in B3 HEAD and is preserved; excluded publication work is not needed to render that interface against the configured backend.

## Final smoke checklist (pending)

1. Sign in, refresh, navigate Jobs/Profile and sign out; test protected redirects and recovery on an approved test account. Preserve official opportunity links/filters.
2. Save/Cancel a profile edit and clear an optional field; refresh to confirm persistence. Completion must change only after confirmed saves/skills. Check unavailable/retry behavior without a false percentage.
3. Open Skills at desktop/mobile widths and high zoom. Check header action order, nine collapsed categories, search/aliases, Other skills, Show more, confirmed chips/count, add/remove/refresh, close during pending, Escape/Done, focus containment/return and retry without losing query.
4. Draft each collection on real Profile: validation/Cancel work, saving is explicitly unavailable. Exercise CRUD/failures/conflicts in the corresponding synthetic previews; inspect keyboard focus and confirmation controls.
5. Select/cancel/replace an allowed PDF and an invalid/oversized file. Real upload stays unavailable; resume link remains usable and persists independently. Exercise upload replacement/delete failures in the preview without losing the confirmed file.
6. Exercise parsing review and both onboarding scenarios: edit/skip, missing required fields, explicit confirmation, Back/Cancel, resume/scenario replacement, failures/retries and stale results. Check persistent demo notices and unchanged real account data/manual path.
7. Exercise tailoring decisions/reorder/edit/save/approve/download. Editing must invalidate approval/export. Sample PDF must remain labelled unrelated to edited content. Check failure/retry/cancel/stale revisions and the preserved real Jobs action.

Missing future backend/storage/AI capabilities are documented integration work, not unfinished frontend scope. The frontend is ready for a scoped commit/review with disclosed limitations. Remaining final-signoff items are fresh browser/device/screen-reader/PDF visual checks, later develop synchronization/integration testing, and Maria's review of the remaining unpatched picomatch development-tooling advisory; do not mark those passed or call the feature merged/Done.
