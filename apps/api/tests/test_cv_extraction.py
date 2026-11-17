"""Synthetic CV parsing, model validation and explicit owner review."""

from io import BytesIO
from zipfile import ZipFile

import pytest
from pydantic import ValidationError
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from opportunity_api.ai.client import AIInvalidOutput, AIUnavailable
from opportunity_api.ai.documents import DOCX, PDF, InvalidDocument, extract_text
from opportunity_api.ai.schemas import CVExtraction
from opportunity_api.api.cv import get_model, get_storage
from opportunity_api.core.errors import APIError
from tests.conftest import auth_headers

TEXT = "Fixture University\nComputer Science\nBachelor student\nGraduation 2027\nPython\nBerlin"


def docx(text=TEXT):
    from xml.sax.saxutils import escape

    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(
            "word/document.xml",
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'
            + escape(text)
            + "</w:t></w:r></w:p></w:body></w:document>",
        )
    return buffer.getvalue()


def output():
    return {
        "headline": None,
        "location": {"value": "Berlin", "evidence": "Berlin"},
        "degree_level": {"value": "bachelor", "evidence": "Bachelor student"},
        "field_of_study": {"value": "Computer Science", "evidence": "Computer Science"},
        "university": {"value": "Fixture University", "evidence": "Fixture University"},
        "graduation_year": {"value": 2027, "evidence": "Graduation 2027"},
        "skills": [{"value": "Python", "evidence": "Python"}],
        "interests": [],
    }


class FakeStorage:
    def __init__(self):
        self.files = {}
        self.calls = []
        self.offline = False

    def upload(self, path, data, media_type):
        if self.offline:
            raise APIError("Storage unavailable", status_code=503, code="storage_unavailable")
        self.files[path] = data
        self.calls.append(("upload", path))

    def download(self, path):
        self.calls.append(("download", path))
        return self.files[path]

    def delete(self, path):
        self.calls.append(("delete", path))
        del self.files[path]


@pytest.fixture()
def cv_setup(client):
    storage = FakeStorage()

    class Model:
        def generate(self, model, text, schema):
            return schema.model_validate(output())

    client.app.dependency_overrides[get_storage] = lambda: storage
    client.app.dependency_overrides[get_model] = lambda: Model()
    headers = auth_headers(client, "cv-fixture@example.invalid")
    return headers, storage


def upload(client, headers):
    response = client.post(
        "/api/v1/cv?filename=resume.docx", headers={**headers, "Content-Type": DOCX}, content=docx()
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_text_parsers_and_schema_grounding():
    assert "Fixture University" in extract_text(docx(), DOCX)
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})}
    )
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 10 100 Td (Synthetic Python CV) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(stream)
    file = BytesIO()
    writer.write(file)
    assert "Synthetic Python CV" in extract_text(file.getvalue(), PDF)
    CVExtraction.model_validate(output()).verify_evidence(TEXT)
    invalid = output()
    invalid["university"]["value"] = "Invented University"
    with pytest.raises(ValueError):
        CVExtraction.model_validate(invalid).verify_evidence(TEXT)
    with pytest.raises(ValidationError):
        CVExtraction.model_validate({"skills": []})


@pytest.mark.parametrize(
    "data,kind", [(b"bad", PDF), (b"", DOCX), (docx(""), DOCX), (b"PKbad", DOCX)]
)
def test_bad_documents_rejected(data, kind):
    with pytest.raises(InvalidDocument):
        extract_text(data, kind)


def test_docx_external_entities_rejected():
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(
            "word/document.xml", '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>'
        )
    with pytest.raises(InvalidDocument):
        extract_text(buffer.getvalue(), DOCX)


def test_upload_extract_review_is_explicit_and_has_provenance(client, cv_setup):
    headers, storage = cv_setup
    uploaded = upload(client, headers)
    assert uploaded["status"] == "uploaded"
    assert "storage_path" not in uploaded
    document_id = uploaded["id"]
    before = client.get("/api/v1/profile", headers=headers).json()
    response = client.post(f"/api/v1/cv/{document_id}/extract", headers=headers)
    assert response.status_code == 200, response.text
    assert client.get("/api/v1/profile", headers=headers).json() == before
    review = client.post(
        f"/api/v1/cv/{document_id}/review",
        headers=headers,
        json={"fields": ["university", "skills"]},
    )
    assert review.status_code == 200, review.text
    assert review.json()["provenance"]["university"]["fact"]["evidence"] == "Fixture University"
    profile = client.get("/api/v1/profile", headers=headers).json()
    assert profile["university"] == "Fixture University"
    assert profile["degree_level"] is None
    assert client.get("/api/v1/profile/skills", headers=headers).json()[0]["name"] == "python"
    assert client.get(f"/api/v1/cv/{document_id}/file", headers=headers).content == docx()
    assert client.delete(f"/api/v1/cv/{document_id}", headers=headers).status_code == 204
    assert not storage.files


def test_cv_owner_isolation_and_refresh(client, cv_setup):
    headers, storage = cv_setup
    document_id = upload(client, headers)["id"]
    other = auth_headers(client, "cv-other@example.invalid")
    calls = len(storage.calls)
    for suffix, method, body in [
        ("", "GET", None),
        ("/file", "GET", None),
        ("/extract", "POST", None),
        ("/review", "POST", {"fields": ["skills"]}),
        ("", "DELETE", None),
    ]:
        assert (
            client.request(
                method, f"/api/v1/cv/{document_id}{suffix}", headers=other, json=body
            ).status_code
            == 404
        )
    assert len(storage.calls) == calls
    assert client.get("/api/v1/cv", headers=other).json() == []
    assert client.get("/api/v1/cv", headers=headers).json()[0]["id"] == document_id
    assert client.get("/api/v1/cv").status_code == 401


def test_review_rejects_profile_changes_and_missing_facts(client, cv_setup):
    headers, _ = cv_setup
    document_id = upload(client, headers)["id"]
    assert (
        client.post(
            f"/api/v1/cv/{document_id}/review", headers=headers, json={"fields": ["skills"]}
        ).status_code
        == 409
    )
    assert client.post(f"/api/v1/cv/{document_id}/extract", headers=headers).status_code == 200
    client.patch("/api/v1/profile", headers=headers, json={"university": "Manual correction"})
    assert (
        client.post(
            f"/api/v1/cv/{document_id}/review", headers=headers, json={"fields": ["university"]}
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/v1/cv/{document_id}/review", headers=headers, json={"fields": ["headline"]}
        ).status_code
        == 422
    )
    assert (
        client.get("/api/v1/profile", headers=headers).json()["university"] == "Manual correction"
    )


@pytest.mark.parametrize("failure,status", [(AIUnavailable, 503), (AIInvalidOutput, 422)])
def test_extraction_failure_leaves_file_and_profile_unchanged(client, cv_setup, failure, status):
    headers, _ = cv_setup
    document_id = upload(client, headers)["id"]

    class FailingModel:
        def generate(self, *args):
            raise failure("safe fixture error")

    client.app.dependency_overrides[get_model] = lambda: FailingModel()
    assert client.post(f"/api/v1/cv/{document_id}/extract", headers=headers).status_code == status
    assert client.get(f"/api/v1/cv/{document_id}", headers=headers).json()["status"] == "uploaded"
    assert client.get("/api/v1/profile", headers=headers).json()["university"] is None


def test_upload_limits_and_storage_failure(client, cv_setup):
    headers, storage = cv_setup
    assert (
        client.post(
            "/api/v1/cv?filename=resume.pdf",
            headers={**headers, "Content-Type": DOCX},
            content=docx(),
        ).status_code
        == 415
    )
    assert (
        client.post(
            "/api/v1/cv?filename=resume.pdf",
            headers={**headers, "Content-Type": PDF},
            content=b"x" * (5 * 1024 * 1024 + 1),
        ).status_code
        == 413
    )
    storage.offline = True
    response = client.post(
        "/api/v1/cv?filename=resume.docx", headers={**headers, "Content-Type": DOCX}, content=docx()
    )
    assert response.status_code == 503
    assert client.get("/api/v1/cv", headers=headers).json() == []


def test_changed_file_cannot_be_extracted_under_original_metadata(client, cv_setup):
    headers, storage = cv_setup
    document_id = upload(client, headers)["id"]
    storage.files[next(iter(storage.files))] = docx("Changed fixture")
    assert client.post(f"/api/v1/cv/{document_id}/extract", headers=headers).status_code == 409


def test_failed_metadata_commit_removes_uploaded_object(client, cv_setup, monkeypatch):
    from sqlalchemy.orm import Session

    from opportunity_api.models import CVDocument

    headers, storage = cv_setup
    original = Session.commit

    def fail_cv(self):
        if any(isinstance(item, CVDocument) for item in self.new):
            raise RuntimeError("synthetic DB failure")
        return original(self)

    monkeypatch.setattr(Session, "commit", fail_cv)
    response = client.post(
        "/api/v1/cv?filename=resume.docx", headers={**headers, "Content-Type": DOCX}, content=docx()
    )
    assert response.status_code == 503
    assert not storage.files


def test_unconfigured_ai_and_storage_do_not_break_core_product(client):
    headers = auth_headers(client, "offline-fixture@example.invalid")
    assert client.get("/api/v1/cv/service-health", headers=headers).json() == {
        "configured": False,
        "available": False,
    }
    assert client.get("/health").status_code == 200
    assert client.get("/api/v1/opportunities/recommended", headers=headers).status_code == 200
    assert (
        client.post(
            "/api/v1/cv?filename=resume.docx",
            headers={**headers, "Content-Type": DOCX},
            content=docx(),
        ).status_code
        == 503
    )
