# API Contract

Frozen endpoint contract for the Opportunity Intelligence Platform backend.
Consumers: **B** (frontend, `apps/web`) and **C** (data/ingestion, `services/ingestion`).
Conventions are decided in [ADR 0002](decisions/0002-api-conventions.md); changes to this
document require a PR and sign-off from B and C.

- Base URL: `http://localhost:8000`
- Version prefix: `/api/v1` (breaking changes ship under a new prefix)
- Interactive OpenAPI docs: `/docs` (Swagger UI), `/openapi.json`
- Health probes (unversioned): `GET /health`, `GET /health/db`

## Conventions

- **Auth**: `Authorization: Bearer <access_token>` on all endpoints marked 🔒.
  Tokens are issued by **Supabase Auth** (client-side sign-in), not by this API —
  see [ADR 0003](decisions/0003-supabase-first-architecture.md). The backend
  validates signature, `iss`, `aud`, and expiry; an unknown-but-valid identity
  is mirrored into a local `users` row on first call.
- **Paths**: plural nouns; multi-word segments use kebab-case (`/job-fairs`).
- **Fields**: snake_case in JSON; UUIDs as strings; datetimes ISO 8601 UTC (`2026-10-07T12:00:00Z`).
- **Enums**: lowercase string values (`bachelor`, `internship`, `applied`).
- Money/durations: plain numbers with the unit in the field name (`salary_eur`, `expires_in`).
- Empty collections serialize as `[]`, absent nullable fields as `null` (never omitted).

## Error envelope

Every non-2xx response (including framework validation failures):

```json
{
  "error": {
    "code": "invalid_credentials",
    "message": "Invalid email or password",
    "details": null
  }
}
```

| HTTP | code | When |
| --- | --- | --- |
| 401 | `unauthorized` | missing/invalid/expired token |
| 403 | `account_disabled` | deactivated user |
| 404 | `not_found` | unknown route |
| 404 | `skill_not_found` | skill not attached to profile |
| 404 | `opportunity_not_found` | unknown opportunity id on application create |
| 404 | `application_not_found` | unknown id, or owned by another user (indistinguishable) |
| 409 | `application_exists` | opportunity already tracked by this user |
| 429 | `rate_limited` | per-IP rate limit exceeded (see `APP_RATE_LIMIT_PER_MINUTE`) |
| 422 | `validation_error` | schema validation (details = pydantic errors) |

## Auth

Sign-up and sign-in happen **client-side against Supabase Auth**; this API never
accepts passwords and never issues tokens. Clients send the Supabase access
token as a bearer token. The error codes `invalid_credentials` and `email_taken`
from the previous contract no longer exist — Supabase returns its own errors
for sign-in/sign-up failures.

### GET /api/v1/auth/me 🔒

Returns the caller's user record, creating it (plus an empty profile) from the
token claims on first authenticated call.

```json
{"id": "9f1c…", "email": "ada@example.com", "full_name": null, "is_active": true}
```

## Profile 🔒

Bachelor/Master rules enforced on write: `degree_level` must be `"bachelor"` or
`"master"`; `graduation_year` must be 1900–2100. Violations → 422.

### GET /api/v1/profile

Returns the caller's profile, bootstrapping an empty one on first call. `201` never
occurs here — the resource always exists for an authenticated user.

```json
{
  "id": "3fa8…", "user_id": "9f1c…",
  "headline": null, "bio": null, "location": null, "resume_url": null,
  "degree_level": null, "field_of_study": null, "university": null, "graduation_year": null,
  "created_at": "2026-10-07T12:00:00Z", "updated_at": "2026-10-07T12:00:00Z"
}
```

### PUT /api/v1/profile

Full replacement — **omitted fields are cleared to null**.

```json
// request
{
  "headline": "CS Master student",
  "location": "Berlin",
  "degree_level": "master",
  "field_of_study": "Computer Science",
  "university": "TU Berlin",
  "graduation_year": 2027
}
// 200 — full ProfileResponse as above
```

### PATCH /api/v1/profile

Partial update — only sent fields change; send `null` explicitly to clear one field.

```json
// request
{"graduation_year": 2028}
```

## Skills & interests 🔒

Skills on a profile double as the user's interests. Names are trimmed, lowercased,
and deduplicated; unknown names create new skill rows (get-or-create).

### GET /api/v1/profile/skills

```json
[{"id": "7b2d…", "name": "python"}, {"id": "c4e1…", "name": "sql"}]
```

### PUT /api/v1/profile/skills — replace the whole set

```json
// request
{"names": ["Python", "SQL", "python"]}
// 200
[{"id": "7b2d…", "name": "python"}, {"id": "c4e1…", "name": "sql"}]
```

### POST /api/v1/profile/skills — add one (idempotent)

```json
// request
{"name": "Go"}   // 201
```

### DELETE /api/v1/profile/skills/{name}

`200` with the remaining skills; `404 skill_not_found` if not attached.

### GET /api/v1/skills — catalog of all skills (for pickers)

## Opportunities

Implemented in A7 (read-only catalog). Ordered by `posted_at` descending,
unposted opportunities last.

### GET /api/v1/opportunities

Query params (all optional, combined with AND):

| Param | Type | Rule |
| --- | --- | --- |
| `page` | int | default `1`, ≥ 1 |
| `page_size` | int | default `20`, 1–100 |
| `opportunity_type` | enum | one of the 11 vocabulary values |
| `degree_level` | enum | `bachelor`/`master` match themselves **and** `both`; `null` (unknown) never matches |
| `study_year` | int (1–6) | containment: opportunity's `study_year` must include it; `null` (unknown) never matches |
| `location` | string | case-insensitive substring |
| `is_active` | `true` only | default `true`; hidden postings (inactive or under review) are never listed, and `false` is rejected with 422. A saved posting stays readable by id. |
| `deadline_after` / `deadline_before` | datetime ISO 8601 | inclusive bounds on `deadline` |
| `search` | string | case-insensitive substring of `title`, `organization`, or `description` |

```json
// 200
{
  "items": [{"id": "1d9a…", "title": "Backend Intern", "…": "…"}],
  "page": 1,
  "page_size": 20,
  "total": 50
}
```

Item shape (same as the detail endpoint):

`title` and `description` are display text: prepared English translations are used
when their source content matches the current record. Internal ATS markers and the
known job-board promotional footer are omitted. Missing or stale translations fall
back to the employer text. The source URL, eligibility and matching inputs remain
unchanged. See [English catalog display](english-catalog.md) for cache preparation
and hosting requirements. The `search` filter still searches the persisted employer
text; it does not index translated display text.

```json
{
  "id": "1d9a…",
  "title": "Backend Intern",
  "description": "…",
  "organization": "Example Corp",
  "opportunity_type": "internship",
  "location": "Berlin",
  "url": "https://example.com/job/1",
  "source": "example",
  "source_id": "1",
  "deadline": "2026-11-30T23:59:59Z",
  "posted_at": "2026-10-01T09:00:00Z",
  "is_active": true,
  "degree_level": "both",
  "study_year": [2, 3],
  "skills": [{"id": "7b2d…", "name": "python"}]
}
```

`opportunity_type` ∈ `internship | job | research | scholarship | fellowship | hackathon | competition | early_career | open_source | grant | other` — final vocabulary decided 2026-10-14 (Maria, option A); single source of truth shared with `supabase/migrations` and `database/seeds`.

`degree_level` ∈ `bachelor | master | both`, nullable — eligibility, not the caller's own degree; `null` means not established (never "everyone"). `study_year` is a nullable array of eligible study years (e.g. `[2, 3]`); `null` means not established.

### Filters on GET /api/v1/opportunities/recommended

Besides `location`, `search` and the deadline bounds:

- `degree_level`, `study_year`: hide only postings that state a *different* degree or year;
  postings that do not state one stay listed (most do not).
- `work_model` = `remote` | `hybrid` | `onsite` and `schedule` = `full_time` | `part_time`
  (working student, Werkstudent, part-time, Teilzeit, hours per week): read from the posting's text.
- `field` = `software` | `data` | `hardware` | `security` | `product` | `mechanical` | `business`:
  the role's domain from its title (description when the title has none).
- `posted_within` (days, 1–365): source publication date within that window.
- `no_experience=true`: hide postings that ask for prior experience.

### GET /api/v1/opportunities/{id}

`200` with the item shape above; `404 not_found` for a valid but unknown id;
`422 validation_error` for a malformed UUID.

### GET /api/v1/opportunities/{id}/eligibility 🔒

A9 eligibility assessment of the opportunity against the caller's profile
(full rule set: degree level, study year, graduation year, location — every
rule reports `eligible | possibly_eligible | not_eligible | unknown` with a
human-readable reason; facts the source never stated stay `unknown`).

```json
// 200
{
  "status": "possibly_eligible",
  "reasons": [
    { "rule": "degree_level", "status": "eligible", "reason": "Bachelor students are accepted" },
    { "rule": "study_year", "status": "unknown", "reason": "Student study year is not known" },
    { "rule": "graduation_year", "status": "unknown", "reason": "No structured graduation restriction available" },
    { "rule": "location", "status": "eligible", "reason": "Remote opportunity; no location barrier" }
  ]
}
```

The profile currently carries `degree_level`, `graduation_year` and
`location`; `study_year` has no profile field yet, so that rule is always
`unknown` until the schema grows.

### GET /api/v1/opportunities/{id}/match 🔒

A10 explainable match score (v3): **the share of the posting's stated requirements the
student meets**, gated by A9 eligibility (`not_eligible` always scores `0`).

    score = 100 × earned / max(sum of the weights of the requirements the posting states, 55)

Each requirement is read from the posting and checked against the profile. A requirement
the posting does not state is not listed and not counted. The floor of 55 (skills +
role field) keeps a posting that names no skills or no role from showing a perfect match.

| key | weight | read from the posting | looked for in the profile |
|---|---|---|---|
| `skills` | 35 | structured skills + known technologies in the text (up to 6 count) | skills, technologies in saved projects/experience, technologies named in certificates |
| `field_fit` | 20 | role domain from the title (software, data, hardware, mechanical, security, product, business) | field of study, saved roles, preferred domains; description-only domain = half |
| `languages` | 15 | required languages and CEFR level ("fluent German" = C1), or the posting's own language when not English (B2) | saved languages with CEFR level (native = above C2) |
| `experience` | 10 | asks for prior/relevant experience | saved experience in the role's domain or using its skills (relevant project only = half) |
| `eligibility` | 10 | degree level / study year, when stated | degree level, study year |
| `location` | 10 | place or remote | chosen locations, own city, remote; same country = half |

`requirements` lists each one: `{ key, label, status: met|partial|missing, summary,
matched[], missing[], weight, earned }`. `components` holds the points earned per key (plus
the optional `ai` bonus, capped at 100 in total), and `reasons` repeats the requirements in
plain text for older clients. `/opportunities/recommended` sorts by score, then by most
recent `posted_at`.

```json
// 200
{
  "score": 64,
  "eligibility": "possibly_eligible",
  "components": { "skills": 23, "field_fit": 20, "languages": 8, "experience": 0, "eligibility": 0, "location": 10, "ai": 0 },
  "requirements": [
    { "key": "skills", "label": "Skills", "status": "partial", "summary": "4 of 6 skills", "matched": ["python", "react", "sql", "typescript"], "missing": ["docker", "kafka"], "weight": 35, "earned": 23.3 },
    { "key": "languages", "label": "Languages", "status": "partial", "summary": "1 of 2 languages", "matched": ["English C1"], "missing": ["German C1 — you have B1"], "weight": 15, "earned": 11.3 }
  ],
  "reasons": ["Matches 4 of 6 skills: python, react, sql, typescript", "Also asks for: docker, kafka"]
}
```

Both endpoints: `401 unauthorized` without a bearer token; `404 not_found`
for a valid but unknown id.

## Applications 🔒

Implemented in A8 (saved opportunities + application tracking). All endpoints
require a bearer token and are scoped to the current user — an application
owned by another user is indistinguishable from a missing one (`404`, never
`403`), mirroring the Supabase RLS policy (defense in depth). `user_id` is
never exposed in responses.

### GET /api/v1/applications

List of the caller's applications, newest first. Optional query param
`status` (`saved|applied|interview|offer|rejected`) filters by status.

```json
// 200
{
  "items": [{ "…": "application shape below" }],
  "total": 2
}
```

### POST /api/v1/applications

Saves an opportunity (default status `saved`).

```json
// request
{"opportunity_id": "1d9a…"}
```

`201` with the application shape; `404 opportunity_not_found` if the
opportunity does not exist; `409 application_exists` if it is already tracked
(one application per (user, opportunity)). An explicit `status`, `notes`, or
`applied_at` may be sent on create.

### PATCH /api/v1/applications/{id}

Updates `status`, `notes`, and/or `applied_at` (only sent fields change).
When the status becomes `applied` and no `applied_at` was provided, the server
stamps the current time. `404 application_not_found` for an unknown id or one
owned by another user.

### DELETE /api/v1/applications/{id}

Removes the application from the tracker. `204` on success; `404` for an
unknown id or one owned by another user.

Application shape (all endpoints):

```json
{
  "id": "5c3f…",
  "opportunity_id": "1d9a…",
  "status": "applied",
  "notes": "via referral",
  "applied_at": "2026-10-05T14:00:00Z",
  "created_at": "2026-10-05T14:00:00Z",
  "updated_at": "2026-10-05T14:00:00Z",
  "opportunity": {
    "id": "1d9a…",
    "title": "Backend Intern",
    "organization": "Example Corp",
    "opportunity_type": "internship",
    "deadline": "2026-11-30T23:59:59Z"
  }
}
```

`status` ∈ `saved | applied | interview | offer | rejected`. `opportunity` is
an embedded summary so the tracker UI renders without extra lookups.

## Saved searches 🔒

A student's saved Jobs searches (up to 10), scoped to the owner like Applications
(another user's search is a `404`); Supabase RLS enforces the same rule.

- `GET /api/v1/saved-searches` → `{ "items": [{ "id", "name", "search", "location", "degree_level", "study_year", "alert", "created_at" }] }`
- `POST /api/v1/saved-searches` `{ name, search?, location?, degree_level?, study_year?, alert? }` → `201`.
  At least one criterion is required (`422`); a duplicate name or an 11th search → `409`.
- `PATCH /api/v1/saved-searches/{id}` `{ "alert": true|false }` → the search. Turning alerts on starts
  the window now, so the backlog is never emailed.
- `DELETE /api/v1/saved-searches/{id}` → `204`.

With `alert` on, the daily `job-alerts` workflow (`python -m opportunity_api.alerts --send`) emails
new internships matching the search, ranked by matching v2, with confirmed mismatches left out.

## Review 🔒 (reviewers only)

Ingested postings the scope rules cannot decide (unclear location, role level or
STEM domain) are held with `review_status = "pending"` and never shown in Jobs.
Only users whose Supabase `app_metadata.roles` contains `"reviewer"` may call
these endpoints; anyone else gets `403 forbidden`. `app_metadata` is set with the
server key only (`user_metadata`, which users can edit, is ignored).

### GET /api/v1/review/opportunities

Up to 100 pending postings, newest `posted_at` first, plus the full count:
`{ "items": [{ "id", "title", "organization", "location", "url", "description",
"source", "posted_at", "deadline", "review_reason" }], "total": 52 }`.

### POST /api/v1/review/opportunities/{id}

Body `{ "decision": "approve" | "reject" }`; `204` on success. `approve` publishes
the posting (unless its deadline has passed); `reject` keeps it hidden. A posting
that is not pending (already decided, or taken off the queue by ingestion) returns
`409 conflict`. Later ingestion runs keep the decision while the posting's values
stay the same; a changed posting that still needs review returns to the queue.

## Frozen upcoming contracts

Implemented in a later phase; the shapes below are frozen so B and C can build
against them now. They mirror the SQLAlchemy models in `apps/api/src/opportunity_api/models/`.

(none — applications moved out on 2026-10-15)

## Changelog

- 2026-10-07 — frozen v1 contract after A4/A5 landed (auth, profile, skills).
- 2026-10-14 — auth moved to Supabase per ADR 0003: `POST /auth/register` and
  `POST /auth/login` removed; tokens are Supabase-issued; `invalid_credentials`
  and `email_taken` error codes retired. Per-IP rate limiting added
  (`429 rate_limited`, `APP_RATE_LIMIT_PER_MINUTE`, default 240/min).
- 2026-10-14 — `opportunity_type` final vocabulary (11 values) — additive
  extension plus renames: adds `research`, `competition`, `open_source`;
  `early_program` renamed to `early_career`. Aligns contract, Supabase enum,
  FastAPI model, and seed dataset. Pending B (frontend) and C (data) sign-off
  per ADR 0002.
- 2026-10-14 — opportunities gain nullable `degree_level`
  (`bachelor|master|both`) and `study_year` (array of ints) eligibility
  fields, backing the seed dataset. Additive; pending B/C sign-off.
- 2026-10-15 — A7: `GET /api/v1/opportunities` (pagination + filters) and
  `GET /api/v1/opportunities/{id}` implemented per the frozen shape; moved out
  of „Frozen upcoming contracts". Query params documented above; pending B/C
  sign-off.
- 2026-10-15 — A8: applications endpoints implemented
  (`GET/POST /api/v1/applications`, `PATCH/DELETE /api/v1/applications/{id}`);
  moved out of „Frozen upcoming contracts". Responses embed an `opportunity`
  summary; `applied_at` is auto-stamped on the transition to `applied`;
  pending B/C sign-off.
- 2026-10-22 — A9/A10/A11: `GET /api/v1/opportunities/{id}/eligibility` (A9
  rule-by-rule eligibility with reasons) and `GET /api/v1/opportunities/{id}/match`
  (explainable score gated by eligibility; optional Ollama `ai` component via
  `APP_OLLAMA_URL`, deterministic-only when unset). Profile-driven:
  `study_year` and `interests` are not profile fields yet, so the study-year
  rule stays `unknown` and the interests component is always 0 until the
  profile schema grows; pending B/C sign-off.


### Profile v2

GET/PUT/PATCH `/api/v1/profile` additionally accept/return nullable `study_year`
(`first`, `second`, `third`, `fourth`, `fifth`, `sixth`), `interests`,
`preferred_tech_domains`, `preferred_locations` (up to 50 nonempty strings, each
up to 100 characters), and `remote_preferred` (boolean). PATCH changes only sent
fields; PUT clears omitted fields. NULL study year remains unknown. Preferences
influence relevance, never hard eligibility. Remote false is a soft preference,
not a prohibition. Tech domains use descriptive text (e.g. `backend`, `data science`).

Apply `20261117120000_profile_v2.sql` before deploying this API. The migration is
additive, backfills no facts, and retains existing owner-only RLS policies/grants.
Run `npm run db:test:fresh` for disposable PostgreSQL migration and two-user RLS
checks; hosted verification still requires an approved development environment.

### Global recommendations

Authenticated `GET /api/v1/opportunities/recommended` filters the entire active,
unexpired catalog before scoring and pagination. Default type: `internship`.
Parameters: `page`, `page_size` (1–100), `opportunity_type`, `degree_level`,
`study_year` (1–6), `location`, `search` (up to 200 characters), `deadline_after`,
`deadline_before`. Filters use catalog semantics; explicit year filters require
known matching years. Missing deadlines are retained unless a deadline filter is set.

Response: `{items: [{opportunity, match, eligibility}], page, page_size, total}`.
`match` includes score, components and reasons; `eligibility` includes every rule's
status/evidence (including unknown requirements). Confirmed mismatches are excluded;
unknown/possible eligibility remains visible. Confirmed matches sort first, then
score descending, then UUID ascending. Pagination is stable for unchanged data;
new data or profile edits can change placement. Matching is deterministic with no
per-candidate Ollama calls. Relevance is not acceptance probability.

The `/jobs` workspace consumes this order directly and displays component scores
and full eligibility evidence rather than sorting one catalog page in the browser.
The current implementation scores candidates in memory, suitable for beta volumes;
measure latency before introducing indexed candidate retrieval or cached scores.

### Application tracker integration

`/jobs` details expose Save and Mark Applied. `/applications` reloads owner-scoped
records from A8 and supports Saved/Applied views, status edits, notes, and removal.
Server actions recheck authentication and resolve the current user's canonical
record before POST/PATCH/DELETE. Successful writes revalidate both views; failures
show an error without optimistic success. Concurrent saves reread the existing
record and show a conflict. Saving an already tracked role keeps its progress.
Explicit `status: null` on PATCH is rejected with 422; omit status to keep it.
“Mark Applied” records the student's action; it does not submit to an employer.

### Private CVs (A11)

All `/api/v1/cv` routes require a verified Supabase bearer token. Storage calls
retain that identity and use only a publishable/anon project key. The private
bucket and metadata migration must be applied before enabling uploads.

| Method | Path | Result |
| --- | --- | --- |
| POST | `/cv?filename=resume.pdf` or `resume.docx` | Raw matching PDF/DOCX bytes, maximum 5 MiB; 201 metadata |
| GET | `/cv` | Current user's documents/drafts |
| GET | `/cv/service-health` | Optional model configured/available flags |
| GET | `/cv/{id}` | Owner metadata, extraction draft and accepted provenance |
| GET | `/cv/{id}/file` | Private attachment with `Cache-Control: no-store` |
| POST | `/cv/{id}/extract` | Validated draft; never changes the profile |
| POST | `/cv/{id}/review` | Accept selected `fields`; rejects profile conflicts |
| DELETE | `/cv/{id}` | Remove private object then metadata; 204 |

Extraction does not require AI. When `APP_OLLAMA_URL` is unset, or the model is offline
or returns an unverifiable draft, deterministic keyword rules (`ai/rules.py`, extractor
`rules-v1`) propose degree level, university, field of study, graduation year, header
city and catalog skills, each quoted from the CV. Workspace `capabilities.parsing` is
therefore always `true`. Students still confirm every value; nothing is written
automatically. 422 `invalid_extraction` means that neither path found an explicit fact.

Reviewable fields: headline, location, degree_level, field_of_study, university,
graduation_year, skills, interests. Missing facts cannot be accepted. Accepting a
field replaces its current value; clients must show values/evidence before asking
the student to accept. Foreign document IDs return 404. Other errors: 409 stale
profile/file or missing extraction, 413 too large, 415 wrong media type, 422 unreadable
document or invalid/ungrounded AI output, 503 unconfigured/unavailable model/Storage.
See `services/ai/README.md` for parser limits, setup, retention and hosted test gates.


## Live profile workspace adapters

Apply `20261122160000_profile_workspace.sql` after the existing migrations before
serving these routes. All routes below require the signed-in owner's bearer
session; owner IDs in request bodies are never trusted. Browser editors use the
verified Next.js same-origin `/api/backend/workspace` proxy. Configure
`API_BASE_URL` (server-only preferred, falling back to `NEXT_PUBLIC_API_BASE_URL`)
and `AUTH_APP_ORIGIN` to the frontend origin. Cross-origin writes are rejected.

- `GET /api/v1/workspace/capabilities`: independent availability of private
  uploads, optional Ollama parsing, explicit confirmation, collections and
  deterministic source-based tailoring. Missing extraction model disables
  parsing without disabling manual profile editing or configured PDF storage.
- `GET /api/v1/workspace/snapshot`: current core fields, skills and all six
  collections with a content revision used by import/onboarding confirmation.
- `GET|POST /api/v1/workspace/collections/{section}` and
  `PATCH|DELETE /api/v1/workspace/collections/{section}/{id}`: experience,
  projects, certificates, honours, languages and publications. Mutations require
  a UUID `Idempotency-Key`. POST/PATCH bodies contain `values` matching the
  typed editor draft; PATCH additionally requires the saved integer `revision`.
  DELETE requires `?revision=N`. The response has flat fields plus `id`,
  `revision`, and `position`. Multiline authors/achievements become arrays.
- `POST /api/v1/workspace/manual-confirm`: `{requestId, profileRevision, draft}`
  atomically saves the five required onboarding fields and explicit skill list.
  Returns the complete confirmed snapshot. A changed baseline returns 409.
- `GET|POST /api/v1/workspace/resume`: current private PDF metadata or null,
  and raw `application/pdf` upload (5 MiB maximum). Replacement requires
  `replace_id` and `replace_revision` query values. Uploads use an idempotency
  header. Metadata uses the fixed safe filename `resume.pdf`.
- `GET /api/v1/workspace/resume/{id}/file?revision=N`: private owner PDF bytes,
  never a public storage URL. DELETE at `/resume/{id}?revision=N` requires
  an idempotency header and removes the active PDF. Older uploads are private
  archives and never automatically become active after removal.
- `POST /api/v1/workspace/resume/review/start`: `{source:{id,revision}}`,
  idempotency header. Persists a validated, source-grounded core profile/skills
  proposal. `GET /resume/review/{jobId}` and `/result` retrieve its status and
  draft. Other profile sections remain manually editable. Parsing alone never
  writes extracted values to the profile.
- `POST /api/v1/workspace/resume/review/confirm`: explicit selected profile,
  skill additions and collection edits, with request/job/source and baseline
  revision. All edits and the durable receipt commit atomically; stale profile,
  PDF or collection versions reject with 409. Human corrections are labelled
  user-provided; accepted unchanged extracted facts retain reviewed provenance.
- `GET /api/v1/workspace/tailoring/context/{jobId}`: actual job requirements and
  current saved source facts, with revision scope. POST `/tailoring/generate`
  accepts `{requestId,scope}` and returns a ready, persisted draft of reordered
  source facts. It does not invent qualifications or perform AI rewriting.
  GET `/tailoring/generation/{id}` reloads its status.
- POST `/tailoring/save` accepts `{requestId,draft:{id,revision},blocks}`;
  `/approve` accepts `{requestId,draft}` after every block is accepted/excluded.
  `/export` accepts `{requestId,approval}` and prepares the exact approved
  wording. GET `/tailoring/export/{id}` and `/file` return status/private PDF.
  Editing the draft or changing its job/profile/PDF source invalidates export
  access. Export contains accepted blocks only, with supported Unicode glyphs;
  oversized/unsupported text fails validation before readiness.

Collection revisions are integers; tailoring refs use revision strings to match
its existing client contract. Idempotency keys and body request IDs are UUIDs,
scoped to the owner and exact operation/payload. Retrying a dropped response with
its original identifier returns the saved receipt, without repeating writes.
Reusing the identifier for different content returns 409. The private workflow
records contain CV/profile text: access is owner-only SELECT via Supabase RLS,
with browser writes denied. The API performs authenticated writes. Account
removal cascades these records; no automatic receipt expiration is applied.

Browser PDF access uses session-authenticated fetch and a short-lived in-memory
blob URL, revoked on close/replacement. Neither this adapter nor PDF export sends
applications to employers. The original `/api/v1/cv` endpoints remain available.
