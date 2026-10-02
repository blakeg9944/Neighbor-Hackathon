from .client import first, supabase

T = "generated_resumes"
LIST_COLS = "id, job_id, title, storage_path, match_score, created_at, jobs(company, title, url)"


def create(
    user_id: str,
    content: dict,
    *,
    job_id: str | None = None,
    title: str | None = None,
    storage_path: str | None = None,
    match_score: float | None = None,
    id: str | None = None,  # pass one if you need the id for the storage path before inserting
) -> dict:
    row = {
        "user_id": user_id, "job_id": job_id, "title": title, "content": content,
        "storage_path": storage_path, "match_score": match_score,
    }
    if id:
        row["id"] = id
    return supabase.table(T).insert(row).execute().data[0]


def get(user_id: str, gen_id: str) -> dict | None:
    return first(supabase.table(T).select("*").eq("user_id", user_id).eq("id", gen_id).execute().data)


def list_for_user(user_id: str) -> list[dict]:
    """Dashboard list, newest first (no `content` blob)."""
    return supabase.table(T).select(LIST_COLS).eq("user_id", user_id) \
        .order("created_at", desc=True).execute().data


def update(user_id: str, gen_id: str, **fields) -> dict | None:
    return first(supabase.table(T).update(fields).eq("user_id", user_id).eq("id", gen_id).execute().data)


def delete(user_id: str, gen_id: str) -> dict | None:
    """Deletes the row and returns it (so the caller can remove the PDF from storage)."""
    return first(supabase.table(T).delete().eq("user_id", user_id).eq("id", gen_id).execute().data)
