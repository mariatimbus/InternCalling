"""Assess cleaned postings against the A14 student-role, STEM and Europe scope.

C3 normalizes before classification. Clearly outside postings are rejected;
remote roles without a non-European restriction are accepted; other ambiguous
postings are retained for review and cannot be published automatically.
"""

import re
from dataclasses import dataclass

# Student-role vocabulary. Matched against the title with word boundaries so
# "intern" does not match "internal" and "placement" does not match "replace".
ROLE_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bintern(ship)?s?\b",
        r"\bworking\s+student\b",
        r"\bwerkstudent(innen?)?\b",
        r"\bpraktikant(innen?)?\b",
        r"\bpraktikum\b",
        r"\bstage?s?\b",
        r"\bstagiaire?s?\b",
        r"\bplacement(s)?\b",
        r"\bstudent\s+(worker|assistant|job)\b",
    )
)

# Tech/STEM vocabulary, matched against title + description with word
# boundaries (substring matching would let "ai" match "campaigns" and "it "
# is not a real token). Multi-word terms use \s+.
STEM_TERMS: tuple[str, ...] = (
    "tech",
    "software",
    "developer",
    "engineer",
    "engineering",
    "devops",
    "frontend",
    "front-end",
    "backend",
    "back-end",
    "fullstack",
    "full-stack",
    "data",
    "sql",
    "machine learning",
    "deep learning",
    "ai",
    "ml",
    "cloud",
    "cyber",
    "security",
    "embedded",
    "mobile",
    "python",
    "java",
    "react",
    "research",
    "science",
    "scientist",
    "physics",
    "math",
    "mathematics",
    "statistics",
    "biotech",
    "chemistry",
    "electrical",
    "mechanical",
    "robotics",
    "automation",
    "database",
    "network",
    "computer",
    "information technology",
)

STEM_PATTERN = re.compile(
    r"\b(" + "|".join(term.replace(" ", r"\s+") for term in STEM_TERMS) + r")\b",
    re.IGNORECASE,
)

# IT must be an explicit title label next to a role/domain, not the pronoun "It".
# Plain IT/it in prose is insufficient evidence; unresolved roles need review.
IT_TITLE_PATTERN = re.compile(
    r"\bIT\b\s*(?:[-:/]\s*)?"
    r"(?i:intern(?:ship)?|support|systems?|infrastructure|operations|services|"
    r"placement|working\s+student)\b"
)

# European countries, plus common aliases. Matching is case-insensitive on
# the free-text location field. Transcontinental countries are included.
EUROPE_COUNTRIES: frozenset[str] = frozenset(
    {
        "albania",
        "andorra",
        "austria",
        "belarus",
        "belgium",
        "bosnia",
        "bulgaria",
        "croatia",
        "cyprus",
        "czechia",
        "czech republic",
        "denmark",
        "estonia",
        "finland",
        "france",
        "germany",
        "greece",
        "hungary",
        "iceland",
        "ireland",
        "italy",
        "kosovo",
        "latvia",
        "liechtenstein",
        "lithuania",
        "luxembourg",
        "malta",
        "moldova",
        "monaco",
        "montenegro",
        "netherlands",
        "holland",
        "north macedonia",
        "macedonia",
        "norway",
        "poland",
        "portugal",
        "romania",
        "russia",
        "san marino",
        "serbia",
        "slovakia",
        "slovenia",
        "spain",
        "sweden",
        "switzerland",
        "turkey",
        "ukraine",
        "united kingdom",
        "uk",
        "great britain",
        "britain",
        "england",
        "scotland",
        "wales",
        "vatican",
        # Native-language country names used by European boards.
        "deutschland",
        "nederland",
        "schweiz",
        "suisse",
        "svizzera",
        "österreich",
        "osterreich",
        "españa",
        "espana",
        "italia",
        "polska",
        "sverige",
        "norge",
        "danmark",
        "suomi",
        "belgique",
        "belgië",
        "belgie",
        "éire",
        "eire",
        "česko",
        "magyarország",
        "românia",
    }
)

# Major European cities, for boards that list a city without its country. Names that
# are also common outside Europe (Cambridge, Valencia, Athens, Nice...) are left out.
EUROPE_CITIES: frozenset[str] = frozenset(
    """
    london paris berlin munich münchen muenchen hamburg frankfurt cologne köln koeln
    düsseldorf dusseldorf duesseldorf stuttgart leipzig dresden nuremberg nürnberg
    hannover bonn karlsruhe heidelberg mannheim aachen essen dortmund bremen potsdam
    darmstadt amsterdam rotterdam utrecht eindhoven den-haag delft leiden groningen
    brussels bruxelles brussel antwerp antwerpen ghent gent leuven zurich zürich geneva
    genève basel bern lausanne lugano vienna wien graz linz innsbruck salzburg dublin
    cork galway edinburgh glasgow bristol leeds belfast oxford madrid barcelona sevilla
    seville bilbao málaga malaga lisbon lisboa porto milan milano roma turin torino
    bologna florence firenze napoli stockholm gothenburg göteborg malmö malmo uppsala
    oslo trondheim copenhagen københavn aarhus helsinki espoo tampere oulu warsaw
    warszawa krakow kraków wroclaw wrocław gdansk gdańsk poznan poznań prague praha
    brno budapest bucharest bucurești bucuresti cluj cluj-napoca iasi iași timisoara
    timișoara brasov brașov sofia plovdiv belgrade zagreb ljubljana bratislava vilnius
    kaunas riga tallinn tartu thessaloniki lyon marseille toulouse nantes bordeaux
    lille strasbourg montpellier rennes grenoble kyiv kiev lviv istanbul ankara
    reykjavik valletta nicosia limassol tirana skopje sarajevo chisinau
    """.replace("den-haag", "den haag").split()
)

# Remote with no listed non-European country is treated as open to Europe.
REMOTE_PATTERN = re.compile(r"\bremote\b|\bwork\s+from\s+home\b", re.IGNORECASE)
EUROPE_PATTERN = re.compile(
    r"\b(?:"
    + "|".join(
        re.escape(c) for c in sorted(EUROPE_COUNTRIES | EUROPE_CITIES, key=len, reverse=True)
    )
    + r"|europe|european union|eu|eea)\b",
    re.IGNORECASE,
)
OUTSIDE_PATTERN = re.compile(
    r"\b(?:united states|usa|us|canada|india|china|hong kong|singapore|japan|australia|"
    r"new zealand|brazil|mexico|south africa|nigeria|pakistan|bangladesh|"
    r"new york|san francisco|seattle|palo alto|los angeles|boston|chicago|austin|denver|"
    r"toronto|vancouver|montreal|bangalore|bengaluru|hyderabad|tokyo|seoul|sydney|"
    r"melbourne|dubai|doha|tel aviv|sao paulo|são paulo)\b",
    re.IGNORECASE,
)
# "Foster City, CA" / "Hybrid - New York, NY": a two-letter US state after a comma.
US_STATE = re.compile(
    r",\s*(?:AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|MA|MD|MI|MN|MS|MO|"
    r"MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b"
)
EU_EXCLUDED = re.compile(r"\b(?:excluding|except|outside|not in)\s+(?:europe|eu|eea)\b", re.I)
NON_STEM = re.compile(r"\b(?:marketing|human resources|sales|social media|recruiting)\b", re.I)
# Business functions that make a title non-STEM unless the title itself is technical
# ("Sales Engineering Intern" stays; "Brand Marketing Intern" does not).
NON_STEM_TITLE = re.compile(
    r"\b(?:marketing|sales|social\s+media|recruit\w*|talent|human\s+resources|people|"
    r"payroll|legal|paralegal|accounting|accountant|consolidation|finance|financial|tax|"
    r"communications?|public\s+relations|brand|content|copywriting|influencer|affiliat\w*|"
    r"crm|account\s+management|merchant|customer\s+success|business\s+development|"
    r"events?|graphic|creative|vertrieb|commercial|comptab\w*|juridique|customer\s+service|"
    r"kundenservice|office\s+management|"
    r"ressources\s+humaines)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ScopeDecision:
    accepted: bool
    reason: str
    requires_review: bool = False
    code: str = "in_scope"


def _is_student_role(title: str) -> bool:
    return any(pattern.search(title) for pattern in ROLE_PATTERNS)


def maybe_student_title(title: str) -> bool:
    """Cheap pre-filter for sources that charge one request per posting detail."""
    return _is_student_role(title) or re.search(r"\b(?:student|trainee)\b", title, re.I) is not None


def _is_stem(title: str, description: str) -> bool:
    return (
        STEM_PATTERN.search(f"{title}\n{description}") is not None
        or IT_TITLE_PATTERN.search(title) is not None
    )


def _is_europe(location: str) -> bool:
    return EUROPE_PATTERN.search(location) is not None


def _technical_title(title: str) -> bool:
    """A STEM title, ignoring a bare "AI" that is often part of a company name."""
    words = {m.group(0).lower() for m in STEM_PATTERN.finditer(title)}
    return bool(words - {"ai"}) or IT_TITLE_PATTERN.search(title) is not None


def assess_scope(
    title: str,
    description: str | None,
    location: str | None,
    *,
    european_source: bool = False,
) -> ScopeDecision:
    """Decide whether a raw posting is inside the ingestion scope.

    ``european_source`` marks boards that only list jobs in Europe, so a town without a
    country name ("Greven") still counts as European.
    """
    reviews = []
    if not _is_student_role(title):
        if re.search(r"\b(?:student|trainee)\b", title, re.I):
            reviews.append("student role level is not explicit")
        else:
            return ScopeDecision(
                False, "not an internship-level student role", code="not_student_role"
            )
    if NON_STEM_TITLE.search(title) and not _technical_title(title):
        return ScopeDecision(False, "not tech/STEM", code="not_stem")
    if not _is_stem(title, description or ""):
        if NON_STEM.search(f"{title}\n{description or ''}"):
            return ScopeDecision(False, "not tech/STEM", code="not_stem")
        reviews.append("tech/STEM domain is not established")
    place = location or ""
    outside = OUTSIDE_PATTERN.search(place) is not None or US_STATE.search(place) is not None
    european = _is_europe(place) or (european_source and not outside)
    if EU_EXCLUDED.search(place) or (outside and not european):
        return ScopeDecision(False, "outside Europe", code="outside_europe")
    if outside and european:
        reviews.append("mixed European and non-European locations need review")
    elif not european and not REMOTE_PATTERN.search(place):
        reviews.append("European availability is not established")
    # Remote roles with no country restriction are open to European students.
    if reviews:
        return ScopeDecision(False, "; ".join(reviews), True, "scope_ambiguous")
    return ScopeDecision(True, "in scope")
