"""Reviewer queue: ingestion fills it, a reviewer decides, later runs respect that."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from opportunity_api.ingestion.persistence import OpportunityStore
from opportunity_api.ingestion.runner import IngestionRunner
from opportunity_api.models import Opportunity
from tests.conftest import mint_token
from tests.test_ingestion_runner import StaticAdapter, make_raw
from tests.test_opportunities import make_opportunity, seed

URL = "/api/v1/review/opportunities"
REVIEWER = {"Authorization": f"Bearer {mint_token(app_metadata={'roles': ['reviewer']})}"}
# Every user can edit user_metadata, so a role there must never count.
SELF_GRANTED = {"Authorization": f"Bearer {mint_token(user_metadata={'roles': ['reviewer']})}"}


def pending(**kwargs):
    return make_opportunity(
        is_active=False, review_status="pending", review_reason="Location unclear", **kwargs
    )


def test_only_reviewers_see_the_queue(client, db_factory):
    seed(db_factory, pending())
    assert client.get(URL).status_code == 401
    assert client.get(URL, headers=SELF_GRANTED).status_code == 403
    assert (
        client.post(
            f"{URL}/{pending().id}", json={"decision": "approve"}, headers=SELF_GRANTED
        ).status_code
        == 403
    )


def test_queue_lists_pending_postings_with_their_reason(client, db_factory):
    waiting = pending(title="Data Intern")
    seed(
        db_factory,
        waiting,
        make_opportunity(title="Live"),
        make_opportunity(review_status="rejected", is_active=False),
    )
    body = client.get(URL, headers=REVIEWER).json()
    assert body["total"] == 1
    assert [(i["title"], i["review_reason"]) for i in body["items"]] == [
        ("Data Intern", "Location unclear")
    ]


@pytest.mark.parametrize(
    ("decision", "deadline", "active", "status"),
    [
        ("approve", None, True, "approved"),
        ("reject", None, False, "rejected"),
        (
            "approve",
            datetime.now(UTC) - timedelta(days=1),
            False,
            "approved",
        ),  # expired stays hidden
    ],
)
def test_decision_publishes_or_hides_once(client, db_factory, decision, deadline, active, status):
    row = pending(deadline=deadline)
    seed(db_factory, row)
    path = f"{URL}/{row.id}"
    assert client.post(path, json={"decision": decision}, headers=REVIEWER).status_code == 204
    with db_factory() as session:
        stored = session.get(Opportunity, row.id)
        assert (stored.is_active, stored.review_status) == (active, status)
        assert stored.reviewed_at is not None
    assert client.post(path, json={"decision": decision}, headers=REVIEWER).status_code == 409
    assert client.post(path, json={"decision": "maybe"}, headers=REVIEWER).status_code == 422


@pytest.fixture
def session(db_factory):
    with db_factory() as session:
        yield session


def _row(session):
    return session.scalar(select(Opportunity))


def _run(session, record):
    IngestionRunner(OpportunityStore(session, publish=True)).run([StaticAdapter("ashby", [record])])
    session.expire_all()
    return _row(session)


def test_ingestion_queues_unclear_postings_and_respects_the_decision(session):
    unclear = make_raw("ashby", 1, deadline_raw=None, location="Worldwide")
    row = _run(session, unclear)
    assert (row.is_active, row.review_status) == (False, "pending")
    assert "European availability is not established" in row.review_reason

    row.review_status, row.is_active = "approved", True  # what the API does
    session.commit()
    row = _run(session, unclear)
    assert (row.is_active, row.review_status) == (True, "approved")  # unchanged: stays live

    changed = make_raw("ashby", 1, deadline_raw=None, location="Worldwide", title="Data Intern")
    row = _run(session, changed)
    assert (row.is_active, row.review_status) == (False, "pending")  # approval was for old values

    row.review_status = "rejected"
    session.commit()
    row = _run(session, changed)
    assert (row.is_active, row.review_status) == (False, "rejected")

    clear = make_raw("ashby", 1, deadline_raw=None, title="Data Intern")
    row = _run(session, clear)
    assert (row.is_active, row.review_status) == (False, "rejected")  # rules never override a no


def test_postings_the_rules_now_accept_leave_the_queue(session):
    row = _run(session, make_raw("ashby", 1, deadline_raw=None, location="Worldwide"))
    assert row.review_status == "pending"
    row = _run(session, make_raw("ashby", 1, deadline_raw=None))
    assert (row.is_active, row.review_status, row.review_reason) == (True, None, None)
