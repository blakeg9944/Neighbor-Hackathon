"""Global job pool (`jobs`) + per-user dashboard cards (`saved_jobs`, which hold the user's layout)."""
from .client import first, supabase

T = "jobs"
SAVED = "saved_jobs"
PUBLIC_COLS = "id, url, company, title, description, summary, bullets, qualifications, created_at"  # no embedding


def create(
    user_id: str,
    description: str,
    *,
    url: str | None = None,
    title: str | None = None,
    company: str | None = None,
    summary: str | None = None,
    bullets: list[str] | None = None,
    qualifications: dict | None = None,
    embedding: list[float] | None = None,
) -> dict:
    """Insert into the global pool, or return the existing job if the url is already there."""
    if url and (existing := get_by_url(url)):
        return existing
    row = {
        "url": url, "title": title, "company": company, "description": description,
        "summary": summary, "bullets": bullets or [], "qualifications": qualifications or {},
        "embedding": embedding, "created_by": user_id,
    }
    created = supabase.table(T).insert(row).execute().data[0]
    created.pop("embedding", None)
    return created


def get(job_id: str) -> dict | None:
    return first(supabase.table(T).select(PUBLIC_COLS).eq("id", job_id).execute().data)


def get_by_url(url: str) -> dict | None:
    return first(supabase.table(T).select(PUBLIC_COLS).eq("url", url).execute().data)


def list_all(limit: int = 50, offset: int = 0) -> list[dict]:
    return supabase.table(T).select(PUBLIC_COLS).order("created_at", desc=True) \
        .range(offset, offset + limit - 1).execute().data


def update(job_id: str, **fields) -> dict | None:
    """e.g. update(job_id, title=..., summary=..., bullets=[...])"""
    supabase.table(T).update(fields).eq("id", job_id).execute()
    return get(job_id)


def set_embedding(job_id: str, embedding: list[float]) -> None:
    supabase.table(T).update({"embedding": embedding}).eq("id", job_id).execute()


# --- saved jobs (one dashboard card per user + job) -------------------------

def save(user_id: str, job_id: str, layout: dict | None = None) -> None:
    """Upsert the card. Passing layout also stores it; omitting it leaves an existing layout untouched."""
    row = {"user_id": user_id, "job_id": job_id}
    if layout is not None:
        row["layout"] = layout
    supabase.table(SAVED).upsert(row).execute()


def set_layout(user_id: str, job_id: str, layout: dict) -> None:
    supabase.table(SAVED).update({"layout": layout}).eq("user_id", user_id).eq("job_id", job_id).execute()


def unsave(user_id: str, job_id: str) -> None:
    supabase.table(SAVED).delete().eq("user_id", user_id).eq("job_id", job_id).execute()


def get_saved(user_id: str, job_id: str) -> dict | None:
    """Job row + `layout` + `saved_at`, or None if this user hasn't saved the job."""
    row = first(supabase.table(SAVED).select(f"created_at, layout, jobs({PUBLIC_COLS})")
                .eq("user_id", user_id).eq("job_id", job_id).execute().data)
    if not row or not row.get("jobs"):
        return None
    return {**row["jobs"], "layout": row["layout"], "saved_at": row["created_at"]}


def list_saved(user_id: str) -> list[dict]:
    """Saved jobs, newest first, flattened to job rows with `layout` and `saved_at`."""
    rows = supabase.table(SAVED).select(f"created_at, layout, jobs({PUBLIC_COLS})") \
        .eq("user_id", user_id).order("created_at", desc=True).execute().data
    return [{**r["jobs"], "layout": r["layout"], "saved_at": r["created_at"]} for r in rows if r.get("jobs")]


def get_many(job_ids: list[str]) -> list[dict]:
    if not job_ids:
        return []
    return supabase.table(T).select(PUBLIC_COLS).in_("id", job_ids).execute().data


# --- matching (vector RPCs from the init migration) -------------------------
# Fit = cosine similarity between profiles.embedding and jobs.embedding; null if either is missing.

def match_for_user(user_id: str, limit: int = 10, only_saved: bool = False) -> list[dict]:
    """[{id, url, company, title, qualifications, fit}] best match first."""
    return supabase.rpc("match_jobs", {
        "p_user_id": user_id, "match_count": limit, "only_saved": only_saved,
    }).execute().data


def saved_fits(user_id: str) -> dict[str, float]:
    """job_id -> fit for every saved job that has a score (one RPC call)."""
    return {r["id"]: r["fit"] for r in match_for_user(user_id, limit=1000, only_saved=True)}


def fit(user_id: str, job_id: str) -> float | None:
    return supabase.rpc("job_fit", {"p_user_id": user_id, "p_job_id": job_id}).execute().data
