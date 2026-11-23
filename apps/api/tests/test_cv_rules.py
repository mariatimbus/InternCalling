"""Deterministic CV extraction: explicit facts only, each quoted from the synthetic CV."""

import re

import pytest

from opportunity_api.ai import rules

CATALOG = ["python", "sql", "java", "javascript", "react", "c++", "c#", "node.js", "go", "docker"]

ENGLISH = """Ana Popescu
Bucharest, Romania | ana@example.invalid
EDUCATION
University Politehnica of Bucharest | BSc Computer Science | 2022 – 2026
SKILLS
Python, SQL, JavaScript, React, C++, Node.js, Docker
I like to go hiking.
"""

ROMANIAN = """Ioan Marin
Cluj-Napoca
Educație
Universitatea Babeș-Bolyai, 2021 - 2024
Licență în Informatică
Master în Inteligență Artificială (absolvire estimată 2026)
Competențe: Java, SQL, Go
"""


def normalized(value):
    return re.sub(r"\s+", " ", str(value)).strip().casefold()


def quoted_in(extraction, text):
    source = normalized(text)
    for name in type(extraction).model_fields:
        value = getattr(extraction, name)
        for fact in value if isinstance(value, list) else [value] if value else []:
            assert normalized(fact.evidence) in source, name


def test_english_cv_core_facts():
    result = rules.extract(ENGLISH, CATALOG)
    assert result.degree_level.value == "bachelor"
    assert result.university.value == "University Politehnica of Bucharest"
    assert result.field_of_study.value == "Computer Science"
    assert result.graduation_year.value == 2026
    assert result.location.value == "Bucharest"
    assert result.headline is None and result.interests == []
    quoted_in(result, ENGLISH)


def test_skill_boundaries_avoid_partial_and_everyday_words():
    skills = rules.extract(ENGLISH, CATALOG).values_for("skills")
    assert skills == ["c++", "docker", "javascript", "node.js", "python", "react", "sql"]
    assert "java" not in skills  # only appears inside "JavaScript"
    assert "go" not in skills  # "go hiking" is a verb, not the Go language


def test_ordinary_lowercase_mentions_still_count():
    text = "Fixture University\nBachelor student\nTools: python and docker"
    assert rules.extract(text, CATALOG).values_for("skills") == ["docker", "python"]


def test_romanian_cv_prefers_master_and_explicit_graduation():
    result = rules.extract(ROMANIAN, CATALOG)
    assert result.degree_level.value == "master"
    assert result.university.value == "Universitatea Babeș-Bolyai"
    # All facts describe the same (master's) programme, not the earlier licence.
    assert result.field_of_study.value == "Inteligență Artificială"
    assert result.graduation_year.value == 2026  # "absolvire estimată 2026" wins over 2024
    assert result.location.value == "Cluj-Napoca"
    assert result.values_for("skills") == ["go", "java", "sql"]
    quoted_in(result, ROMANIAN)


def test_field_on_its_own_line_next_to_university():
    text = "Fixture University\nComputer Science\nBachelor student\nGraduation 2027\nPython\nBerlin"
    result = rules.extract(text, CATALOG)
    assert result.field_of_study.value == "Computer Science"
    assert result.graduation_year.value == 2027
    assert result.location.value == "Berlin"


def test_field_after_degree_phrase_when_not_in_known_list():
    text = "Master of Science in Quantum Engineering at Delft University, 2025"
    result = rules.extract(text, [])
    assert result.field_of_study.value == "Quantum Engineering"
    assert result.degree_level.value == "master"


def test_nothing_explicit_raises():
    with pytest.raises(ValueError):
        rules.extract("Hello world\nThis document has no profile facts.", CATALOG)


def test_unrelated_years_are_not_graduation_years():
    text = "Fixture University\nBachelor student\n\n\n\nVolunteer 2019 at a charity"
    assert rules.extract(text, []).graduation_year is None


def test_long_lines_keep_evidence_within_limits():
    text = "Skills: " + "filler " * 200 + "Python" + " more" * 200 + "\nFixture University"
    result = rules.extract(text, CATALOG)
    fact = result.skills[0]
    assert fact.value == "python" and len(fact.evidence) <= 500 and "Python" in fact.evidence
    quoted_in(result, text)


def test_verify_quotes_rejects_invented_evidence():
    result = rules.extract(ENGLISH, CATALOG)
    result.university.evidence = "Invented University"
    with pytest.raises(ValueError):
        rules.verify_quotes(result, ENGLISH)


def test_date_only_line_below_university_is_used():
    text = "Fixture University\nSept 2022 – June 2026\nBachelor student"
    assert rules.extract(text, []).graduation_year.value == 2026


def test_degree_line_field_beats_faculty_name():
    text = (
        "Universitatea Politehnica Timisoara - Facultatea de Automatica si Calculatoare\n"
        "Bachelor of Engineering in Computer Engineering, Oct 2022 - Jul 2026 (expected)"
    )
    result = rules.extract(text, [])
    assert result.field_of_study.value == "Computer Engineering"
    assert result.university.value == "Universitatea Politehnica Timisoara"
    assert result.graduation_year.value == 2026


# Mirrors a real CV whose PDF text puts work experience (mentioning a university)
# before the Education section, uses dotted degree abbreviations and lists two degrees.
TWO_DEGREES = "\n".join(
    [
        "Jane Student",
        "Bucharest, Romania | jane@example.invalid",
        "Research Assistant | Faculty of Physics, University of Bucharest / Institute of Space"
        " Science Sep 2023 – Oct 2025",
        "Skills",
        "Python, C++, SQL",
        "University of Bucharest – Faculty of Mathematics and Computer Science"
        " Oct 2025 – Jun 2029 (Expected)",
        "B.E., Computer Engineering",
        "Relevant Coursework: Numerical Methods, Statistics, Linear Algebra",
        "Bucharest University of Economic Studies (ASE) – B.S., Management"
        " Oct 2025 – Jun 2028 (Expected)",
    ]
)


def test_degree_entry_beats_university_mentioned_in_experience():
    result = rules.extract(TWO_DEGREES, CATALOG)
    assert result.degree_level.value == "bachelor"  # "B.E." is a bachelor's degree
    assert result.university.value == "University of Bucharest"
    assert result.field_of_study.value == "Computer Engineering"
    assert result.graduation_year.value == 2029
    assert result.location.value == "Bucharest"
    quoted_in(result, TWO_DEGREES)


def test_two_degrees_are_never_mixed():
    text = (
        "Bucharest University of Economic Studies (ASE) Oct 2025 – Jun 2028 (expected)\n"
        "B.S. in Management\n"
        "Relevant Coursework: Statistics, Macroeconomics\n"
        "University of Bucharest – Faculty of Mathematics and Computer Science 2025 – 2029\n"
        "B.E. in Computer Engineering\n"
    )
    result = rules.extract(text, [])
    assert (
        result.university.value,
        result.field_of_study.value,
        result.graduation_year.value,
    ) == ("Bucharest University of Economic Studies (ASE)", "Management", 2028)


def test_master_degree_is_the_anchor_when_present():
    text = (
        "Politehnica University of Bucharest, 2019 - 2023\nB.Sc. in Computer Science\n"
        "University of Amsterdam, 2024 - 2026 (expected)\nM.Sc. in Artificial Intelligence\n"
    )
    result = rules.extract(text, [])
    assert result.degree_level.value == "master"
    assert result.university.value == "University of Amsterdam"
    assert result.field_of_study.value == "Artificial Intelligence"
    assert result.graduation_year.value == 2026


@pytest.mark.parametrize(
    "line",
    ["B.E., Computer Engineering", "B.S. in Management", "B.A. History", "B.Tech in Robotics"],
)
def test_dotted_bachelor_abbreviations(line):
    assert rules.extract(f"Fixture University\n{line}", []).degree_level.value == "bachelor"


def test_coursework_is_not_a_field_of_study():
    text = "Fixture University\nBachelor student\nRelevant Coursework: Statistics, Physics"
    assert rules.extract(text, []).field_of_study is None
