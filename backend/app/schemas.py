"""Pydantic mirrors of DESIGN_SPEC §6.1 (and frontend/src/lib/types.ts). Change both together."""
from typing import Literal

from pydantic import BaseModel

Category = Literal["education", "coursework", "skills", "experience", "projects", "other"]
CATEGORIES: tuple[str, ...] = Category.__args__


YesNo = Literal["yes", "no"]
Decline = Literal["decline"]  # "I don't wish to answer"


class ApplicationInfo(BaseModel):
    """Answers to the generic questions on most job applications (auto-apply). Every field optional;
    null = not answered. Stored in profiles.application (jsonb). Mirror: ApplicationInfo in types.ts."""
    # links
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    # address (profiles.location stays the free-text "City, ST" for the resume header)
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    # education
    school: str | None = None
    degree: str | None = None              # e.g. "Bachelor of Science"
    major: str | None = None
    graduation_date: str | None = None     # "YYYY-MM"
    gpa: str | None = None
    # work eligibility / logistics
    authorized_to_work_us: YesNo | None = None
    requires_sponsorship: YesNo | None = None
    over_18: YesNo | None = None
    willing_to_relocate: YesNo | None = None
    earliest_start_date: str | None = None  # "YYYY-MM-DD"
    desired_salary: str | None = None
    # voluntary self-identification (EEO); "decline" = chose not to answer
    pronouns: str | None = None
    gender: Literal["male", "female", "non_binary", "decline"] | None = None
    hispanic_latino: YesNo | Decline | None = None
    race: list[Literal[
        "american_indian_alaska_native", "asian", "black_african_american",
        "native_hawaiian_pacific_islander", "white", "two_or_more", "decline",
    ]] = []
    veteran_status: Literal["not_veteran", "protected_veteran", "veteran", "decline"] | None = None
    disability_status: YesNo | Decline | None = None


class Profile(BaseModel):
    id: str
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[str] = []
    application: ApplicationInfo = ApplicationInfo()


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[str] | None = None
    application: ApplicationInfo | None = None  # replaces the whole object


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
    overrides: dict[str, str] = {}  # tile id -> text edited for THIS resume only; the bank tile is untouched


class ResolvedLayout(BaseModel):
    sections: dict[Category, list[Tile]]   # tiles carry their bank text; apply `overrides` for display
    unused: list[Tile]
    overrides: dict[str, str] = {}


class Job(BaseModel):
    id: str
    url: str
    title: str | None = None
    company: str | None = None
    summary: str | None = None
    bullets: list[str] = []
    created_at: str
    fit: float | None = None  # calibrated match 0..1 (job_service.calibrate_fit); null until both are embedded


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


class FieldDescriptor(BaseModel):
    field_id: str
    label: str
    type: str
    options: list[str] = []
    multiple: bool = False  # select/multiselect fields where more than one option may be chosen


class AutofillFieldsRequest(BaseModel):
    fields: list[FieldDescriptor]


class AutofillMappingResult(BaseModel):
    mapping: dict[str, str]


class TilesOut(BaseModel):
    tiles: list[Tile]


class Ok(BaseModel):
    ok: Literal[True] = True
