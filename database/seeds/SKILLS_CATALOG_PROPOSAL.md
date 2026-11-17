# Proposed skills catalog (B4 review only)

Prepared 17 November 2026 on feature/bianca-profile-resume-hub in the original worktree.
Status: proposal only. No database writes, importer implementation, application changes or approval to publish.

## Review files and scope

[skills_catalog.proposed.json](skills_catalog.proposed.json) contains 140 canonical skill names in nine categories (16 / 14 / 15 / 15 / 16 / 16 / 14 / 14 / 20 entries). This follows the repository's database/seeds JSON-input plus Markdown-review convention. It is deliberately separate from opportunities_seed.json, publication ledgers and generated supabase/seed.sql. Existing import commands do not consume this proposal.

Names are lowercase, trimmed ASCII database names, consistent with profile normalization. Human-facing brand capitalization is not a second skill. Category, aliases and current_matcher_single_token are proposal metadata, not new API/database fields. Aliases record possible equivalent spellings, not additional rows or active redirects. No levels such as beginner/advanced are included. Foundation concepts, specific technologies and specialized practices are separate when their meanings differ (for example c versus c++, c versus embedded c, javascript versus typescript, and machine learning versus deep learning).

## What exists today

- apps/api/src/opportunity_api/api/profile.py: POST/PUT profile skills permit custom names. _normalize_skill_name applies strip().lower(); _get_or_create_skill looks up lower(name) and creates a UUID record if absent. Removing a user association does not prune the shared catalog.
- GET /api/v1/skills lists every skills row alphabetically; it does not apply a curated/approved filter.
- apps/api/src/opportunity_api/ingestion/seed.py: opportunity imports also insert required skills and link them to opportunities. normalize() strips required names but does not lowercase them; suggested_skills are validated input but are not added to payload.skills by that path. SQL uses ON CONFLICT (name) DO NOTHING, then links the existing row by exact name.
- The model and initial Supabase migration enforce unique name, not uniqueness of lower(trim(name)). Case variants may therefore coexist, especially across ingestion and custom input.
- Conclusion: the shared catalog is the union accumulated through user additions and ingestion, not an enforced curated vocabulary. The earlier live read returned seven entries, but that read alone cannot establish which writer created each row; no per-skill provenance/curation field was found.

Existing code references:
- apps/api/src/opportunity_api/models/skill.py
- apps/api/src/opportunity_api/api/profile.py
- apps/api/src/opportunity_api/ingestion/seed.py
- supabase/migrations/20261014175810_initial_schema.sql

## Preserve existing names, IDs and associations

The seven previously observed names were c/c++, data structures and algorithm, java, javascript, object-oriented programming, python and typescript. Five are exact canonical entries in the proposal and should be reused if still present. The two combined legacy names are explicitly recorded in legacy_records_to_preserve; neither is renamed or merged.

The proposal contains separate c and c++, and separate data structures and algorithms. A combined existing entry is not an alias for each of its constituent concepts. Adding separate records does not split, transfer or rewrite any existing user/opportunity links. With exactly the earlier seven-row catalog and no further case variants, the proposal would add 135 new rows and retain the two legacy rows, for 142 total; this is a calculation, not a fresh database inventory or an applied result.

Never replace existing UUIDs, delete old skills or rewrite user_skills/opportunity_skills as part of catalog expansion. Custom names remain permitted, so the catalog will continue to grow unless a separately reviewed policy changes that behavior.

## Proposed additive implementation (not implemented or executed)

1. Maria/Dalia review the vocabulary, aliases, matching limitations and exact target environment. Perform a read-only dry run against that target: compare exact names and lower(trim(name)), list additions/reuses/ambiguous variants, and capture existing IDs and association counts.
2. Add a dedicated reviewed catalog importer/generator with dry-run as default and explicit apply mode. Do not use a dummy user or POST profile skills to populate the catalog: that would create unwanted personal associations. Do not run the opportunity importer merely to add skills: it can delete/rebuild opportunity links.
3. In one transaction, serialize catalog writes appropriately (for example an approved table lock for the short import). For each proposed name, reuse the existing row whose normalized name matches, preserving its spelling and UUID. If multiple existing rows normalize to the same name, stop and report ambiguity rather than choosing or merging automatically. Never resolve aliases during this first additive import.
4. Insert only absent canonical names with new UUIDs. Keep exact-name ON CONFLICT DO NOTHING as a final guard, then re-read the stored row. The plain unique-name constraint alone does not make a case-insensitive check-then-insert safe against concurrent writers; locking/serialization and a second dry run matter.
5. Verify unchanged pre-existing IDs, names, timestamps and association rows; only new skills should exist. A second apply must insert zero records and make zero updates. Import rollback should roll back only that transaction, not delete any pre-existing catalog rows.
6. Publish a versioned approved seed/data artifact through the repository's reviewed data workflow. Do not hand-edit generated supabase/seed.sql. Keep authorization explicit for any shared write.

No schema migration or backend endpoint change is inherently needed to add rows to the current skills table. A new reviewed importer and seed/data artifact are still required; this JSON is not executable with the existing opportunity importer. If aliases/categories later become persisted, or normalized uniqueness is enforced, that is a separate backend contract/schema decision with a reproducible Supabase migration and collision audit. No dashboard-only schema changes are proposed.

## Naming and current matching: important limitation

apps/api/src/opportunity_api/api/opportunities.py builds matching input from the associated skill names, not their UUIDs. The deterministic scorer in matching/scoring.py lowercases opportunity title, description and linked skill names, tokenizes with [a-z0-9+#.\-]+, and compares each whole trimmed/lowercase user skill name to that token set. It awards six points per matched selected skill, capped at thirty.

This is exact full-name-to-token equality, not alias resolution or general phrase matching:
- python can match an opportunity token Python.
- js does not match javascript; postgres does not match postgresql.
- java does not match javascript in the scorer, although frontend substring suggestions intentionally can match both before selected names are excluded.
- machine learning, object-oriented programming and c/c++ cannot match as full strings in the current token set, even if identically named opportunity associations exist. The latter is split at the slash; multiword names are split at spaces.
- Punctuation/token boundaries can also prevent otherwise sensible equivalents. The per-entry current_matcher_single_token flag reports compatibility with the tokenizer's character set, not a guarantee of relevance or a match score.
- Aliases such as torch must not be blindly equated to pytorch: other technologies may use that name. Acronyms also need context. This proposal does not change matching, ingestion normalization or existing records.

Expansion improves discoverability but must not be represented as fixing ranking. Before expecting reliable scoring for these multiword skills, Maria should review a separate phrase/alias-aware matcher change with regression tests (exact associated-name overlap, token boundaries, aliases, punctuation, no false Java/JavaScript matches, and no double-counting equivalent names). Alias metadata here has no runtime effect. Canonicalization of future writes must be coordinated across profiles and ingestion; historical association rewrites require separate explicit review.

## Frontend behavior

Profile and onboarding already read GET /api/v1/skills as the full array. Profile normalizes case/whitespace for comparison, excludes selected skills, filters by substring and slices the result to ten; onboarding likewise excludes selected names and limits suggestions to ten. A 140-entry vocabulary needs no new search endpoint or query parameters. Existing loading, error, empty-catalog, selected-only and no-match states plus Refresh suggestions remain unchanged. No hardcoded frontend fallback or alias-search implementation is added. Searching js will not necessarily find javascript unless alias-aware suggestions are separately approved.

## Review and next steps

- Review category balance, naming and aliases; approve or adjust this data file.
- Audit actual target rows for name collisions without changing records.
- Agree whether additive discoverability can ship independently of matcher improvements, documenting that limitation.
- Implement and test the separate dry-run/idempotent writer after approval. Test first/second application, concurrent/case-variant collisions, transaction rollback and preservation of both association tables in a disposable environment.
- Only after explicit target/write authorization, apply approved data and verify real GET /skills suggestions and profile isolation.

Validation for this proposal: JSON parse; 140 unique normalized canonical names; names within the API's 100-character limit; aliases normalized and unambiguous within the proposal; all nine categories represented; metadata flags checked against the actual matcher regex; whitespace/diff checks. No database seed, migration, importer, build or application tests are needed for these two review-only data/documentation files. Existing application/local files are preserved.
