"""Prepare local English display text from the public catalog, without database writes.

Run: python -m opportunity_api.ingestion.translate --api-url http://127.0.0.1:8000
"""

import argparse
import json
import re
import time

import httpx

from opportunity_api.catalog_presentation import (
    cached_translation,
    clean_ats_markers,
    source_hash,
    source_language,
    translation_directory,
)

CODES = {"English": "en", "German": "de", "French": "fr", "Dutch": "nl"}


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
        "Produce only the English translation, with the title on the first line, "
        "without commentary. "
        "Preserve every URL, numeric value, qualification and contract type. "
        "Keep numbers as digits rather than spelling them out. Do not summarize. "
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

    def numbers(value: str) -> set[str]:
        # Translators commonly render a numeric frequency (2 times) as "twice".
        value = re.sub(r"\btwice\b", "2", value, flags=re.I)
        return {
            re.sub(r"[.,\s]", "", token)
            for token in re.findall(
                r"\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*",
                value,
            )
        }

    if not numbers(source).issubset(numbers(output)):
        raise ValueError("Translation changed a source number")
    if source_language(first, rest) != "English":
        raise ValueError("Translation still contains non-English text")
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
    parser.add_argument(
        "--check", action="store_true", help="Check coverage without model calls or writes"
    )
    parser.add_argument(
        "--watch", action="store_true", help="Continuously prepare new catalog text"
    )
    parser.add_argument(
        "--interval", type=int, default=300, help="Poll seconds (30–86400; default 300)"
    )
    args = parser.parse_args()
    if not 30 <= args.interval <= 86400:
        parser.error("--interval must be between 30 and 86400 seconds")
    if args.watch and (args.check or args.dry_run):
        parser.error("--watch cannot be combined with --check or --dry-run")
    while True:
        try:
            failed = prepare_catalog(args)
        except (httpx.HTTPError, ValueError, KeyError, TypeError, OSError) as exc:
            if not args.watch:
                raise
            print(
                f"Catalog preparation failed ({type(exc).__name__}); retrying next poll.",
                flush=True,
            )
        else:
            if not args.watch:
                if failed:
                    raise SystemExit(1)
                return
        time.sleep(args.interval)


def prepare_catalog(args: argparse.Namespace) -> int:
    """Prepare one complete catalog snapshot; failed entries remain retryable."""

    directory = translation_directory()
    if not (args.dry_run or args.check):
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
    pending_items = []
    for item in items:
        title, text = item["title"], item.get("description") or ""
        cached = cached_translation(title, text)
        display_title, display_text = cached or (title, text)
        language = source_language(display_title, display_text)
        if language != "English":
            pending_items.append((title, text, language))
    print(
        f"Catalog: {len(items)}; English/cached: {len(items) - len(pending_items)}; "
        f"missing: {len(pending_items)}",
        flush=True,
    )
    if args.check or args.dry_run:
        for title, _, language in pending_items:
            print(f"{language}: {title}", flush=True)
        return int(args.check and bool(pending_items))
    completed = failed = 0
    with httpx.Client(base_url=args.ollama_url, timeout=900, trust_env=False) as model:
        for title, text, language in pending_items:
            digest = source_hash(title, text)
            target = directory / (digest + ".json")
            print(f"{language}: {title}", flush=True)
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
                print(
                    f"  Failed ({reason}); original retained. Retry on next preparation.",
                    flush=True,
                )
    print(
        f"Translated: {completed}; unchanged/cached: {len(items) - len(pending_items)}; "
        f"failed: {failed}",
        flush=True,
    )
    return failed


if __name__ == "__main__":
    main()
