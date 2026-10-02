"""
PDF in (resume upload -> text, pypdf) and PDF out (tiles -> resume, ReportLab).
Signatures are fixed (DESIGN_SPEC §7).
"""
import io
from xml.sax.saxutils import escape

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer

from .llm import CATEGORIES

LABELS: dict[str, str] = {
    "education": "Education",
    "coursework": "Relevant Coursework",
    "skills": "Skills",
    "experience": "Job Experience",
    "projects": "Projects",
    "other": "Other",
}

# Handy for testing extract_tiles / the parse route without a real PDF.
SAMPLE_RESUME_TEXT = """Jordan Lee
jordan.lee@example.com | (555) 123-4567 | Provo, UT | github.com/jordanlee

EDUCATION
B.S. Computer Science, State University (Expected May 2026), GPA 3.8
Relevant Coursework: Data Structures, Algorithms, Databases, Machine Learning, Operating Systems

SKILLS
Languages: Python, TypeScript, Java, SQL
Frameworks: React, FastAPI, Node.js, PyTorch
Tools: Git, Docker, AWS, PostgreSQL

EXPERIENCE
Software Engineering Intern, Acme Corp (May 2024 – Aug 2024)
• Built a Kafka ingestion service handling 2M events/day
• Reduced p95 API latency by 40% by adding a Redis cache
Teaching Assistant, State University CS Department (Jan 2024 – Present)
• Led weekly labs for 40 students in Data Structures
• Wrote autograder tests used across 3 course sections

PROJECTS
Campus Eats (React, FastAPI, PostgreSQL)
• Food-truck tracker used by 1,200 students in its first month
• Real-time location updates over WebSockets
Stock Sentiment Analyzer (Python, PyTorch)
• Fine-tuned a BERT model on 50k financial headlines, 87% accuracy

OTHER
Dean's List, 6 semesters
Volunteer Math Tutor, Lincoln High School (2022 – Present)
"""


def pdf_to_text(data: bytes) -> str:
    """Join the text of every page. Returns "" for scanned/image-only PDFs."""
    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages).strip()


# --- rendering -------------------------------------------------------------

_BASE = dict(fontName="Helvetica", fontSize=10, leading=12.5, textColor=colors.black)
STYLES = {
    "name": ParagraphStyle("name", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 18, "leading": 22},
                           alignment=TA_CENTER),
    "contact": ParagraphStyle("contact", **{**_BASE, "fontSize": 9.5}, alignment=TA_CENTER, spaceAfter=6),
    "section": ParagraphStyle("section", **{**_BASE, "fontName": "Helvetica-Bold", "fontSize": 11, "leading": 14},
                              spaceBefore=6),
    "heading": ParagraphStyle("heading", **{**_BASE, "fontName": "Helvetica-Bold"}, spaceBefore=3),
    "body": ParagraphStyle("body", **_BASE),
    "bullet": ParagraphStyle("bullet", **_BASE, leftIndent=14, bulletIndent=4),
}


def _tile_flowables(text: str) -> list:
    """DESIGN_SPEC §4.2: line 1 bold heading; '• ' lines are bullets; other lines plain."""
    lines = [ln.rstrip() for ln in text.strip().split("\n") if ln.strip()]
    if not lines:
        return []
    label, sep, rest = lines[0].partition(": ")
    if len(lines) == 1 and sep and len(label) <= 30:
        # "Languages: Python, SQL" -> bold label, normal list
        return [Paragraph(f"<b>{escape(label)}:</b> {escape(rest)}", STYLES["body"])]
    out = [Paragraph(escape(lines[0]), STYLES["heading"])]
    for line in lines[1:]:
        if line.lstrip().startswith("•"):
            out.append(Paragraph(escape(line.lstrip()[1:].strip()), STYLES["bullet"], bulletText="•"))
        else:
            out.append(Paragraph(escape(line), STYLES["body"]))
    return [KeepTogether(out)]


def render_resume(profile: dict, sections: dict[str, list[str]]) -> bytes:
    """sections: category -> ordered tile texts. Returns PDF bytes (Letter, ~0.6in margins)."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.6 * inch, rightMargin=0.6 * inch,
                            topMargin=0.5 * inch, bottomMargin=0.5 * inch,
                            title=profile.get("full_name") or "Resume")

    contact = [profile.get("email"), profile.get("phone"), profile.get("location"), *(profile.get("links") or [])]
    story: list = [Paragraph(escape(profile.get("full_name") or "Your Name"), STYLES["name"])]
    contact_line = "  |  ".join(escape(str(c)) for c in contact if c)
    if contact_line:
        story.append(Paragraph(contact_line, STYLES["contact"]))

    for cat in CATEGORIES:
        texts = [t for t in (sections.get(cat) or []) if t and t.strip()]
        if not texts:
            continue
        story.append(Paragraph(LABELS[cat].upper(), STYLES["section"]))
        story.append(HRFlowable(width="100%", thickness=0.6, color=colors.black, spaceBefore=1, spaceAfter=3))
        for text in texts:
            story.extend(_tile_flowables(text))
        story.append(Spacer(1, 2))

    doc.build(story)
    return buf.getvalue()
