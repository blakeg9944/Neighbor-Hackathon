"""Jobs: creation flow (DESIGN_SPEC §6.3), dashboard list, layouts, PDF generation, fit/recommendations."""
import uuid

from ..db import generated_resumes, jobs, profiles, storage
from . import llm, pdf
from .bank_service import list_tiles, refresh_profile_embedding
from .errors import AppError, not_found
from .layout import normalize_layout, resolve_layout, section_texts
from .scraper import fetch_job_text

MIN_JOB_TEXT = 500  # §6.3: less scraped text than this counts as a failed fetch

# Raw cosine similarity between OpenAI embeddings sits in ~0.20 (unrelated) .. ~0.55 (strong match),
# measured on our job pool. `fit` is rescaled onto 0..1 between these anchors so it reads as a percentage.
FIT_FLOOR, FIT_CEIL = 0.20, 0.55


def calibrate_fit(raw: float | None) -> float | None:
    if raw is None:
        return None
    return round(min(1.0, max(0.0, (raw - FIT_FLOOR) / (FIT_CEIL - FIT_FLOOR))), 3)


# --- output shapes ----------------------------------------------------------

def job_out(job: dict, fit: float | None = None) -> dict:
    """jobs row (+ saved_at) -> Job. created_at is when the user saved it (§6.1). `fit` is the raw cosine."""
    return {
        "id": job["id"], "url": job.get("url") or "", "title": job.get("title"), "company": job.get("company"),
        "summary": job.get("summary"), "bullets": job.get("bullets") or [],
        "created_at": job.get("saved_at") or job["created_at"], "fit": calibrate_fit(fit),
    }


def pdf_out(row: dict) -> dict:
    return {"id": row["id"], "created_at": row["created_at"],
            "url": storage.signed_url(storage.RESUMES, row["storage_path"]) or ""}


def _detail(user_id: str, saved: dict) -> dict:
    return {
        **job_out(saved, jobs.fit(user_id, saved["id"])),
        "layout": resolve_layout(saved.get("layout"), list_tiles(user_id)),
        "pdfs": [pdf_out(r) for r in generated_resumes.list_for_job(user_id, saved["id"]) if r.get("storage_path")],
    }


def _get_saved(user_id: str, job_id: str) -> dict:
    saved = jobs.get_saved(user_id, job_id)
    if not saved:
        raise not_found("Job")
    return saved


def embed_job(job: dict) -> None:
    """Embed the clean summary only (title, company, summary, bullets). The raw scraped page is mostly
    site navigation/boilerplate shared by every posting, which pushes all fit scores together."""
    try:
        parts = [job.get("title"), job.get("company"), job.get("summary"), *(job.get("bullets") or [])]
        vec = llm.embed("\n".join(p for p in parts if p))
        if vec:
            jobs.set_embedding(job["id"], vec)
    except Exception as e:  # fit scores are best-effort
        print(f"job embedding failed for {job['id']}: {e}")


def _job_text(url: str, description: str | None) -> str:
    text = (description or "").strip()
    if text:
        return text
    try:
        text = fetch_job_text(url)
    except Exception as e:
        print(f"fetch_job_text failed for {url}: {e}")
        text = ""
    if len(text) < MIN_JOB_TEXT:
        raise AppError(422, "FETCH_FAILED", "Couldn't read that page. Paste the job description instead.")
    return text


def _select_and_save(user_id: str, job: dict, text: str, tiles: list[dict]) -> None:
    """LLM picks tiles for the job (budget fallback on failure); save the validated layout on the card."""
    try:
        layout = llm.select_tiles(job, text, [{k: t[k] for k in ("id", "category", "text", "data")} for t in tiles])
    except Exception as e:
        print(f"select_tiles failed, using budget layout: {e}")
        layout = llm._budget_layout(tiles)
    jobs.save(user_id, job["id"], normalize_layout(layout, tiles))


def _is_stale(layout: dict | None, tiles: list[dict]) -> bool:
    """True when the saved layout places none of the current bank tiles (e.g. the resume was re-uploaded)."""
    if not tiles:
        return False
    placed = {i for ids in ((layout or {}).get("sections") or {}).values() for i in ids or []}
    return not placed & {t["id"] for t in tiles}


def _refresh_if_stale(user_id: str, saved: dict) -> dict:
    tiles = list_tiles(user_id)
    if not _is_stale(saved.get("layout"), tiles):
        return saved
    _select_and_save(user_id, saved, saved.get("description") or "", tiles)
    return jobs.get_saved(user_id, saved["id"])


# --- public API -------------------------------------------------------------

def create_job(user_id: str, url: str, description: str | None = None) -> dict:
    """DESIGN_SPEC §6.3 -> JobDetail."""
    url = url.strip()
    existing = jobs.get_by_url(url)

    # 1. Already on the user's dashboard with a layout -> return it (re-picking tiles if the bank was replaced).
    if existing:
        saved = jobs.get_saved(user_id, existing["id"])
        if saved and saved.get("layout"):
            return _detail(user_id, _refresh_if_stale(user_id, saved))

    # 2. Need tiles to select from.
    tiles = list_tiles(user_id)
    if not tiles:
        raise AppError(400, "EMPTY_BANK", "Your Resume is empty. Add your resume first.")

    # 3. Get the job (reuse the global row if it's already summarized).
    if existing and existing.get("summary"):
        job, text = existing, existing.get("description") or ""
    else:
        text = _job_text(url, description)
        try:
            info = llm.summarize_job(text, url)
        except Exception as e:
            print(f"summarize_job failed: {e}")
            raise AppError(502, "LLM_FAILED", "Couldn't summarize the job. Please try again.")
        if existing:
            job = jobs.update(existing["id"], description=text, **info)
        else:
            job = jobs.create(user_id, text, url=url, **info)
        embed_job(job)

    # 4-5. LLM picks tiles, save the card + validated layout.
    _select_and_save(user_id, job, text, tiles)
    return _detail(user_id, jobs.get_saved(user_id, job["id"]))


def get_job(user_id: str, job_id: str) -> dict:
    """JobDetail. If the bank was replaced since the layout was made, tiles are re-picked automatically."""
    return _detail(user_id, _refresh_if_stale(user_id, _get_saved(user_id, job_id)))


def autoselect(user_id: str, job_id: str) -> dict:
    """Re-run tile selection against the CURRENT bank (overwrites the saved layout) -> JobDetail."""
    saved = _get_saved(user_id, job_id)
    tiles = list_tiles(user_id)
    if not tiles:
        raise AppError(400, "EMPTY_BANK", "Your Resume is empty. Add your resume first.")
    _select_and_save(user_id, saved, saved.get("description") or "", tiles)
    return _detail(user_id, jobs.get_saved(user_id, job_id))


def list_jobs(user_id: str) -> list[dict]:
    """JobListItem[] newest first, with PDF counts and fit scores."""
    fits = jobs.saved_fits(user_id)
    pdf_dates: dict[str, list[str]] = {}
    for r in generated_resumes.list_for_user(user_id):  # newest first
        if r.get("job_id"):
            pdf_dates.setdefault(r["job_id"], []).append(r["created_at"])
    return [
        {**job_out(j, fits.get(j["id"])), "pdf_count": len(pdf_dates.get(j["id"], [])),
         "latest_pdf_at": (pdf_dates.get(j["id"]) or [None])[0]}
        for j in jobs.list_saved(user_id)
    ]


def recommended_jobs(user_id: str, limit: int = 10, include_saved: bool = False, offset: int = 0) -> list[dict]:
    """Global-pool jobs most similar to the user's whole-resume embedding, best fit first, paged by offset.
    Excludes jobs already on the dashboard unless include_saved. Empty with no bank / no OpenAI key."""
    if not profiles.has_embedding(user_id):
        refresh_profile_embedding(user_id)  # bank predates embeddings or the background task failed
    saved_ids = set() if include_saved else {j["id"] for j in jobs.list_saved(user_id)}
    # The RPC has no offset, so fetch enough rows to cover skipped pages + saved jobs, then slice.
    pool = jobs.match_for_user(user_id, limit=offset + limit + len(saved_ids))
    matches = [m for m in pool if m["id"] not in saved_ids][offset:offset + limit]
    by_id = {j["id"]: j for j in jobs.get_many([m["id"] for m in matches])}
    return [job_out(by_id[m["id"]], m["fit"]) for m in matches if m["id"] in by_id]


def save_layout(user_id: str, job_id: str, layout: dict) -> None:
    _get_saved(user_id, job_id)
    jobs.set_layout(user_id, job_id, normalize_layout(layout, list_tiles(user_id)))


def generate_pdf(user_id: str, job_id: str, layout: dict) -> dict:
    """Save the layout, render the PDF, upload it, record it -> GeneratedPdf."""
    saved = _get_saved(user_id, job_id)
    tiles = list_tiles(user_id)
    layout = normalize_layout(layout, tiles)
    jobs.set_layout(user_id, job_id, layout)

    pdf_bytes = pdf.render_resume(profiles.get(user_id) or {}, section_texts(layout, tiles))
    gen_id = str(uuid.uuid4())
    path = storage.upload(storage.RESUMES, f"{user_id}/{job_id}/{gen_id}.pdf", pdf_bytes)
    row = generated_resumes.create(
        user_id, layout, id=gen_id, job_id=job_id, title=saved.get("title"), storage_path=path,
        match_score=calibrate_fit(jobs.fit(user_id, job_id)),
    )
    return pdf_out(row)


def delete_job(user_id: str, job_id: str) -> None:
    jobs.unsave(user_id, job_id)
