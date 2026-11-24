"""Prepare local English display text from the public catalog, without database writes.

Run: python -m opportunity_api.ingestion.translate --api-url http://127.0.0.1:8000
"""

import argparse
import json
import re

import httpx

from opportunity_api.catalog_presentation import (
    clean_ats_markers,
    source_hash,
    translation_directory,
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
CODES = {"English": "en", "German": "de", "French": "fr", "Dutch": "nl"}


def source_language(title: str, text: str) -> str:
    words = re.findall(r"[^\W\d_]+", text.lower())
    scores = {
        language: sum(word in vocabulary for word in words)
        for language, vocabulary in WORDS.items()
    }
    language = max(scores, key=scores.get)
    if language == "English":
        if re.search(r"Werkstudent|Praktik|Elektrotechnik", title, re.I):
            return "German"
        if re.search(r"stagiair|meewerk|afstudeer", title, re.I):
            return "Dutch"
        if re.search(r"\bstage\b|\bstagiaire\b|ingénieur|recherche|développeur", title, re.I):
            return "French"
    return language


def translate(
    client: httpx.Client, model: str, title: str, text: str, language: str
) -> tuple[str, str]:
    source = translation_source(
        clean_ats_markers(title) + "\n\n" + clean_ats_markers(text), language
    )
    prompt = (
        f"You are a professional {language} ({CODES[language]}) to English (en) translator. "
        f"Accurately convey the meaning and nuances of the original {language} text "
        "while adhering to English grammar, vocabulary, and cultural sensitivities. "
        "Produce only the English translation, without any additional explanations or commentary. "
        f"Please translate the following {language} text into English:\n\n\n{source}"
    )
    response = client.post(
        "/api/chat",
        json={
            "model": model,
            "stream": False,
            "messages": [{"role": "user", "content": prompt}],
            "options": {"temperature": 0, "num_ctx": 8192, "num_predict": 8192, "num_thread": 8},
        },
    )
    response.raise_for_status()
    result = response.json()
    if not result.get("done") or result.get("done_reason") == "length":
        raise ValueError("Incomplete translation")
    output = result["message"]["content"].strip()
    first, separator, rest = output.partition("\n")
    first = first.strip().strip("*")
    if (
        not separator
        or not first.strip()
        or not rest.strip()
        or not 0.4 < len(output) / max(1, len(source)) < 2.5
    ):
        raise ValueError("Translation failed completeness validation")
    urls = {url.rstrip(".,;)") for url in re.findall(r"https?://[^\s<>]+", source)}
    translated_urls = {url.rstrip(".,;)") for url in re.findall(r"https?://[^\s<>]+", output)}
    if not urls.issubset(translated_urls):
        raise ValueError("Translation changed a source link")
    if source_language(title, title) == "English":
        first = title
    if re.search(r"Werkstudent", title, re.I) and not re.search(r"working student", first, re.I):
        if re.search(r"Praktik", title, re.I):
            first = "Working Student / " + first
        elif re.search(r"\b(?:student|intern(?:ship)?)\b", first, re.I):
            first = re.sub(r"\b(?:student|intern(?:ship)?)\b", "Working Student", first, flags=re.I)
        else:
            first = "Working Student — " + first
    return first.strip().strip("*"), rest.strip()


def translation_source(text: str, language: str) -> str:
    # These contract types must not be conflated by the translation model.
    text = re.sub(
        r"\bWerkstudent(?:[/:*]?in(?:nen)?|en|innen)?\b", "Working Student", text, flags=re.I
    )
    if language == "German":
        text = re.sub(r"\bKI\b", "AI", text)
    if language == "French":
        text = re.sub(r"\bIA\b", "AI", text)
    if language in {"French", "Dutch"}:
        text = re.sub(r"\bstage\b", "Internship", text, flags=re.I)
    return text


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    parser.add_argument("--model", default="translategemma:4b")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    directory = translation_directory()
    directory.mkdir(parents=True, exist_ok=True)
    # Fetch the full catalog before writing translations.
    items = []
    with httpx.Client(base_url=args.api_url, timeout=30, trust_env=False) as api:
        page = 1
        while True:
            response = api.get(
                "/api/v1/opportunities",
                params={"page": page, "page_size": 100, "is_active": "true"},
            )
            response.raise_for_status()
            data = response.json()
            items.extend(data["items"])
            if page * 100 >= data["total"]:
                break
            page += 1
    completed = skipped = failed = 0
    with httpx.Client(base_url=args.ollama_url, timeout=900, trust_env=False) as model:
        for item in items:
            title, text = item["title"], item.get("description") or ""
            language = source_language(title, text)
            if language == "English":
                skipped += 1
                continue
            digest = source_hash(title, text)
            target = directory / (digest + ".json")
            if target.exists():
                skipped += 1
                continue
            print(f"{language}: {title}", flush=True)
            if args.dry_run:
                continue
            try:
                translated_title, translated_text = translate(
                    model, args.model, title, text, language
                )
                result = {
                    "source_hash": digest,
                    "source_language": CODES[language],
                    "model": args.model,
                    "title": translated_title,
                    "description": translated_text,
                }
                pending = target.with_suffix(".tmp")
                pending.write_text(json.dumps(result, ensure_ascii=False, indent=2))
                pending.replace(target)
                completed += 1
                print(f"  Ready: {translated_title}", flush=True)
            except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
                failed += 1
                reason = str(exc) if isinstance(exc, ValueError) else type(exc).__name__
                print(f"  Failed ({reason}); original retained. Rerun to retry.", flush=True)
    print(f"Translated: {completed}; unchanged/cached: {skipped}; failed: {failed}", flush=True)
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
