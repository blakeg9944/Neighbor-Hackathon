"""Structured tile data per category (stored in resume_items.content, exposed as Tile.data).

A tile's `text` is generated from its data by render_text(), so everything that reads text
(UI, embeddings, select_tiles) keeps working. Tiles without data are freeform text (old tiles,
manual text tiles). Skills and coursework are one tile per skill/course; pdf_lines() regroups them.

Models have no defaults on purpose: OpenAI strict structured outputs require every field
(nullable fields are `str | None`). Use coerce() to fill in missing keys for API input.
"""
from typing import get_args, get_origin

from pydantic import BaseModel, Field


class EducationData(BaseModel):
    institution: str
    degree: str | None = Field(description='Field of study, e.g. "Computer Science"')
    degree_type: str | None = Field(description='e.g. "B.S.", "M.S.", "Ph.D.", "High School Diploma"')
    gpa: str | None = Field(description='As written, e.g. "3.8" or "3.8/4.0"')
    minor: str | None
    location: str | None
    start_date: str | None
    end_date: str | None = Field(description='Graduation or end date as written, e.g. "Expected May 2026"')
    details: list[str] = Field(description="Honors, scholarships, thesis, etc. (not courses)")


class ExperienceData(BaseModel):
    title: str
    organization: str | None
    location: str | None
    start_date: str | None
    end_date: str | None
    bullets: list[str]


class ProjectData(BaseModel):
    name: str
    technologies: list[str]
    link: str | None
    date: str | None
    bullets: list[str]


class SkillData(BaseModel):
    name: str = Field(description='ONE skill, e.g. "Python"')
    group: str | None = Field(description='Label from the resume, e.g. "Languages", "Frameworks", "Tools"; null if none')


class CourseData(BaseModel):
    name: str = Field(description='ONE course, e.g. "Data Structures"')
    code: str | None = Field(description='Course code if written, e.g. "CS 235"')


class OtherData(BaseModel):
    title: str
    organization: str | None
    date: str | None
    kind: str | None = Field(description='e.g. "award", "certification", "volunteer", "leadership", "publication"')
    bullets: list[str]


CATEGORY_MODELS: dict[str, type[BaseModel]] = {
    "education": EducationData,
    "coursework": CourseData,
    "skills": SkillData,
    "experience": ExperienceData,
    "projects": ProjectData,
    "other": OtherData,
}


def coerce(category: str, data: dict) -> dict:
    """Validate API-supplied data: missing optional fields become None / []. Raises pydantic.ValidationError."""
    model = CATEGORY_MODELS[category]
    filled = {}
    for name, field in model.model_fields.items():
        if name in data:
            filled[name] = data[name]
        elif get_origin(field.annotation) is list:
            filled[name] = []
        elif type(None) in get_args(field.annotation):
            filled[name] = None
    return model.model_validate(filled).model_dump()


# --- text rendering (DESIGN_SPEC §4.2: line 1 heading, "• " bullet lines) ---------------------

def _dates(start: str | None, end: str | None) -> str:
    return " – ".join(d for d in (start, end) if d)


def _join(*parts: str | None, sep: str = ", ") -> str:
    return sep.join(p for p in parts if p)


def _with_bullets(heading: str, bullets: list[str]) -> str:
    return "\n".join([heading, *(f"• {b}" for b in bullets if b)])


def render_text(category: str, data: dict) -> str:
    d = data
    if category == "education":
        degree = _join(d.get("degree_type"), d.get("degree"), sep=" ")
        if d.get("minor"):
            degree = _join(degree, f"Minor in {d['minor']}")
        head = _join(degree, d.get("institution"))
        if dates := _dates(d.get("start_date"), d.get("end_date")):
            head += f" ({dates})"
        if d.get("gpa"):
            head += f", GPA {d['gpa']}"
        return _with_bullets(head, d.get("details") or [])
    if category == "experience":
        head = _join(d.get("title"), d.get("organization"))
        if dates := _dates(d.get("start_date"), d.get("end_date")):
            head += f" ({dates})"
        return _with_bullets(head, d.get("bullets") or [])
    if category == "projects":
        head = d.get("name") or ""
        if d.get("technologies"):
            head += f" ({', '.join(d['technologies'])})"
        if d.get("date"):
            head += f", {d['date']}"
        return _with_bullets(head, d.get("bullets") or [])
    if category == "skills":
        return d.get("name") or ""
    if category == "coursework":
        return d.get("name") or ""
    # other
    head = _join(d.get("title"), d.get("organization"))
    if d.get("date"):
        head += f" ({d['date']})"
    return _with_bullets(head, d.get("bullets") or [])


# --- PDF regrouping ---------------------------------------------------------------------------

def pdf_lines(category: str, tiles: list[dict]) -> list[str]:
    """Selected tiles of one section (in layout order) -> texts for pdf.render_resume.

    skills: structured tiles grouped by `group` (first-appearance order) -> "Languages: Python, Java";
    coursework: structured tiles -> one "Relevant Coursework: A, B" line;
    freeform tiles (no data) pass through as their own line, in place.
    """
    if category not in ("skills", "coursework"):
        return [t["text"] for t in tiles]

    lines: list[str | list[str]] = []        # str = freeform line, list = a group's names
    groups: dict[str, list[str]] = {}
    labels: dict[int, str] = {}
    for t in tiles:
        data = t.get("data")
        if not data:
            lines.append(t["text"])
            continue
        key = (data.get("group") or "") if category == "skills" else "Relevant Coursework"
        if key not in groups:
            groups[key] = []
            labels[len(lines)] = key
            lines.append(groups[key])
        groups[key].append(data.get("name") or t["text"])

    out = []
    for i, line in enumerate(lines):
        if isinstance(line, str):
            out.append(line)
        else:
            label = labels[i]
            out.append(f"{label}: {', '.join(line)}" if label else ", ".join(line))
    return out
