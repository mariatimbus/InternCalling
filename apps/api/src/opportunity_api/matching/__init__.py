"""Explainable internship matching engine (A10 core + A11/A12 AI bonus)."""

from .ai import AI_CAP, AIScorer, cosine_similarity
from .embeddings import Embedder, OllamaEmbedder, StaticEmbedder
from .engine import GATE_RULES, score_match
from .requirements import WEIGHTS, evaluate_requirements, requirement_score

__all__ = [
    "AI_CAP",
    "AIScorer",
    "Embedder",
    "GATE_RULES",
    "OllamaEmbedder",
    "StaticEmbedder",
    "WEIGHTS",
    "cosine_similarity",
    "evaluate_requirements",
    "requirement_score",
    "score_match",
]
