"""C3 identity priority and safe repeat imports, without a hosted database."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from opportunity_api.core.database import Base
from opportunity_api.ingestion.dedupe import Deduplicator, conservative_fingerprint, storage_id
from opportunity_api.ingestion.models import RawOpportunity
from opportunity_api.ingestion.persistence import NormalizedOpportunity, OpportunityStore
from opportunity_api.ingestion.report import IngestionError
from opportunity_api.ingestion.runner import IngestionRunner
from opportunity_api.ingestion.smoke import FixtureAdapter
from opportunity_api.models import Application, Opportunity, User


def record(**changes):
    values = dict(
        source="fixture",
        source_id="1",
        url="https://example.org/jobs/1",
        title="Software Intern",
        organization="Acme",
        location="Berlin, Germany",
        deadline=datetime(2027, 1, 15, tzinfo=UTC),
    )
    values.update(changes)
    return NormalizedOpportunity.model_validate(values)


@pytest.fixture()
def store():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield OpportunityStore(session)
    engine.dispose()


def test_provider_id_priority_and_tracking_url_identity():
    seen = Deduplicator()
    first = record()
    seen.remember(first)
    assert seen.find(record(title="Software Intern (updated)")).kind == "provider_id"
    assert seen.find(record(url=first.url + "?utm_source=mail")).kind == "provider_id"
    with pytest.raises(IngestionError) as error:
        seen.find(record(url="https://example.org/jobs/other"))
    assert error.value.code == "identity_conflict"
    assert seen.find(record(url="https://example.org/jobs/new"), allow_update=True).record is first


def test_canonical_url_matches_cross_provider_without_title_only_merging():
    seen = Deduplicator()
    seen.remember(record())
    match = seen.find(
        record(source="other", source_id="other-id", url="https://example.org/jobs/1?fbclid=x")
    )
    assert match.kind == "url"
    assert seen.find(record(source_id="2", url="https://example.org/jobs/2")) is None
    assert (
        seen.find(
            record(source_id="3", title="Data Engineering Intern", url="https://example.org/jobs/3")
        )
        is None
    )


def test_explicit_different_ids_sharing_url_are_conflict_not_merge():
    seen = Deduplicator()
    seen.remember(record())
    with pytest.raises(IngestionError, match="Different explicit IDs") as error:
        seen.find(record(source_id="different"))
    assert error.value.review


def test_provider_id_and_url_pointing_at_different_rows_are_conflict():
    seen = Deduplicator()
    seen.remember(record())
    seen.remember(record(source_id="2", url="https://example.org/jobs/2"))
    with pytest.raises(IngestionError, match="different rows"):
        seen.find(record(url="https://example.org/jobs/2"), allow_update=True)


def test_shared_url_with_contradictory_role_is_not_merged():
    seen = Deduplicator()
    seen.remember(record())
    with pytest.raises(IngestionError, match="contradictory"):
        seen.find(record(source="other", source_id="9", title="Data Engineering Intern"))


def test_conservative_fingerprint_requires_all_fields_and_no_strong_identifier():
    first = record(source_id=None, url="https://example.org/careers?lang=en")
    second = record(source_id=None, url="https://example.org/careers?lang=de")
    seen = Deduplicator()
    seen.remember(first)
    assert seen.find(second).kind == "fingerprint"
    assert conservative_fingerprint(first) is not None
    assert conservative_fingerprint(record(source_id=None, deadline=None)) is None
    # URL-embedded IDs also override fingerprints, even when source_id was omitted.
    assert conservative_fingerprint(record(source_id=None)) is None
    assert (
        conservative_fingerprint(record(source_id=None, url="https://example.org/careers?job_id=2"))
        is None
    )
    assert (
        conservative_fingerprint(record(source_id=None, url="https://example.org/#/job/2")) is None
    )
    assert (
        conservative_fingerprint(
            record(source_id=None, url="https://example.org/careers?listing=2")
        )
        is None
    )
    assert (
        conservative_fingerprint(record(source_id=None, url="https://example.org/vacancies/2"))
        is None
    )
    assert seen.find(record(source_id="new-native", url=second.url)) is None
    assert (
        seen.find(record(source_id=None, url="https://example.org/careers?lang=fr", deadline=None))
        is None
    )


def test_similar_titles_or_missing_deadline_do_not_deduplicate():
    seen = Deduplicator()
    seen.remember(record(source_id=None, url="https://a.example/careers", deadline=None))
    assert seen.find(record(source_id=None, url="https://b.example/careers", deadline=None)) is None
    assert (
        seen.find(
            record(source_id=None, url="https://b.example/careers", title="Software Intern II")
        )
        is None
    )


def test_explicit_ids_that_look_like_internal_hashes_still_prevent_fingerprint_merge(store):
    seen = Deduplicator()
    first = record(source_id="urlhash:" + "a" * 64, url="https://example.org/careers?lang=en")
    second = record(source_id="urlhash:" + "b" * 64, url="https://example.org/careers?lang=de")
    seen.remember(first)
    assert seen.find(second) is None
    assert store.upsert(first) == "created"
    store.commit()
    assert store.upsert(second) == "created"
    store.commit()
    assert len(list(store.session.scalars(select(Opportunity)))) == 2


def test_multiple_legacy_matches_require_review():
    seen = Deduplicator()
    seen.remember(record(source_id=None, url="https://example.org/careers"))
    seen.remember(record(source="other", source_id=None, url="https://example.org/careers"))
    with pytest.raises(IngestionError, match="Several stored rows"):
        seen.find(record(source_id=None, url="https://example.org/careers"))
    with pytest.raises(IngestionError, match="multiple rows"):
        seen.find(record(source_id=None, url="https://example.org/careers?locale=fr"))


def test_generated_identity_and_invalid_legacy_url():
    first = record(source_id=None)
    assert storage_id(first) == storage_id(first.model_copy())
    seen = Deduplicator()
    legacy = first.model_copy(update={"url": "urn:legacy", "source_id": "legacy-id"})
    seen.remember(legacy)
    assert not seen.urls
    seen.forget(legacy)
    assert not seen.providers
    assert not seen(first)
    assert seen(first)
    seen.forget(first)
    assert not seen.urls


def test_persistence_fallback_id_replay_unchanged_timestamps_and_applications(store):
    value = record(source_id=None)
    assert store.upsert(value) == "created"
    store.commit()
    saved = store.session.scalar(select(Opportunity))
    original_id, timestamp = saved.id, saved.updated_at
    assert saved.source_id == storage_id(value) and saved.is_active is False
    user = User(email="fixture@example.invalid", full_name="Fixture")
    app = Application(user=user, opportunity=saved)
    store.session.add(app)
    store.session.commit()
    assert store.upsert(value) == "updated"
    store.commit()
    assert saved.id == original_id and saved.updated_at == timestamp
    assert app.opportunity_id == original_id
    assert len(list(store.session.scalars(select(Opportunity)))) == 1


def test_native_id_adoption_and_real_update_preserve_uuid_and_ownership(store):
    first = record(source_id=None)
    store.upsert(first)
    store.commit()
    saved = store.session.scalar(select(Opportunity))
    identity = saved.id
    assert store.upsert(record(title="Software Intern II")) == "updated"
    store.commit()
    assert saved.source_id == "1" and saved.id == identity
    assert saved.title == "Software Intern II"
    other = record(source="other", source_id="other-1", title="Software Intern II")
    assert store.upsert(other) == "duplicate"
    store.commit()
    assert saved.source == "fixture" and saved.source_id == "1"
    with pytest.raises(IngestionError):
        store.upsert(record(source_id="different", title=saved.title))


def test_store_fingerprint_fallback_and_review_deactivation(store):
    first = record(source_id=None, url="https://example.org/careers?lang=en")
    store.upsert(first)
    store.commit()
    second = record(source_id=None, url="https://example.org/careers?lang=de")
    assert store.classify(second) == "update"
    assert store.upsert(second) == "duplicate"
    store.commit()
    saved = store.session.scalar(select(Opportunity))
    assert saved.url == first.url
    saved.is_active = True  # synthetic approval; local fixture only
    store.session.commit()
    assert store.upsert(first) == "updated"
    store.commit()
    assert saved.is_active is True  # clean replays preserve an existing publication decision
    first._requires_review = True
    store.upsert(first)
    store.commit()
    assert saved.is_active is False
    saved.is_active = True
    store.session.commit()
    first._requires_review = False
    first.title = "Software Engineering Intern"
    store.upsert(first)
    store.commit()
    assert saved.is_active is False  # Changed data needs a fresh publication decision.


def test_runner_dedupe_resets_per_run_and_keeps_distinct_ids(store):
    def raw(idx, url=None):
        return RawOpportunity(
            source="fixture",
            source_id=idx,
            source_url=url or f"https://example.org/jobs/{idx}",
            title="Software Intern",
            organization="Acme",
            location="Germany",
            description="Python",
        )

    runner = IngestionRunner(store)
    adapter = FixtureAdapter(
        "fixture", [raw("1"), raw("1"), raw("2"), raw("3", "https://example.org/jobs/1")]
    )
    first = runner.run([adapter])
    assert first.totals().created == 2 and first.totals().duplicates == 1
    assert first.totals().review_required == 1
    assert len(list(store.session.scalars(select(Opportunity)))) == 2
    assert {i.code for i in first.issues} == {"identity_conflict", "duplicate_provider_id"}
    second = runner.run([FixtureAdapter("fixture", [raw("1"), raw("2")])])
    assert second.totals().created == 0 and second.totals().updated == 2


def test_dry_run_deduplicates_without_writes(store):
    item = RawOpportunity(
        source="fixture",
        source_url="https://example.org/jobs/1?utm_source=x",
        title="Software Intern",
        location="Germany",
    )
    report = IngestionRunner(store, dry_run=True).run([FixtureAdapter("fixture", [item, item])])
    assert report.totals().would_create == 1 and report.totals().duplicates == 1
    assert report.issues[0].code == "duplicate_url"
    assert not list(store.session.scalars(select(Opportunity)))


@pytest.mark.parametrize("other_id", ["ROLE  7", "ROLE\t7"])
def test_normalization_preserves_distinct_provider_ids_and_their_reimports(store, other_id):
    records = [
        RawOpportunity(
            source="fixture",
            source_id=provider_id,
            source_url=f"https://example.org/jobs/{number}",
            title="Software Intern",
            organization="Acme",
            location="Germany",
        )
        for number, provider_id in enumerate(["ROLE 7", other_id], 1)
    ]
    runner = IngestionRunner(store)
    first = runner.run([FixtureAdapter("fixture", records)])
    assert first.totals().created == 2
    assert first.totals().review_required == 0
    saved = list(store.session.scalars(select(Opportunity)))
    assert {row.source_id for row in saved} == {"ROLE 7", other_id}
    second = runner.run([FixtureAdapter("fixture", records)])
    assert second.totals().updated == 2 and second.totals().created == 0
    assert len(list(store.session.scalars(select(Opportunity)))) == 2


@pytest.mark.parametrize(
    ("first_url", "second_url"),
    [
        (
            "https://jobs.example.org/acme/11111111-1111-4111-8111-111111111111",
            "https://jobs.example.org/acme/22222222-2222-4222-8222-222222222222",
        ),
        ("https://example.org/careers/101", "https://example.org/careers/102"),
        ("https://example.org/a", "https://example.org/b"),
        ("https://one.example.org/careers", "https://two.example.org/careers"),
        ("https://example.org/careers?id=1", "https://example.org/careers?id=2"),
        ("https://example.org/#/role/one", "https://example.org/#/role/two"),
    ],
)
def test_regression_distinct_url_identities_never_merge_by_fingerprint(
    store, first_url, second_url
):
    first = record(source_id=None, url=first_url)
    second = record(source_id=None, url=second_url)
    seen = Deduplicator()
    seen.remember(first)
    assert seen.find(second) is None
    assert store.upsert(first) == "created"
    store.commit()
    assert store.upsert(second) == "created"
    store.commit()
    assert len(list(store.session.scalars(select(Opportunity)))) == 2


def test_regression_uuid_url_tracking_is_still_duplicate(store):
    url = "https://jobs.example.org/acme/11111111-1111-4111-8111-111111111111"
    records = [
        RawOpportunity(
            source="fixture", source_url=address, title="Software Intern", location="Germany"
        )
        for address in (url, url + "?utm_source=fixture&gclid=fixture")
    ]
    report = IngestionRunner(store).run([FixtureAdapter("fixture", records)])
    assert report.totals().created == 1 and report.totals().duplicates == 1
    assert report.issues[0].code == "duplicate_url"


def test_regression_review_duplicate_deactivates_existing_active_posting(store):
    raw = RawOpportunity(
        source="fixture",
        source_id="1",
        source_url="https://example.org/jobs/1",
        title="Software Intern",
        organization="Acme",
        location="Germany",
    )
    IngestionRunner(store).run([FixtureAdapter("fixture", [raw])])
    saved = store.session.scalar(select(Opportunity))
    saved.is_active = True
    store.session.commit()
    ambiguous = raw.model_copy(update={"deadline_raw": "01/02/2027"})
    report = IngestionRunner(store).run([FixtureAdapter("fixture", [raw, ambiguous])])
    assert report.totals().duplicates == 1 and report.totals().review_required == 1
    assert not saved.is_active
    assert report.review_records()[0]["opportunity_id"] == str(saved.id)


def test_regression_fingerprint_is_useful_without_overriding_provider_or_url_ids(store):
    records = [
        RawOpportunity(
            source="fixture",
            source_id=provider_id,
            source_url=f"https://example.org/careers?lang={language}",
            title=title,
            organization="Acme",
            location="Germany",
            deadline_raw="2027-02-03",
        )
        for language, provider_id, title in (
            ("en", None, "Software Intern"),
            ("de", None, "Software Intern"),  # Same address/facts, different language selector.
            ("fr", None, "Data Intern"),  # Different role, even at the same base address.
            ("it", "provider-1", "Software Intern"),
            ("es", "provider-2", "Software Intern"),  # Explicit IDs override weak similarity.
        )
    ]
    report = IngestionRunner(store).run([FixtureAdapter("fixture", records)])
    assert report.totals().created == 4 and report.totals().duplicates == 1
    assert [i.code for i in report.issues] == ["duplicate_fingerprint"]
    rows = list(store.session.scalars(select(Opportunity)))
    assert len(rows) == 4
    assert {"provider-1", "provider-2"} <= {row.source_id for row in rows}
