# B6 opportunity detail

Local branch `feature/bianca-job-detail-match` is based on `origin/develop` at `95ba4f2c9d618fd5c2c630e2f8887260302550f1`. The pre-integration B6 files were backed up separately and remain recoverable from the local Git stash checkpoint `d7e5afefeae57888044cdff8c9fd54ea8724c5a2`.

Jobs desktop and mobile share an assessment load for the selected opportunity. Superseded results are ignored. The standalone page uses the same view with server-loaded assessments. A9 supplies the eligibility verdict and rule reasons; A10 supplies the final score, positive match reasons, component points and cap signal. Zero is a valid score and `unknown` is a valid eligibility verdict. Each request can fail independently.

The action footer reuses the existing Save contract and preserves tracker status. The official link opens the guarded destination without writing to the tracker. A Saved or Applied entry with only tracker metadata shows its status and a full-details link. The standalone route loads catalog metadata when it remains available.

Recommended retains the backend's global ranking and pagination. Loading the selected listing's detailed assessments does not reorder the results. The shared Jobs detail view retains the application progress form, including explicit Mark Applied, status and notes edits, and removal. The persistent Save control takes the place of the initial Save button in that form when the footer already offers Save.

Integrated checks passed: 50 frontend tests across Jobs, resume tailoring, application tracking and Profile-to-Jobs with the real FastAPI scorer; 19 focused FastAPI recommendation and application tests using isolated SQLite; ESLint, Next.js route type generation, TypeScript, production build and Git whitespace checks. The focused API run bypassed the full-suite coverage threshold. Frontend build tooling was verified in a temporary copy with the versions pinned by develop, including Next.js 16.4.6.

All three signed-in smoke checks passed on the integrated build using synthetic records and disposable local PostgreSQL initialized with all eight migrations. Recommended loaded, the seeded QuantCo listing showed a Match Score of 40/100 and a Possibly eligible verdict, and the seeded Optiver listing showed its Saved status and application progress controls. The browser check made no tracker writes.

Verification with real records remains pending. The shared database migration ledger records the five October migrations, so a repeat requires a team-approved database with the current schema, compatible authentication and the relevant records.
