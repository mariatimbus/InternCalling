# English opportunity display

The Supabase catalog retains the employer's original title and description. API opportunity responses display a prepared English translation when available. Eligibility, matching, ingestion and saved source records continue using the original data. No database migration or shared database write is required.

`catalog_presentation.py` removes internal `#li-*` markers and the known Arbeitnow promotional footer. Ordinary hashtags, work-mode prose and source links remain intact. The frontend uses one formatter for description sections, bullet lists and card previews; common section titles are displayed consistently as Responsibilities, Qualifications and Benefits.

## Prepare translations locally

Use the existing Ollama service and a downloaded translation model. The local setup uses [TranslateGemma's documented translation prompt](https://ollama.com/library/translategemma). Only public opportunity text is processed; profiles and documents are not sent to this operation.

From the repository root, with the API running:

```bash
apps/api/.venv/bin/python -m opportunity_api.ingestion.translate --dry-run
apps/api/.venv/bin/python -m opportunity_api.ingestion.translate
apps/api/.venv/bin/python -m opportunity_api.ingestion.translate --check
```

Options: `--api-url`, `--ollama-url`, `--model`, `--dry-run`, `--check`, `--watch`, `--interval`. Defaults are the local API on port 8000, Ollama on port 11434 and `translategemma:4b`. The detector covers the languages in the current catalog: English, German, French and Dutch. It also checks individual paragraphs for mixed-language requirements. This is a heuristic, not a language or accuracy guarantee; extend it before adding sources in other languages.

Translations are generated before page requests, never during rendering. They are stored under ignored `.cache/opportunity-translations/`, or the server-only `APP_OPPORTUNITY_TRANSLATIONS_DIR`. Each entry is bound to the cleaned employer title and description. Changing meaningful source text invalidates the translation; changing an ATS marker or the job board's promotional footer does not. API display and preparation share cache validation, including the same supported-language check. A cached result still classified as non-English is rejected before presentation; the worker then receives the original employer text and repairs its original hash, avoiding nested translations. Preparation checks cached contents instead of skipping any existing filename, so corrupt entries are regenerated. Writes are atomic. Unreadable, malformed, oversized or missing entries fall back to the source text and never hide an opportunity.

The operation preserves already English titles and the explicit working-student contract type. Incomplete or still non-English output, altered source links and dropped numeric values are rejected. Numeric validation compares digit values with decimal/grouping punctuation normalized; it does not prove that numbers retain their original meaning. Automatic translation still needs editorial review against the employer's original, particularly for qualifications, contract terms and compensation. The original application URL remains unchanged and authoritative.

## Keep a local catalog translated

Run a separate preparation worker so new postings and changed source text are discovered automatically:

```bash
apps/api/.venv/bin/python -m opportunity_api.ingestion.translate --watch --interval 300
```

The default interval is 300 seconds; accepted values are 30–86400 seconds. Each poll fetches the full active catalog, retains validated cached content, and translates only missing or invalid content. Source changes create new content-addressed entries. It sleeps after each completed attempt, outside API requests, so the delay includes preparation time. Transient API/model failures retain originals and are retried on subsequent polls; worker error messages omit HTTP response bodies. Stop the process normally with Ctrl-C or your process manager. Run one worker per cache directory under your local process supervisor; this command does not install or launch a service automatically. `--watch` cannot be combined with `--check` or `--dry-run`; their one-shot behavior is unchanged.

## Hosting

This cache is a derived display artifact, not an alternative catalog. It is local and ignored by Git. A deployment must prepare translations from its own current catalog and provide a durable cache directory to the API; translations are not automatically uploaded or provisioned by the frontend build. Run preparation after every catalog refresh and verify it with `--check` before promoting the cache. `--check` fetches every active page and reports the total, English/cached count and missing count; it makes no model calls or cache writes, and exits 1 when any supported non-English posting remains. `--dry-run` lists pending work without writing. Failed translations retain originals and preparation exits 1; rerun to retry. Without a prepared cache, the site remains functional and displays the original posting.


For a hosted API with ephemeral disks, the smallest supported setup is a durable directory mounted into the API process and the preparation worker, with `APP_OPPORTUNITY_TRANSLATIONS_DIR` pointing to that directory in both. A server-side refresh job should run preparation after ingestion, then `--check` against that deployment. The worker needs access to its translation model; page requests do not. Copies of a cache must be transferred as deployment artifacts, never as client assets.

A future database-backed alternative would require a separately approved migration for derived translations keyed by source hash and target language, storing model/version and validation status. An ingestion worker would upsert only validated results; the API would select translations matching the current source hash while retaining original records for eligibility and matching. That design is not implemented here and must receive database/RLS review before any hosted changes.
