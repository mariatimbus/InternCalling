"""Offline-first ranking evaluation. A missing model never counts as an AI result."""

import argparse
import hashlib
import json
import math
from collections import OrderedDict
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from opportunity_api.ai.client import AIInvalidOutput, AIUnavailable, OllamaClient
from opportunity_api.schemas.matching import MatchingOpportunity, MatchingProfile

from .ai import TEXT_TEMPLATE_VERSION, AIScorer
from .embeddings import OllamaEmbedder
from .engine import score_match


class Candidate(BaseModel):
    id: str
    opportunity: MatchingOpportunity


class Judgment(BaseModel):
    id: str
    profile: MatchingProfile
    relevance: dict[str, StrictInt]


class GoldenDataset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str
    provenance: str
    team_reviewed: bool
    opportunities: list[Candidate] = Field(min_length=1)
    profiles: list[Judgment] = Field(min_length=1)

    @model_validator(mode="after")
    def valid_labels(self):
        ids = [item.id for item in self.opportunities]
        if len(set(ids)) != len(ids) or len({item.id for item in self.profiles}) != len(
            self.profiles
        ):
            raise ValueError("Dataset IDs must be unique")
        for profile in self.profiles:
            if set(profile.relevance) != set(ids) or any(
                type(n) is not int or not 0 <= n <= 3 for n in profile.relevance.values()
            ):
                raise ValueError("Every candidate requires a relevance judgment from zero to three")
        return self


class CachedEmbedder:
    """Per-run bounded cache; identity includes exact model digest and text template."""

    def __init__(self, backend, *, model_digest: str, capacity=512):
        if capacity < 1 or not model_digest:
            raise ValueError("A cache needs a positive bound and exact model identity")
        self.backend, self.model_digest, self.capacity = backend, model_digest, capacity
        self.values = OrderedDict()
        self.hits = 0
        self.failures = 0

    def embed(self, texts):
        result = []
        for text in texts:
            key = (
                self.model_digest,
                TEXT_TEMPLATE_VERSION,
                hashlib.sha256(text.encode()).hexdigest(),
            )
            if key not in self.values:
                vectors = self.backend.embed([text])
                if not vectors:
                    self.failures += 1
                    return None
                self.values[key] = tuple(vectors[0])
                if len(self.values) > self.capacity:
                    self.values.popitem(last=False)
            else:
                self.hits += 1
            self.values.move_to_end(key)
            result.append(list(self.values[key]))
        return result


def metrics(ranked: list[str], relevance: dict[str, StrictInt], *, k=3):
    if k < 1:
        raise ValueError("k must be positive")

    def dcg(values):
        return sum((2**grade - 1) / math.log2(index + 2) for index, grade in enumerate(values))

    grades = [relevance[item] for item in ranked[:k]]
    ideal = sorted((relevance[item] for item in ranked), reverse=True)[:k]
    denominator = dcg(ideal)
    return {
        "ndcg_at_k": dcg(grades) / denominator if denominator else 0.0,
        "precision_at_k": sum(grade >= 2 for grade in grades) / len(grades) if grades else 0.0,
    }


def evaluate(dataset: GoldenDataset, *, ai=None, k=3):
    rows = []
    for profile in dataset.profiles:
        scored = [
            (candidate.id, score_match(profile.profile, candidate.opportunity, ai=ai))
            for candidate in dataset.opportunities
        ]
        scored = [
            (identity, match) for identity, match in scored if match.eligibility != "not_eligible"
        ]
        scored.sort(key=lambda item: (item[1].eligibility != "eligible", -item[1].score, item[0]))
        ranked = [identity for identity, _ in scored]
        rows.append(
            {"profile_id": profile.id, "ranking": ranked, **metrics(ranked, profile.relevance, k=k)}
        )
    return {
        "profiles": rows,
        "mean_ndcg_at_k": sum(row["ndcg_at_k"] for row in rows) / len(rows),
        "mean_precision_at_k": sum(row["precision_at_k"] for row in rows) / len(rows),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset",
        type=Path,
        default=Path(__file__).resolve().parents[3] / "tests/fixtures/matching/golden-ranking.json",
    )
    parser.add_argument("--semantic", action="store_true")
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    parser.add_argument("--model", default="nomic-embed-text")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    dataset = GoldenDataset.model_validate_json(args.dataset.read_text())
    baseline = evaluate(dataset)
    report = {
        "dataset_version": dataset.version,
        "team_reviewed": dataset.team_reviewed,
        "text_template": TEXT_TEMPLATE_VERSION,
        "k": 3,
        "baseline": baseline,
        "semantic": {"status": "not_requested"},
        "pgvector_decision": "deferred_until_representative_benchmark",
    }
    if args.semantic:
        try:
            client = OllamaClient(args.ollama_url, timeout=5)
            digest = client.model_digest(args.model)
            if not digest:
                raise AIUnavailable("Configured embedding model is not installed")
            cache = CachedEmbedder(OllamaEmbedder(args.ollama_url, args.model), model_digest=digest)
            result = evaluate(dataset, ai=AIScorer(cache))
            if cache.failures:
                raise AIUnavailable("Embedding comparison is incomplete")
            report["semantic"] = {
                "status": "measured",
                "model": args.model,
                "digest": digest,
                "cache_hits": cache.hits,
                "results": result,
                "delta_ndcg": result["mean_ndcg_at_k"] - baseline["mean_ndcg_at_k"],
            }
        except (AIUnavailable, AIInvalidOutput):
            report["semantic"] = {
                "status": "unavailable",
                "model": args.model,
                "reason": (
                    "Configured embedding model unavailable; no comparison or improvement claim"
                ),
            }
    text = json.dumps(report, indent=2) + "\n"
    if args.output:
        with args.output.open("x") as output:
            output.write(text)
    print(text, end="")
    return 2 if args.semantic and report["semantic"]["status"] != "measured" else 0


if __name__ == "__main__":
    raise SystemExit(main())
