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


class Layout(BaseModel):
    sections: dict[Category, list[str]]
    unused: list[str] = []


class ResolvedLayout(BaseModel):
    sections: dict[Category, list[Tile]]
    unused: list[Tile]


class Job(BaseModel):
    id: str
    url: str
    title: str | None = None
    company: str | None = None
    summary: str | None = None
    bullets: list[str] = []
    created_at: str
    fit: float | None = None  # cosine similarity resume vs job (0..1-ish); null until both are embedded


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
