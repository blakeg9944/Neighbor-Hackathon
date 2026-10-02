from .client import first, supabase

T = "profiles"
COLS = "id, full_name, email, phone, location, links"


def get(user_id: str) -> dict | None:
    return first(supabase.table(T).select(COLS).eq("id", user_id).execute().data)


def update(user_id: str, **fields) -> dict | None:
    """e.g. update(uid, full_name="Ada Lovelace", links=["github.com/ada"])"""
    if not fields:
        return get(user_id)
    supabase.table(T).update(fields).eq("id", user_id).execute()
    return get(user_id)


def set_embedding(user_id: str, embedding: list[float]) -> None:
    """Whole-resume vector for match_jobs / job_fit (fit scores, recommended jobs)."""
    supabase.table(T).update({"embedding": embedding}).eq("id", user_id).execute()


def has_embedding(user_id: str) -> bool:
    row = first(supabase.table(T).select("id").eq("id", user_id).not_.is_("embedding", "null").execute().data)
    return row is not None
