# A12 benchmark and storage decision — 17 November 2026

The optional embedding component already existed. This task adds evaluation and
reproducibility controls; it does not enable semantic global ranking or add pgvector.

## Dataset and recorded result

`apps/api/tests/fixtures/matching/golden-ranking.json` contains four synthetic
student profiles and eight synthetic internship descriptions, including paraphrase
pairs and a hard degree mismatch. Labels are deliberately authored relevance
expectations (0 unrelated through 3 strong), **not team-reviewed empirical judgments**.
It is a regression set, not a representative product-quality benchmark.

Recorded deterministic A10 baseline at k=3:

- Mean NDCG@3: **0.7791092035**.
- Mean Precision@3 (label >=2): **0.5**.
- Hard-ineligible master-only candidates are excluded for the bachelor profiles.

The first local attempt exited 2 with `semantic.status=unavailable` because
`nomic-embed-text` was not installed. That attempt is retained as historical evidence.
After installing the configured model locally, the actual comparison measured:

- Mean NDCG@3: **0.9001123311**, delta **+0.1210031276** versus A10.
- Mean Precision@3: **0.6666666667**, versus 0.5 for A10.
- Exact model digest: `0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f`.
- 52 cache hits across repeated profile/opportunity texts.

The baseline, initial unavailable attempt and subsequent measured result are retained
as separate JSON artifacts beside this file. The improvement is on this small
synthetic set only; no real-world quality, acceptance-probability, latency or scale
claim follows from it. Global recommendations remain deterministic by default.

```sh
cd apps/api
uv run python -m opportunity_api.matching.benchmark
# After an operator installs/approves an embedding model:
uv run python -m opportunity_api.matching.benchmark --semantic --model nomic-embed-text
```

`--output <new-file>` retains results without overwriting earlier evidence. Dataset
validation rejects missing/extra candidate judgments and scores outside 0–3. Tests
verify metric math, deterministic order, model-failure behavior, and eligibility gates.

## Versioning, caching and pgvector

Canonical embedding text uses `matching-v2`: field/skills/interests/domains for the
profile, title/description/skills for the internship, with stable list ordering.
Changing this template or the exact model digest requires regeneration. The CLI
records the model digest obtained from the local model inventory before measuring.

The benchmark's bounded in-memory cache keys exact model digest + text-template
version + SHA-256 of text; it never stores raw profiles or CVs on disk. It is scoped
to a benchmark run, not a production persistence/cache design. Missing embeddings
mark the comparison incomplete rather than silently reporting baseline as AI gain.
The AI bonus is bounded to [0,25], including negative/non-finite similarity cases,
and cannot rescue a hard not-eligible result.

**Decision: defer pgvector and persistent embeddings.** First expand and independently
review the relevance set across degree/year/location/unknown-requirement cases,
run A10 versus A10+semantic with an installed pinned embedding model, and measure
ranking quality and latency. Enable only after repeatable quality improvement and
acceptable operational cost. Any future persistence needs a reviewed migration,
index/dimension choice, exact model/template identity, canonical content hashes,
background regeneration, and explicit invalidation after model/data changes.
