"""Requirement-based matching: what the posting asks for, checked against the profile.

The score is the share of the posting's *stated* requirements the student meets:

    score = 100 x earned / max(sum(weights of the requirements stated), 55)

A requirement the posting does not state is left out entirely, so nobody is
penalised for something the employer never asked for; the floor of 55 keeps a
posting that names no skills or no role from showing a perfect match. Weights:

    skills 35 · role field 20 · languages 15 · experience 10 · eligibility 10 · location 10

What is read from the posting, and what is looked for in the profile:

- skills: technologies named in the posting (structured skills + known terms in the
  text, ``posting_skills``) <-> profile skills, technologies saved in projects and
  experience, and technologies named in certificates. At most ``SKILLS_COUNTED`` count.
- field: the role's domain from its title (software, data, hardware, ...) <-> field of
  study, saved roles and preferred domains. Only the description in that domain: half.
- languages: languages the posting requires, with a CEFR level when it says one
  ("fluent German" = C1), or the posting's own language when it is not English <->
  languages saved in Profile with their level (native counts as C2).
- experience: whether the posting asks for prior experience <-> saved experience in
  the role's domain or using its skills (a relevant project alone: half).
- eligibility: degree level and study year, only when the posting states them.
- location: the posting's place <-> chosen locations, the student's city, remote.
"""

import re
from dataclasses import dataclass, field

from opportunity_api.eligibility.text import graduation_years
from opportunity_api.schemas.eligibility import EligibilityStatus, RuleResult
from opportunity_api.schemas.matching import MatchingOpportunity, MatchingProfile, Requirement

from .scoring import (
    VOCABULARY,
    _country,
    _domains,
    _pattern,
    canonical,
    posting_skills,
    student_domains,
)

WEIGHTS = {
    "skills": 35,
    "field_fit": 20,
    "languages": 15,
    "experience": 10,
    "eligibility": 10,
    "location": 10,
}
SKILLS_COUNTED = 6
# A posting that states only thin requirements cannot score 100: the share is taken over
# at least the two core criteria (skills 35 + role field 20). A posting that names no
# skills or no role can still rank, but never as a perfect match.
MIN_POSSIBLE = 55

CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"]
LANGUAGES = {
    "English": "english|englisch|anglais|inglés|ingles|inglese|engels",
    "German": "german|deutsch|allemand|alemán|aleman|tedesco|duits",
    "French": "french|französisch|franzosisch|français|francais|francés|frances|francese|frans",
    "Spanish": "spanish|spanisch|espagnol|español|espanol|spagnolo|spaans",
    "Italian": "italian|italienisch|italien|italiano|italiaans",
    "Dutch": "dutch|niederländisch|niederlandisch|néerlandais|neerlandais|nederlands",
    "Polish": "polish|polnisch|polonais|polski",
    "Portuguese": "portuguese|portugiesisch|portugais|português|portugues",
    "Romanian": "romanian|rumänisch|rumanisch|roumain|română|romana",
}
_LANG = re.compile(
    r"(?<![\w-])(" + "|".join(LANGUAGES.values()) + r")(?:kenntnisse|sprachkenntnisse)?(?!\w)",
    re.I,
)
_LEVEL_WORDS = [
    (re.compile(r"\b(?:native|mother tongue|muttersprach\w*)\b", re.I), "C2"),
    (
        re.compile(
            r"\b(?:fluent\w*|fluency|business|professional|excellent|very good|proficien\w*|"
            r"fließend\w*|fliessend\w*|verhandlungssicher\w*|sehr gut\w*|courant|bilingu\w*)",
            re.I,
        ),
        "C1",
    ),
    (re.compile(r"\b(?:good|gut\w*|solid\w*|working|bonne?s?)\b", re.I), "B2"),
    (re.compile(r"\b(?:basic|grundkenntnisse|grund\w*|notions)\b", re.I), "A2"),
]
_CUE = re.compile(
    r"require|must|skills?|knowledge|kenntnis|level|niveau|speak|spoken|written|"
    r"communicat|maîtrise|maitrise|proficien|fluent|fließend|fliessend|command of",
    re.I,
)
_OPTIONAL = re.compile(
    r"nice to have|is a plus|a plus|plus\b|bonus|von vorteil|wünschenswert|wunschenswert|"
    r"ideally|idéalement|preferred|bevorzugt",
    re.I,
)
# Common words per language, to tell which language a posting is written in.
_STOPWORDS = {
    "German": " und der die das mit für wir sie ist ein eine zu auf bei von dich deine unsere ",
    "French": " et le la les des une pour avec nous vous est sur dans au aux votre notre ",
    "Dutch": " en de het een van voor met wij jij je onze bij zijn naar ",
    "Spanish": " y el la los las una para con nosotros es en del tu nuestro ",
    "Italian": " e il la le gli una per con noi sei nel della tuo nostro ",
}
_EXPERIENCE = re.compile(
    r"\b(?:(?:\d+\+?\s*(?:years?|jahre?n?|ans?)|prior|previous|relevant|practical|hands-on|"
    r"professional|some|first|initial|erste)\s+(?:\w+\s+){0,2}(?:experience|erfahrung\w*|expérience)|"
    r"experience (?:with|in|working|as)|berufserfahrung|praktische erfahrung\w*|"
    r"erfahrung (?:mit|im|in)|expérience (?:en|dans|avec))",
    re.I,
)


@dataclass
class Check:
    """One requirement's outcome before it becomes the API's ``Requirement``."""

    key: str
    label: str
    status: str  # met | partial | missing
    summary: str
    matched: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    share: float = 0.0  # 0..1 of the weight

    def to_requirement(self) -> Requirement:
        weight = WEIGHTS[self.key]
        return Requirement(
            key=self.key,
            label=self.label,
            status=self.status,
            summary=self.summary,
            matched=self.matched,
            missing=self.missing,
            weight=weight,
            earned=round(weight * self.share, 1),
        )


def _status(share: float) -> str:
    return "met" if share >= 0.999 else "partial" if share > 0 else "missing"


def _text(opportunity: MatchingOpportunity) -> str:
    return "\n".join([opportunity.title, opportunity.description or ""])


# --- skills -------------------------------------------------------------------------


def student_skills(profile: MatchingProfile) -> set[str]:
    """Listed skills, plus known technologies named in saved certificates."""
    skills = {canonical(s) for s in profile.skills if s.strip()}
    for certificate in profile.certificates:
        skills |= {term for term in VOCABULARY if _pattern(term).search(certificate)}
    return skills


def check_skills(profile: MatchingProfile, opportunity: MatchingOpportunity) -> Check | None:
    mine = student_skills(profile)
    demand = posting_skills(opportunity, mine)
    if not demand:
        return None
    matched = [s for s in demand if s in mine]
    missing = [s for s in demand if s not in mine]
    share = min(1.0, len(matched) / min(len(demand), SKILLS_COUNTED))
    summary = f"{len(matched)} of {len(demand)} skills"
    return Check("skills", "Skills", _status(share), summary, matched, missing, share)


# --- role field ---------------------------------------------------------------------


def check_field(profile: MatchingProfile, opportunity: MatchingOpportunity) -> Check | None:
    title = _domains(opportunity.title)
    text = _domains(opportunity.description or "")
    if not title and not text:
        return None
    mine = student_domains(profile)
    role = sorted(title or text)[0]
    label = f"{role.capitalize()} role"
    # A title can name several domains ("Financial Analytics": business, data): label the
    # role by the one that matched, not by whichever sorts first.
    if title & mine:
        what = sorted(title & mine)[0]
        label = f"{what.capitalize()} role"
        return Check("field_fit", label, "met", f"Fits your {what} background", [what], [], 1.0)
    if not title and text & mine:
        what = sorted(text & mine)[0]
        label = f"{what.capitalize()} role"
        return Check("field_fit", label, "met", f"Fits your {what} background", [what], [], 1.0)
    if text & mine:
        what = sorted(text & mine)[0]
        summary = f"Involves {what} work from your background"
        return Check("field_fit", label, "partial", summary, [what], [role], 0.5)
    summary = "Your studies and roles point elsewhere" if mine else "Add your field of study"
    return Check("field_fit", label, "missing", summary, [], [role], 0.0)


# --- languages ----------------------------------------------------------------------


def _language(word: str) -> str:
    word = word.lower()
    for name, spellings in LANGUAGES.items():
        if re.fullmatch(spellings, word, re.I):
            return name
    return word.capitalize()


def posting_language(text: str) -> str | None:
    """The language a posting is written in, when it is clearly not English."""
    words = re.findall(r"[a-zäöüßéèêàçñíóú]+", text.lower())
    if len(words) < 40:
        return None
    padded = " " + " ".join(words) + " "
    english = sum(padded.count(f" {w} ") for w in "the and with for you our are will to of".split())
    best, hits = None, 0
    for name, stop in _STOPWORDS.items():
        count = sum(padded.count(f" {w} ") for w in stop.split())
        if count > hits:
            best, hits = name, count
    return best if hits >= 12 and hits > 1.5 * english else None


def required_languages(opportunity: MatchingOpportunity) -> dict[str, tuple[str, bool]]:
    """{language: (minimum CEFR, stated explicitly)} the posting requires."""
    text = _text(opportunity)
    found: dict[str, tuple[str, bool]] = {}
    for match in _LANG.finditer(text):
        # Only the sentence that names the language: "French is a plus." must not make
        # the previous sentence's English optional.
        start = max(text.rfind(c, 0, match.start()) for c in ".!?;\n") + 1
        ends = [i for i in (text.find(c, match.end()) for c in ".!?;\n") if i != -1]
        end = min(ends) if ends else len(text)
        window = text[max(start, match.start() - 80) : min(end, match.end() + 80)]
        near = window
        if _OPTIONAL.search(near):
            continue
        # The level closest to this language: "fluent German and good English" gives
        # German C1 and English B2, not C1 for both.
        offset = text.find(window)
        centre = match.start() - offset
        candidates = [
            (abs(m.start() - centre), m[1]) for m in re.finditer(r"\b([ABC][12])\b", window)
        ]
        candidates += [
            (abs(m.start() - centre), lvl)
            for pattern, lvl in _LEVEL_WORDS
            for m in pattern.finditer(window)
        ]
        level = min(candidates)[1] if candidates else None
        if level is None and not (
            _CUE.search(near) or match.group(0).lower().endswith("kenntnisse")
        ):
            continue  # "our German office": a language name, not a requirement
        name = _language(match.group(1))
        level = level or "B2"
        if name not in found or CEFR.index(level) > CEFR.index(found[name][0]):
            found[name] = (level, True)
    written = posting_language(opportunity.description or "")
    if written and written not in found:
        found[written] = ("B2", False)  # you will work in the language the posting uses
    return found


def _level(skill) -> int:
    if skill.native:
        return len(CEFR)  # above C2
    return CEFR.index(skill.cefr) + 1 if skill.cefr in CEFR else 0


def check_languages(profile: MatchingProfile, opportunity: MatchingOpportunity) -> Check | None:
    required = required_languages(opportunity)
    if not required:
        return None
    mine = {_language(s.name): s for s in profile.languages}
    matched, missing, points = [], [], 0.0
    for name, (level, explicit) in sorted(required.items()):
        need = f"{name} {level}" + ("" if explicit else " (posting language)")
        have = mine.get(name)
        if have is None:
            missing.append(need)
            continue
        level_have = _level(have)
        shown = "native" if have.native else have.cefr or "level not set"
        if level_have == 0:
            matched.append(f"{name} ({shown})")
            points += 0.5
        elif level_have >= CEFR.index(level) + 1:
            matched.append(f"{name} {shown}")
            points += 1
        else:
            missing.append(f"{need} — you have {shown}")
            points += 0.5
    share = points / len(required)
    summary = f"{len(matched)} of {len(required)} languages"
    return Check("languages", "Languages", _status(share), summary, matched, missing, share)


# --- experience ---------------------------------------------------------------------


def check_experience(profile: MatchingProfile, opportunity: MatchingOpportunity) -> Check | None:
    text = _text(opportunity)
    if not _EXPERIENCE.search(text):
        return None
    domains = _domains(opportunity.title) or _domains(opportunity.description or "")
    demand = set(posting_skills(opportunity))

    def relevant(entry) -> bool:
        body = f"{entry.title}\n{entry.text}"
        uses_skill = any(_pattern(skill).search(body) for skill in demand)
        return bool(_domains(body) & domains) or uses_skill

    jobs = [e.title for e in profile.evidence if e.kind == "experience" and relevant(e)]
    projects = [e.title for e in profile.evidence if e.kind == "project" and relevant(e)]
    if jobs:
        return Check("experience", "Experience", "met", "Relevant experience", jobs[:3], [], 1.0)
    if projects:
        summary = "Relevant projects, no work experience yet"
        return Check("experience", "Experience", "partial", summary, projects[:3], [], 0.5)
    summary = "Asks for prior experience"
    return Check("experience", "Experience", "missing", summary, [], ["relevant experience"], 0.0)


# --- eligibility --------------------------------------------------------------------


def check_eligibility(opportunity: MatchingOpportunity, rules: list[RuleResult]) -> Check | None:
    stated = {
        "degree_level": opportunity.degree_level is not None,
        "study_year": bool(opportunity.study_year),
        "graduation_year": graduation_years(_text(opportunity)) is not None,
    }
    relevant = [r for r in rules if stated.get(r.rule)]
    if not relevant:
        return None
    labels = {
        "degree_level": "degree level",
        "study_year": "study year",
        "graduation_year": "graduation year",
    }
    met = [labels[r.rule] for r in relevant if r.status == EligibilityStatus.eligible]
    failed = [labels[r.rule] for r in relevant if r.status == EligibilityStatus.not_eligible]
    unknown = [labels[r.rule] for r in relevant if r.status == EligibilityStatus.unknown]
    if failed:
        return Check("eligibility", "Eligibility", "missing", "Requirement not met", met, failed, 0)
    share = len(met) / len(relevant)
    summary = "Meets the stated requirements" if not unknown else "Add details to your profile"
    return Check("eligibility", "Eligibility", _status(share), summary, met, unknown, share)


# --- location -----------------------------------------------------------------------


def check_location(profile: MatchingProfile, opportunity: MatchingOpportunity) -> Check | None:
    place = (opportunity.location or "").strip()
    if not place:
        return None
    lowered = place.lower()
    wanted = [
        p.strip() for p in [*profile.preferred_locations, profile.location or ""] if p.strip()
    ]
    if any(w.split(",")[0].strip().lower() in lowered for w in wanted):
        return Check("location", "Location", "met", "In a location you chose", [place], [], 1.0)
    if re.search(r"\bremote\b", lowered):
        return Check("location", "Location", "met", "Remote", [place], [], 1.0)
    country = _country(lowered)
    if country and any(country == (_country(w.lower()) or w.lower()) for w in wanted):
        return Check("location", "Location", "partial", "In your country", [place], [], 0.5)
    summary = "Not where you are" if wanted else "Add your city to compare"
    return Check("location", "Location", "missing", summary, [], [place], 0.0)


def evaluate_requirements(
    profile: MatchingProfile, opportunity: MatchingOpportunity, rules: list[RuleResult]
) -> list[Check]:
    checks = [
        check_skills(profile, opportunity),
        check_field(profile, opportunity),
        check_languages(profile, opportunity),
        check_experience(profile, opportunity),
        check_eligibility(opportunity, rules),
        check_location(profile, opportunity),
    ]
    return [c for c in checks if c is not None]


def requirement_score(checks: list[Check]) -> int:
    possible = sum(WEIGHTS[c.key] for c in checks)
    earned = sum(WEIGHTS[c.key] * c.share for c in checks)
    return round(100 * earned / max(possible, MIN_POSSIBLE)) if possible else 0
