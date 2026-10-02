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

load_dotenv()

# Fixed order used everywhere (DESIGN_SPEC §4.1)
CATEGORIES: tuple[str, ...] = ("education", "coursework", "skills", "experience", "projects", "other")

# Rough one-page budget per section (DESIGN_SPEC §7.1)
BUDGET: dict[str, int] = {"education": 2, "coursework": 1, "skills": 4, "experience": 4, "projects": 3, "other": 2}

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
class _TileOut(BaseModel):
    category: Category
    text: str = Field(description="Line 1 = heading. Following lines = body; bullet lines start with '• '.")


class _TilesOut(BaseModel):
    tiles: list[_TileOut]


EXTRACT_INSTRUCTIONS = """You split a resume into "tiles" for a resume builder. One tile = one resume entry.

Categories (use exactly these): education, coursework, skills, experience, projects, other.

Tile text format (strict):
- Line 1 is the entry's heading, e.g. "Software Engineering Intern, Acme Corp (May 2024 – Aug 2024)"
  or "B.S. Computer Science, State University (Expected May 2026), GPA 3.8".
- Following lines are the body. Every bullet line starts with "• " (bullet + space).
- Separate lines with "\\n". No blank lines, no markdown.

Rules:
- One tile per job, degree, project, award, etc. Keep each entry's bullets inside its tile.
- Keep the original wording VERBATIM. Only clean up whitespace and normalize bullet characters to "• ".
- If education lists courses, move them into ONE separate coursework tile:
  "Relevant Coursework: Data Structures, Algorithms, ..." and REMOVE them from the education tile
  (keep other details like GPA in the education tile).
- Skills: one tile per skill line/group, e.g. "Languages: Python, TypeScript, SQL". A skills tile is a
  SINGLE line with no bullets. Keep a label only if the resume has one; never add labels like "Skills".
- Awards, certifications, volunteering, leadership, interests, publications -> other.
- Skip the name/contact header (email, phone, links); that comes from the profile.
- Never invent content."""


def extract_tiles(resume_text: str) -> list[dict]:
    """-> [{"category": Category, "text": str}], text follows DESIGN_SPEC §4.2."""
    if USE_STUBS:
        return [dict(t) for t in _STUB_TILES]
    out = _parse(EXTRACT_INSTRUCTIONS, resume_text, _TilesOut)
    tiles = []
    for t in out.tiles:
        lines = [_clean_line(ln) for ln in t.text.split("\n")]
        lines = [ln for ln in lines if ln]
        if not lines:
            continue
        if t.category == "skills" and len(lines) > 1 and not any(ln.startswith("• ") for ln in lines):
            tiles += [{"category": "skills", "text": ln} for ln in lines]  # one tile per skill line (§4.2)
        else:
            tiles.append({"category": t.category, "text": "\n".join(lines)})
    return tiles


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
- Leave out weak or irrelevant tiles; anything not selected goes to "unused" automatically."""


def select_tiles(job: dict, job_text: str, tiles: list[dict]) -> dict:
    """tiles: [{"id","category","text"}] -> Layout {"sections": {6 keys: [ids]}, "unused": [ids]}

    The LLM sees short keys (t1, t2, ...) instead of UUIDs so it can't garble IDs; we map them back.
    Unknown keys are dropped; the caller (routes) validates the final layout anyway.
    """
    if USE_STUBS or not tiles:
        return _budget_layout(tiles)

    key_to_id = {f"t{i}": t["id"] for i, t in enumerate(tiles, 1)}
    listing = "\n\n".join(f"[{k}] ({t['category']})\n{t['text']}" for k, t in zip(key_to_id, tiles))
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
_STUB_TILES = [
    {"category": "education",
     "text": "B.S. Computer Science, State University (Expected May 2026), GPA 3.8"},
    {"category": "coursework",
     "text": "Relevant Coursework: Data Structures, Algorithms, Databases, Machine Learning, Operating Systems"},
    {"category": "skills", "text": "Languages: Python, TypeScript, Java, SQL"},
    {"category": "skills", "text": "Frameworks: React, FastAPI, Node.js, PyTorch"},
    {"category": "skills", "text": "Tools: Git, Docker, AWS, PostgreSQL"},
    {"category": "experience",
     "text": "Software Engineering Intern, Acme Corp (May 2024 – Aug 2024)\n"
             "• Built a Kafka ingestion service handling 2M events/day\n"
             "• Reduced p95 API latency by 40% by adding a Redis cache"},
    {"category": "experience",
     "text": "Teaching Assistant, State University CS Department (Jan 2024 – Present)\n"
             "• Led weekly labs for 40 students in Data Structures\n"
             "• Wrote autograder tests used across 3 course sections"},
    {"category": "projects",
     "text": "Campus Eats (React, FastAPI, PostgreSQL)\n"
             "• Food-truck tracker used by 1,200 students in its first month\n"
             "• Real-time location updates over WebSockets"},
    {"category": "projects",
     "text": "Stock Sentiment Analyzer (Python, PyTorch)\n"
             "• Fine-tuned a BERT model on 50k financial headlines, 87% accuracy"},
    {"category": "other", "text": "Dean's List, 6 semesters"},
    {"category": "other", "text": "Volunteer Math Tutor, Lincoln High School (2022 – Present)"},
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
