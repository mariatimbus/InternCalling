"""Exercise live editor workflows, owner boundaries and durable receipt retries."""

from copy import deepcopy
from io import BytesIO
from uuid import uuid4

import pytest
from pypdf import PdfReader
from reportlab.pdfgen.canvas import Canvas
from sqlalchemy import select

from opportunity_api.ai.client import AIUnavailable
from opportunity_api.api.cv import get_model, get_storage
from opportunity_api.models import ProfileEntry, WorkspaceRecord
from tests.conftest import auth_headers
from tests.test_cv_extraction import FakeStorage, output
from tests.test_opportunities import make_opportunity, seed

BASE = "/api/v1/workspace"
DRAFTS = {
    "experience": {
        "role": "Engineer",
        "organization": "Example",
        "startDate": "2024",
        "current": True,
        "achievements": "Built a solver\nTested accuracy",
    },
    "projects": {
        "name": "Solver",
        "technologies": ["Python"],
        "repositoryUrl": "https://example.com/solver",
    },
    "certificates": {"name": "Certificate", "organization": "University", "doesNotExpire": True},
    "honours": {"title": "Research award", "receivedDate": "2025-03"},
    "languages": {"name": "Romanian", "native": True},
    "publications": {
        "title": "Numerical analysis",
        "authors": "Maria\nAda",
        "doi": "https://doi.org/10.1000/example",
    },
}


def key(headers):
    return {**headers, "Idempotency-Key": str(uuid4())}


def write(client, path, headers, payload, expected=200):
    response = client.post(BASE + path, headers=headers, json=payload)
    assert response.status_code == expected, response.text
    return response.json()


@pytest.fixture()
def owner(client):
    return auth_headers(client, "workspace-owner@example.invalid")


@pytest.mark.parametrize("section", DRAFTS)
def test_collection_roundtrip_revision_retry_and_two_user_isolation(
    client, db_factory, owner, section
):
    headers = key(owner)
    row = write(client, f"/collections/{section}", headers, {"values": DRAFTS[section]}, 201)
    assert (
        write(client, f"/collections/{section}", headers, {"values": DRAFTS[section]}, 201) == row
    )
    assert row["revision"] == 1 and row["position"] == 1
    assert client.get(BASE + f"/collections/{section}", headers=owner).json() == [row]
    stranger = auth_headers(client, "other@example.invalid")
    assert client.get(BASE + f"/collections/{section}", headers=stranger).json() == []
    url = BASE + f"/collections/{section}/{row['id']}"
    assert (
        client.patch(
            url, headers=key(stranger), json={"revision": 1, "values": DRAFTS[section]}
        ).status_code
        == 404
    )
    updated = client.patch(url, headers=key(owner), json={"revision": 1, "values": DRAFTS[section]})
    assert updated.status_code == 200, updated.text
    assert updated.json()["revision"] == 2
    assert (
        client.patch(
            url, headers=key(owner), json={"revision": 1, "values": DRAFTS[section]}
        ).status_code
        == 409
    )
    assert client.delete(url + "?revision=1", headers=key(owner)).status_code == 409
    removal = key(owner)
    for _ in range(2):
        assert client.delete(url + "?revision=2", headers=removal).status_code == 204
    assert client.get(BASE + f"/collections/{section}", headers=owner).json() == []
    with db_factory() as db:
        assert db.scalar(select(ProfileEntry)) is None


@pytest.mark.parametrize(
    "section,values",
    [
        ("experience", {**DRAFTS["experience"], "endDate": "2023"}),
        ("projects", {"name": "Test", "repositoryUrl": "javascript:alert(1)"}),
        ("certificates", {**DRAFTS["certificates"], "expirationDate": "2026"}),
        ("honours", {"title": "Award", "receivedDate": "2025-13"}),
        ("languages", {"name": "French", "native": True, "cefr": "C2"}),
        ("publications", {"title": "Paper", "doi": "not-a-doi"}),
        ("projects", {"name": "Test\u0000"}),
        ("projects", {"name": "Test\ud800"}),
    ],
)
def test_invalid_collection_payload_never_persists(client, owner, section, values):
    assert (
        client.post(
            BASE + f"/collections/{section}",
            headers={**key(owner), "Content-Type": "application/json"},
            content=__import__("json").dumps({"values": values}),
        ).status_code
        == 422
    )
    assert client.get(BASE + f"/collections/{section}", headers=owner).json() == []


def test_language_duplicate_and_idempotency_payload_reuse(client, owner):
    headers = key(owner)
    write(client, "/collections/languages", headers, {"values": DRAFTS["languages"]}, 201)
    response = client.post(
        BASE + "/collections/languages", headers=key(owner), json={"values": {"name": "ROMANIAN"}}
    )
    assert response.status_code == 409 and response.json()["error"]["code"] == "duplicate_language"
    assert (
        client.post(
            BASE + "/collections/languages", headers=headers, json={"values": {"name": "French"}}
        ).status_code
        == 409
    )
    assert (
        client.post(
            BASE + "/collections/projects", headers=owner, json={"values": {"name": "No key"}}
        ).status_code
        == 422
    )
    assert client.get(BASE + "/collections/projects").status_code == 401


def manual_payload(client, owner):
    snapshot = client.get(BASE + "/snapshot", headers=owner).json()
    return {
        "requestId": str(uuid4()),
        "profileRevision": snapshot["profileRevision"],
        "draft": {
            "degree_level": "bachelor",
            "university": "University",
            "field_of_study": "Computer Science",
            "graduation_year": "2027",
            "location": "Berlin",
            "skills": ["Python", "SQL"],
        },
    }


def test_manual_onboarding_is_atomic_and_replayable(client, owner):
    payload = manual_payload(client, owner)
    value = write(client, "/manual-confirm", owner, payload)
    assert value["profile"]["university"] == "University" and value["skills"] == ["python", "sql"]
    assert value["profileRevision"] != payload["profileRevision"]
    assert write(client, "/manual-confirm", owner, payload) == value
    assert client.get(BASE + "/snapshot", headers=owner).json() == value
    stale = {**payload, "requestId": str(uuid4())}
    assert client.post(BASE + "/manual-confirm", headers=owner, json=stale).status_code == 409


def pdf_bytes():
    buffer = BytesIO()
    canvas = Canvas(buffer)
    for index, text in enumerate(
        [
            "Fixture University",
            "Computer Science",
            "Bachelor student",
            "Graduation 2027",
            "Python",
            "Berlin",
        ]
    ):
        canvas.drawString(60, 780 - index * 20, text)
    canvas.save()
    return buffer.getvalue()


@pytest.fixture()
def cv(client, owner):
    storage = FakeStorage()

    class Model:
        def generate(self, model, text, schema):
            return schema.model_validate(output())

    client.app.dependency_overrides[get_storage] = lambda: storage
    client.app.dependency_overrides[get_model] = lambda: Model()
    headers = {**key(owner), "Content-Type": "application/pdf"}
    data = pdf_bytes()
    response = client.post(BASE + "/resume", headers=headers, content=data)
    assert response.status_code == 201, response.text
    doc = response.json()
    assert client.post(BASE + "/resume", headers=headers, content=data).json() == doc
    return doc, storage


def test_active_pdf_replace_remove_does_not_resurrect_old_file(client, owner, cv):
    doc, storage = cv
    url = BASE + f"/resume/{doc['id']}/file?revision={doc['revision']}"
    fetched = client.get(url, headers=owner)
    assert fetched.status_code == 200 and fetched.content.startswith(b"%PDF")
    assert fetched.headers["cache-control"] == "private, no-store"
    stranger = auth_headers(client, "other-pdf@example.invalid")
    assert client.get(url, headers=stranger).status_code == 409
    assert (
        client.post(
            BASE + "/resume",
            headers={**key(owner), "Content-Type": "application/pdf"},
            content=pdf_bytes(),
        ).status_code
        == 409
    )
    replacement = client.post(
        BASE + f"/resume?replace_id={doc['id']}&replace_revision={doc['revision']}",
        headers={**key(owner), "Content-Type": "application/pdf"},
        content=pdf_bytes(),
    )
    assert replacement.status_code == 201, replacement.text
    newer = replacement.json()
    assert newer["revision"] > doc["revision"] and newer["id"] != doc["id"]
    assert client.get(url, headers=owner).status_code == 409
    removal = key(owner)
    for _ in range(2):
        assert (
            client.delete(
                BASE + f"/resume/{newer['id']}?revision={newer['revision']}", headers=removal
            ).status_code
            == 204
        )
    assert client.get(BASE + "/resume", headers=owner).json() is None
    assert len(storage.files) == 1  # archived first upload is never made active again


def review_payload(client, owner, cv):
    doc, _ = cv
    source = {"id": doc["id"], "revision": doc["revision"]}
    job = write(client, "/resume/review/start", key(owner), {"source": source})
    result = client.get(BASE + f"/resume/review/{job['id']}/result", headers=owner).json()
    assert result["jobId"] == job["id"]
    assert client.get(BASE + "/snapshot", headers=owner).json()["profile"]["university"] == ""
    return {
        "requestId": str(uuid4()),
        "jobId": job["id"],
        "source": source,
        "profileRevision": result["snapshot"]["profileRevision"],
        "profile": result["proposed"]["profile"],
        "skills": {"add": result["proposed"]["skills"]},
        "collections": [],
    }


def test_review_requires_confirmation_and_receipt_retry_does_not_repeat_writes(client, owner, cv):
    payload = review_payload(client, owner, cv)
    receipt = write(client, "/resume/review/confirm", owner, payload)
    assert receipt["snapshot"]["profile"]["university"] == "Fixture University"
    assert receipt["snapshot"]["skills"] == ["python"]
    assert receipt["snapshot"]["profileRevision"] != payload["profileRevision"]
    assert write(client, "/resume/review/confirm", owner, payload) == receipt
    stranger = auth_headers(client, "review-stranger@example.invalid")
    assert (
        client.get(BASE + f"/resume/review/{payload['jobId']}/result", headers=stranger).status_code
        == 404
    )


def test_review_conflict_and_invalid_collection_roll_back_all_fields(client, owner, cv):
    payload = review_payload(client, owner, cv)
    bad = deepcopy(payload)
    bad["collections"] = [{"section": "projects", "operation": "add", "fields": {"name": ""}}]
    assert client.post(BASE + "/resume/review/confirm", headers=owner, json=bad).status_code == 422
    assert client.get(BASE + "/snapshot", headers=owner).json()["profile"]["university"] == ""
    write(client, "/collections/projects", key(owner), {"values": {"name": "Concurrent edit"}}, 201)
    assert (
        client.post(BASE + "/resume/review/confirm", headers=owner, json=payload).status_code == 409
    )


def test_parsing_offline_does_not_change_profile_or_remove_pdf(client, owner, cv):
    doc, _ = cv

    class Offline:
        def generate(self, *args):
            raise AIUnavailable()

    client.app.dependency_overrides[get_model] = lambda: Offline()
    assert (
        client.post(
            BASE + "/resume/review/start",
            headers=key(owner),
            json={"source": {"id": doc["id"], "revision": doc["revision"]}},
        ).status_code
        == 503
    )
    assert client.get(BASE + "/resume", headers=owner).json() == doc
    assert client.get(BASE + "/snapshot", headers=owner).json()["profile"]["university"] == ""


def test_tailoring_exports_exact_approved_edits_and_invalidates_stale_download(
    client, db_factory, owner
):
    write(client, "/manual-confirm", owner, manual_payload(client, owner))
    job = make_opportunity(title="Python intern")
    seed(db_factory, job)
    value = client.get(BASE + f"/tailoring/context/{job.id}", headers=owner).json()
    scope = {
        "job": {k: value["job"][k] for k in ("id", "revision")},
        "profile": value["source"]["profile"],
        "resume": value["source"]["resume"],
    }
    payload = {"scope": scope, "requestId": str(uuid4())}
    generation = write(client, "/tailoring/generate", owner, payload)
    assert write(client, "/tailoring/generate", owner, payload) == generation
    draft = generation["draft"]
    ref = {"id": draft["id"], "revision": draft["revision"]}
    assert (
        client.post(
            BASE + "/tailoring/approve",
            headers=owner,
            json={"requestId": str(uuid4()), "draft": ref},
        ).status_code
        == 422
    )
    blocks = deepcopy(draft["blocks"])
    for block in blocks:
        block["decision"] = "excluded"
    blocks[0].update(
        decision="accepted",
        wording="user",
        title="Maria Ștefan",
        text="Approved café résumé <test> & Python research",
    )
    saved = write(
        client,
        "/tailoring/save",
        owner,
        {"requestId": str(uuid4()), "draft": ref, "blocks": blocks},
    )
    ref = {"id": saved["id"], "revision": saved["revision"]}
    approval = write(client, "/tailoring/approve", owner, {"requestId": str(uuid4()), "draft": ref})
    export = write(
        client, "/tailoring/export", owner, {"requestId": str(uuid4()), "approval": approval}
    )
    file_url = BASE + f"/tailoring/export/{export['id']}/file"
    response = client.get(file_url, headers=owner)
    assert response.status_code == 200, response.text
    text = "\n".join(page.extract_text() for page in PdfReader(BytesIO(response.content)).pages)
    assert "Maria Ștefan" in text and "Approved café résumé <test> & Python research" in text
    assert "University" not in text  # explicitly excluded blocks are absent
    stranger = auth_headers(client, "export-stranger@example.invalid")
    assert client.get(file_url, headers=stranger).status_code == 404
    write(client, "/collections/projects", key(owner), {"values": {"name": "New source"}}, 201)
    assert client.get(file_url, headers=owner).status_code == 409
    with db_factory() as db:
        assert (
            len(
                list(
                    db.scalars(
                        select(WorkspaceRecord).where(WorkspaceRecord.kind == "tailor-export")
                    )
                )
            )
            == 1
        )
