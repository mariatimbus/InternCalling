"""Private CV Storage requests retain the caller's identity and enforce owner RLS."""

import re
from urllib.parse import urlsplit

import httpx
import jwt

from opportunity_api.ai.documents import MAX_FILE_BYTES
from opportunity_api.core.errors import APIError

BUCKET = "private-cvs"


class PrivateCVStorage:
    def __init__(self, project_url: str, public_key: str, token: str, *, client=None):
        url = urlsplit(project_url)
        safe_key = public_key.startswith("sb_publishable_")
        if not safe_key and public_key.count(".") == 2:
            try:
                safe_key = (
                    jwt.decode(public_key, options={"verify_signature": False}).get("role")
                    == "anon"
                )
            except jwt.PyJWTError:
                safe_key = False
        if (
            not safe_key
            or not token
            or url.scheme not in {"http", "https"}
            or not url.hostname
            or url.username
            or url.password
            or url.path not in {"", "/"}
            or url.query
            or url.fragment
        ):
            raise APIError(
                "CV storage is not configured", status_code=503, code="storage_unavailable"
            )
        if url.scheme == "http" and url.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise APIError("CV storage requires HTTPS", status_code=503, code="storage_unavailable")
        self.base = project_url.rstrip("/") + "/storage/v1"
        self.headers = {"apikey": public_key, "Authorization": f"Bearer {token}"}
        self.client = client

    def _path(self, path: str) -> str:
        if not re.fullmatch(r"[0-9a-f-]{36}/[0-9a-f-]{36}/resume\.(pdf|docx)", path):
            raise ValueError("Invalid server-generated storage path")
        return path

    def _request(self, method, suffix, **kwargs):
        headers = {**self.headers, **kwargs.pop("headers", {})}
        try:
            if self.client is not None:
                response = self.client.request(
                    method, self.base + suffix, headers=headers, **kwargs
                )
                response.raise_for_status()
                if len(response.content) > MAX_FILE_BYTES:
                    raise ValueError("Storage object is too large")
                return response.content
            with httpx.Client(timeout=20, follow_redirects=False, trust_env=False) as client:
                with client.stream(
                    method, self.base + suffix, headers=headers, **kwargs
                ) as response:
                    response.raise_for_status()
                    data = bytearray()
                    for chunk in response.iter_bytes():
                        data.extend(chunk)
                        if len(data) > MAX_FILE_BYTES:
                            raise ValueError("Storage object is too large")
                    return bytes(data)
        except (httpx.HTTPError, ValueError) as exc:
            raise APIError(
                "CV storage request failed; try again", status_code=503, code="storage_unavailable"
            ) from exc

    def upload(self, path: str, data: bytes, media_type: str):
        self._request(
            "POST",
            f"/object/{BUCKET}/{self._path(path)}",
            content=data,
            headers={"Content-Type": media_type, "x-upsert": "false"},
        )

    def download(self, path: str) -> bytes:
        return self._request("GET", f"/object/authenticated/{BUCKET}/{self._path(path)}")

    def delete(self, path: str):
        self._request("DELETE", f"/object/{BUCKET}", json={"prefixes": [self._path(path)]})
