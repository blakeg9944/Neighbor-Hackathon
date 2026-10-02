"""
PDF in (resume upload -> text, pypdf) and PDF out (tiles -> resume, ReportLab).
Signatures are fixed (DESIGN_SPEC §7).
"""
import io
import json
import re
from pathlib import Path
from xml.sax.saxutils import escape

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily, stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

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
# Styling comes from shared/resume_templates.json (also read by the frontend's live preview, so the two match).
# Keep the entry composition below in sync with frontend/src/lib/preview.ts.

TEMPLATES_FILE = Path(__file__).resolve().parents[3] / "shared" / "resume_templates.json"
FONT_DIR = Path(__file__).resolve().parents[1] / "fonts"
_CONFIG = json.loads(TEMPLATES_FILE.read_text(encoding="utf-8"))
TEMPLATES: dict[str, dict] = _CONFIG["templates"]
DEFAULT_TEMPLATE: str = _CONFIG["default"]
FIT_MIN, FIT_MAX = _CONFIG["fit"]["min"], _CONFIG["fit"]["max"]


def _register_fonts() -> None:
    """Register each template's TTF family once, so <b>/<i> markup picks the right face."""
    done: set[str] = set()
    for t in TEMPLATES.values():
        fam = t["pdf_font"]
        if fam in done:
            continue
        faces = {"regular": fam, "bold": f"{fam}-Bold", "italic": f"{fam}-Italic", "boldItalic": f"{fam}-BoldItalic"}
        for key, name in faces.items():
            pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / t["files"][key])))
        registerFontFamily(fam, normal=faces["regular"], bold=faces["bold"], italic=faces["italic"],
                           boldItalic=faces["boldItalic"])
        done.add(fam)


_register_fonts()

_ALIGN = {"left": TA_LEFT, "center": TA_CENTER, "right": TA_RIGHT}


def _styles(t: dict, f: float) -> dict[str, ParagraphStyle]:
    fam, size, lead = t["pdf_font"], t["base_size"] * f, t["leading"] * f
    base = dict(fontName=fam, fontSize=size, leading=lead, textColor=colors.black)
    name, contact = t["name"], t["contact"]
    indent = t["bullet_indent"] * f
    return {
        "name": ParagraphStyle("name", **{**base, "fontName": f"{fam}-Bold", "fontSize": name["size"] * f,
                                          "leading": name["size"] * f * 1.2, "textColor": colors.HexColor(name["color"])},
                               alignment=_ALIGN[name["align"]]),
        "contact": ParagraphStyle("contact", **{**base, "fontSize": contact["size"] * f,
                                                "leading": contact["size"] * f * 1.3},
                                  alignment=_ALIGN[contact["align"]], spaceAfter=contact["space_after"] * f),
        "body": ParagraphStyle("body", **base),
        "right": ParagraphStyle("right", **base, alignment=TA_RIGHT),
        "bullet": ParagraphStyle("bullet", **base, leftIndent=indent, bulletIndent=indent * 0.3),
    }


class _SectionHeading(Flowable):
    """Section title with letter spacing (Paragraph can't track letters) and a rule underneath."""

    def __init__(self, text: str, t: dict, f: float):
        super().__init__()
        sec = t["section"]
        self.text = text.upper() if sec["caps"] else text
        self.font, self.size = f"{t['pdf_font']}-Bold", sec["size"] * f
        self.track, self.color, self.rule = sec["tracking"] * f, colors.HexColor(sec["color"]), sec["rule"]
        self.before, self.after = sec["space_before"] * f, sec["space_after"] * f

    def wrap(self, avail_w, avail_h):
        self.width = avail_w
        self.height = self.before + self.size * 1.15 + 2 + self.rule + self.after
        return self.width, self.height

    def draw(self):
        c = self.canv
        text = c.beginText(0, self.after + self.rule + 2 + self.size * 0.25)
        text.setFont(self.font, self.size)
        text.setCharSpace(self.track)
        text.setFillColor(self.color)
        text.textLine(self.text)
        c.drawText(text)
        if self.rule:
            c.setStrokeColor(self.color)
            c.setLineWidth(self.rule)
            c.line(0, self.after, self.width, self.after)


# --- entry composition (mirror of frontend/src/lib/preview.ts entryParts) ---------------------

def _dash(s: str | None) -> str | None:
    """Normalize date-range dashes: "2022-2023" / "May 2024 - Aug 2024" -> en dash with spaces."""
    return re.sub(r"\s*[-–—]\s*", " – ", s.strip()) if s and s.strip() else None


def _dates(start: str | None, end: str | None) -> str:
    return " – ".join(d for d in (_dash(start), _dash(end)) if d)


def _url(link: str) -> str:
    return link if re.match(r"^[a-z]+:", link, re.I) else f"https://{link}"


def _link(text: str, href: str) -> str:
    return f'<a href="{escape(href)}">{escape(text)}</a>'


def entry_parts(category: str, d: dict) -> tuple[list[tuple[str, str]], list[str]]:
    """Structured tile data -> ([(left_markup, right_markup) rows], bullet texts). Markup is ReportLab mini-HTML."""
    e = lambda s: escape(s or "")  # noqa: E731
    b = lambda s: f"<b>{e(s)}</b>" if s else ""  # noqa: E731
    i = lambda s: f"<i>{e(s)}</i>" if s else ""  # noqa: E731
    rows: list[tuple[str, str]] = []
    bullets = [x for x in (d.get("bullets") or []) if x]
    if category == "experience":
        rows.append((b(d.get("title")), e(_dates(d.get("start_date"), d.get("end_date")))))
        if d.get("organization") or d.get("location"):
            rows.append((i(d.get("organization")), i(d.get("location"))))
    elif category == "education":
        degree = " ".join(x for x in (d.get("degree_type"), d.get("degree")) if x)
        if d.get("minor"):
            degree = f"{degree}, Minor in {d['minor']}" if degree else f"Minor in {d['minor']}"
        if d.get("gpa"):
            degree = f"{degree} · GPA {d['gpa']}" if degree else f"GPA {d['gpa']}"
        rows.append((b(d.get("institution")), e(_dates(d.get("start_date"), d.get("end_date")))))
        if degree or d.get("location"):
            rows.append((i(degree), i(d.get("location"))))
        bullets = [x for x in (d.get("details") or []) if x]
    elif category == "projects":
        left = b(d.get("name"))
        if d.get("technologies"):
            left += f" · {i(', '.join(d['technologies']))}"
        rows.append((left, e(_dash(d.get("date")))))
        if d.get("link"):
            rows.append((f"<i>{_link(d['link'], _url(d['link']))}</i>", ""))
    else:  # other
        left = b(d.get("title"))
        if d.get("organization"):
            left += f", {e(d['organization'])}"
        rows.append((left, e(_dash(d.get("date")))))
    return rows, bullets


def _row(left: str, right: str, st: dict, avail: float):
    if not right:
        return Paragraph(left, st["body"])
    plain = re.sub(r"<[^>]+>", "", right)
    st_r = st["right"]
    right_w = min(avail * 0.45, stringWidth(plain, f"{st_r.fontName}-Italic" if "<i>" in right else st_r.fontName,
                                           st_r.fontSize) + 4)
    tbl = Table([[Paragraph(left, st["body"]), Paragraph(right, st_r)]], colWidths=[avail - right_w, right_w])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tbl


def _freeform(text: str, category: str, st: dict) -> list:
    """DESIGN_SPEC §4.2: line 1 bold heading; '• ' lines are bullets; other lines plain."""
    lines = [ln.rstrip() for ln in text.strip().split("\n") if ln.strip()]
    if not lines:
        return []
    label, sep, rest = lines[0].partition(": ")
    if len(lines) == 1 and sep and category == "coursework" and "cours" in label.lower():
        return [Paragraph(escape(rest), st["body"])]  # "Relevant Coursework: ..." under that header: drop the label
    if len(lines) == 1 and sep and len(label) <= 30:
        return [Paragraph(f"<b>{escape(label)}:</b> {escape(rest)}", st["body"])]  # "Languages: Python, SQL"
    if len(lines) == 1 and category == "skills":
        return [Paragraph(escape(lines[0]), st["body"])]
    heading = re.sub(r"(?<=\w)\s+[-–—]\s+(?=\w)", " – ", lines[0])
    out = [Paragraph(f"<b>{escape(heading)}</b>", st["body"])]
    for line in lines[1:]:
        if line.lstrip().startswith("•"):
            out.append(Paragraph(escape(line.lstrip()[1:].strip()), st["bullet"], bulletText="•"))
        else:
            out.append(Paragraph(escape(line), st["body"]))
    return out


def _entry(entry, category: str, st: dict, avail: float) -> list:
    if isinstance(entry, str):
        return _freeform(entry, category, st)
    rows, bullets = entry_parts(entry.get("category") or category, entry.get("data") or {})
    out = [_row(left, right, st, avail) for left, right in rows if left or right]
    out += [Paragraph(escape(b), st["bullet"], bulletText="•") for b in bullets]
    return out


def _contact_markup(profile: dict) -> str:
    parts = []
    if profile.get("email"):
        parts.append(_link(profile["email"], f"mailto:{profile['email']}"))
    for key in ("phone", "location"):
        if profile.get(key):
            parts.append(escape(str(profile[key])))
    for link in profile.get("links") or []:
        if link:
            parts.append(_link(re.sub(r"^https?://(www\.)?", "", link).rstrip("/"), _url(link)))
    return "  ·  ".join(parts)


def _story(profile: dict, sections: dict[str, list], t: dict, f: float, labels: dict[str, str], avail: float) -> list:
    st = _styles(t, f)
    story: list = [Paragraph(escape(profile.get("full_name") or "Your Name"), st["name"])]
    if contact := _contact_markup(profile):
        story.append(Paragraph(contact, st["contact"]))
    gap = t["entry_gap"] * f
    for cat in [c for c in sections if c in LABELS] or CATEGORIES:
        entries = [e for e in (sections.get(cat) or []) if (e.strip() if isinstance(e, str) else e)]
        blocks = [b for b in (_entry(e, cat, st, avail) for e in entries) if b]
        if not blocks:
            continue
        heading = _SectionHeading(labels.get(cat) or LABELS[cat], t, f)
        # Keep each entry together, and the heading with its first entry (no orphaned headings).
        story.append(KeepTogether([heading, *blocks[0]]))
        for block in blocks[1:]:
            story.append(KeepTogether([Spacer(1, gap), *block]))
    return story


def _build(profile, sections, t, f, labels, meta) -> tuple[bytes, int]:
    margin_x, margin_y = t["margins"]["x"] * inch, t["margins"]["y"] * inch
    name = profile.get("full_name") or "Resume"
    job = " at ".join(x for x in (meta.get("title"), meta.get("company")) if x)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter, leftMargin=margin_x, rightMargin=margin_x, topMargin=margin_y, bottomMargin=margin_y,
        title=f"{name} – Resume" + (f" – {job}" if job else ""), author=name,
        subject=f"Resume for {job}" if job else "Resume", creator="trimdcv",
    )
    pages = [0]

    def count(canvas, _doc):
        pages[0] += 1

    avail = doc.width - 12  # SimpleDocTemplate's frame has 6pt padding on each side
    doc.build(_story(profile, sections, t, f, labels, avail), onFirstPage=count, onLaterPages=count)
    return buf.getvalue(), pages[0]


def render_resume(profile: dict, sections: dict[str, list], template: str | None = None,
                  labels: dict[str, str] | None = None, meta: dict | None = None) -> bytes:
    """sections: category -> ordered entries, in print order. An entry is either freeform text (str) or
    {"category", "data"} for structured tiles (laid out with right-aligned dates, see entry_parts).
    Auto-fit: text and spacing scale between fit.min and fit.max to fill exactly one page when possible;
    if it can't fit even at fit.min, the smallest size is used and the PDF runs onto page 2.
    Returns PDF bytes (Letter)."""
    t = TEMPLATES.get(template or "") or TEMPLATES[DEFAULT_TEMPLATE]
    args = (profile, sections, t)
    labels, meta = labels or {}, meta or {}
    pdf, pages = _build(*args, FIT_MAX, labels, meta)
    if pages <= 1:
        return pdf  # fits even at the largest size
    best, pages = _build(*args, FIT_MIN, labels, meta)
    if pages > 1:
        return best  # too long even at the smallest size (the editor warns about this)
    lo, hi = FIT_MIN, FIT_MAX
    for _ in range(7):  # largest size that still fits on one page
        mid = (lo + hi) / 2
        pdf, pages = _build(*args, mid, labels, meta)
        if pages <= 1:
            lo, best = mid, pdf
        else:
            hi = mid
    return best
