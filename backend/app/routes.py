"""All /api endpoints (DESIGN_SPEC §6). Sync handlers: FastAPI runs them in a threadpool,
which suits the sync Supabase/OpenAI clients."""
import uuid
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .services import llm, pdf
from .auth import get_user_id
from .db import generated_resumes, jobs, profiles, resume_items, source_resumes, storage
from .schemas import (
    CATEGORIES, GeneratedPdf, Job, JobCreate, JobDetail, JobListItem, Layout, Ok, Profile, ProfileUpdate,
    ResolvedLayout, Tile, TileCreate, TilesOut, TileUpdate,
)
from .services.scraper import ScraperService, fetch_job_text

router = APIRouter(prefix="/api")

MIN_JOB_TEXT = 500  # §6.3: less scraped text than this counts as a failed fetch


def fail(status: int, code: str, message: str):
    raise HTTPException(status_code=status, detail={"code": code, "message": message})


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def tile_out(row: dict) -> dict:
    """resume_items row -> Tile (text <- content_text, category <- section)."""
    return {
        "id": row["id"], "category": row["section"], "text": row["content_text"],
        "source_resume_id": row.get("source_resume_id"), "created_at": row["created_at"],
    }


def user_tiles(user_id: str) -> list[dict]:
    return [tile_out(r) for r in resume_items.list_for_user(user_id)]


def normalize_layout(layout: dict | None, tiles: list[dict]) -> dict:
    """§4.3 / §6.3 step 4: drop unknown IDs, de-duplicate, append unplaced bank tiles to unused."""
    layout = layout or {}
    known = {t["id"] for t in tiles}
    seen: set[str] = set()

    def keep(ids) -> list[str]:
        out = []
        for i in ids or []:
            if i in known and i not in seen:
                seen.add(i)
                out.append(i)
        return out

    sections = {c: keep((layout.get("sections") or {}).get(c)) for c in CATEGORIES}
    unused = keep(layout.get("unused"))
    unused += [t["id"] for t in tiles if t["id"] not in seen]
    return {"sections": sections, "unused": unused}


def resolve_layout(layout: dict | None, tiles: list[dict]) -> dict:
    norm = normalize_layout(layout, tiles)
    by_id = {t["id"]: t for t in tiles}
    return {
        "sections": {c: [by_id[i] for i in ids] for c, ids in norm["sections"].items()},
        "unused": [by_id[i] for i in norm["unused"]],
    }


def job_out(job: dict, fit: float | None = None) -> dict:
    """jobs row (+ saved_at) -> Job. created_at is when the user saved it (§6.1)."""
    return {
        "id": job["id"], "url": job.get("url") or "", "title": job.get("title"), "company": job.get("company"),
        "summary": job.get("summary"), "bullets": job.get("bullets") or [],
        "created_at": job.get("saved_at") or job["created_at"], "fit": fit,
    }


def pdf_out(row: dict) -> dict:
    return {"id": row["id"], "created_at": row["created_at"],
            "url": storage.signed_url(storage.RESUMES, row["storage_path"]) or ""}


def job_detail(user_id: str, saved: dict) -> dict:
    return {
        **job_out(saved, jobs.fit(user_id, saved["id"])),
        "layout": resolve_layout(saved.get("layout"), user_tiles(user_id)),
        "pdfs": [pdf_out(r) for r in generated_resumes.list_for_job(user_id, saved["id"]) if r.get("storage_path")],
    }


def get_saved_or_404(user_id: str, job_id: str) -> dict:
    saved = jobs.get_saved(user_id, job_id)
    if not saved:
        fail(404, "NOT_FOUND", "Job not found")
    return saved


def refresh_profile_embedding(user_id: str) -> None:
    """Background task after the bank changes: re-embed all tile text for fit scores."""
    try:
        vec = llm.embed(resume_items.all_text(user_id))
        if vec:
            profiles.set_embedding(user_id, vec)
    except Exception as e:  # fit scores are best-effort; never break the request
        print(f"profile embedding failed for {user_id}: {e}")


def embed_job(job: dict, text: str) -> None:
    try:
        parts = [job.get("title"), job.get("company"), job.get("summary"), *(job.get("bullets") or []), text]
        vec = llm.embed("\n".join(p for p in parts if p))
        if vec:
            jobs.set_embedding(job["id"], vec)
    except Exception as e:
        print(f"job embedding failed for {job['id']}: {e}")


# ---------------------------------------------------------------------------
# health + profile
# ---------------------------------------------------------------------------
@router.get("/health")
def health():
    return {"ok": True}


@router.get("/me", response_model=Profile)
def get_me(user_id: str = Depends(get_user_id)):
    profile = profiles.get(user_id)
    if not profile:
        fail(404, "NOT_FOUND", "Profile not found")
    return profile


@router.put("/me", response_model=Profile)
def update_me(body: ProfileUpdate, user_id: str = Depends(get_user_id)):
    fields = body.model_dump(exclude_unset=True)
    if fields.get("links") is None:
        fields.pop("links", None)
    return profiles.update(user_id, **fields)


# ---------------------------------------------------------------------------
# resume bank (tiles)
# ---------------------------------------------------------------------------
@router.post("/resume/parse", response_model=TilesOut)
def parse_resume(
    background: BackgroundTasks,
    file: UploadFile | None = File(None),
    text: str | None = Form(None),
    user_id: str = Depends(get_user_id),
):
    data = file.file.read() if file else None
    if data:
        try:
            raw_text = pdf.pdf_to_text(data)
        except Exception:
            fail(422, "BAD_PDF", "Couldn't read that PDF. Try pasting the text instead.")
    else:
        raw_text = (text or "").strip()
    if not raw_text:
        fail(422, "EMPTY_RESUME", "No text found. If the PDF is scanned, paste the text instead.")

    source = source_resumes.create(user_id, raw_text)
    if data:
        path = storage.upload(storage.UPLOADS, storage.user_path(user_id, f"{source['id']}.pdf"), data)
        source_resumes.set_storage_path(user_id, source["id"], path)

    try:
        extracted = llm.extract_tiles(raw_text)
    except Exception as e:
        print(f"extract_tiles failed: {e}")
        fail(502, "LLM_FAILED", "Couldn't split the resume into tiles. Please try again.")

    created = resume_items.create_many(user_id, extracted, source_resume_id=source["id"])
    background.add_task(refresh_profile_embedding, user_id)
    return {"tiles": [tile_out(r) for r in created]}


@router.get("/tiles", response_model=list[Tile])
def list_tiles(user_id: str = Depends(get_user_id)):
    return user_tiles(user_id)


@router.post("/tiles", response_model=Tile)
def create_tile(body: TileCreate, background: BackgroundTasks, user_id: str = Depends(get_user_id)):
    row = resume_items.create(user_id, body.category, body.text.strip())
    background.add_task(refresh_profile_embedding, user_id)
    return tile_out(row)


@router.patch("/tiles/{tile_id}", response_model=Tile)
def update_tile(tile_id: str, body: TileUpdate, background: BackgroundTasks, user_id: str = Depends(get_user_id)):
    fields = {}
    if body.category is not None:
        fields["section"] = body.category
    if body.text is not None:
        fields["content_text"] = body.text.strip()
    row = resume_items.update(user_id, tile_id, **fields) if fields else resume_items.get(user_id, tile_id)
    if not row:
        fail(404, "NOT_FOUND", "Tile not found")
    if "content_text" in fields:
        background.add_task(refresh_profile_embedding, user_id)
    return tile_out(row)


@router.delete("/tiles/{tile_id}", response_model=Ok)
def delete_tile(tile_id: str, background: BackgroundTasks, user_id: str = Depends(get_user_id)):
    resume_items.delete(user_id, tile_id)
    background.add_task(refresh_profile_embedding, user_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# jobs
# ---------------------------------------------------------------------------
@router.post("/jobs", response_model=JobDetail)
def create_job(body: JobCreate, user_id: str = Depends(get_user_id)):
    """DESIGN_SPEC §6.3."""
    url = body.url.strip()
    existing = jobs.get_by_url(url)

    # 1. Already on the user's dashboard with a layout -> return as-is.
    if existing:
        saved = jobs.get_saved(user_id, existing["id"])
        if saved and saved.get("layout"):
            return job_detail(user_id, saved)

    # 2. Need tiles to select from.
    tiles = user_tiles(user_id)
    if not tiles:
        fail(400, "EMPTY_BANK", "Your resume bank is empty. Add your resume first.")

    # 3. Get the job (reuse the global row if it's already summarized).
    if existing and existing.get("summary"):
        job, text = existing, existing.get("description") or ""
    else:
        text = (body.description or "").strip()
        if not text:
            try:
                text = fetch_job_text(url)
            except Exception as e:
                print(f"fetch_job_text failed for {url}: {e}")
                text = ""
            if len(text) < MIN_JOB_TEXT:
                fail(422, "FETCH_FAILED", "Couldn't read that page. Paste the job description instead.")
        try:
            info = llm.summarize_job(text, url)
        except Exception as e:
            print(f"summarize_job failed: {e}")
            fail(502, "LLM_FAILED", "Couldn't summarize the job. Please try again.")
        if existing:
            job = jobs.update(existing["id"], description=text, **info)
        else:
            job = jobs.create(user_id, text, url=url, **info)
        embed_job(job, text)

    # 4. LLM picks tiles; fall back to the simple budget layout if it fails.
    try:
        layout = llm.select_tiles(job, text, [{k: t[k] for k in ("id", "category", "text")} for t in tiles])
    except Exception as e:
        print(f"select_tiles failed, using budget layout: {e}")
        layout = llm._budget_layout(tiles)
    layout = normalize_layout(layout, tiles)

    # 5. Save the card + layout.
    jobs.save(user_id, job["id"], layout)
    return job_detail(user_id, jobs.get_saved(user_id, job["id"]))


@router.get("/jobs", response_model=list[JobListItem])
def list_jobs(user_id: str = Depends(get_user_id)):
    fits = jobs.saved_fits(user_id)
    pdfs: dict[str, list[str]] = {}
    for r in generated_resumes.list_for_user(user_id):  # newest first
        if r.get("job_id"):
            pdfs.setdefault(r["job_id"], []).append(r["created_at"])
    return [
        {**job_out(j, fits.get(j["id"])), "pdf_count": len(pdfs.get(j["id"], [])),
         "latest_pdf_at": (pdfs.get(j["id"]) or [None])[0]}
        for j in jobs.list_saved(user_id)
    ]


@router.get("/jobs/recommended", response_model=list[Job])
def recommended_jobs(limit: int = 10, user_id: str = Depends(get_user_id)):
    """Jobs from the global pool that best fit the user's resume, excluding ones already saved.
    Empty until the user's resume and some jobs have embeddings."""
    saved_ids = {j["id"] for j in jobs.list_saved(user_id)}
    matches = [m for m in jobs.match_for_user(user_id, limit=limit + len(saved_ids)) if m["id"] not in saved_ids]
    matches = matches[:limit]
    by_id = {j["id"]: j for j in jobs.get_many([m["id"] for m in matches])}
    return [job_out(by_id[m["id"]], m["fit"]) for m in matches if m["id"] in by_id]


@router.get("/jobs/{job_id}", response_model=JobDetail)
def get_job(job_id: str, user_id: str = Depends(get_user_id)):
    return job_detail(user_id, get_saved_or_404(user_id, job_id))


@router.put("/jobs/{job_id}/layout", response_model=Ok)
def save_layout(job_id: str, body: Layout, user_id: str = Depends(get_user_id)):
    get_saved_or_404(user_id, job_id)
    jobs.set_layout(user_id, job_id, normalize_layout(body.model_dump(), user_tiles(user_id)))
    return {"ok": True}


@router.post("/jobs/{job_id}/pdfs", response_model=GeneratedPdf)
def generate_pdf(job_id: str, body: Layout, user_id: str = Depends(get_user_id)):
    saved = get_saved_or_404(user_id, job_id)
    tiles = user_tiles(user_id)
    layout = normalize_layout(body.model_dump(), tiles)
    jobs.set_layout(user_id, job_id, layout)

    by_id = {t["id"]: t for t in tiles}
    sections = {c: [by_id[i]["text"] for i in ids] for c, ids in layout["sections"].items()}
    pdf_bytes = pdf.render_resume(profiles.get(user_id) or {}, sections)

    gen_id = str(uuid.uuid4())
    path = storage.upload(storage.RESUMES, f"{user_id}/{job_id}/{gen_id}.pdf", pdf_bytes)
    row = generated_resumes.create(
        user_id, layout, id=gen_id, job_id=job_id, title=saved.get("title"), storage_path=path,
        match_score=jobs.fit(user_id, job_id),
    )
    return pdf_out(row)


@router.delete("/jobs/{job_id}", response_model=Ok)
def delete_job(job_id: str, user_id: str = Depends(get_user_id)):
    jobs.unsave(user_id, job_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Legacy: old extension popup still POSTs here. Remove once the §9 popup redesign lands.
# ---------------------------------------------------------------------------
class URLRequest(BaseModel):
    url: str


@router.post("/url")
async def receive_and_scrape_url(payload: URLRequest):
    if not payload.url:
        raise HTTPException(status_code=400, detail="No URL provided")
    scraped_data = await ScraperService.scrape_url(payload.url)
    return {"status": "success", "url": payload.url, "scraped_data": scraped_data,
            "redirect_url": "http://localhost:5173/generate?url=" + quote(payload.url, safe="")}
