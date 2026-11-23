"""Bounded PDF rendering of exactly the selected approved text, never HTML input."""

from functools import lru_cache
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from ..core.errors import APIError


@lru_cache
def font_name():
    path = Path(__file__).resolve().parents[1] / "assets/fonts/NotoSans-Regular.ttf"
    pdfmetrics.registerFont(TTFont("WorkspaceSans", str(path)))
    return "WorkspaceSans"


def render_approved_pdf(blocks):
    selected = [block for block in blocks if block["decision"] == "accepted"]
    text = "\n".join(block["title"] + "\n" + block["text"] for block in selected)
    if not selected or len(text) > 100_000:
        raise APIError(
            "Approve between 1 and 100,000 characters of resume content",
            status_code=422,
            code="pdf_content_limit",
        )
    font = font_name()
    supported = pdfmetrics.getFont(font).face.charToGlyph
    if any(ord(char) not in supported and not char.isspace() for char in text):
        raise APIError(
            "Some characters cannot be rendered by the resume font. "
            "Review the wording before exporting.",
            status_code=422,
            code="unsupported_pdf_characters",
        )
    body = ParagraphStyle(
        "Body",
        fontName=font,
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#29263B"),
        spaceAfter=9,
    )
    heading = ParagraphStyle(
        "Heading",
        parent=body,
        fontSize=13,
        leading=18,
        textColor=colors.HexColor("#1F3CA3"),
        spaceBefore=10,
    )
    story = []
    for block in selected:
        story.append(Paragraph(escape(block["title"]), heading))
        for paragraph in block["text"].split("\n"):
            story.append(Paragraph(escape(paragraph).replace("\t", "    ") or "&#160;", body))
        story.append(Spacer(1, 7))
    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=46,
        leftMargin=46,
        topMargin=40,
        bottomMargin=42,
        title="Approved resume",
        author="",
        pageCompression=1,
    )
    try:
        document.build(story)
    except Exception as exc:
        # Layout errors may include private paragraph content in their exception text.
        raise APIError(
            "The approved text could not be rendered. Review its length and formatting.",
            status_code=422,
            code="pdf_render_failed",
        ) from exc
    return output.getvalue()
