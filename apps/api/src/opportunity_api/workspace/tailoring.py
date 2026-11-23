"""Deterministic source-grounded tailoring, with immutable approval boundaries."""

import re
from uuid import UUID

from sqlalchemy import select

from ..core.errors import APIError
from ..models import Opportunity, ResumeState
from ..schemas.workspace import SECTIONS
from .common import digest, entries, iso, reject, snapshot

TAILOR_SECTIONS = ("profile", "skills", *SECTIONS)


def words(value):
    return set(re.findall(r"[\w+#.]+", value.casefold()))


def context(db, user, job_id):
    try:
        key = UUID(str(job_id))
    except ValueError:
        key = None
    job = db.scalar(select(Opportunity).where(Opportunity.id == key)) if key else None
    if job is None:
        raise APIError("Opportunity not found", status_code=404, code="opportunity_not_found")
    current = snapshot(db, user)
    revision = current["profileRevision"]
    facts = []
    if user.full_name.strip():
        facts.append(
            {
                "id": "profile:identity",
                "revision": revision,
                "section": "profile",
                "title": "Name",
                "text": user.full_name.strip(),
            }
        )
    for field, value in current["profile"].items():
        for index, start in enumerate(range(0, len(value), 5900)):
            facts.append(
                {
                    "id": f"profile:{field}:{index}",
                    "revision": revision,
                    "section": "profile",
                    "title": field.replace("_", " ").capitalize(),
                    "text": value[start : start + 5900],
                }
            )
    for skill in user.skills:
        facts.append(
            {
                "id": "skill:" + str(skill.id),
                "revision": revision,
                "section": "skills",
                "title": "Skill",
                "text": skill.name,
            }
        )
    for entry in entries(db, user):
        title = str(
            entry.values.get("name")
            or entry.values.get("role")
            or entry.values.get("title")
            or entry.section
        )[:255]
        parts = []
        for name, value in entry.values.items():
            if isinstance(value, list):
                value = "\n".join(value)
            if value is False or value == "":
                continue
            label = re.sub(r"([a-z])([A-Z])", r"\1 \2", name).capitalize()
            parts.append(f"{label}: {value}")
        # Split oversized entries into explicit source fragments without inventing content.
        text = "\n".join(parts)
        for index, start in enumerate(range(0, len(text), 5900)):
            facts.append(
                {
                    "id": f"{entry.id}:{index}",
                    "revision": str(entry.revision),
                    "section": entry.section,
                    "title": title,
                    "text": text[start : start + 5900],
                }
            )
    relevance = words(
        (job.title or "")
        + " "
        + (job.description or "")
        + " "
        + " ".join(skill.name for skill in job.skills)
    )
    facts.sort(
        key=lambda fact: (
            fact["id"] != "profile:identity",
            -len(words(fact["text"]) & relevance),
            TAILOR_SECTIONS.index(fact["section"]),
            fact["id"],
        )
    )
    requirements = [{"id": "skill:" + str(skill.id), "text": skill.name} for skill in job.skills]
    state = db.get(ResumeState, user.id)
    job_data = {
        "title": job.title,
        "organization": job.organization or "Organization not specified",
        "applicationUrl": job.url,
        "requirements": requirements[:100],
    }
    job_revision = digest(
        {
            **job_data,
            "description": job.description,
            "active": job.is_active,
            "deadline": iso(job.deadline) if job.deadline else None,
            "degree_level": job.degree_level,
            "study_year": job.study_year,
        }
    )
    return {
        "job": {"id": str(job.id), "revision": job_revision, **job_data},
        "source": {
            "profile": {"id": str(user.profile.id), "revision": revision},
            "resume": {
                "id": str(state.document_id) if state and state.document_id else "profile-resume",
                "revision": str(state.revision) if state and state.document_id else revision,
            },
            "facts": facts[:100],
        },
    }


def context_scope(value):
    return {
        "job": {"id": value["job"]["id"], "revision": value["job"]["revision"]},
        "profile": value["source"]["profile"],
        "resume": value["source"]["resume"],
    }


def require_scope(db, user, scope):
    try:
        value = context(db, user, scope["job"]["id"])
    except (KeyError, TypeError) as exc:
        raise APIError("Invalid resume scope", status_code=422, code="invalid_scope") from exc
    if context_scope(value) != scope:
        reject(
            "Profile, PDF or opportunity changed. Reload source data.", code="tailoring_conflict"
        )
    return value


def validate_blocks(blocks, value):
    if not isinstance(blocks, list) or len(blocks) > 100:
        raise APIError("Use at most 100 resume items", status_code=422, code="invalid_blocks")
    ids = set()
    facts = {fact["id"]: fact for fact in value["source"]["facts"]}
    for block in blocks:
        if not isinstance(block, dict) or set(block) != {
            "id",
            "section",
            "title",
            "text",
            "sourceRefs",
            "origin",
            "wording",
            "decision",
        }:
            raise APIError("Invalid resume item", status_code=422, code="invalid_blocks")
        if (
            any(
                not isinstance(block[name], str)
                or not block[name].strip()
                or len(block[name]) > limit
                for name, limit in (("id", 255), ("title", 255), ("text", 6000))
            )
            or block["id"] in ids
            or not all(
                isinstance(block[name], str)
                for name in ("section", "decision", "origin", "wording")
            )
            or block["section"] not in TAILOR_SECTIONS
            or block["decision"] not in {"pending", "accepted", "excluded"}
            or block["origin"] not in {"source", "user"}
            or block["wording"] not in {"source", "proposed", "user"}
            or not isinstance(block["sourceRefs"], list)
            or len(block["sourceRefs"]) > 100
        ):
            raise APIError(
                "Review resume item values and decisions", status_code=422, code="invalid_blocks"
            )
        if any(ord(c) < 32 and c not in "\n\t" for c in block["text"] + block["title"]):
            raise APIError(
                "Remove unsupported control characters", status_code=422, code="invalid_blocks"
            )
        ids.add(block["id"])
        refs = block["sourceRefs"]
        if block["origin"] == "user":
            if refs or block["wording"] != "user":
                raise APIError(
                    "Manual wording must remain user-provided",
                    status_code=422,
                    code="invalid_source",
                )
            continue
        for ref in refs:
            if (
                not isinstance(ref, dict)
                or set(ref) != {"id", "revision"}
                or not isinstance(ref.get("id"), str)
                or ref.get("id") not in facts
                or facts[ref["id"]]["revision"] != ref["revision"]
                or facts[ref["id"]]["section"] != block["section"]
            ):
                reject("A source reference changed", code="tailoring_conflict")
        if not refs:
            raise APIError(
                "A source item needs a source reference", status_code=422, code="invalid_source"
            )
        original = "\n\n".join(facts[ref["id"]]["text"] for ref in refs)
        if block["wording"] != "user" and block["text"] != original:
            raise APIError(
                "Edited wording must be labelled user-provided",
                status_code=422,
                code="invalid_source",
            )


def draft_json(row):
    return {"id": str(row.id), "revision": str(row.revision), **row.payload}
