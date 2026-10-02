from .client import first, supabase

T = "source_resumes"


def create(user_id: str, raw_text: str, storage_path: str | None = None) -> dict:
    return supabase.table(T).insert(
        {"user_id": user_id, "raw_text": raw_text, "storage_path": storage_path}
    ).execute().data[0]


def get(user_id: str, source_id: str) -> dict | None:
    return first(supabase.table(T).select("*").eq("user_id", user_id).eq("id", source_id).execute().data)


def list_for_user(user_id: str) -> list[dict]:
    return supabase.table(T).select("id, storage_path, created_at") \
        .eq("user_id", user_id).order("created_at", desc=True).execute().data


def delete(user_id: str, source_id: str) -> None:
    supabase.table(T).delete().eq("user_id", user_id).eq("id", source_id).execute()
