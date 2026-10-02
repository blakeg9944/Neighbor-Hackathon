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
    """Unused for now (DESIGN_SPEC §2): whole-resume vector for match_jobs / job_fit."""
    supabase.table(T).update({"embedding": embedding}).eq("id", user_id).execute()
