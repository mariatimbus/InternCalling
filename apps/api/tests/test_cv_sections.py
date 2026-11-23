"""Deterministic CV section proposals from synthetic CV text (no real personal data)."""

from opportunity_api.ai.sections import propose

CV = """Jane Student
Bucharest, Romania ⋄ jane@example.invalid ⋄ /github GitHub
Experience
Software Engineering Intern /github | Acme SRL | Jun 2025 – Sep 2025
Cluj-Napoca, Romania
• Built a Python service used by 3 teams and reduced
manual checks across the release process.
• Cut CI time by 40%
Robotics Club – Team Leader Sep 2021 – Present
• Led 25 members
Projects
Chess Engine /github |C++, CMake Jan 2024 – Mar 2024
• Alpha-beta search
Tech: Catch2
Weather App
• Small React app
Extracurricular Acti
Debate Society – Volunteer Oct 2022 – Jun 2023
Awards, Certifications & Simulations
• Dean's List (2023); 2nd Place – National Olympiad (2022)
• Certifications: AWS Cloud Practitioner – Amazon Web Services (2024)
• Simulation: Bank Forage (Jul 2026)
Languages
Romanian (native), English – C1, French B1
Education
University of Bucharest
"""


def by_section(text=CV):
    found = {}
    for candidate in propose(text):
        found.setdefault(candidate["section"], []).append(candidate["values"])
    return found


def test_experience_entries_with_location_wrapped_bullets_and_role_order():
    first, second, volunteer = by_section()["experience"]
    assert first == {
        "role": "Software Engineering Intern",
        "organization": "Acme SRL",
        "location": "Cluj-Napoca, Romania",
        "startDate": "2025-06",
        "endDate": "2025-09",
        "current": False,
        "achievements": "Built a Python service used by 3 teams and reduced manual checks "
        "across the release process.\nCut CI time by 40%",
    }
    assert (second["role"], second["organization"]) == ("Team Leader", "Robotics Club")
    assert second["current"] and second["endDate"] == ""
    # "Extracurricular Acti" (a lost ligature) still opens an experience-like section.
    assert (volunteer["role"], volunteer["organization"]) == ("Volunteer", "Debate Society")


def test_projects_split_stack_and_short_titles():
    chess, weather = by_section()["projects"]
    assert chess["name"] == "Chess Engine"
    assert chess["technologies"] == ["C++", "CMake", "Catch2"]
    assert (chess["startDate"], chess["endDate"]) == ("2024-01", "2024-03")
    assert weather["name"] == "Weather App" and weather["description"] == "Small React app"


def test_awards_certificates_and_languages():
    found = by_section()
    assert found["honours"] == [
        {"title": "Dean's List", "receivedDate": "2023"},
        {"title": "2nd Place – National Olympiad", "receivedDate": "2022"},
    ]
    assert found["certificates"] == [
        {
            "name": "AWS Cloud Practitioner",
            "organization": "Amazon Web Services",
            "issueDate": "2024",
        }
    ]
    assert found["languages"] == [
        {"name": "Romanian", "cefr": "", "native": True},
        {"name": "English", "cefr": "C1", "native": False},
        {"name": "French", "cefr": "B1", "native": False},
    ]


def test_repeated_text_layer_is_proposed_once_and_keys_are_unique():
    doubled = CV + "\n" + CV
    candidates = propose(doubled)
    assert len(candidates) == len(propose(CV))
    assert len({c["key"] for c in candidates}) == len(candidates)


def test_incomplete_entries_are_not_guessed():
    text = "Experience\nIntern at Acme\nCertifications\nAWS Cloud Practitioner (2024)\n"
    assert propose(text) == []  # no dates for the job, no issuer for the certificate
