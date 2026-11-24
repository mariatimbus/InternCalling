import json

import httpx

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
