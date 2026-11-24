"""Deterministic CV section proposals: experience, projects, languages and more.

Only text the CV states is used. An entry is proposed when it has the fields its
profile section requires (an experience needs a role, an organization and dates);
anything less is left for the student to add by hand rather than guessed.
"""

import json
import re

MONTHS = {
    **{m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)},
    **{m: i for i, m in enumerate("ian feb mar apr mai iun iul aug sep oct noi dec".split(), 1)},
}
_MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ian|mai|iun|iul|noi)[a-zăâîșț]*\.?"
_POINT = rf"(?:{_MONTH}\s+\d{{4}}|\d{{1,2}}[./]\d{{4}}|\d{{4}})"
_NOW = r"(?:present|current|now|today|ongoing|prezent|curent|în prezent|in prezent)"
DATE_RANGE = re.compile(
    rf"(?P<start>{_POINT})\s*(?:-|–|—|to|până la|pana la)\s*(?P<end>{_POINT}|{_NOW})", re.I
)
# "Arduino Door Lock | Hardware Jun 2026": one date closing a title line (no range).
TRAILING_DATE = re.compile(rf"\s+(?P<start>{_MONTH}\s+\d{{4}}|\d{{1,2}}[./]\d{{4}})\s*$", re.I)
IN_PROGRESS = re.compile(r"\s*[(–—-]?\s*(?:in progress|ongoing|în curs|in curs)\s*\)?\s*$", re.I)
YEAR = re.compile(r"\b(19|20)\d{2}\b")
LINK_ROLE = re.compile(r"\b(?:repository|repo|github|gitlab|demo|website|link)\b", re.I)
BULLET = re.compile(r"^\s*(?:[•●▪◦‣\-–*·]|\d+[.)])\s*")
SEPARATOR = re.compile(r"\s+(?:\||—|–|-|@|at|la)\s+|\s*\|\s*|,\s+", re.I)
# Project names, awards and papers often contain commas: only strong separators split them.
STRONG_SEPARATOR = re.compile(r"\s+(?:\||—|–|-|@|at|la)\s+|\s*\|\s*", re.I)
# Icon fonts leave their glyph names in the text layer ("/github", "/gl⌢be Website").
ICONS = re.compile(
    r"\s*/(?:github|linkedin|gl\S{0,3}be|globe|link|envelope|phone)\b(?:\s+(?:Website|GitHub|LinkedIn))?|[⋄✉☎]",
    re.I,
)
ROLE_WORDS = re.compile(
    r"\b(?:intern|internship|assistant|member|leader|lead|engineer|developer|manager|analyst|"
    r"president|volunteer|researcher|coordinator|head|founder|co-founder|student|tutor|mentor|"
    r"consultant|designer|scientist|captain|officer|representative|ambassador|stagiar|voluntar)\b",
    re.I,
)

HEADERS = {
    "experience": "experience|work experience|professional experience|employment|"
    "employment history|internships|work history|extracurricular activities|"
    "extracurricular experience|activities|"
    "leadership|leadership experience|volunteering|volunteer experience|experiență|"
    "experiență profesională|experienta|experienta profesionala|activități extracurriculare|"
    "voluntariat",
    "projects": "projects|personal projects|academic projects|selected projects|proiecte|"
    "proiecte personale",
    "languages": "languages|language skills|limbi|limbi străine|limbi straine",
    "certificates": "certifications|certificates|licenses & certifications|"
    "licenses and certifications|certificări|certificari|additional learning|courses|"
    "online courses|trainings|training|cursuri",
    "honours": "honors|honours|awards|honors & awards|honours & awards|achievements|"
    "awards & achievements|premii|distincții|distinctii",
    "publications": "publications|papers|publicații|publicatii",
    # Not proposed as entries: only used to recognise a project's technologies.
    "skills": "skills|technical skills|technologies|competențe|competente|aptitudini|"
    "competențe tehnice|competente tehnice",
    None: "education|contact|summary|profile|about me|interests|"
    "hobbies|references|educație|educatie|interese|"
    "coursework|relevant coursework|research interests|interests & hobbies|"
    "volunteer interests",
}
_HEADER = {phrase: section for section, phrases in HEADERS.items() for phrase in phrases.split("|")}

LANGUAGES = (
    "english|romanian|french|german|spanish|italian|portuguese|russian|chinese|mandarin|japanese|"
    "korean|arabic|dutch|hungarian|polish|swedish|norwegian|danish|finnish|greek|turkish|czech|"
    "ukrainian|bulgarian|engleză|engleza|română|romana|franceză|franceza|germană|germana|"
    "spaniolă|spaniola|italiană|italiana|rusă|rusa|maghiară|maghiara|chineză|chineza|japoneză|"
    "japoneza|portugheză|portugheza"
)
LANGUAGE = re.compile(rf"\b({LANGUAGES})\b", re.I)
CEFR = re.compile(r"\b([ABC][12])\b")
NATIVE = re.compile(r"\b(native|mother tongue|nativ[ăa]?|limba maternă|limba materna)\b", re.I)
TECH = re.compile(r"^\s*(?:tech(?:nologies)?|stack|tools|built with|tehnologii)\s*[:\-]\s*", re.I)
LABEL = re.compile(r"^\s*([A-Za-zăâîșț &/-]{3,30}):\s*")


def _clean(line: str) -> str:
    return re.sub(r"\s{2,}", " ", ICONS.sub("", line)).strip()


def _date(value: str) -> str:
    """YYYY-MM or YYYY, as the profile sections store dates."""
    value = value.strip().lower()
    if match := re.fullmatch(r"(\d{1,2})[./](\d{4})", value):
        month, year = int(match[1]), match[2]
        return f"{year}-{month:02d}" if 1 <= month <= 12 else year
    if match := re.fullmatch(r"([a-zăâîșț]+)\.?\s+(\d{4})", value):
        month = MONTHS.get(match[1][:3])
        return f"{match[2]}-{month:02d}" if month else match[2]
    return value if re.fullmatch(r"\d{4}", value) else ""


def _header(line: str) -> str | None | bool:
    """Section key for a heading line, None for a non-proposal heading, False otherwise."""
    key = re.sub(r"[:\s]+$", "", line.strip()).casefold()
    if len(key) > 45 or BULLET.match(line) or DATE_RANGE.search(line):
        return False
    if key in _HEADER:
        return _HEADER[key]
    # Lost ligatures ("Extracurricular Acti") or combined headings ("Awards, Certifications").
    for phrase in sorted(_HEADER, key=len, reverse=True):
        if len(phrase) >= 6 and (key.startswith(phrase + ",") or key.startswith(phrase + " &")):
            return _HEADER[phrase]
        if len(key) >= 12 and phrase.startswith(key):
            return _HEADER[phrase]
    return False


# An unrecognised ALL-CAPS heading ("RESEARCH INTERESTS") still ends the previous section.
CAPS_HEADING = re.compile(r"^[A-ZĂÂÎȘȚ][A-ZĂÂÎȘȚ &,/'-]{3,40}$")


def split_sections(text: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current = None
    for raw in text.splitlines():
        line = _clean(raw)
        if not line:
            continue
        heading = _header(line)
        if heading is False and CAPS_HEADING.match(line) and len(line.split()) <= 5:
            heading = None
        if heading is not False:
            current = heading
            if current:
                sections.setdefault(current, [])
            continue
        if current:
            sections[current].append(line)
    return sections


def _title_like(line: str) -> bool:
    """A short "Role | Organization" line, not a sentence that happens to have commas."""
    return bool(SEPARATOR.search(line)) and len(line) < 100 and not line.rstrip().endswith(".")


def _continues(line: str) -> bool:
    """A wrapped line of the previous bullet."""
    return line[:1].islower() or line[:1] in "(+%&"


def _blocks(lines: list[str], *, short_titles: bool = False) -> list[dict]:
    """Group lines into entries: a non-bullet line with a date range or separator opens one.

    With ``short_titles`` (projects), a short plain line such as "Chess Engine" also opens one.
    """
    blocks: list[dict] = []
    for line in lines:
        bullet = BULLET.match(line) is not None or TECH.match(line) is not None
        dates = DATE_RANGE.search(line)
        if not dates and not bullet and (single := TRAILING_DATE.search(line)):
            if _title_like(line[: single.start()]):
                dates = {"start": single["start"], "end": single["start"], "span": single.span()}
        last = blocks[-1] if blocks else None
        if last and last["body"] and not bullet and not dates and _continues(line):
            last["body"][-1] += " " + line
            continue
        if last and (last["dates"] or short_titles) and not last["body"] and not last["location"]:
            if not bullet and not dates and len(line) < 100 and not line.endswith("."):
                # "Bucharest, Romania" under a job; "University Project – CAD" under a project
                last["location"] = line
                continue
        if short_titles and not bullet and not dates and last and last["body"]:
            if len(line) < 60 and not line.rstrip().endswith((".", ":")):
                blocks.append({"head": line, "dates": None, "body": [], "location": ""})
                continue
        if isinstance(dates, dict):
            line = line[: dates["span"][0]]
        head = re.sub(r"\s{2,}", " ", DATE_RANGE.sub("", line)).strip(" |,–—-·")
        if not bullet and dates and not head and last and not last["dates"]:
            last["dates"] = dates  # dates on their own line below the title
        elif not bullet and (dates or _title_like(line)):
            blocks.append({"head": head, "dates": dates, "body": [], "location": ""})
        elif last:
            last["body"].append(line if TECH.match(line) else BULLET.sub("", line).strip())
        elif not bullet:
            blocks.append({"head": head, "dates": dates, "body": [], "location": ""})
    return blocks


def _parts(head: str, separator: re.Pattern = SEPARATOR) -> list[str]:
    return [p.strip(" |,–—-") for p in separator.split(head) if p and p.strip(" |,–—-")]


def _range(dates) -> tuple[str, str, bool]:
    if not dates:
        return "", "", False
    start = _date(dates["start"])
    end_text = dates["end"]
    current = re.fullmatch(_NOW, end_text.strip(), re.I) is not None
    return start, "" if current else _date(end_text), current


def experience(lines: list[str]) -> list[dict]:
    found = []
    for block in _blocks(lines):
        parts = _parts(block["head"], STRONG_SEPARATOR)
        if len(parts) < 2:
            parts = _parts(block["head"])
        start, end, current = _range(block["dates"])
        if len(parts) < 2 or not start or not (end or current):
            continue
        role, organization = parts[0], ", ".join(parts[1:])
        if ROLE_WORDS.search(organization) and not ROLE_WORDS.search(role):
            role, organization = organization, role  # "AlphaZ – Web & Communications Member"
        found.append(
            {
                "role": role[:255],
                "organization": organization[:255],
                "location": block["location"][:255],
                "startDate": start,
                "endDate": end,
                "current": current,
                "achievements": "\n".join(b[:500] for b in block["body"][:20] if b),
            }
        )
    return found


def skill_terms(lines: list[str]) -> list[str]:
    """Skills the CV lists ("Programming: C, C++, Python"), longest first."""
    joined: list[str] = []
    for line in lines:  # "…, Image" + "Processing, …": a wrapped line continues its label
        if joined and not LABEL.match(line):
            joined[-1] += " " + line
        else:
            joined.append(line)
    terms = []
    for line in joined:
        for term in re.split(r"[,;•|]", LABEL.sub("", line)):
            term = term.strip(" .")
            if 2 <= len(term) <= 40 and len(term.split()) <= 4:
                terms.append(term)
    return sorted(dict.fromkeys(terms), key=len, reverse=True)


def _mentioned(terms: list[str], text: str) -> list[str]:
    return [t for t in terms if re.search(rf"(?<![\w+#.]){re.escape(t)}(?![\w+#])", text, re.I)]


def projects(lines: list[str], skills: list[str] = ()) -> list[dict]:
    found = []
    for block in _blocks(lines, short_titles=True):
        parts = _parts(block["head"], STRONG_SEPARATOR)
        if not parts:
            continue
        start, end, ongoing = _range(block["dates"])
        tech, body, role = [], [], ""
        for extra in parts[1:]:
            if "," in extra:  # "Python, FastAPI, React" after the name is the stack
                tech += [t.strip() for t in extra.split(",") if t.strip()]
            elif not role:
                role = extra
        if role and LINK_ROLE.search(role):
            role = ""  # "| GitHub Repository" points at a link, it is not a role
        if role and role.casefold() in {t.casefold() for t in skills}:
            tech.append(role)  # "Formula 1 Car CAD | AutoCAD": the stack, not a role
            role = ""
        if block["location"]:
            body.append(block["location"])  # "University Project – Computer-Aided Design"
        for line in block["body"]:
            if TECH.match(line):
                tech += [t.strip() for t in re.split(r",|;", TECH.sub("", line)) if t.strip()]
            else:
                body.append(line)
        # Only skills the CV itself lists, when the project text names them.
        tech += _mentioned(list(skills), " ".join([parts[0], *body]))
        found.append(
            {
                "name": parts[0][:255],
                "role": role[:255],
                "description": "\n".join(body)[:5000],
                "technologies": list(dict.fromkeys(t[:100] for t in tech))[:30],
                "startDate": start,
                "endDate": end,
                "ongoing": ongoing,
            }
        )
    return found


def languages(lines: list[str]) -> list[dict]:
    found, seen = [], set()
    for line in lines:
        # "Romanian: Native English: C2": each language owns the text up to the next one.
        starts = [m.start() for m in LANGUAGE.finditer(line)] or [0]
        pieces = [line[a:b] for a, b in zip(starts, starts[1:] + [len(line)], strict=True)]
        for chunk in (c for piece in pieces for c in re.split(r"[,;•|]|\s{2,}", piece)):
            match = LANGUAGE.search(chunk)
            if not match or match[1].casefold() in seen:
                continue
            seen.add(match[1].casefold())
            level = CEFR.search(chunk)
            found.append(
                {
                    "name": match[1][:1].upper() + match[1][1:],
                    "cefr": level[1] if level else "",
                    "native": NATIVE.search(chunk) is not None,
                }
            )
    return found


def _items(lines: list[str]) -> list[tuple[str, str]]:
    """(label, item) pairs: one per line, or per ";" when a line lists several."""
    items: list[tuple[str, str]] = []
    for line in lines:
        if items and not BULLET.match(line) and _continues(line):
            label, text = items[-1]
            items[-1] = (label, text + " " + line)
            continue
        text = BULLET.sub("", line).strip()
        label = ""
        if match := LABEL.match(text):
            label, text = match[1].casefold(), text[match.end() :]
        for item in re.split(r";\s*", text):
            if item.strip(" ."):
                items.append((label, item.strip(" .")))
    return items


def _when(text: str) -> tuple[str, str]:
    """Strip the date from an item: "Rookie All-Star (2026)" -> ("Rookie All-Star", "2026")."""
    if match := DATE_RANGE.search(text):
        return DATE_RANGE.sub("", text).strip(" |,–—-()"), _date(match["start"])
    if match := re.search(rf"\(?\s*({_POINT})(?:\s*,\s*\d{{4}})*\s*\)?\s*$", text, re.I):
        return text[: match.start()].strip(" |,–—-("), _date(match[1])
    year = YEAR.search(text)
    return text.strip(), year[0] if year else ""


def certificates(lines: list[str], *, labelled_only: bool = False) -> list[dict]:
    found = []
    for label, item in _items(lines):
        if (label or labelled_only) and "cert" not in label:
            continue
        item = IN_PROGRESS.sub("", item)  # still in progress: no issue date yet
        title, when = _when(item)
        parts = _parts(title, STRONG_SEPARATOR)
        if len(parts) == 1 and ", " in parts[0]:
            parts = _parts(title)  # "Certificate, Issuer"
        if len(parts) >= 2:  # an issuer is required; never guessed from the name
            found.append(
                {
                    "name": parts[0][:255],
                    "organization": ", ".join(parts[1:])[:255],
                    "issueDate": when,
                }
            )
    return found


def honours(lines: list[str]) -> list[dict]:
    found = []
    for label, item in _items(lines):
        if label and not re.search(r"award|honou?r|prize|premi|distinc", label):
            continue  # "Certifications: ..." or "Simulation: ..." inside a combined section
        title, when = _when(item)
        last = found[-1] if found else None
        if last and last["receivedDate"] and not when and not last["description"] and "|" in item:
            last["description"] = item[:5000]  # "Winter Intensive | Policy Lab" under the award
            continue
        if title:
            found.append({"title": title[:255], "receivedDate": when, "description": ""})
    return found


def publications(lines: list[str]) -> list[dict]:
    found = []
    for _, item in _items(lines):
        title, when = _when(item)
        parts = _parts(title, STRONG_SEPARATOR)
        if parts:
            found.append(
                {
                    "title": parts[0][:255],
                    "publisher": ", ".join(parts[1:])[:255],
                    "publicationDate": when,
                }
            )
    return found


PARSERS = {
    "experience": experience,
    "projects": projects,
    "languages": languages,
    "certificates": certificates,
    "honours": honours,
    "publications": publications,
}


# A repeated text layer can yield a second, garbled copy of an entry: one per identity.
IDENTITY = {
    "experience": ("role", "organization", "startDate"),
    "projects": ("name",),
    "languages": ("name",),
    "certificates": ("name",),
    "honours": ("title",),
    "publications": ("title",),
}


def propose(text: str) -> list[dict]:
    """Review candidates: {key, section, values, warnings}, capped at 100.

    Some PDFs repeat their text layer, so identical entries are proposed once.
    """
    candidates, seen = [], set()
    sections = split_sections(text)
    skills = skill_terms(sections.pop("skills", []))
    found = {section: PARSERS[section](lines) for section, lines in sections.items()}
    if "projects" in sections:
        found["projects"] = projects(sections["projects"], skills)
    if "honours" in sections:  # "Certifications: ..." lines inside "Awards, Certifications"
        found.setdefault("certificates", [])
        found["certificates"] += certificates(sections["honours"], labelled_only=True)
    for section, rows in found.items():
        for values in rows:
            identity = [values.get(k) for k in IDENTITY[section]]
            signature = (section, json.dumps(identity, ensure_ascii=False).casefold())
            if signature in seen:
                continue
            seen.add(signature)
            candidates.append(
                {
                    "key": f"{section}-{sum(c['section'] == section for c in candidates) + 1}",
                    "section": section,
                    "values": values,
                    "warnings": ["Read from your CV by rules; check it before saving."],
                }
            )
    return candidates[:100]
