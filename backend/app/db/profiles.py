from .client import first, supabase

T = "profiles"


def get(user_id: str) -> dict | None:
    return first(supabase.table(T).select("id, full_name, email, created_at").eq("id", user_id).execute().data)


def update(user_id: str, **fields) -> dict | None:
    """e.g. update(uid, full_name="Ada Lovelace")"""
    return first(supabase.table(T).update(fields).eq("id", user_id).execute().data)


def set_embedding(user_id: str, embedding: list[float]) -> None:
    """Whole-resume vector (1536 dims) used by match_jobs / job_fit."""
    supabase.table(T).update({"embedding": embedding}).eq("id", user_id).execute()
