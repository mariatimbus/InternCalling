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
        {"title": "Dean's List", "receivedDate": "2023", "description": ""},
        {"title": "2nd Place – National Olympiad", "receivedDate": "2022", "description": ""},
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


# Synthetic CV with the layout that used to split projects in two: a subtitle line under
# each title, one date at the end of the title line, an ALL-CAPS heading the parser does
# not know, two languages on one line and a detail line under an award.
LAYOUT = """
TECHNICAL SKILLS
Programming: C, C++, Python
Hardware: Arduino Uno, Servo Motor Control
Concepts: Power Iteration, Image
Processing, Computer Vision
Tools: Git, AutoCAD
PROJECTS
Campus Rover | Hardware & Embedded Programming Jun 2026
University Project – Computer Systems Architecture
• Built a rover on an Arduino Uno with servo steering written in C++.
• Added obstacle detection and automatic stop.
Plant Watering Alarm | GitHub Repository May 2026
Python – Computer Vision & Linear Algebra
• Detected dry soil from webcam frames with Image Processing and Power Iteration.
Bridge Model | AutoCAD May 2026
University Project – Computer-Aided Design
• Drew 2D plans and a 3D model.
RESEARCH INTERESTS
Embedded Systems, Circuit Design, PCB Development.
ADDITIONAL LEARNING
Intro to Robotics Certificate In Progress
Object-Oriented Programming in C++ – Microsoft In Progress
HONORS & AWARDS
Second Place – National Robotics Contest Mar 2025
Spring Edition | Robotics League | Finals
LANGUAGES
Romanian: Native English: C2
"""


def test_project_subtitles_single_dates_and_unknown_headings():
    found = {}
    for candidate in propose(LAYOUT):
        found.setdefault(candidate["section"], []).append(candidate["values"])
    rover, alarm, bridge = found["projects"]  # exactly three: no title-only duplicates
    assert rover["name"] == "Campus Rover" and rover["role"] == "Hardware & Embedded Programming"
    assert (rover["startDate"], rover["endDate"]) == ("2026-06", "2026-06")
    assert rover["description"].startswith("University Project – Computer Systems Architecture\n")
    assert "obstacle detection" in rover["description"]
    assert set(rover["technologies"]) == {"Arduino Uno", "C++"}
    assert alarm["role"] == ""  # "GitHub Repository" is a link, not a role
    # The subtitle names Python and Computer Vision; the bullet names the other two.
    assert set(alarm["technologies"]) == {
        "Python",
        "Computer Vision",
        "Image Processing",
        "Power Iteration",
    }
    assert (bridge["role"], bridge["technologies"]) == ("", ["AutoCAD"])
    assert found["certificates"] == [
        {"name": "Object-Oriented Programming in C++", "organization": "Microsoft", "issueDate": ""}
    ]
    [award] = found["honours"]
    assert award["receivedDate"] == "2025-03"
    assert award["description"] == "Spring Edition | Robotics League | Finals"
    assert found["languages"] == [
        {"name": "Romanian", "cefr": "", "native": True},
        {"name": "English", "cefr": "C2", "native": False},
    ]
