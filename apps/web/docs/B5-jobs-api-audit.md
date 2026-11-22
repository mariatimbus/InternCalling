# InternCalling B5 · Jobs API audit and Recommended feed

Step 1 is based on `origin/develop` at `d05af14955a4b96bbd9d12f43c7fa7f412584bf2` (B4 #44).

## Frontend behavior

Recommended requests `opportunity_type=internship&is_active=true` with 12 results per page. The API filters before counting and paging. Legacy `type` values are ignored, including repeated values, and are omitted from new links. Search uses `q`, trims the API term, and submits back to page 1. Pagination preserves `q` and uses `page`.

Step 2 brings Recommended, Saved and Applied into authenticated `/jobs`. The `view` query parameter defaults to Recommended for missing or unsupported values. View links carry `q` and `page` so the URL retains the Recommended context on navigation, reload and history traversal. Each view has its own empty and retryable load error copy. Saved and Applied use the Applications response without catalog discovery filters and show the embedded title, organization, type, deadline and tracker status in the shared card and detail layouts. The tracker summary supplies limited detail, including no official URL. `/applications` remains available.

The completed-account guard, per-item match requests and page-local score sorting, desktop detail panel, mobile drawer, and original opportunity CTA are retained. Explore and Applications keep their existing behavior. Recommended is an active internship feed. Europe and tech/STEM coverage remains unverified.

## Step 3 discovery controls and card metadata

| Jobs URL | A7 list parameter and behavior |
| --- | --- |
| `q` | `search`, trimmed and limited to 200 characters on the frontend. |
| `location` | `location`, trimmed and limited to 255 characters on the frontend. The API searches the stored location text. |
| `degree_level` | `degree_level` from the Filters drawer. `bachelor` or `master` includes `both` rows. `both` selects rows explicitly marked for both. |
| `study_year` | `study_year` from the same academic selection as degree. A7 accepts a single integer from 1 through 6 and checks containment in the opportunity array. |
| `page` | `page`, default 1. The frontend retains the existing page cap of 10000 and size 12. |
| `view` | Frontend only. Recommended is the default. Tabs retain submitted discovery values, while Saved and Applied read only Applications. |

Keyword submission, suggestion selection, applying filters and clearing applied filters omit `page` to start at 1. Keyword changes retain the applied filters, and filter changes retain the submitted keyword. Pagination, tabs and retry links carry the discovery state. The Filters trigger counts an applied location and an applied academic selection individually. The shared Add skills drawer keeps edits in a draft until Apply filters. Its Clear filters control clears the draft, and the applied-filter row's Clear filters control clears the URL filters immediately. Both keep the keyword and fixed active-internship constraints. Blank, repeated scalar, and invalid filter values are omitted from the API request. Legacy `type` and direct URL attempts to override the fixed constraints are ignored.

Curated search suggestions use case-insensitive prefix and substring matching across labels, aliases and keywords, with prefixes ranked first and at most five matches. Typing updates local suggestions. Choosing a suggestion submits the corresponding literal A7 keyword, and submitting the form accepts free text. Dynamic vacancy-backed search suggestions would need a future catalog API contract. The local list uses neither the Skills API nor live catalog data.

| Suggestion | Keyword | Aliases |
| --- | --- | --- |
| Software Engineering | `software` | SWE, software developer, frontend, backend |
| AI / ML | `machine learning` | AI, ML, artificial intelligence |
| Data | `data` | data science, analytics, data engineering |
| Cybersecurity | `cybersecurity` | cyber, security, infosec |
| Quant | `quant` | quantitative, quant finance |
| Robotics | `robotics` | robot, automation |
| Embedded Systems Engineering | `embedded` | firmware, microcontroller, embedded software |

Undergraduate first through fourth year send `degree_level=bachelor` paired with `study_year=1` through `4`. Master’s first and second year send `degree_level=master` with `study_year=1` or `2`. Degree-only choices remain available in the same selector. Previously supported URL combinations outside the six named year choices remain visible as the current filter and can be cleared or replaced. The UI offers no new choices for bachelor years 5–6, master years 3–6, or year-only and both-plus-year combinations.

**Confirmed A7 limitation.** The degree predicate and year containment are conjunctive, and a row marked `both` can match either degree. A7 stores a single flat year list and does not identify which degree each year belongs to. Maria and Dalia would need degree-specific eligibility data and matching to express, for example, a role open to undergraduate year 3 and master’s year 1 only. Verify with a mixed-degree fixture where the two eligible pairs match and both crossed pairs are excluded before pagination.

Recommended cards can display `deadline`, `posted_at`, `degree_level` and explicit eligible years from `study_year`. Absent or unusable values are omitted. Dates use UTC. The reviewed seed pipeline maps source `released_date` to `posted_at`. ATS records can leave it null, and the UI never falls back to an import timestamp. Work mode is unavailable from A7. Saved and Applied cards can display the embedded tracker deadline. They have no publication date, degree, study years or official URL in that summary.

Cards with a canonical `url` now offer a native Official source link in addition to the detail CTA. Both use the existing Jobs HTTP(S) and no-credentials guard. The link sits above the stretched selection target and has its own keyboard focus, separate from Save and card selection.

### Proposed contracts for unsupported discovery controls

The drawer has two live filter controls, Location and the combined degree and study-year selector. Schedule, Work Model, Date Posted, Industry and Required Experience are visible and labelled “Not available yet.” Schedule, Work Model and Date Posted show disabled choices. Industry shows a disabled search field without options. Required Experience has no selectable ranges. These sections contribute no draft values, applied count, URL parameters or API filters. Schedule occupies the place of a Job Type control, and Recommended continues to request active internships.

Code inspection of the current A7 routes, response schema and tests found none of these filter contracts. The following names and semantics are proposals for Maria (API) and Dalia (source data).

| Control | Proposed field, values and unknown handling | Proposed query and verification |
| --- | --- | --- |
| Schedule | Nullable `schedule`, with source-backed `full_time` and `part_time` as supported choices. Leave unknown or unclassified values null. Schedule is independent of opportunity type. | Exact `schedule` match before counts and pagination. Nulls remain visible without the filter. Verify full-time and part-time internships plus null and non-internship controls over multiple pages. |
| Work Model | Nullable `work_model` with `remote`, `hybrid`, `on_site`, supplied only from explicit source evidence. Null means unknown. Work model is independent of location and region eligibility. | Exact `work_model` match before counts and pagination. Verify all three choices plus null against the same location, including a remote role with no European eligibility evidence. |
| Date Posted | Nullable UTC `posted_at` from the actual source publication. Keep unknown dates null. Proposed preset windows are rolling 24 hours, 3 days, 7 days and one calendar month in UTC. | Filter with proposed `posted_after` and `posted_before` time bounds inclusive, before counts and pagination. Exclude nulls when bounded. Freeze the reference time and test each boundary, a future timestamp, and an import date that differs from publication. |
| Industry | Nullable `industry_id` with stable server-issued IDs and authoritative labels from a searchable vocabulary endpoint. Unknown or unmapped industries stay null. Industry describes the source industry independently of role domain. | Match the selected `industry_id` before counts and pagination. Verify label search returns stable IDs, invalid IDs are rejected, and same-domain roles in two industries are distinguished. |
| Required Experience | Nullable source-backed requirement with an explicit minimum amount and units where stated, and source text for requirements that cannot be normalized. Explicit zero remains zero. Unknown or unstated stays null. Agree allowed units and matching rules before offering any selector values. | Once defined, apply the structured requirement predicate before counts and pagination. Unclassified requirements stay out of a numeric filter. Verify zero, a positive stated requirement, ambiguous source text and unknown values on separate pages. |

Europe and tech/STEM are a separate open feed requirement. Neither a location string, the Remote work model, nor keyword preset matches establish that scope. A verified server-side classification or scoped feed must apply across the full result set.

## Confirmed A7 contract

`GET /api/v1/opportunities` and `GET /api/v1/opportunities/{opportunity_id}` are public reads in FastAPI. The Jobs page itself is protected and uses the authenticated transport. The list returns `{items, page, page_size, total}`, ordered by `posted_at` descending with nulls last and ID as tie-breaker. A page beyond the end returns an empty list and the filtered total.

| List parameter | Confirmed semantics |
| --- | --- |
| `search` | Case-insensitive SQL LIKE match across title, organization, or description. The server wraps the term in `%` and leaves LIKE wildcards such as `%` and `_` unescaped. |
| `opportunity_type` | Optional exact enum. Values are `internship`, `job`, `research`, `scholarship`, `fellowship`, `hackathon`, `competition`, `early_career`, `open_source`, `grant`, `other`. |
| `is_active` | Optional boolean equality. Omission includes both states. The filter reads the stored flag and does not compare the deadline to the current time. |
| `location` | Case-insensitive SQL LIKE match on free-text location, with the same wildcard behavior as search. |
| `degree_level` | `bachelor` and `master` each include `both`. `both` matches only itself. Null is excluded when this filter is set. |
| `study_year` | One integer from 1 to 6. The opportunity's eligible-year list must contain it. Null and empty lists are excluded. The API applies containment in Python before slicing and recomputes total. The current profile-to-eligibility mapping leaves student study year unknown. |
| `deadline_after`, `deadline_before` | Inclusive datetime bounds on deadline. Rows with null deadlines are excluded when either bound is supplied. |
| Posting date | `posted_at` is returned and used for ordering. There is no posting-date range parameter. |
| Europe/region, tech/STEM | No supported region, country, work mode, domain, STEM, or skills filter. A15's ingestion scope screens evidence for some sources. The list has no scope predicate or feed identifier, and the audit found no guarantee covering all active internships. |
| `page`, `page_size` | One-based integer page, default 1. Size 1–100, default 20. Filters compose before paging and determine total. |

List items and detail use the same schema. Required non-null fields are `id` (UUID), `title`, `opportunity_type`, `url`, `source`, `source_id`, `is_active`, and `skills` (possibly empty, each entry has UUID `id` and `name`). Required nullable fields are `description`, `organization`, `location`, `deadline`, `posted_at`, `degree_level`, and `study_year` (array of integers). Country, work mode, compensation, duration, separate application URL, and classification/evidence fields are absent. The Jobs card adapts the title, organization, location, type and skills, with display fallbacks. The brief also displays description and deadline when available. Authenticated `GET /api/v1/opportunities/{id}/match` supplies the score (0–100), eligibility, components and reasons. The authenticated sibling `/eligibility` endpoint provides the eligibility assessment.

`url` is the canonical official URL field. Ingestion derives it from the connector's `source_url`, canonicalizes and validates it, then persists the normalized value. `source` and `source_id` identify the record's provenance. An unusable or missing official URL can prevent ingestion. This trace verifies field lineage in code. Individual hosted URLs and records were not checked. The Jobs card and brief expose official-source actions for valid HTTP(S) URLs without embedded credentials. Explore already uses an HTTPS-safe official link.

FastAPI errors use `{error: {code, message, details}}`. Invalid typed query input or a malformed UUID returns 422 `validation_error`. An absent opportunity UUID returns 404 `not_found`. An existing inactive record can return 200 from the detail endpoint. Unexpected server errors return 500 `internal_error`. Protected endpoints require a valid current user. The web transport keeps HTTP status and uses safe generic errors without reading upstream error details.

## Step 4 direct detail and page states

`/opportunities/[id]` is a workspace route guarded by the same session-refresh proxy and completed-account check as Jobs. A direct or refreshed visit reads `GET /api/v1/opportunities/{id}` using the public-read transport without forwarding the account token to this endpoint. The detail body contains catalog data only, including description, skills, known degree and study years, and the guarded canonical `url`. It has no tracker mutation, match, or eligibility request.

The Jobs desktop panel and mobile drawer include View full details for Recommended, Saved, and Applied. Back to Jobs reconstructs a local `/jobs` URL from the allowlisted `view`, `q`, `location`, `degree_level`, `study_year`, and `page`. An absent or invalid view gives plain `/jobs`. The route accepts no return URL. Detail retry retains the same allowlisted context.

| State | Code inspection |
| --- | --- |
| Loading | The detail route has an accessible loading boundary. Jobs awaits the catalog and settled match requests. |
| Empty | Jobs shows a view-specific empty state. A missing detail has a separate state. |
| API error or validation | Jobs catalog or tracker failures show view-specific retry. Detail network, server, and other non-404/422 failures show a separate retry state. A match failure leaves the Jobs card usable without a score. |
| Not found | The detail page handles missing segments, malformed UUIDs (locally), and A7 404 or 422 from the UUID-only lookup. It renders a missing-record state with Back to Jobs. This UI state is distinct from the upstream HTTP status and does not promise an HTML 404. |
| Inactive or expired | A detail response with `is_active=false` shows “Closed on InternCalling” and “View official listing” when a safe canonical URL remains. Active records with past dates remain active in the UI. The detail displays the calendar date encoded by `deadline` and does not infer a cutoff, timezone, or expiry from that date or from a null deadline. |

Saved and Applied use the tracker response independently from the detail lookup. For acceptance, an `offer` row for a withdrawn internship still supplied by Applications must remain visible in Applied with its title and status. View full details can return A7 404. Back to Jobs should restore the Applied view and filters, and the tracker row should still be present. Repeat for an existing `saved` row. A7 does not provide an explicit withdrawn state or tombstone, and a hard-deleted opportunity can cascade-delete tracker rows in the current model. Frontend preservation depends on the tracker API continuing to supply a record and its summary.

## Saved and Applied

Jobs and Applications use authenticated `GET /api/v1/applications` and partition its response into `saved` and all other statuses (`applied`, `interview`, `offer`, `rejected`). The Applied view represents application progress. The status contract alone does not prove that every progressed row has a recorded submission timestamp. Optional backend `status` is an exact single status. Rows include tracker ID, opportunity ID, status, nullable notes and applied timestamp, created/updated timestamps, and an embedded opportunity summary (ID, title, nullable organization, type, nullable deadline).

`POST /api/v1/applications` with an opportunity ID defaults to `saved` and creates a tracker row (201). The unique user/opportunity pair yields 409 `application_exists` for duplicates, including concurrent creates and existing Applied rows. A missing opportunity returns 404 `opportunity_not_found`. `PATCH /api/v1/applications/{application_id}` updates tracker fields and can stamp `applied_at`. `DELETE` on that path deletes the entire row (204). Missing or other-user tracker IDs return 404 `application_not_found`. Invalid inputs return 422 and unauthenticated access returns 401.

Recommended shows the existing tracker status when there is a row and offers Save otherwise. Save disables the control during submission, checks the authenticated completed account and reads the current tracker rows. Only a missing row triggers POST with `status=saved`. A 409 triggers a fresh read and uses the actual tracker status, including progressed statuses. A confirmed response invalidates Jobs and Applications so subsequent reads show the persisted row. Unconfirmed responses allow retry without marking the card Saved.

Unsave has no atomic saved-only guard. A read followed by DELETE can race an Applied transition, and even a currently saved row can carry notes or prior application history. Independent bookmarks cannot coexist with an application using the current single-row model. Jobs exposes Save only.

## Backend handoff

Everything in this table describes proposed work or contracts to agree on.

| Owner | Capability and what it unlocks | Verification |
| --- | --- | --- |
| Maria + Dalia | Define authoritative Europe availability and tech/STEM classification, or document a verified scoped feed. Dalia supplies source-backed classifications and handles unknown, mixed-location and remote eligibility. Maria exposes filters applied before count and pagination, or a scoped endpoint with equivalent guarantees. This unlocks the full Recommended scope and domain shortcuts. | Seed active/inactive, internship/non-internship, European/non-European, remote with and without explicit Europe eligibility, STEM/non-STEM and unknown cases across multiple pages. Assert filtered totals, membership, and consistent pagination. Check the approved catalog read-only against provenance across all feed pages. |
| Dalia + Maria | Populate source publication timestamps where present and expose a posting-date filter with documented boundaries and null behavior. Preserve explicit opportunity study-year evidence. A separately collected student study year is needed if future personalization uses it. This unlocks date filters and reliable year-based eligibility. | Give a fixture different source and import dates and leave another source date missing. Assert range boundaries and no date substitution. Verify eligible years and nulls against source evidence, with a different graduation year in the profile fixture. |
| Dalia + Maria | Agree nullable structured country/work mode and any supported duration/compensation fields. Specify official URL verification and freshness together with active and expiry semantics. This unlocks richer cards and reliable closed/expired detail messaging. The existing detail GET is sufficient for basic lookup. | Check source-to-API round trips for explicit and unknown fields, canonical employer/ATS links, active and inactive rows, overdue and null deadlines, missing UUIDs and malformed UUIDs. |
| Maria | Define an atomic owner-scoped Unsave that removes only bookmark state. For the single-row model, define when a saved tracker row qualifies as history-free and reject removals that could lose progress, notes or prior submissions. If bookmarks must coexist with tracking, define independent authenticated bookmark reads/writes with idempotent removal. Confirm whether Applied should retain all progress statuses or gain an explicit submission marker. | Seed a pure saved row, a saved row with notes or prior application history, and rows in every progressed status. Race Unsave against an Applied transition and retry Unsave. With two users, assert ownership, deterministic final bookmark state and preservation of all tracker fields and history when the record has progress. |
| Dalia + Maria | Define source freshness and behavior when an opportunity is retired or removed. If Saved/Applied need richer details or an official link, preserve the authoritative opportunity summary and canonical URL for tracked rows. | Retire a tracked opportunity and confirm that both tracker views preserve its row and status. Where richer detail is supplied, verify the URL against ingestion provenance. |
| Maria + Dalia | Agree on an authoritative expiry or withdrawal signal and a deadline contract distinguishing source date-only deadlines from timed deadlines with a timezone. Define when a retired listing retains a valid canonical URL, and whether unavailable links are cleared. Preserve tracker snapshots or tombstones through hard withdrawal if history must survive it. | Exercise active records with past, future, and unknown deadlines, an explicitly expired record at the agreed boundary, inactive records with and without a usable official source, and withdrawn IDs whose live detail returns 404 while Saved/Applied retain their snapshots. |

Primary code evidence: `apps/api/src/opportunity_api/api/{opportunities,applications}.py`, the matching schemas/models and `core/errors.py`, plus `ingestion/{normalize,validate,persistence,runner,scope}.py`. API tests are `apps/api/tests/test_opportunities.py` and `test_applications.py`. Frontend evidence includes the Jobs, Explore and Applications pages, `recommended-jobs.tsx`, `job-card.tsx`, `opportunities.ts`, and `api/client.ts`.

## Verification

The Jobs company avatar is shared by compact cards, the selected panel and its drawer. It supports an optional presentation-only logo URL, currently limited to same-origin assets under `/company-logos/`. A7 and the Applications summary expose no company ID or logo URL, so real records use monograms or a neutral tile. The proposed Notion contract is a stable company ID and nullable verified logo URL, exposed in list, detail and tracker responses. Approve the exact managed storage origin and path in the image policy before wiring that contract. No logo lookup is made per card.

- Step 2's six Jobs tests exercise the server page, Save action and card control with a mock account/API and JSX runtime. They cover URL restoration, Step 1 discovery filters and matching data, distinct view states, authoritative Save, conflict reconciliation, retry, double-click suppression and preservation of tracker statuses.
- The 31 focused API fixture tests passed again with `pytest tests/test_opportunities.py tests/test_applications.py -q --no-cov`. The initial Step 1 subset run passed all tests and failed the repository-wide coverage gate (25.39% versus 80%).
- Web lint, route type generation and TypeScript checks passed. The separate profile-to-Jobs matching integration test timed out in its Python fixture run. Browser history, desktop/mobile rendering and hosted API behavior remain unverified.
- Step 3 baseline was six passing Jobs tests. After the change, seven passed, covering all three views, combined API parameters, page resets, presets, clearing, URL restoration, card metadata and independent actions. The 31 focused API tests, web lint, typecheck and `git diff --check` passed again. The Profile-to-Jobs retry timed out after 30 seconds. The URL tests reconstruct navigation from generated links; desktop/mobile browser behavior and hosted integration were not observed.
- The refinement passed nine Jobs tests, web lint and typecheck. An isolated A7 fixture confirmed that undergraduate year 1 and master’s year 1 return distinct degree-specific rows and share a matching `both` row, with filtered totals across two pages. Native dialog focus, mobile layout and browser history were not observed in a browser.
- Step 4 passed 15 focused Jobs tests, 31 A7 and Applications fixture tests, lint, typecheck, and a production build. HTTP checks against the built app and loopback services verified the guest redirect, signed-in direct/repeat requests, full return URL, malformed ID, upstream 404, and recovery after a 503. Headless Edge did not yield a confirmed browser result. Client navigation, browser refresh, and desktop/mobile rendering remain separate manual checks.
