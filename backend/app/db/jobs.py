"""Global job pool (`jobs`) + per-user bookmarks (`saved_jobs`)."""
from .client import first, supabase

T = "jobs"
SAVED = "saved_jobs"
PUBLIC_COLS = "id, url, company, title, description, qualifications, created_at"  # everything but embedding


def create(
    user_id: str,
    description: str,
    *,
    url: str | None = None,
    title: str | None = None,
    company: str | None = None,
    qualifications: dict | None = None,
    embedding: list[float] | None = None,
) -> dict:
    """Insert into the global pool, or return the existing job if the url is already there."""
    if url and (existing := get_by_url(url)):
        return existing
    row = {
        "url": url, "title": title, "company": company, "description": description,
        "qualifications": qualifications or {}, "embedding": embedding, "created_by": user_id,
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
    """e.g. update(job_id, qualifications={...}, embedding=[...])"""
    return first(supabase.table(T).update(fields).eq("id", job_id).execute().data)


def set_embedding(job_id: str, embedding: list[float]) -> None:
    supabase.table(T).update({"embedding": embedding}).eq("id", job_id).execute()


# --- saved jobs -------------------------------------------------------------

def save(user_id: str, job_id: str) -> None:
    supabase.table(SAVED).upsert({"user_id": user_id, "job_id": job_id}).execute()


def unsave(user_id: str, job_id: str) -> None:
    supabase.table(SAVED).delete().eq("user_id", user_id).eq("job_id", job_id).execute()


def list_saved(user_id: str) -> list[dict]:
    """Saved jobs, newest first, flattened to job rows with a `saved_at` field."""
    rows = supabase.table(SAVED).select(f"created_at, jobs({PUBLIC_COLS})") \
        .eq("user_id", user_id).order("created_at", desc=True).execute().data
    return [{**r["jobs"], "saved_at": r["created_at"]} for r in rows if r.get("jobs")]


# --- matching (vector RPCs defined in the migration) ------------------------

def match_for_user(user_id: str, limit: int = 10, only_saved: bool = False) -> list[dict]:
    """Jobs ranked by cosine similarity to the user's profile embedding. Each row has `fit` in [-1, 1]."""
    return supabase.rpc("match_jobs", {
        "p_user_id": user_id, "match_count": limit, "only_saved": only_saved,
    }).execute().data


def fit(user_id: str, job_id: str) -> float | None:
    """Similarity of one job to the user's profile; None if either embedding is missing."""
    return supabase.rpc("job_fit", {"p_user_id": user_id, "p_job_id": job_id}).execute().data
