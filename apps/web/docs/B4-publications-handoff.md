# Publications frontend handoff

Original complete application on feature/bianca-profile-resume-hub. Frontend implemented; backend fields, storage and live routes are unconfirmed. This personal Profile collection is separate from the unrelated database/publications ingestion/publication work; none of those files or data is changed.

## Implemented versus pending

Profile includes Publications instead of the final generic placeholder. Users can draft, Validate draft, Cancel or Escape. Without an injected service it does not fetch account publications, assume an empty collection, show fake saved entries or report persistence success. Save is explicitly unavailable and drafts disappear on navigation/reload. Existing B3/B4 interface and functionality are preserved. Publications do not alter completion's eight-item formula, matching, onboarding, upload or parsing.

PublicationsSection reuses CollectionService, CollectionView, partialDate, shared rounded Input/Field/Button controls and URL safety validation. Typed states cover unconnected/loading/ready-empty/error/retry, confirmed data, save/delete pending, success after service confirmation, failure retaining drafts/entries and revision conflict. Synchronous pending guards prevent duplicate create/update/delete and cancellation during an accepted request. Delete requires Keep entry/Confirm delete. Forms focus title on opening and the first invalid control on errors; confirmations focus Keep entry; Cancel/Escape/success restore focus to the section heading. Fields have associated labels/errors/hints, errors/status announcements, wrapping actions, and responsive spacing using semantic dark tokens. Manual browser/mobile verification remains pending.

## Proposed fields (NOT confirmed backend schema)

PublicationDraft uses provisional camelCase names:
- title: required trimmed plain text, proposed 1-255 characters.
- authors: form-only newline-separated text. One author per line in publication order; blank lines omitted and each name trimmed. Commas remain part of names. No sorting, deduplication, inferred author or automatic signed-in user. Proposed maximum 100 authors, each 1-255 characters.
- publisher: optional plain text, proposed maximum 255, representing publisher/journal/conference.
- publicationDate: optional YYYY or YYYY-MM, proposed years 1900-2100. Blank means unknown/unprovided. Never add a month or day; precision must survive round trips.
- doi: optional DOI identifier or HTTPS doi.org resolver form on input, proposed input maximum 512 characters. Canonical preview storage uses the identifier, not an arbitrary URL; details below.
- publicationUrl: optional absolute HTTP/HTTPS, proposed maximum 512, without embedded credentials, control/space/backslash ambiguities or executable/relative URLs.
- description: optional plain text/abstract, proposed maximum 5000, preserving line breaks.

Publication replaces the draft authors string with an ordered string[] and adds stable server id, revision and position. publicationDraft joins ordered authors for editing and strips metadata. Keep author order independent of publication-list position. Repeated names may represent different people and must not be automatically merged. Any future richer author identity model needs explicit agreement, not inference from strings.

Agree actual names/limits, storage and nullable/omitted partial-update semantics with Maria/Dalia. Proposed backend unknown scalars are null, mapped to empty UI strings; unknown authors map to an empty ordered list. Deliberate clearing must map back to agreed null/empty semantics without overwriting unrelated fields. Unknown dates remain null or precision-preserving year/month data, never January/day 1.

## DOI and URL rules

normalizeDoi performs syntax-only local processing and never queries a resolver, publisher or arbitrary URL. It trims input, accepts an identifier with numeric DOI prefix under 10. and nonempty suffix, or an exact HTTPS doi.org resolver form. Resolver input is percent-decoded once to the identifier; display preserves identifier casing/text. Raw identifiers are not percent-decoded. Link construction percent-encodes prefix and the complete suffix separately, including extra suffix slashes, percent, question and hash characters, so they cannot change URL structure. Re-normalizing a generated resolver link produces the same identifier.

Reject whitespace/control/format/surrogate/backslash characters, invalid percent encoding in resolver input, credentials, other hosts/schemes/ports, query or fragment on a supplied resolver URL, empty suffixes and dot-only suffixes. For DOI names containing query/hash characters, supply the identifier directly or percent-encode those characters in the resolver URL. These conservative input rules and the 512-character product limit are provisional, not a complete DOI-standard conformance validator. No case rewrite or punctuation stripping is performed. A syntactically accepted DOI may not be registered or resolve; it is never claimed as verified.

Reference: [DOI Foundation resolution and encoding guidance](https://www.doi.org/the-identifier/resources/factsheets/doi-resolution-documentation/) and [DOI Handbook](https://www.doi.org/doi-handbook/html/). DOI syntax/URL encoding is separate from verification of registration or publication authorship.

Both DOI resolver and publication links use target=_blank with rel=noopener noreferrer and a new-tab announcement. Invalid legacy DOI/URL values produce nonclickable correction notices. All user title/author/publisher/abstract text renders as React text, with no HTML injection. Optional absent details are omitted honestly. There is no server-side fetch or claim of accessible/verified publications.

## Proposed service and frontend integration

PublicationsService = CollectionService<Publication, PublicationDraft>:
- load(): Promise<Publication[]> returns authoritative owner-scoped entries ordered by position.
- create(draft): Promise<Publication> returns canonical fields/ordered authors/id/revision/position.
- update(id, expectedRevision, draft): Promise<Publication> preserves stable ID/order and returns canonical data/new revision.
- remove(id, expectedRevision): Promise<void> resolves after confirmed deletion.

No live endpoint routes are agreed or called. A future authenticated adapter maps draft authors into the agreed ordered backend representation, DOI canonicalization, nullable fields and partial-update payloads; maps concurrency errors to PublicationConflict; and is injected into PublicationsSection in profile-hub.tsx. Never inject the preview adapter on real Profile. A successful service response is authoritative and drives rendering. The adapter must reject uncertain/failed writes rather than report false success.

## Maria/Dalia backend requirements

Provide authenticated owner-scoped CRUD using verified Supabase identity. Derive ownership server-side, enforce API checks and appropriate RLS, and test cross-user denial. Define server-generated stable IDs, deterministic ordering/reorder, pagination/collection bounds and account-deletion behavior. Preserve ordered authors on every read/write; author position must be explicit if stored as related rows. Do not populate signed-in user authorship automatically.

Revalidate required/optional text limits, ordered author limits, partial-date precision, DOI and safe HTTP/HTTPS rules server-side. Agree canonical complete responses, nulls, omission/clearing and field validation errors before integration. Do not turn syntactic DOI acceptance into a verification/certification flag.

Agree safe authentication/authorization/not-found, validation, throttling/unavailability and version/ETag conflict responses. Current generic errors retain entered values/confirmed entries and permit retry. Conflict handling retains the draft/deletion target and asks for Cancel then Reload; Cancel deliberately discards edits, with no automatic merge. Define create idempotency and reconciliation after ambiguous network outcomes, delete not-found handling and post-write refresh before real integration. Preview failures occur before mutation and do not simulate committed writes with lost responses.

Future parsing must produce reviewable drafts requiring explicit confirmation, preserve author order, avoid invented authors and retain manual editing/corrections afterward. No parsing/AI/upload or match-score effects are implemented here.

## Development preview and pending manual checklist

From apps/web run `npm run dev`, then visit http://localhost:3000/dev/publications (or the actual development server port). It is visibly labelled temporary in-memory data, starts empty and clears on reload. No samples, real account data or localStorage are used. Non-development renders notFound() before the preview; the route is noindex.

Simulate next failure rejects the next load/create/update/delete once without changing records. Simulate next edit/delete conflict rejects the next update/remove once; create/load do not consume that flag. Actual stale revision checking also exists independently. Use Cancel/Reload after a conflict.

Manual browser/mobile checks (pending):
1. On real Profile, Draft publication, Validate draft with blank title, fill a valid title, Cancel/Escape and reopen. Saving stays unavailable and no entry is saved.
2. Preview: create with title only, then edit authors in intentionally non-alphabetical order. Include a comma in one name and repeated names. Verify exact order after Save/reopen; Cancel must preserve the saved list. Empty authors must not insert the current user.
3. Save year-only and year/month dates; reject impossible months/full day dates and preserve unknown blanks. Test DOI identifier and doi.org forms, encoded suffix punctuation and unsafe credential/other-host links. Confirm safe new-tab links without verification claims.
4. Test Add/Edit/Delete, Keep entry/Escape and confirmation. Arm failures before load/create/edit/delete; retry retains drafts/records without false success. Simulate edit/delete conflicts and follow Cancel/Reload. Rapid repeated submissions must cause one write.
5. Check Tab/Shift+Tab/Enter/Escape, initial/error/confirmation focus, visible focus, long titles/DOIs/authors and narrow mobile/high zoom wrapping. Verify existing profile/Skills/Resume flows remain usable. Reload clears preview entries. Production URL must be 404.

## Verification

Focused controlled-hook and isolated-memory tests cover required/optional fields, ordered authors/conversion/persistence, date precision, DOI normalization/encoding/clearing, URL safety/text rendering, Cancel/Escape, CRUD/IDs/order, failure/conflict retry, pending duplicate prevention and production gating. Profile completion integration tests preserve the existing eight-item calculation. These are not browser or real-service CRUD tests. Automated command results are recorded after execution; actual browser/mobile/keyboard and connected backend verification remain pending.

Actual automated results: `node --test tests/*.test.mjs` passed all 136 auth/B4 tests, including 14 Publications tests. `npm run lint`, `npm run typecheck`, `npm run build` and `git diff --check` passed. Production build was repeated successfully after constraining long DOI links to card width. Scoped whitespace/conflict checks also covered new/untracked files. Preview production gating is tested through the route function, not deployed HTTP. Browser/mobile/keyboard and real-service publication CRUD remain pending.
