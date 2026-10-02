"""Resume tiles (DESIGN_SPEC §5): category lives in `section`, display text in `content_text`,
structured fields (services/tile_data.py) in `content` ({} for freeform tiles).
title/organization/start_date/end_date stay unused (null)."""
from typing import Literal

from .client import first, supabase

T = "resume_items"
COLS = "id, section, content_text, content, source_resume_id, created_at"

Section = Literal["education", "coursework", "skills", "experience", "projects", "other"]
SECTIONS: tuple[str, ...] = Section.__args__  # also the fixed display order (§4.1)


def _row(user_id: str, section: str, text: str, source_resume_id: str | None, data: dict | None = None) -> dict:
    # Every row gets every key: bulk inserts null out missing keys instead of using column defaults.
    return {
        "user_id": user_id,
        "source_resume_id": source_resume_id,
        "section": section if section in SECTIONS else "other",
        "content_text": text,
        "content": data or {},
    }


def create(user_id: str, section: str, text: str, source_resume_id: str | None = None,
           data: dict | None = None) -> dict:
    return supabase.table(T).insert(_row(user_id, section, text, source_resume_id, data)).execute().data[0]


def create_many(user_id: str, tiles: list[dict], source_resume_id: str | None = None) -> list[dict]:
    """tiles: [{"category", "text", "data"?}] (llm.extract_tiles output)."""
    rows = [_row(user_id, t.get("category"), t.get("text") or "", source_resume_id, t.get("data"))
            for t in tiles if t.get("text")]
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
    """e.g. update(uid, id, section="skills", content_text="...", content={...})"""
    return first(supabase.table(T).update(fields).eq("user_id", user_id).eq("id", item_id).execute().data)


def delete(user_id: str, item_id: str) -> None:
    supabase.table(T).delete().eq("user_id", user_id).eq("id", item_id).execute()


def delete_all(user_id: str) -> None:
    supabase.table(T).delete().eq("user_id", user_id).execute()
