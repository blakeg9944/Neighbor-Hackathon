"""Pydantic mirrors of DESIGN_SPEC §6.1 (and frontend/src/lib/types.ts). Change both together."""
from typing import Literal

from pydantic import BaseModel

Category = Literal["education", "coursework", "skills", "experience", "projects", "other"]
CATEGORIES: tuple[str, ...] = Category.__args__


class Profile(BaseModel):
    id: str
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[str] = []


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[str] | None = None


class Tile(BaseModel):
    id: str
    category: Category
    text: str                      # display text; generated from `data` when data is present
    data: dict | None = None       # structured fields per category (services/tile_data.py); null = freeform
    source_resume_id: str | None = None
    created_at: str


class TileCreate(BaseModel):
    category: Category
    text: str | None = None        # freeform tile ...
    data: dict | None = None       # ... or structured (text is generated). One of the two is required.


class TileUpdate(BaseModel):
    category: Category | None = None
    text: str | None = None        # editing text alone makes the tile freeform (data -> null)
    data: dict | None = None       # replaces data and regenerates text


class Requirement(BaseModel):
    id: str                                         # "r1", "r2", ... stable within a job
    text: str
    kind: Literal["required", "preferred"] = "required"


class Layout(BaseModel):
    sections: dict[Category, list[str]]
    unused: list[str] = []
    overrides: dict[str, str] = {}  # tile id -> text edited for THIS resume only; the bank tile is untouched
    order: list[Category] = []      # section order for THIS resume; missing categories are appended in default order
    matches: dict[str, list[str]] | None = None  # requirement id -> tile ids that show it; None = keep the saved ones
    template: str | None = None     # "classic" | "modern" | "compact" (shared/resume_templates.json); None = default
    labels: dict[Category, str] = {}  # per-resume section names, e.g. {"experience": "Professional Experience"}


class ResolvedLayout(BaseModel):
    sections: dict[Category, list[Tile]]   # tiles carry their bank text; apply `overrides` for display
    unused: list[Tile]
    overrides: dict[str, str] = {}
    order: list[Category] = []             # always a full permutation of the 6 categories
    matches: dict[str, list[str]] = {}     # requirement id -> tile ids (any bank tile) that demonstrate it
    template: str = "classic"
    labels: dict[str, str] = {}


class Job(BaseModel):
    id: str
    url: str
    title: str | None = None
    company: str | None = None
    summary: str | None = None
    bullets: list[str] = []
    created_at: str
    fit: float | None = None  # calibrated match 0..1 (job_service.calibrate_fit); null until both are embedded
    requirements: list[Requirement] = []  # every requirement/qualification in the posting (left pane of the editor)


class JobListItem(Job):
    pdf_count: int
    latest_pdf_at: str | None = None


class GeneratedPdf(BaseModel):
    id: str
    created_at: str
    url: str


class JobDetail(Job):
    layout: ResolvedLayout
    pdfs: list[GeneratedPdf]


class JobCreate(BaseModel):
    url: str
    description: str | None = None


class TilesOut(BaseModel):
    tiles: list[Tile]


class Ok(BaseModel):
    ok: Literal[True] = True
