import json

import httpx
import pytest

from opportunity_api.catalog_presentation import clean_ats_markers, english_text, source_hash
from opportunity_api.ingestion.translate import source_language, translate, translation_source


def test_ats_cleanup_preserves_prose_links_and_non_ats_hashtags():
    assert (
        clean_ats_markers(
            r"\#li-Hybrid"
            + "\n#LI-AG4\nHybrid role. #LI-Remote\nhttps://example.org/#li-hybrid\nC# #opensource"
        )
        == "Hybrid role.\nhttps://example.org/#li-hybrid\nC# #opensource"
    )


def test_changing_job_board_promotions_does_not_invalidate_the_employer_translation():
    body = "Build software for our team."
    a = body + "\nFind Jobs in Germany on Arbeitnow"
    b = body + "\nFind more English Speaking Jobs in Germany on Arbeitnow"
    assert source_hash("Engineer", a) == source_hash("Engineer", b)
    assert clean_ats_markers(a) == body


def test_translation_is_bound_to_exact_source_and_never_required(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_OPPORTUNITY_TRANSLATIONS_DIR", str(tmp_path))
    title, description = "Werkstudent IT", "Deine Aufgaben\n• Entwickle Software. #LI-AG4"
    assert english_text(title, description) == (title, "Deine Aufgaben\n• Entwickle Software.")
    digest = source_hash(title, description)
    path = tmp_path / (digest + ".json")
    path.write_text(
        json.dumps(
            {
                "source_hash": digest,
                "title": "IT Working Student",
                "description": "Responsibilities\n• Develop software.",
            }
        )
    )
    assert english_text(title, description) == (
        "IT Working Student",
        "Responsibilities\n• Develop software.",
    )
    assert english_text(title, description + "\nNew requirement") == (
        title,
        "Deine Aufgaben\n• Entwickle Software.\nNew requirement",
    )
    path.write_text("not JSON")
    assert english_text(title, description)[0] == title
    path.write_text(json.dumps({"source_hash": "wrong", "title": "Wrong", "description": "Wrong"}))
    assert english_text(title, description)[0] == title


def test_translation_preserves_working_student_contract_and_detects_catalog_languages():
    source = "Werkstudent:in IT\nWir suchen Werkstudenten und Praktikanten."
    assert (
        translation_source(source, "German")
        == "Working Student IT\nWir suchen Working Student und Praktikanten."
    )
    assert source_language("Werkstudent IT", "Find Jobs in Germany on Arbeitnow") == "German"
    assert (
        source_language("Developer", "We build tools and you will work with our team.") == "English"
    )
    assert (
        source_language("Data", "Nous recherchons une personne pour rejoindre notre équipe.")
        == "French"
    )
    assert (
        source_language("Data", "Je werkt met onze mensen aan het verbeteren van de zorg.")
        == "Dutch"
    )


def test_translated_description_cannot_replace_an_already_english_role_title():
    client = httpx.Client(
        base_url="http://local.test",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "done": True,
                    "message": {
                        "content": "Software Engineer Intern\nBuild software for customers."
                    },
                },
            )
        ),
    )
    title, text = translate(
        client,
        "test",
        "Forward Deployed Software Engineer, Internship",
        "Nous construisons des logiciels pour nos clients.",
        "French",
    )
    assert title == "Forward Deployed Software Engineer, Internship"
    assert text == "Build software for customers."


def test_translated_title_preserves_an_explicit_working_student_contract():
    with httpx.Client(
        base_url="http://local.test",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "done": True,
                    "message": {
                        "content": (
                            "IT Intern (m/f/d)\n"
                            "Working student role: help build software for our team."
                        )
                    },
                },
            )
        ),
    ) as client:
        title, _ = translate(
            client,
            "test",
            "Werkstudent IT (m/w/d)",
            "Wir suchen dich für unser IT-Team und entwickeln Software.",
            "German",
        )
    assert title == "IT Working Student (m/f/d)"


def test_mixed_description_translates_foreign_requirements_even_when_english_dominates():
    description = (
        "You will work with our team and build software for our customers. " * 8
        + "\nVous devez être inscrit dans une université et avoir votre permis de travail."
    )
    assert source_language("Software Intern", description) == "French"


def test_translation_rejects_missing_numeric_requirements():
    import pytest

    with (
        httpx.Client(
            base_url="http://local.test",
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    json={
                        "done": True,
                        "message": {
                            "content": (
                                "Engineering Intern\nWe offer a paid internship for students."
                            )
                        },
                    },
                )
            ),
        ) as client,
        pytest.raises(ValueError, match="number"),
    ):
        translate(
            client, "test", "Praktikum Engineering", "Wir bieten 1200 Euro für 6 Monate.", "German"
        )


def test_check_reports_untranslated_catalog_without_model_or_cache_writes(
    tmp_path, monkeypatch, capsys
):
    import sys

    import pytest

    from opportunity_api.ingestion import translate as command

    monkeypatch.setenv("APP_OPPORTUNITY_TRANSLATIONS_DIR", str(tmp_path / "missing"))
    monkeypatch.setattr(sys, "argv", ["translate", "--check"])
    real_client = httpx.Client
    requests = []

    def client(**kwargs):
        def respond(request):
            requests.append(request)
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "title": "Werkstudent IT",
                            "description": "Wir suchen dich für unser Team.",
                        }
                    ],
                    "total": 1,
                },
            )

        return real_client(**kwargs, transport=httpx.MockTransport(respond))

    monkeypatch.setattr(command.httpx, "Client", client)
    with pytest.raises(SystemExit) as exit_info:
        command.main()
    assert exit_info.value.code == 1
    assert len(requests) == 1
    assert "missing: 1" in capsys.readouterr().out
    assert not (tmp_path / "missing").exists()


def test_preparation_repairs_invalid_cache_instead_of_skipping_existing_file(
    tmp_path, monkeypatch, capsys
):
    import sys

    from opportunity_api.ingestion import translate as command

    monkeypatch.setenv("APP_OPPORTUNITY_TRANSLATIONS_DIR", str(tmp_path))
    monkeypatch.setattr(sys, "argv", ["translate"])
    title, description = "Werkstudent IT", "Wir suchen dich für unser Team."
    path = tmp_path / (source_hash(title, description) + ".json")
    path.write_text("not JSON")
    real_client = httpx.Client
    calls = []

    def client(**kwargs):
        def respond(request):
            calls.append(request.method)
            if request.method == "GET":
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            {
                                "title": title,
                                "description": description,
                            }
                        ],
                        "total": 1,
                    },
                )
            return httpx.Response(
                200,
                json={
                    "done": True,
                    "message": {
                        "content": "IT Working Student\nWe are looking for you to join our team."
                    },
                },
            )

        return real_client(**kwargs, transport=httpx.MockTransport(respond))

    monkeypatch.setattr(command.httpx, "Client", client)
    command.main()
    assert calls == ["GET", "POST"]
    assert english_text(title, description) == (
        "IT Working Student",
        "We are looking for you to join our team.",
    )
    assert "Translated: 1" in capsys.readouterr().out


def test_translation_accepts_english_number_grouping_without_changing_values():
    with httpx.Client(
        base_url="http://local.test",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "done": True,
                    "message": {
                        "content": (
                            "Engineering Internship\nWe support 27,000 clients "
                            "and pay 66.60 euros per month."
                        )
                    },
                },
            )
        ),
    ) as client:
        _, description = translate(
            client,
            "test",
            "Stage ingénieur",
            "Nous accompagnons 27 000 clients et payons 66,60 euros par mois.",
            "French",
        )
    assert "27,000" in description
    assert "66.60" in description


def test_translation_preserves_numeric_frequency_rendered_as_twice():
    with httpx.Client(
        base_url="http://local.test",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "done": True,
                    "message": {"content": "Engineering Internship\nOur team meets twice a month."},
                },
            )
        ),
    ) as client:
        _, description = translate(
            client,
            "test",
            "Stage ingénieur",
            "Notre équipe se réunit 2 fois par mois.",
            "French",
        )
    assert "twice a month" in description


def test_translation_worker_retries_api_and_model_then_skips_valid_cache(
    tmp_path, monkeypatch, capsys
):
    import sys
    import time

    import pytest

    from opportunity_api.ingestion import translate as command

    monkeypatch.setenv("APP_OPPORTUNITY_TRANSLATIONS_DIR", str(tmp_path))
    monkeypatch.setattr(sys, "argv", ["translate", "--watch", "--interval", "30"])
    real_client = httpx.Client
    methods, sleeps = [], []
    polls = model_calls = 0

    def respond(request):
        nonlocal polls, model_calls
        methods.append(request.method)
        if request.method == "GET":
            polls += 1
            if polls == 1:
                return httpx.Response(503, text="sensitive response body")
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "title": "Werkstudent IT",
                            "description": (
                                "Wir suchen dich für unser Team."
                                + (" Du hilfst bei Software." if polls == 5 else "")
                            ),
                        }
                    ],
                    "total": 1,
                },
            )
        model_calls += 1
        if model_calls == 1:
            return httpx.Response(503, text="sensitive response body")
        return httpx.Response(
            200,
            json={
                "done": True,
                "message": {
                    "content": "IT Working Student\nWe are looking for you to join our team.",
                },
            },
        )

    def sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 5:
            raise KeyboardInterrupt

    monkeypatch.setattr(
        command.httpx,
        "Client",
        lambda **kwargs: real_client(**kwargs, transport=httpx.MockTransport(respond)),
    )
    monkeypatch.setattr(time, "sleep", sleep)
    with pytest.raises(KeyboardInterrupt):
        command.main()
    assert methods == ["GET", "GET", "POST", "GET", "POST", "GET", "GET", "POST"]
    assert sleeps == [30] * 5
    assert len(list(tmp_path.glob("*.json"))) == 2
    assert "sensitive response body" not in capsys.readouterr().out
    assert (
        english_text("Werkstudent IT", "Wir suchen dich für unser Team.")[0] == "IT Working Student"
    )


@pytest.mark.parametrize(
    "options",
    [
        ["--watch", "--interval", "1"],
        ["--watch", "--interval", "86401"],
        ["--watch", "--check"],
        ["--watch", "--dry-run"],
    ],
)
def test_translation_worker_rejects_unsafe_interval_or_one_shot_mode(options, monkeypatch):
    import sys

    from opportunity_api.ingestion.translate import main

    monkeypatch.setattr(sys, "argv", ["translate", *options])
    with pytest.raises(SystemExit) as result:
        main()
    assert result.value.code == 2


def test_public_display_and_worker_repair_non_english_cache_at_original_source_hash(
    tmp_path, monkeypatch
):
    import sys

    from opportunity_api.ingestion import translate as command

    monkeypatch.setenv("APP_OPPORTUNITY_TRANSLATIONS_DIR", str(tmp_path))
    title, description = "Werkstudent IT", "Wir suchen dich für unser Team."
    digest = source_hash(title, description)
    path = tmp_path / (digest + ".json")
    path.write_text(
        json.dumps(
            {
                "source_hash": digest,
                "title": "Werkstudent Software",
                "description": "Du arbeitest mit uns und entwickelst unsere Software.",
            }
        )
    )
    real_client = httpx.Client
    requests = []

    def respond(request):
        requests.append(request.method)
        if request.method == "GET":
            # Exercise the real API presentation boundary, rather than returning raw fixtures.
            display_title, display_description = english_text(title, description)
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "title": display_title,
                            "description": display_description,
                        }
                    ],
                    "total": 1,
                },
            )
        return httpx.Response(
            200,
            json={
                "done": True,
                "message": {
                    "content": "IT Working Student\nWe are looking for you to join our team.",
                },
            },
        )

    monkeypatch.setattr(
        command.httpx,
        "Client",
        lambda **kwargs: real_client(**kwargs, transport=httpx.MockTransport(respond)),
    )
    monkeypatch.setattr(sys, "argv", ["translate", "--check"])
    with pytest.raises(SystemExit) as before:
        command.main()
    assert before.value.code == 1
    monkeypatch.setattr(sys, "argv", ["translate"])
    command.main()
    assert english_text(title, description) == (
        "IT Working Student",
        "We are looking for you to join our team.",
    )
    assert list(tmp_path.glob("*.json")) == [path]
    assert json.loads(path.read_text())["source_hash"] == digest
    monkeypatch.setattr(sys, "argv", ["translate", "--check"])
    command.main()
    assert requests == ["GET", "GET", "POST", "GET"]
