# Optional local AI and private CV processing (A11)

The shared client lives in `apps/api/src/opportunity_api/ai/client.py`. Embeddings
and structured extraction use this one transport. Discovery, applications,
eligibility and deterministic recommendations work without Ollama.

## Local setup

Install Ollama from its official distribution, then in separate terminals:

```sh
ollama serve
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

Server-only configuration (values below contain no credentials):

```dotenv
APP_OLLAMA_URL=http://localhost:11434
APP_OLLAMA_EXTRACT_MODEL=qwen2.5:7b
APP_OLLAMA_EMBED_MODEL=nomic-embed-text
APP_OLLAMA_TIMEOUT=30
```

The configured extraction model must support structured JSON output. The client
uses non-streaming `/api/generate` with a JSON schema, rejects incomplete/malformed
results, sets temperature zero and caps response size. Embeddings use `/api/embed`.
See [Ollama structured generation](https://docs.ollama.com/api/generate) and
[embedding API](https://docs.ollama.com/api/embed). Offline/invalid model calls
produce controlled errors; no prompt, token or raw provider error is logged.

## Supabase Storage

Review/apply `20261117130000_private_cvs.sql` only in the approved development
project before testing hosted uploads. It creates the private `private-cvs` bucket,
5 MiB PDF/DOCX limits, owner-folder object policies, and owner-readable CV metadata.
Browser roles cannot forge extraction or review metadata. No public CV URLs or
service-role Storage calls are used; server helpers forward the user's bearer
token plus the project's browser-safe publishable/anon key.

Set server-only `APP_SUPABASE_URL` and `APP_SUPABASE_PUBLISHABLE_KEY` to the approved
project and its publishable/anon key. Do not put database passwords, privileged keys
or personal access tokens in client variables. See [Supabase Storage access
control](https://supabase.com/docs/guides/storage/security/access-control).

`npm run db:test:fresh` checks application SQL and two-user object/metadata policies
on disposable PostgreSQL with an explicit stub of Supabase-managed interfaces.
Actual hosted Storage HTTP behavior still needs the approved project credentials;
local stub tests do not certify its configuration.

## CV lifecycle

1. POST raw bytes to `/api/v1/cv?filename=resume.pdf` (or `.docx`) with the matching
   Content-Type and a Supabase bearer token. Uploads require readable text. Text
   parsing runs in a separate process with a 10-second deadline, CPU limit, and a
   512 MiB address-space cap on Linux. DOCX XML rejects DTD/entities and oversized
   archives; PDF page/text limits apply. Scans/OCR and encrypted documents are not
   supported. Parsing is validation, not a malware-scanning service.
2. List/download/delete only the current owner's documents. Original filenames are
   not stored; server-generated UUID paths are private and never returned as URLs.
3. POST `/cv/{id}/extract` downloads and hash-checks the stored file, extracts text
   server-side, and returns a strict draft. Exact evidence/value grounding is
   checked; raw document text is never persisted in the database.
4. Present the draft values, quotations and model identifier for student review.
   POST `/cv/{id}/review` with `{"fields":["university","skills"]}` explicitly
   replaces only selected fields. No extraction call updates the profile. Reject
   missing facts and profile changes since extraction; retain accepted provenance.
   Students can always use the ordinary profile API instead of AI extraction.

If upload metadata fails after object creation, the API attempts cleanup. Failed
cleanup can leave a private orphan; production operations must reconcile orphaned
objects and define retention/account-deletion cleanup before enabling CV uploads.
No CV text or documents are sent to hosted AI by this feature. Configure only an
approved self-hosted Ollama endpoint; a remote endpoint receives the private text.

## C7 ingestion contract

Deterministic parsing is first. Only unstructured failures may call the shared
client, with a task-specific strict schema and explicit source evidence. Missing
facts remain null; unsupported keys/partial output are rejected. Low-confidence
or ungrounded output goes to review and must never publish automatically. Reuse
existing normalization, canonical URL, dedupe and inactive-review persistence.
The client is available; Dalia's C7 adapter integration remains a separate task.
