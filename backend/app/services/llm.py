"""
OpenAI calls: resume -> tiles, job text -> summary, tiles + job -> layout (DESIGN_SPEC §7, §7.1).
Uses structured outputs (Pydantic). Signatures are fixed.
If OPENAI_API_KEY is not set, every function returns the realistic hardcoded stub data instead,
so the rest of the app still works offline.
"""
import json
import os
import re
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from .tile_data import (
    CourseData, EducationData, ExperienceData, OtherData, ProjectData, SkillData, render_text,
)

load_dotenv()

# Fixed order used everywhere (DESIGN_SPEC §4.1)
CATEGORIES: tuple[str, ...] = ("education", "coursework", "skills", "experience", "projects", "other")

# Rough one-page budget per section (DESIGN_SPEC §7.1)
# skills/coursework are one tile per skill/course, so their budgets count individual items.
BUDGET: dict[str, int] = {"education": 2, "coursework": 6, "skills": 12, "experience": 4, "projects": 3, "other": 2}

MODEL = os.getenv("OPENAI_MODEL") or "gpt-5.6-luna"
# gpt-5 models default to medium reasoning (~3x slower on extract_tiles); "low" keeps quality, "none" is fastest.
REASONING_EFFORT = os.getenv("OPENAI_REASONING_EFFORT") or "low"
USE_STUBS = not os.getenv("OPENAI_API_KEY")

if USE_STUBS:
    print("\n" + "!" * 72 + "\n  llm.py: OPENAI_API_KEY is not set -> STUB MODE. Resume parsing returns FAKE tiles\n"
          "  (written to the real bank) and every job gets a fake Acme summary.\n" + "!" * 72 + "\n")

Category = Literal["education", "coursework", "skills", "experience", "projects", "other"]

EMBED_MODEL = "text-embedding-3-small"  # 1536 dims, matches vector(1536) in the schema

_client = None


def _openai():
    global _client
    if _client is None:
        from openai import OpenAI
        _client = OpenAI()
    return _client


def embed(text: str) -> list[float] | None:
    """Vector for fit scoring (profile = all tile texts, job = title + summary + bullets + posting).
    Returns None in stub mode, so fit scores are simply null without an API key."""
    if USE_STUBS or not text.strip():
        return None
    return _openai().embeddings.create(model=EMBED_MODEL, input=text[:24000]).data[0].embedding


def _parse(instructions: str, user_input: str, schema: type[BaseModel]) -> BaseModel:
    kwargs = {}
    # Reasoning models (gpt-5*, o*) reject temperature; older chat models take a low one.
    if MODEL.startswith(("gpt-4", "gpt-3")):
        kwargs["temperature"] = 0.2
    elif MODEL.startswith(("gpt-5", "o")):
        kwargs["reasoning"] = {"effort": REASONING_EFFORT}
    res = _openai().responses.parse(
        model=MODEL, instructions=instructions, input=user_input, text_format=schema, **kwargs
    )
    if res.output_parsed is None:
        raise RuntimeError("OpenAI returned no parsed output (refusal or truncation)")
    return res.output_parsed


# ---------------------------------------------------------------------------
# extract_tiles
# ---------------------------------------------------------------------------
class _ResumeOut(BaseModel):
    education: list[EducationData]
    coursework: list[CourseData]
    skills: list[SkillData]
    experience: list[ExperienceData]
    projects: list[ProjectData]
    other: list[OtherData]


EXTRACT_INSTRUCTIONS = """You turn a resume into structured entries for a resume builder.

Return one list per category: education, coursework, skills, experience, projects, other.

Rules:
- Copy every field VERBATIM from the resume (only clean up whitespace). Never invent or infer content;
  use null (or an empty list) when a field isn't on the resume.
- education: one entry per degree/school. degree_type = "B.S.", "M.S.", "Ph.D.", "Associate", etc.;
  degree = field of study ("Computer Science"); gpa as written. Do NOT put courses in education.
- coursework: ONE entry PER COURSE (e.g. "Data Structures", "Algorithms"), including courses listed under
  education. Put a course code in `code` only if the resume shows one.
- skills: ONE entry PER SKILL (e.g. "Python", "React", "Docker"). Split comma/slash/pipe lists into separate
  entries. group = the resume's own label for that line ("Languages", "Frameworks", "Tools"...), else null.
- experience: one entry per job/role (internships, research, TA positions too). bullets = the entry's bullet
  points without the bullet character.
- projects: one entry per project. technologies = the tech stack if listed.
- other: awards, certifications, volunteering, leadership, publications, interests. kind = the type.
- Skip the name/contact header (email, phone, links, address); that comes from the profile."""

_EXTRACT_ORDER = ("education", "coursework", "skills", "experience", "projects", "other")


def extract_tiles(resume_text: str) -> list[dict]:
    """-> [{"category": Category, "text": str, "data": dict}]; text is generated from data (DESIGN_SPEC §4.2)."""
    if USE_STUBS:
        return [dict(t) for t in _STUB_TILES]
    out = _parse(EXTRACT_INSTRUCTIONS, resume_text, _ResumeOut)
    tiles = []
    for category in _EXTRACT_ORDER:
        for entry in getattr(out, category):
            data = _clean_data(entry.model_dump())
            text = render_text(category, data)
            if text.strip():
                tiles.append({"category": category, "text": text, "data": data})
    return tiles


def _clean_data(value):
    """Recursively clean strings from PDF text: collapse whitespace, strip leading bullet characters."""
    if isinstance(value, dict):
        return {k: _clean_data(v) for k, v in value.items()}
    if isinstance(value, list):
        return [c for c in (_clean_data(v) for v in value) if c]
    if isinstance(value, str):
        return _clean_line(value).removeprefix("• ").strip() or None
    return value


def _clean_line(line: str) -> str:
    """Collapse whitespace runs (PDF text is full of them) and normalize '-'/'*' bullets to '• '."""
    line = re.sub(r"\s+", " ", line).strip()
    line = re.sub(r" +([,;])", r"\1", line)  # "University , Provo" -> "University, Provo"
    return re.sub(r"^[-*•●▪◦]\s*", "• ", line)


# ---------------------------------------------------------------------------
# summarize_job
# ---------------------------------------------------------------------------
class _JobOut(BaseModel):
    title: str
    company: str
    summary: str = Field(description="2-3 sentence factual overview of the role")
    bullets: list[str] = Field(description="5-8 most important requirements/responsibilities")


SUMMARIZE_INSTRUCTIONS = """You read a job posting (possibly scraped page text with navigation noise) and extract:
- title: the job title
- company: the hiring company
- summary: 2-3 factual, concise sentences about the role
- bullets: the 5-8 most important requirements and responsibilities, each short (under ~15 words)
Use only information in the posting. If the company isn't stated, infer it from the URL."""


def summarize_job(job_text: str, url: str) -> dict:
    """-> {"title", "company", "summary", "bullets": list[str] (5–8)}"""
    if USE_STUBS:
        return json.loads(json.dumps(_STUB_JOB))
    out = _parse(SUMMARIZE_INSTRUCTIONS, f"URL: {url}\n\nPOSTING:\n{job_text}", _JobOut)
    return {"title": out.title, "company": out.company, "summary": out.summary, "bullets": out.bullets[:8]}


# ---------------------------------------------------------------------------
# select_tiles
# ---------------------------------------------------------------------------
class _SectionsOut(BaseModel):
    education: list[str]
    coursework: list[str]
    skills: list[str]
    experience: list[str]
    projects: list[str]
    other: list[str]


class _LayoutOut(BaseModel):
    sections: _SectionsOut


SELECT_INSTRUCTIONS = f"""You tailor a one-page resume to a job by SELECTING and ORDERING the candidate's tiles.
You never rewrite tiles. Each tile has a short key like "t3".

Return, for each of the 6 sections, the keys of the tiles to include, ordered most relevant first.
- Only use keys from the input. Use each key at most once.
- Normally keep each tile in its own category's section.
- One-page budget (maximums): {json.dumps(BUDGET)}.
- Prefer tiles whose skills/experience match the job's requirements. Always include education if any exists.
- Skills and coursework tiles are ONE skill / ONE course each: pick the individual skills and courses that
  matter for this job (most relevant first) and skip unrelated ones.
- Leave out weak or irrelevant tiles; anything not selected goes to "unused" automatically."""


def select_tiles(job: dict, job_text: str, tiles: list[dict]) -> dict:
    """tiles: [{"id","category","text"}] -> Layout {"sections": {6 keys: [ids]}, "unused": [ids]}

    The LLM sees short keys (t1, t2, ...) instead of UUIDs so it can't garble IDs; we map them back.
    Unknown keys are dropped; the caller (routes) validates the final layout anyway.
    """
    if USE_STUBS or not tiles:
        return _budget_layout(tiles)

    key_to_id = {f"t{i}": t["id"] for i, t in enumerate(tiles, 1)}
    listing = "\n\n".join(f"[{k}] ({_tile_label(t)})\n{t['text']}" for k, t in zip(key_to_id, tiles))
    job_info = {k: job.get(k) for k in ("title", "company", "summary", "bullets")}
    user_input = (
        f"JOB:\n{json.dumps(job_info, indent=1)}\n\nPOSTING TEXT (truncated):\n{(job_text or '')[:6000]}"
        f"\n\nCANDIDATE TILES:\n{listing}"
    )
    out = _parse(SELECT_INSTRUCTIONS, user_input, _LayoutOut)

    sections: dict[str, list[str]] = {}
    used: set[str] = set()
    for cat in CATEGORIES:
        ids = []
        for key in getattr(out.sections, cat):
            tid = key_to_id.get(key.strip().strip("[]"))
            if tid and tid not in used:
                ids.append(tid)
                used.add(tid)
        sections[cat] = ids
    unused = [t["id"] for t in tiles if t["id"] not in used]
    return {"sections": sections, "unused": unused}


def _tile_label(t: dict) -> str:
    """"skills: Languages" for grouped skills, else just the category."""
    group = (t.get("data") or {}).get("group") if t["category"] == "skills" else None
    return f"{t['category']}: {group}" if group else t["category"]


def _budget_layout(tiles: list[dict]) -> dict:
    """Fallback: keep each tile in its bank category, first N per BUDGET, rest go to unused."""
    sections: dict[str, list[str]] = {c: [] for c in CATEGORIES}
    unused: list[str] = []
    for t in tiles:
        placed = sections.get(t["category"])
        if placed is not None and len(placed) < BUDGET[t["category"]]:
            placed.append(t["id"])
        else:
            unused.append(t["id"])
    return {"sections": sections, "unused": unused}


# ---------------------------------------------------------------------------
# Stub data (used when OPENAI_API_KEY is missing)
# ---------------------------------------------------------------------------
def _stub(category: str, **data) -> dict:
    return {"category": category, "text": render_text(category, data), "data": data}


_STUB_TILES = [
    _stub("education", institution="State University", degree="Computer Science", degree_type="B.S.", gpa="3.8",
          minor=None, location="Provo, UT", start_date=None, end_date="Expected May 2026", details=[]),
    *(_stub("coursework", name=c, code=None) for c in
      ("Data Structures", "Algorithms", "Databases", "Machine Learning", "Operating Systems")),
    *(_stub("skills", name=n, group="Languages") for n in ("Python", "TypeScript", "Java", "SQL")),
    *(_stub("skills", name=n, group="Frameworks") for n in ("React", "FastAPI", "Node.js", "PyTorch")),
    *(_stub("skills", name=n, group="Tools") for n in ("Git", "Docker", "AWS", "PostgreSQL")),
    _stub("experience", title="Software Engineering Intern", organization="Acme Corp", location=None,
          start_date="May 2024", end_date="Aug 2024",
          bullets=["Built a Kafka ingestion service handling 2M events/day",
                   "Reduced p95 API latency by 40% by adding a Redis cache"]),
    _stub("experience", title="Teaching Assistant", organization="State University CS Department", location=None,
          start_date="Jan 2024", end_date="Present",
          bullets=["Led weekly labs for 40 students in Data Structures",
                   "Wrote autograder tests used across 3 course sections"]),
    _stub("projects", name="Campus Eats", technologies=["React", "FastAPI", "PostgreSQL"], link=None, date=None,
          bullets=["Food-truck tracker used by 1,200 students in its first month",
                   "Real-time location updates over WebSockets"]),
    _stub("projects", name="Stock Sentiment Analyzer", technologies=["Python", "PyTorch"], link=None, date=None,
          bullets=["Fine-tuned a BERT model on 50k financial headlines, 87% accuracy"]),
    _stub("other", title="Dean's List", organization=None, date="6 semesters", kind="award", bullets=[]),
    _stub("other", title="Volunteer Math Tutor", organization="Lincoln High School", date="2022 – Present",
          kind="volunteer", bullets=[]),
]

_STUB_JOB = {
    "title": "Software Engineer, Backend",
    "company": "Acme Corp",
    "summary": "Acme is hiring a backend engineer to build and scale the data pipelines and APIs "
               "behind its logistics platform. The role works in Python and Go on AWS, with a focus "
               "on reliability and performance.",
    "bullets": [
        "Design, build, and operate backend services in Python and Go",
        "Own data pipelines processing millions of events per day",
        "Experience with SQL databases and caching (PostgreSQL, Redis)",
        "Familiarity with AWS and containerized deployments (Docker)",
        "Write tests and participate in code review",
        "B.S. in Computer Science or equivalent experience",
    ],
}
