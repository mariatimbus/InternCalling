"""C3 normalization, scope and reporting, using only local fixtures/SQLite."""

import json
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from opportunity_api.core.database import Base
from opportunity_api.ingestion.models import RawOpportunity
from opportunity_api.ingestion.normalize import (
    canonical_url,
    clean_html,
    normalize,
    parse_deadline,
    parse_degree,
    parse_years,
)
from opportunity_api.ingestion.persistence import OpportunityStore
from opportunity_api.ingestion.report import IngestionError, record_ref
from opportunity_api.ingestion.runner import IngestionRunner
from opportunity_api.ingestion.scope import assess_scope
from opportunity_api.ingestion.smoke import FixtureAdapter
from opportunity_api.ingestion.validate import validate
from opportunity_api.models import Opportunity


def raw(idx="1", **changes):
    values = dict(
        source="fixture",
        source_id=idx,
        source_url=f"https://example.org/jobs/{idx}",
        title="Software Intern",
        organization="Acme",
        description="Python engineering",
        location="Berlin, Germany",
    )
    values.update(changes)
    return RawOpportunity(**values)


@pytest.fixture()
def store():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield OpportunityStore(session)
    engine.dispose()


def test_spaces_html_and_raw_record_preserved():
    record = raw(
        title="  Software\t Engineering\n Intern  ",
        organization="  Acme\u00a0  Labs ",
        description=(
            "<h2>Our team</h2><p>Build <b>Python</b> &amp; SQL.</p><ul><li>Learn</li></ul>"
            "<script>secret()</script><style>hidden</style><!-- comment -->"
        ),
    )
    result = normalize(record)
    assert result["title"] == "Software Engineering Intern"
    assert result["organization"] == "Acme Labs"
    assert result["description"] == "Our team\nBuild Python & SQL.\nLearn"
    assert "<b>" in record.description
    assert normalize(record) == result
    assert clean_html(None) is None
    assert clean_html("<p> </p>") is None
    assert clean_html("<script>ignore <b>all</b></script>visible") == "visible"


def test_url_removes_only_known_tracking_preserves_identifiers_order_and_fragment():
    url = (
        " HTTPS://Careers.Example.org:443/Jobs/Apply/?utm_source=a&jobId=A%2B1"
        "&source=engineering&lang=ro&jobId=B&ref=12&utm_job_id=99&gh_src=z#job-42 "
    )
    expected = "https://careers.example.org/Jobs/Apply/?jobId=A%2B1&source=engineering&lang=ro&jobId=B&ref=12&utm_job_id=99#job-42"
    assert canonical_url(url) == expected
    assert canonical_url(expected) == expected
    assert canonical_url("http://EXAMPLE.org:80") == "http://example.org/"
    assert canonical_url("https://example.org:80/job") == "https://example.org:80/job"


@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.org/job",
        "javascript:alert(1)",
        "https://user:secret@example.org/job",
        "https://example.org/?api_key=sb_secret_should_not_appear",
        "https://example.org:99999/job",
        "https://example.org/a b",
        "https://",
        "https://example.org:9000/job",
    ],
)
def test_bad_urls_rejected_without_echoing_secrets(url):
    values = normalize(raw(source_url=url))
    with pytest.raises(IngestionError, match="url contract") as error:
        validate(values)
    assert error.value.code == "invalid_url"
    assert "secret" not in str(error.value)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, None),
        ("", None),
        ("2027-02-03", datetime(2027, 2, 3, tzinfo=UTC)),
        ("2027-02-03T13:00:00+02:00", datetime(2027, 2, 3, 11, tzinfo=UTC)),
        ("2027-02-03T11:00:00Z", datetime(2027, 2, 3, 11, tzinfo=UTC)),
        ("3 February 2027", datetime(2027, 2, 3, tzinfo=UTC)),
        ("3 Feb 2027", datetime(2027, 2, 3, tzinfo=UTC)),
        ("01/02/2027", None),
        ("2027-02-03T11:00:00", None),
        ("2027-02-30", None),
        ("31 February 2027", None),
        ("rolling", None),
        ("3 Blarg 2027", None),
        ("2027-02-03T25:00:00Z", None),
    ],
)
def test_deadlines_are_explicit_and_utc(value, expected):
    assert parse_deadline(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, None),
        ("bachelor", "bachelor"),
        ("Master", "master"),
        ("both", "both"),
        ("BSc / MSc", "both"),
        ("Bachelor's or Master's degree", "both"),
        ("undergraduate students", "bachelor"),
        ("bachelor not required", None),
        ("master preferred", None),
        ("bachelor or equivalent experience", None),
    ],
)
def test_degree_conditions_not_keyword_guesses(value, expected):
    assert parse_degree(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, None),
        ("2-4", [2, 3, 4]),
        ("years 1–2", [1, 2]),
        ("2nd year", [2]),
        ("1, 3 or 5", [1, 3, 5]),
        ("2/2/3", [2, 3]),
        ("at least year 2", None),
        ("2+", None),
        ("two years completed by start", None),
        ("2 years completed", None),
        ("year 2 of a 4-year degree", None),
        ("graduating in 2028", None),
        ("penultimate year", None),
        ("4-2", None),
        ("0-7", None),
    ],
)
def test_years_do_not_invent_eligibility(value, expected):
    assert parse_years(value) == expected


def test_missing_values_do_not_mean_open_or_everyone():
    result = validate(normalize(raw(study_year_group="3-4")))
    assert result.deadline is result.posted_at is result.degree_level is result.study_year is None
    assert result.is_active is False


@pytest.mark.parametrize("years", [[True], [0], [7], [2.0], ["2"], "2"])
def test_normalized_year_validation_is_strict(years):
    result = normalize(raw())
    result["study_year"] = years
    with pytest.raises(IngestionError) as error:
        validate(result)
    assert error.value.code == "invalid_study_year"


def test_validation_alias_utc_lists_and_unsupported_shape():
    values = normalize(raw())
    values.update(study_year=[3, 2, 2], deadline="2027-02-03T13:00:00+02:00")
    record = validate(values)
    assert record.study_year == [2, 3]
    assert record.deadline.hour == 11 and record.deadline.tzinfo == UTC
    assert validate(record).model_dump() == record.model_dump()
    values["study_year"] = []
    assert validate(values).study_year is None
    values["deadline"] = "2027-02-03T11:00:00"
    with pytest.raises(IngestionError) as error:
        validate(values)
    assert error.value.code == "invalid_deadline"
    with pytest.raises(IngestionError, match="mapping"):
        validate(42)


@pytest.mark.parametrize(
    ("title", "description", "location", "status"),
    [
        ("Software Intern", "Python", "Romania", "accepted"),
        ("Working Student Data", "SQL", "Remote - EU", "accepted"),
        ("Werkstudent Software", "Python", "Germany", "accepted"),
        ("Engineering Placement", "Robotics", "France", "accepted"),
        ("Senior Software Engineer", "Python", "Germany", "rejected"),
        ("Marketing Intern", "Social media campaigns", "France", "rejected"),
        ("Software Intern", "Python", "Milwaukee, USA", "rejected"),
        ("Software Intern", "Python", "Remote - US only", "rejected"),
        ("Software Intern", "Python", "Remote excluding Europe", "rejected"),
        ("Software Intern", "Python", "Remote", "review"),
        ("Software Intern", "Python", None, "review"),
        ("Software Intern", "Python", "Berlin", "review"),
        ("Software Intern", "Python", "Germany / USA", "review"),
        ("Student Researcher", "Python", "Germany", "review"),
        ("Intern", None, "Germany", "review"),
    ],
)
def test_scope_three_outcomes(title, description, location, status):
    result = assess_scope(title, description, location)
    actual = "review" if result.requires_review else "accepted" if result.accepted else "rejected"
    assert actual == status


def test_cleanup_before_scope_review_persistence_and_structured_rejections(store):
    records = [
        raw("1", title="Software Intern", description="<p>Soft<b>ware</b></p>", location="Germany"),
        raw("2", location="Remote"),
        raw("3", location="Remote - US only"),
        raw("4", deadline_raw="01/02/2027", study_year_raw="2 years completed"),
    ]
    report = IngestionRunner(store).run([FixtureAdapter("fixture", records)])
    counts = report.source("fixture")
    assert (counts.created, counts.rejected, counts.review_required) == (3, 1, 2)
    assert report.totals().review_required == 2
    rows = list(store.session.scalars(select(Opportunity)))
    assert len(rows) == 3 and all(not row.is_active for row in rows)
    assert next(r for r in rows if r.source_id == "4").study_year is None
    codes = {i.code for i in report.issues}
    assert {
        "outside_europe",
        "scope_ambiguous",
        "deadline_unresolved",
        "study_year_unresolved",
    } <= codes
    issue = next(i for i in report.issues if i.code == "outside_europe")
    assert issue.source == "fixture" and issue.record_ref == record_ref("fixture", "3")
    assert report.to_dict()["issues"] and "review_required=2" in report.render()


def test_id_only_retained_for_review_not_given_fake_url(store):
    report = IngestionRunner(store).run([FixtureAdapter("fixture", [raw(source_url=None)])])
    assert report.source("fixture").review_required == 1
    assert report.issues[0].code == "missing_official_url"
    assert not list(store.session.scalars(select(Opportunity)))


def test_report_never_echoes_bad_url_payloads_or_exception_messages(store):
    secret = "sb_secret_do_not_print_this_value"
    adapter = FixtureAdapter("fixture", [raw(source_url=f"https://user:{secret}@example.org/job")])
    report = IngestionRunner(store).run([adapter])
    assert report.issues[0].code == "invalid_url"
    assert secret not in report.render() and secret not in json.dumps(report.to_dict())
    assert "https://" not in report.render()

    def broken(_):
        raise RuntimeError(secret)

    report = IngestionRunner(store, normalizer=broken).run([FixtureAdapter("fixture", [raw()])])
    assert secret not in report.render() and report.source("fixture").failed == 1


def test_partial_generator_failure_and_later_source_survive(store):
    class Partial(FixtureAdapter):
        def fetch(self):
            yield raw()
            raise RuntimeError("secret database URL")

    report = IngestionRunner(store).run(
        [
            Partial("fixture", []),
            FixtureAdapter("later", [raw("2", source="later")]),
        ]
    )
    assert report.failed_sources == ["fixture"]
    assert report.totals().created == 2
    assert report.issues[0].code == "fetch_failed"
    assert "secret database" not in report.render()


def test_record_constraint_rollback_does_not_lose_previous_insert(store):
    store.session.execute(
        text("""CREATE TRIGGER reject_fixture BEFORE INSERT ON opportunities
        WHEN NEW.title = 'Software Intern FAIL' BEGIN SELECT RAISE(ABORT,'secret'); END""")
    )
    records = [raw("1"), raw("2", title="Software Intern FAIL"), raw("3")]
    report = IngestionRunner(store).run([FixtureAdapter("fixture", records)])
    rows = list(store.session.scalars(select(Opportunity)))
    assert {r.source_id for r in rows} == {"1", "3"}
    assert report.source("fixture").created == 2
    assert any(i.code == "persistence_conflict" for i in report.issues)
    assert "secret" not in report.render()


def test_failed_source_commit_rolls_back_and_does_not_suppress_next_source(store):
    class FailOnce(OpportunityStore):
        fail = True

        def commit(self):
            if self.fail:
                self.fail = False
                raise RuntimeError("secret")
            super().commit()

    records = [raw()]
    report = IngestionRunner(FailOnce(store.session)).run(
        [
            FixtureAdapter("fixture", records),
            FixtureAdapter("fixture", records),
        ]
    )
    assert len(list(store.session.scalars(select(Opportunity)))) == 1
    assert report.source("fixture").created == 1
    assert report.source("fixture").failed == 1
    assert any(i.code == "source_commit_failed" for i in report.issues)


def test_custom_dedupe_failure_raw_errors_and_source_mismatch_are_isolated(store):
    def bad_dedupe(record):
        if record.source_id == "1":
            raise RuntimeError("secret")
        return False

    report = IngestionRunner(store, dedupe=bad_dedupe).run(
        [
            FixtureAdapter("fixture", [raw(), raw("2"), raw("3", source="wrong"), {}]),
        ]
    )
    assert report.source("fixture").created == 1
    assert report.source("fixture").failed == 3
    assert {"dedupe_failed", "source_mismatch", "invalid_raw_source"} <= {
        i.code for i in report.issues
    }
    assert "secret" not in report.render()


def test_custom_model_hook_and_invalid_output_are_supported(store):
    runner = IngestionRunner(store, normalizer=lambda r: validate(normalize(r)), dry_run=True)
    assert runner.run([FixtureAdapter("fixture", [raw()])]).totals().would_create == 1
    report = IngestionRunner(store, normalizer=lambda r: 42).run(
        [FixtureAdapter("fixture", [raw()])]
    )
    assert report.issues[0].code == "invalid_record"
    with pytest.raises(IngestionError):
        validate({**normalize(raw()), "is_active": True})
    with pytest.raises(IngestionError):
        validate({**normalize(raw()), "title": "\x00"})


def test_source_labels_cannot_echo_credentials():
    from opportunity_api.ingestion.report import IngestionReport

    report = IngestionReport()
    report.source("sb_secret_hidden")
    assert "sb_secret_hidden" not in report.render()


def test_regression_model_normalizer_retains_review_metadata(store):
    candidate = raw(
        deadline_raw="01/02/2027",
        degree_level_raw="master preferred",
        study_year_raw="two years completed by start",
    )
    prepared = validate(normalize(candidate))
    assert "_review_notices" not in prepared.model_dump()
    revalidated = validate(prepared)
    assert revalidated._requires_review
    assert revalidated._review_notices == prepared._review_notices
    report = IngestionRunner(store, normalizer=lambda r: validate(normalize(r))).run(
        [FixtureAdapter("fixture", [candidate])]
    )
    assert report.totals().created == 1 and report.totals().review_required == 1
    assert {i.code for i in report.issues} == {
        "deadline_unresolved",
        "degree_level_unresolved",
        "study_year_unresolved",
    }
    saved = store.session.scalar(select(Opportunity))
    assert saved.deadline is saved.degree_level is saved.study_year is None
    assert not saved.is_active
    queued = report.to_dict()["review_records"]
    assert len(queued) == 1
    assert queued[0]["opportunity_id"] == str(saved.id)
    assert queued[0]["persistence"] == "persisted"


@pytest.mark.parametrize("model_hook", [False, True])
def test_regression_active_reimport_requiring_review_deactivates_without_data_change(
    store, model_hook
):
    IngestionRunner(store).run([FixtureAdapter("fixture", [raw()])])
    saved = store.session.scalar(select(Opportunity))
    original_id = saved.id
    saved.is_active = True  # fixture's prior explicit approval
    store.session.commit()
    candidate = raw(deadline_raw="01/02/2027", study_year_raw="two years completed by start")
    hooks = {"normalizer": lambda r: validate(normalize(r))} if model_hook else {}
    report = IngestionRunner(store, **hooks).run([FixtureAdapter("fixture", [candidate])])
    assert report.totals().updated == 1 and report.totals().review_required == 1
    assert saved.id == original_id and not saved.is_active
    assert report.review_records()[0]["opportunity_id"] == str(original_id)
    # Ordinary clean imports never grant publication approval after a hold.
    IngestionRunner(store).run([FixtureAdapter("fixture", [raw()])])
    assert not saved.is_active


@pytest.mark.parametrize(
    "changed", [{"title": "Senior Software Engineer"}, {"location": "New York, USA"}]
)
def test_regression_validator_cannot_bypass_final_scope(store, changed):
    def rewrite(value):
        result = validate(value)
        for field, replacement in changed.items():
            setattr(result, field, replacement)
        return result

    report = IngestionRunner(store, validate=rewrite).run([FixtureAdapter("fixture", [raw()])])
    assert report.totals().rejected == 1 and report.totals().accepted == 0
    assert report.totals().created == 0
    assert not list(store.session.scalars(select(Opportunity)))
    assert report.issues[-1].code in {"not_student_role", "outside_europe"}


def test_regression_final_ambiguous_scope_is_review_not_plain_inactive(store):
    def move_to_remote(value):
        result = validate(value)
        result.location = "Remote"
        return result

    plain = IngestionRunner(store).run([FixtureAdapter("fixture", [raw("plain")])])
    assert plain.review_records() == []
    report = IngestionRunner(store, validate=move_to_remote).run(
        [FixtureAdapter("fixture", [raw("review")])]
    )
    saved = list(store.session.scalars(select(Opportunity)))
    assert len(saved) == 2 and all(not row.is_active for row in saved)
    review = report.review_records()
    assert len(review) == 1 and review[0]["codes"] == ["scope_ambiguous"]
    assert review[0]["opportunity_id"] == str(next(r.id for r in saved if r.source_id == "review"))


def test_regression_marketing_pronoun_it_is_not_stem(store):
    candidate = raw(
        title="Marketing Intern",
        description="It is an opportunity to create social media campaigns.",
    )
    report = IngestionRunner(store).run([FixtureAdapter("fixture", [candidate])])
    assert report.totals().rejected == 1 and report.issues[0].code == "not_stem"
    assert not list(store.session.scalars(select(Opportunity)))


@pytest.mark.parametrize(
    ("title", "description", "status"),
    [
        ("IT Intern", "Help the team", "accepted"),
        ("IT Support Working Student", None, "accepted"),
        ("Information Technology Intern", None, "accepted"),
        ("Intern", "It is a great opportunity", "review"),
        ("Intern", "IT", "review"),
        ("Intern", "it", "review"),
    ],
)
def test_regression_it_needs_explicit_domain_context(title, description, status):
    decision = assess_scope(title, description, "Germany")
    actual = (
        "review" if decision.requires_review else "accepted" if decision.accepted else "rejected"
    )
    assert actual == status


def test_regression_validator_rebuild_cannot_erase_source_review(store):
    report = IngestionRunner(store, validate=lambda value: validate(value).model_dump()).run(
        [FixtureAdapter("fixture", [raw(deadline_raw="01/02/2027")])]
    )
    assert report.totals().review_required == 1
    assert report.review_records()[0]["codes"] == ["deadline_unresolved"]


def test_regression_dedupe_hook_cannot_mutate_final_values(store):
    def mutate(record):
        record.location = "USA"
        return False

    report = IngestionRunner(store, dedupe=mutate).run([FixtureAdapter("fixture", [raw()])])
    assert report.issues[0].code == "dedupe_mutated_record"
    assert not list(store.session.scalars(select(Opportunity)))


def test_regression_review_report_distinguishes_unsaved_dry_run_and_rollback(store):
    missing = IngestionRunner(store).run([FixtureAdapter("fixture", [raw(source_url=None)])])
    assert missing.review_records()[0]["persistence"] == "not_persisted"
    assert missing.review_records()[0]["opportunity_id"] is None
    dry = IngestionRunner(store, dry_run=True).run(
        [FixtureAdapter("fixture", [raw(location="Remote")])]
    )
    assert dry.review_records()[0]["persistence"] == "dry_run"

    class FailCommit(OpportunityStore):
        def commit(self):
            raise RuntimeError("fixture failure")

    failed = IngestionRunner(FailCommit(store.session)).run(
        [FixtureAdapter("fixture", [raw(location="Remote")])]
    )
    assert failed.review_records()[0]["persistence"] == "rolled_back"
    assert failed.review_records()[0]["opportunity_id"] is None
    assert not list(store.session.scalars(select(Opportunity)))


def test_regression_dedupe_cannot_clear_review_metadata(store):
    IngestionRunner(store).run([FixtureAdapter("fixture", [raw()])])
    saved = store.session.scalar(select(Opportunity))
    saved.is_active = True
    store.session.commit()

    def clear_metadata(record):
        record._requires_review = False
        record._review_notices = ()
        return False

    report = IngestionRunner(store, dedupe=clear_metadata).run(
        [FixtureAdapter("fixture", [raw(deadline_raw="01/02/2027")])]
    )
    assert report.totals().review_required == 1 and not saved.is_active


def test_regression_explicit_model_review_flag_survives_revalidation(store):
    prepared = validate(normalize(raw()))
    prepared._requires_review = True
    assert validate(prepared)._requires_review
    report = IngestionRunner(store, normalizer=lambda _: prepared).run(
        [FixtureAdapter("fixture", [raw()])]
    )
    assert report.totals().review_required == 1
    assert report.review_records()[0]["codes"] == ["review_required"]
    assert not store.session.scalar(select(Opportunity)).is_active


@pytest.mark.parametrize("callback_duplicate", [False, True])
def test_regression_review_duplicate_hold_rollback_is_reported_truthfully(
    store, callback_duplicate
):
    IngestionRunner(store).run([FixtureAdapter("fixture", [raw()])])
    saved = store.session.scalar(select(Opportunity))
    saved.is_active = True
    store.session.commit()

    class FailCommit(OpportunityStore):
        def commit(self):
            raise RuntimeError("fixture failure")

    candidate = raw(deadline_raw="01/02/2027")
    if not callback_duplicate:
        candidate = candidate.model_copy(update={"source": "other"})
    hooks = {"dedupe": lambda _: True} if callback_duplicate else {}
    report = IngestionRunner(FailCommit(store.session), **hooks).run(
        [FixtureAdapter(candidate.source, [candidate])]
    )
    assert saved.is_active  # The failed commit did not persist the publication hold.
    assert report.review_records()[0]["persistence"] == "rolled_back"
    assert report.review_records()[0]["opportunity_id"] is None


def test_regression_export_review_report_roundtrip_and_retention(store, tmp_path):
    records = [raw("review", location="Remote"), raw("plain"), raw("missing", source_url=None)]
    report = IngestionRunner(store).run([FixtureAdapter("fixture", records)])
    destination = report.export_json(tmp_path / "run-001.json")
    saved_payload = json.loads(destination.read_text(encoding="utf-8"))
    assert saved_payload == report.to_dict()
    assert len(saved_payload["review_records"]) == 2
    assert {r["persistence"] for r in saved_payload["review_records"]} == {
        "persisted",
        "not_persisted",
    }
    review_row = store.session.scalar(select(Opportunity).where(Opportunity.source_id == "review"))
    assert str(review_row.id) in {r["opportunity_id"] for r in saved_payload["review_records"]}
    # A later run has its own snapshot and cannot change the earlier review evidence.
    later = IngestionRunner(store).run([FixtureAdapter("fixture", [raw("plain")])])
    later.export_json(tmp_path / "run-002.json")
    assert json.loads(destination.read_text(encoding="utf-8")) == saved_payload
    assert (
        json.loads((tmp_path / "run-002.json").read_text(encoding="utf-8"))["review_records"] == []
    )


def test_regression_export_report_refuses_overwrite_and_preserves_utf8(tmp_path):
    from opportunity_api.ingestion.report import IngestionReport

    report = IngestionReport()
    report.issue("fixture", "1", "scope", "scope_ambiguous", "Eligibilitate neclară", "review")
    destination = report.export_json(tmp_path / "review.json")
    original = destination.read_bytes()
    assert "neclară" in original.decode("utf-8")
    with pytest.raises(FileExistsError):
        report.export_json(destination)
    assert destination.read_bytes() == original
