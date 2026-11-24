# English opportunity display

The Supabase catalog retains the employer's original title and description. API opportunity responses display a prepared English translation when available. Eligibility, matching, ingestion and saved source records continue using the original data. No database migration or shared database write is required.

`catalog_presentation.py` removes internal `#li-*` markers and the known Arbeitnow promotional footer. Ordinary hashtags, work-mode prose and source links remain intact. The frontend uses one formatter for description sections, bullet lists and card previews; common section titles are displayed consistently as Responsibilities, Qualifications and Benefits.

## Prepare translations locally

Use the existing Ollama service and a downloaded translation model. The local setup uses [TranslateGemma's documented translation prompt](https://ollama.com/library/translategemma). Only public opportunity text is processed; profiles and documents are not sent to this operation.

From the repository root, with the API running:

```bash
apps/api/.venv/bin/python -m opportunity_api.ingestion.translate --dry-run
apps/api/.venv/bin/python -m opportunity_api.ingestion.translate
```

Options: `--api-url`, `--ollama-url`, `--model`. Defaults are the local API on port 8000, Ollama on port 11434 and `translategemma:4b`. The detector covers the languages in the current catalog: English, German, French and Dutch. Extend it before adding sources in other languages.

Translations are generated before page requests, never during rendering. They are stored under ignored `.cache/opportunity-translations/`, or the server-only `APP_OPPORTUNITY_TRANSLATIONS_DIR`. Each entry is bound to the cleaned employer title and description. Changing meaningful source text invalidates the translation; changing an ATS marker or the job board's promotional footer does not. Writes are atomic. Unreadable, malformed, oversized or missing entries fall back to the source text and never hide an opportunity.

The operation preserves already English titles and the explicit working-student contract type. Incomplete output and altered source links are rejected. Automatic translation still needs editorial review against the employer's original, particularly for qualifications, contract terms and compensation. The original application URL remains unchanged and authoritative.

## Hosting

This cache is a derived display artifact, not an alternative catalog. It is local and ignored by Git. A deployment must prepare translations from its own current catalog and provide a durable cache directory to the API; translations are not automatically uploaded or provisioned by the frontend build. Rerun preparation after source updates. Without a prepared cache, the site remains functional and displays the original posting.
