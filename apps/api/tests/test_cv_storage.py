"""Storage helpers never use elevated credentials and forward only owner tokens."""

import httpx
import pytest

from opportunity_api.core.errors import APIError
from opportunity_api.core.storage import PrivateCVStorage

PATH = "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/resume.pdf"


def test_private_storage_transport_contract():
    requests = []

    def handler(request):
        requests.append(request)
        assert request.headers["Authorization"] == "Bearer synthetic-owner-token"
        assert request.headers["apikey"] == "sb_publishable_fixture"
        return httpx.Response(200, content=b"synthetic file")

    storage = PrivateCVStorage(
        "https://example.supabase.co",
        "sb_publishable_fixture",
        "synthetic-owner-token",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    storage.upload(PATH, b"synthetic file", "application/pdf")
    assert requests[-1].headers["x-upsert"] == "false"
    assert requests[-1].headers["Content-Type"] == "application/pdf"
    assert storage.download(PATH) == b"synthetic file"
    assert requests[-1].url.path.startswith("/storage/v1/object/authenticated/private-cvs/")
    storage.delete(PATH)
    assert requests[-1].method == "DELETE"
    with pytest.raises(ValueError):
        storage.download("../other-user/resume.pdf")


def test_storage_configuration_rejects_privileged_keys_and_remote_http():
    for url, key in [
        ("https://example.supabase.co", "sb_secret_fixture"),
        ("http://example.com", "sb_publishable_fixture"),
        ("https://user:password@example.com", "sb_publishable_fixture"),
    ]:
        with pytest.raises(APIError):
            PrivateCVStorage(url, key, "fixture-token")


def test_storage_failures_do_not_echo_provider_details():
    storage = PrivateCVStorage(
        "https://example.supabase.co",
        "sb_publishable_fixture",
        "synthetic-owner-token",
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(403, text="sensitive provider payload")
            )
        ),
    )
    with pytest.raises(APIError) as error:
        storage.download(PATH)
    assert "sensitive" not in str(error.value)
    assert error.value.status_code == 503
