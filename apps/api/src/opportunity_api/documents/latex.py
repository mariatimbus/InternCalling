"""LaTeX sources for tailored CVs and cover letters, compiled to PDF with Tectonic.

Every value from a profile, a posting or a model is escaped, so no input can run a
LaTeX command, and Tectonic runs with ``--untrusted`` (no shell escape).
"""

import hashlib
import io
import logging
import os
import platform
import re
import shutil
import subprocess
import tarfile
import tempfile
import threading
from datetime import date
from pathlib import Path

import httpx

from ..core.config import get_settings
from ..core.errors import APIError

log = logging.getLogger(__name__)

VERSION = "0.17.0"
# (system, machine) -> release target and its published sha256.
RELEASES = {
    ("linux", "x86_64"): (
        "x86_64-unknown-linux-musl",
        "8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7",
    ),
    ("darwin", "arm64"): (
        "aarch64-apple-darwin",
        "a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667",
    ),
    ("darwin", "x86_64"): (
        "x86_64-apple-darwin",
        "7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80",
    ),
}
URL = (
    "https://github.com/tectonic-typesetting/tectonic/releases/download/"
    "tectonic%40{version}/tectonic-{version}-{target}.tar.gz"
)
_lock = threading.Lock()

_SPECIAL = {
    "\\": r"\textbackslash{}",
    "{": r"\{",
    "}": r"\}",
    "$": r"\$",
    "&": r"\&",
    "#": r"\#",
    "^": r"\textasciicircum{}",
    "_": r"\_",
    "~": r"\textasciitilde{}",
    "%": r"\%",
}
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def tex(text: str) -> str:
    """Plain text as LaTeX that prints exactly that text."""
    text = " ".join(_CONTROL.sub(" ", text or "").split())
    return "".join(_SPECIAL.get(char, char) for char in text)


def month_year(value: str) -> str:
    """``2024-05`` -> ``May 2024``; ``2024`` stays ``2024``."""
    match = re.fullmatch(r"(\d{4})(?:-(\d{2}))?", value or "")
    if not match:
        return value or ""
    year, month = match.groups()
    return date(int(year), int(month), 1).strftime("%b %Y") if month else year


def span(start: str, end: str, current: bool = False) -> str:
    left, right = month_year(start), "Present" if current else month_year(end)
    return " -- ".join(tex(part) for part in (left, right) if part)


PREAMBLE = r"""\documentclass[10pt]{article}
\usepackage[a4paper,margin=1.6cm]{geometry}
\usepackage{fontspec}
\setmainfont{texgyreheros}[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,
  ItalicFont=*-italic,BoldItalicFont=*-bolditalic]
\usepackage{xcolor}
\definecolor{ink}{HTML}{29263B}
\definecolor{accent}{HTML}{1F3CA3}
\definecolor{soft}{HTML}{4A3F74}
\usepackage{enumitem}
\setlist[itemize]{leftmargin=1.2em,topsep=2pt,itemsep=1.5pt,parsep=0pt,label={\textbullet}}
\usepackage[hidelinks]{hyperref}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\newcommand{\cvsection}[1]{\vspace{9pt}{\color{accent}\bfseries\large #1}\par
  \vspace{2pt}{\color{accent!35}\hrule height 0.6pt}\vspace{5pt}}
\newcommand{\cventry}[2]{{\bfseries #1}\hfill{\small\color{soft}#2}\par}
\newcommand{\cvsub}[2]{{\color{soft}#1}\hfill{\small\color{soft}#2}\par}
"""


def _header(name: str, contact: list[str]) -> str:
    line = r" \enspace{\color{accent!50}|}\enspace ".join(tex(c) for c in contact if c)
    return (
        r"{\color{ink}\LARGE\bfseries " + tex(name) + r"}\par\vspace{3pt}"
        r"{\small\color{soft}" + line + r"}\par" + "\n"
    )


def _items(lines: list[str]) -> str:
    if not lines:
        return ""
    # "\item{}" so text starting with "[" is never read as an optional label.
    body = "\n".join(r"\item{} " + tex(line) for line in lines)
    return "\\begin{itemize}\n" + body + "\n\\end{itemize}\n"


def _cmd(name: str, *args: str) -> str:
    """``\\name{a}{b}`` from arguments that are already LaTeX."""
    return "\\" + name + "".join("{" + arg + "}" for arg in args)


def _entry(title: str, when: str, subtitle: str = "", where: str = "") -> str:
    """``when`` is already LaTeX (see ``span``); the rest is plain text."""
    line = _cmd("cventry", tex(title), when)
    if subtitle or where:
        line += _cmd("cvsub", tex(subtitle), tex(where))
    return line + r"\vspace{1pt}"


def resume_source(doc: dict) -> str:
    """``doc``: name, contact, summary, education, experience, projects, skills, extras."""
    parts = [PREAMBLE, r"\begin{document}\color{ink}", _header(doc["name"], doc["contact"])]
    if doc.get("summary"):
        parts += [r"\vspace{6pt}", tex(doc["summary"]) + r"\par"]
    if doc.get("education"):
        parts.append(r"\cvsection{Education}")
        for e in doc["education"]:
            parts.append(_entry(e["school"], tex(e["when"]), e["degree"]))
    sections = (
        ("Experience", "experience"),
        ("Research", "research"),
        ("Projects", "projects"),
        ("Leadership & Activities", "activities"),
    )
    for title, key in sections:
        if doc.get(key):
            parts.append(_cmd("cvsection", tex(title)))
            for e in doc[key]:
                parts.append(_entry(e["title"], e["when"], e["subtitle"], e["where"]))
                parts.append(_items(e["bullets"]))
                parts.append(r"\vspace{3pt}")
    if doc.get("skills"):
        parts += [r"\cvsection{Skills}", tex(", ".join(doc["skills"])) + r"\par"]
    for title, values in doc.get("extras", []):
        if values:
            parts += [_cmd("cvsection", tex(title)), tex(" · ".join(values)) + r"\par"]
    parts.append(r"\end{document}")
    return "\n".join(parts) + "\n"


def letter_source(doc: dict) -> str:
    """``doc``: name, contact, organization, title, paragraphs."""
    today = date.today().strftime("%d %B %Y").lstrip("0")
    parts = [
        PREAMBLE.replace("margin=1.6cm", "margin=2.2cm"),
        r"\begin{document}\color{ink}",
        _header(doc["name"], doc["contact"]),
        r"\vspace{18pt}" + tex(today) + r"\par\vspace{12pt}",
        r"Hiring Team\\" + tex(doc["organization"] or "") + r"\par\vspace{12pt}",
        r"{\bfseries Application for " + tex(doc["title"]) + r"}\par\vspace{10pt}",
        r"Dear Hiring Team,\par\vspace{8pt}",
        r"\setlength{\parskip}{8pt}",
    ]
    parts += [tex(p) + r"\par" for p in doc["paragraphs"]]
    parts += [
        r"\vspace{6pt}Kind regards,\par\vspace{4pt}{\bfseries " + tex(doc["name"]) + r"}",
        r"\end{document}",
    ]
    return "\n".join(parts) + "\n"


# --- compiling ----------------------------------------------------------------------


def _unavailable() -> APIError:
    return APIError(
        "The PDF renderer is not available right now. Please try again in a minute.",
        status_code=503,
        code="pdf_renderer_unavailable",
    )


def _root() -> Path:
    # Writable on Vercel (/tmp) and locally; removed with the system's temp files.
    return Path(tempfile.gettempdir()) / "interncalling-tectonic"


def tectonic() -> Path:
    """A Tectonic binary: configured, on PATH, or the pinned release fetched once."""
    configured = get_settings().tectonic_path or shutil.which("tectonic")
    if configured:
        return Path(configured)
    machine = {"amd64": "x86_64", "aarch64": "arm64"}.get(platform.machine().lower())
    key = (platform.system().lower(), machine or platform.machine().lower())
    if key not in RELEASES:
        raise _unavailable()
    target, digest = RELEASES[key]
    exe = _root() / VERSION / "tectonic"
    with _lock:
        if exe.exists():
            return exe
        try:
            response = httpx.get(
                URL.format(version=VERSION, target=target), follow_redirects=True, timeout=60
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning("Tectonic download failed: %s", type(exc).__name__)
            raise _unavailable() from exc
        if hashlib.sha256(response.content).hexdigest() != digest:
            log.error("Tectonic download did not match its pinned sha256")
            raise _unavailable()
        with tarfile.open(fileobj=io.BytesIO(response.content), mode="r:gz") as archive:
            member = archive.extractfile("tectonic")
            if member is None:
                raise _unavailable()
            exe.parent.mkdir(parents=True, exist_ok=True)
            partial = exe.with_suffix(f".{os.getpid()}")
            partial.write_bytes(member.read())
        partial.chmod(0o755)
        os.replace(partial, exe)
    return exe


def compile_pdf(source: str) -> bytes:
    exe = tectonic()
    cache = _root() / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    env = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": str(_root()),
        "TECTONIC_CACHE_DIR": str(cache),
    }
    with tempfile.TemporaryDirectory() as work:
        Path(work, "document.tex").write_text(source, encoding="utf-8")
        try:
            run = subprocess.run(
                [str(exe), "-X", "compile", "--untrusted", "--outdir", work, "document.tex"],
                cwd=work,
                env=env,
                capture_output=True,
                timeout=150,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            log.warning("Tectonic did not finish: %s", type(exc).__name__)
            raise _unavailable() from exc
        pdf = Path(work, "document.pdf")
        if run.returncode or not pdf.exists():
            log.warning("Tectonic failed: %s", run.stderr.decode(errors="replace")[-800:])
            raise APIError(
                "The PDF could not be produced.", status_code=502, code="pdf_render_failed"
            )
        return pdf.read_bytes()
