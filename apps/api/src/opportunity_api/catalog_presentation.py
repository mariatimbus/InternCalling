"""Derived display text; the persisted employer text stays authoritative."""

import hashlib
import json
import os
import re
from pathlib import Path

ATS_MARKER = re.compile(r"(^|\s)\\?#li-[a-z0-9_-]+\b", re.IGNORECASE)
BOARD_PROMOTION = re.compile(
    r"^Find (?:more English Speaking )?Jobs in .+ on Arbeitnow\.?$", re.IGNORECASE
)


WORDS = {
    "English": set(
        (
            "the and you your with for our are will have from this that "
            "we in to of a an is be on as at or by it"
        ).split()
    ),
    "German": set(
        (
            "und der die das du deine dein wir mit für von auf eine ein einer einen im den dem "
            "dich sich sie bei ist als wirst kannst unsere zum des nicht oder auch hast"
        ).split()
    ),
    "French": set(
        (
            "et les des vous nous votre vos pour une dans est avec notre au aux du qui que sur "
            "cette rejoindre le la un en ou ce nos sont plus"
        ).split()
    ),
    "Dutch": set(
        (
            "en je jij jouw wij onze voor een het van met bij deze zijn als naar aan op om te "
            "ook hebt ons wordt zoek werk dit kan wat niet de"
        ).split()
    ),
}


def clean_ats_markers(text: str) -> str:
    return "\n".join(
        line.rstrip()
        for line in ATS_MARKER.sub(r"\1", text).strip().splitlines()
        if line.strip() and not BOARD_PROMOTION.fullmatch(line.strip())
    )


def translation_directory() -> Path:
    return Path(
        os.environ.get(
            "APP_OPPORTUNITY_TRANSLATIONS_DIR",
            str(Path(__file__).resolve().parents[4] / ".cache" / "opportunity-translations"),
        )
    )


def source_hash(title: str, description: str | None) -> str:
    source = clean_ats_markers(title) + "\n" + clean_ats_markers(description or "")
    return hashlib.sha256(source.encode()).hexdigest()


def source_language(title: str, text: str) -> str:
    text = clean_ats_markers(text)
    words = re.findall(r"[^\W\d_]+", text.lower())
    scores = {
        language: sum(word in vocabulary for word in words)
        for language, vocabulary in WORDS.items()
    }
    language = max(scores, key=scores.get)
    if language == "English":
        # A foreign requirements paragraph must not disappear in English marketing copy.
        for paragraph in text.splitlines():
            paragraph_words = re.findall(r"[^\W\d_]+", paragraph.lower())
            if len(paragraph_words) < 8:
                continue
            paragraph_scores = {
                name: sum(word in vocabulary for word in paragraph_words)
                for name, vocabulary in WORDS.items()
            }
            candidate = max(paragraph_scores, key=paragraph_scores.get)
            if (
                candidate != "English"
                and paragraph_scores[candidate] >= 3
                and paragraph_scores[candidate] >= paragraph_scores["English"] + 2
            ):
                return candidate
        if re.search(r"Werkstudent|Praktik|Elektrotechnik", title, re.I):
            return "German"
        if re.search(r"stagiair|meewerk|afstudeer", title, re.I):
            return "Dutch"
        if re.search(r"\bstage\b|\bstagiaire\b|ingénieur|recherche|développeur", title, re.I):
            return "French"
    return language


def cached_translation(title: str, description: str | None) -> tuple[str, str] | None:
    digest = source_hash(title, description)
    try:
        path = translation_directory() / (digest + ".json")
        if path.stat().st_size <= 200_000:
            cached = json.loads(path.read_text())
            if (
                isinstance(cached, dict)
                and cached.get("source_hash") == digest
                and isinstance(cached.get("title"), str)
                and cached["title"].strip()
                and isinstance(cached.get("description"), str)
                and cached["description"].strip()
                and source_language(cached["title"], cached["description"]) == "English"
            ):
                return cached["title"], cached["description"]
    except (OSError, ValueError):
        pass
    return None


def english_text(title: str, description: str | None) -> tuple[str, str | None]:
    cached = cached_translation(title, description)
    if cached is not None:
        title, description = cached
    return clean_ats_markers(title), clean_ats_markers(description) if description else description
