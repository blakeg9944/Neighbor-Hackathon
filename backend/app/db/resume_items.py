"""Resume tiles (DESIGN_SPEC §5): category lives in `section`, tile text in `content_text`.
title/organization/start_date/end_date/content stay unused (null / {})."""
from typing import Literal

from .client import first, supabase

T = "resume_items"
COLS = "id, section, content_text, source_resume_id, created_at"

Section = Literal["education", "coursework", "skills", "experience", "projects", "other"]
SECTIONS: tuple[str, ...] = Section.__args__  # also the fixed display order (§4.1)


def _row(user_id: str, section: str, text: str, source_resume_id: str | None) -> dict:
    # Every row gets every key: bulk inserts null out missing keys instead of using column defaults.
    return {
        "user_id": user_id,
        "source_resume_id": source_resume_id,
        "section": section if section in SECTIONS else "other",
        "content_text": text,
        "content": {},
    }


def create(user_id: str, section: str, text: str, source_resume_id: str | None = None) -> dict:
    return supabase.table(T).insert(_row(user_id, section, text, source_resume_id)).execute().data[0]


def create_many(user_id: str, tiles: list[dict], source_resume_id: str | None = None) -> list[dict]:
    """tiles: [{"category", "text"}] (llm.extract_tiles output)."""
    rows = [_row(user_id, t.get("category"), t.get("text") or "", source_resume_id) for t in tiles if t.get("text")]
    if not rows:
        return []
    return supabase.table(T).insert(rows).execute().data


def get(user_id: str, item_id: str) -> dict | None:
    return first(supabase.table(T).select(COLS).eq("user_id", user_id).eq("id", item_id).execute().data)


def list_for_user(user_id: str, section: Section | None = None) -> list[dict]:
    """Ordered by category order (enum order), then created_at."""
    q = supabase.table(T).select(COLS).eq("user_id", user_id)
    if section:
        q = q.eq("section", section)
    return q.order("section").order("created_at").execute().data


def count(user_id: str) -> int:
    return supabase.table(T).select("id", count="exact").eq("user_id", user_id).limit(0).execute().count or 0


def all_text(user_id: str) -> str:
    rows = supabase.table(T).select("content_text").eq("user_id", user_id).execute().data
    return "\n\n".join(r["content_text"] for r in rows if r["content_text"])


def update(user_id: str, item_id: str, **fields) -> dict | None:
    """e.g. update(uid, id, section="skills", content_text="...")"""
    return first(supabase.table(T).update(fields).eq("user_id", user_id).eq("id", item_id).execute().data)


def delete(user_id: str, item_id: str) -> None:
    supabase.table(T).delete().eq("user_id", user_id).eq("id", item_id).execute()


def delete_all(user_id: str) -> None:
    supabase.table(T).delete().eq("user_id", user_id).execute()
