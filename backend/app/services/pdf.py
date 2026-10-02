"""
PDF in (resume upload -> text) and PDF out (tiles -> resume).
STUB: pdf_to_text returns sample text; render_resume writes a bare-bones single-page PDF
by hand (no ReportLab yet) so the /pdfs route can upload and serve something real.
Signatures are fixed (DESIGN_SPEC §7).
"""

from .llm import CATEGORIES

LABELS: dict[str, str] = {
    "education": "Education",
    "coursework": "Relevant Coursework",
    "skills": "Skills",
    "experience": "Job Experience",
    "projects": "Projects",
    "other": "Other",
}

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
    return SAMPLE_RESUME_TEXT


def render_resume(profile: dict, sections: dict[str, list[str]]) -> bytes:
    """sections: category -> ordered tile texts. Returns PDF bytes (Letter, one page)."""
    contact = [profile.get("email"), profile.get("phone"), profile.get("location"), *(profile.get("links") or [])]
    # (font, size, x, text)
    lines: list[tuple[str, int, int, str]] = [
        ("F2", 18, 43, profile.get("full_name") or "Your Name"),
        ("F1", 10, 43, " | ".join(c for c in contact if c)),
    ]
    for cat in CATEGORIES:
        texts = sections.get(cat) or []
        if not texts:
            continue
        lines.append(("F2", 12, 43, LABELS[cat].upper()))
        for text in texts:
            heading, *body = text.split("\n")
            lines.append(("F2", 10, 43, heading))
            for line in body:
                lines.append(("F1", 10, 55 if line.startswith("• ") else 43, line))
    return _build_pdf(lines)


def _escape(s: str) -> bytes:
    # WinAnsi covers the bullet and en dash used in tiles
    return s.encode("cp1252", "replace").replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def _build_pdf(lines: list[tuple[str, int, int, str]]) -> bytes:
    stream = b""
    y = 792 - 50
    for font, size, x, text in lines:
        y -= size + 4
        if y < 40:
            break  # stub: no wrapping or second page
        stream += b"BT /%s %d Tf %d %d Td (%s) Tj ET\n" % (font.encode(), size, x, y, _escape(text[:110]))

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        b"<< /Length %d >>\nstream\n%sendstream" % (len(stream), stream),
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (i, obj)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return out
