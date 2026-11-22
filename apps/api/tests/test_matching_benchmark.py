"""Synthetic golden regression metrics; never claims measured semantic improvement."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from opportunity_api.matching import AIScorer, StaticEmbedder, score_match
from opportunity_api.matching.ai import AI_CAP, opportunity_text, profile_text
from opportunity_api.matching.benchmark import (
    CachedEmbedder,
    GoldenDataset,
    evaluate,
    main,
    metrics,
)
from opportunity_api.schemas.matching import MatchingOpportunity, MatchingProfile

DATASET = Path(__file__).parent / "fixtures/matching/golden-ranking.json"


def test_ndcg_and_precision_metrics():
    relevance = {"best": 3, "good": 2, "irrelevant": 0}
    perfect = metrics(["best", "good", "irrelevant"], relevance)
    reversed_order = metrics(["irrelevant", "good", "best"], relevance)
    assert perfect["ndcg_at_k"] == 1
    assert 0 <= reversed_order["ndcg_at_k"] < 1
    assert perfect["precision_at_k"] == pytest.approx(2 / 3)
    assert metrics([], relevance) == {"ndcg_at_k": 0, "precision_at_k": 0}
    with pytest.raises(ValueError):
        metrics([], relevance, k=0)


def test_golden_baseline_is_deterministic_and_gates_hard_mismatches():
    dataset = GoldenDataset.model_validate_json(DATASET.read_text())
    result = evaluate(dataset)
    assert result == evaluate(dataset)
    assert 0 <= result["mean_ndcg_at_k"] <= 1
    assert all("masters" not in item["ranking"] for item in result["profiles"])
    assert dataset.team_reviewed is False
    invalid = json.loads(DATASET.read_text())
    invalid["profiles"][0]["relevance"]["unknown-id"] = 3
    with pytest.raises(ValidationError):
        GoldenDataset.model_validate(invalid)


def test_cache_is_bounded_and_model_version_scoped():
    backend = StaticEmbedder({"one": [1.0], "two": [2.0]})
    cache = CachedEmbedder(backend, model_digest="fixture-v1", capacity=1)
    assert cache.embed(["one", "one"]) == [[1.0], [1.0]]
    assert cache.hits == 1
    cache.embed(["two"])
    assert len(cache.values) == 1
    assert cache.embed(["unknown"]) is None and cache.failures == 1
    other = CachedEmbedder(backend, model_digest="fixture-v2")
    assert not other.values


def test_semantic_bonus_never_negative_and_never_rescues_ineligible():
    profile = MatchingProfile(degree_level="bachelor", field_of_study="Computer Science")
    opportunity = MatchingOpportunity(title="Research", degree_level="master")
    mapping = {profile_text(profile): [1.0], opportunity_text(opportunity): [-1.0]}
    result = score_match(profile, opportunity, ai=AIScorer(StaticEmbedder(mapping)))
    assert 0 <= result.components.ai <= AI_CAP
    assert result.score == 0 and result.eligibility == "not_eligible"


def test_cli_baseline_is_explicit_about_missing_semantic_measurement(capsys):
    assert main(["--dataset", str(DATASET)]) == 0
    result = json.loads(capsys.readouterr().out)
    assert result["semantic"]["status"] == "not_requested"
    assert result["pgvector_decision"] == "deferred_until_representative_benchmark"


def test_semantic_cli_distinguishes_measured_results_from_unavailable(monkeypatch, capsys):
    import opportunity_api.matching.benchmark as benchmark

    class Inventory:
        def __init__(self, *args, **kwargs):
            pass

        def model_digest(self, model):
            return "synthetic-model-digest"

    class Uniform:
        def __init__(self, *args, **kwargs):
            pass

        def embed(self, texts):
            return [[1.0] for _ in texts]

    monkeypatch.setattr(benchmark, "OllamaClient", Inventory)
    monkeypatch.setattr(benchmark, "OllamaEmbedder", Uniform)
    assert main(["--dataset", str(DATASET), "--semantic"]) == 0
    measured = json.loads(capsys.readouterr().out)["semantic"]
    assert measured["status"] == "measured"
    assert measured["cache_hits"] > 0
    monkeypatch.setattr(Inventory, "model_digest", lambda self, model: None)
    assert main(["--dataset", str(DATASET), "--semantic"]) == 2
    assert json.loads(capsys.readouterr().out)["semantic"]["status"] == "unavailable"


def test_nonfinite_similarity_is_a_controlled_missing_bonus():
    profile = MatchingProfile(field_of_study="Computer Science")
    opportunity = MatchingOpportunity(title="Intern")
    mapping = {profile_text(profile): [float("nan")], opportunity_text(opportunity): [1.0]}
    assert AIScorer(StaticEmbedder(mapping)).score(profile, opportunity) == (0, None)
