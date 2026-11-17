"""Optional AI transport contracts: strict structured JSON and deterministic fallback."""

import json

import httpx
import pytest

from opportunity_api.ai.client import AIInvalidOutput, AIUnavailable, OllamaClient
from opportunity_api.ai.schemas import CVExtraction
from opportunity_api.matching import OllamaEmbedder
from tests.test_cv_extraction import output


def client_for(handler):
    return OllamaClient(
        "http://localhost:11434", client=httpx.Client(transport=httpx.MockTransport(handler))
    )


def test_generate_sends_schema_and_rejects_partial_or_unknown_fields():
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"done": True, "response": json.dumps(output())})

    result = client_for(handler).generate("fixture-model", "Synthetic CV", CVExtraction)
    assert result.university.value == "Fixture University"
    assert requests[0]["stream"] is False
    assert requests[0]["format"]["additionalProperties"] is False
    for value in [
        {"skills": []},
        {**output(), "invented": True},
        {**output(), "graduation_year": {"value": "2027", "evidence": "2027"}},
    ]:
        with pytest.raises(AIInvalidOutput):
            client_for(
                lambda request, value=value: httpx.Response(
                    200, json={"done": True, "response": json.dumps(value)}
                )
            ).generate("fixture-model", "CV", CVExtraction)


@pytest.mark.parametrize(
    "payload", [{}, {"done": False, "response": "{}"}, {"done": True, "response": "bad json"}]
)
def test_incomplete_generation_rejected(payload):
    with pytest.raises(AIInvalidOutput):
        client_for(lambda request: httpx.Response(200, json=payload)).generate(
            "fixture-model", "CV", CVExtraction
        )


def test_health_and_model_offline_are_controlled():
    assert client_for(lambda request: httpx.Response(200, json={"models": []})).healthy()

    def offline(request):
        raise httpx.ConnectError("synthetic offline fixture")

    client = client_for(offline)
    assert client.healthy() is False
    with pytest.raises(AIUnavailable):
        client.generate("fixture-model", "CV", CVExtraction)
    for url in [
        "",
        "https://user:password@localhost",
        "http://localhost/path",
        "file:///tmp/model",
    ]:
        with pytest.raises(AIUnavailable):
            OllamaClient(url)


@pytest.mark.parametrize("vector", [[], [True], [float("nan")], ["1"], [None]])
def test_invalid_embedding_values_never_enter_matching(vector):
    class Fake:
        def post(self, url, json):
            return type(
                "R",
                (),
                {
                    "raise_for_status": lambda self: None,
                    "json": lambda self: {"embeddings": [vector]},
                },
            )()

    assert (
        OllamaEmbedder("http://localhost:11434", "fixture-model", client=Fake()).embed(["fixture"])
        is None
    )


def test_embed_uses_current_api_contract():
    def handler(request):
        assert request.url.path == "/api/embed"
        assert json.loads(request.content)["truncate"] is False
        return httpx.Response(200, json={"embeddings": [[0.1, 0.2]]})

    assert client_for(handler).embed("fixture-model", ["one", "two"]) == [[0.1, 0.2], [0.1, 0.2]]
