from typing import Literal, TypedDict

from .client import first, supabase

T = "resume_items"

Section = Literal["experience", "education", "project", "skill", "certification", "summary", "other"]
SECTIONS: tuple[str, ...] = Section.__args__


class ResumeItemIn(TypedDict, total=False):
    section: Section  # required
    title: str | None
    organization: str | None
    start_date: str | None
    end_date: str | None
    content: dict  # e.g. {"bullets": [...], "location": "..."}
    content_text: str  # plain-text version, used for the profile embedding


def _row(user_id: str, item: ResumeItemIn, source_resume_id: str | None) -> dict:
    # Every row gets every key: bulk inserts null out missing keys instead of using column defaults.
    section = item.get("section")
    return {
        "user_id": user_id,
        "source_resume_id": source_resume_id,
        "section": section if section in SECTIONS else "other",
        "title": item.get("title"),
        "organization": item.get("organization"),
        "start_date": item.get("start_date"),
        "end_date": item.get("end_date"),
        "content": item.get("content") or {},
        "content_text": item.get("content_text") or "",
    }


def create(user_id: str, item: ResumeItemIn, source_resume_id: str | None = None) -> dict:
    return supabase.table(T).insert(_row(user_id, item, source_resume_id)).execute().data[0]


def create_many(user_id: str, items: list[ResumeItemIn], source_resume_id: str | None = None) -> list[dict]:
    if not items:
        return []
    rows = [_row(user_id, it, source_resume_id) for it in items]
    return supabase.table(T).insert(rows).execute().data


def get(user_id: str, item_id: str) -> dict | None:
    return first(supabase.table(T).select("*").eq("user_id", user_id).eq("id", item_id).execute().data)


def list_for_user(user_id: str, section: Section | None = None) -> list[dict]:
    q = supabase.table(T).select("*").eq("user_id", user_id)
    if section:
        q = q.eq("section", section)
    return q.order("section").order("created_at").execute().data


def grouped_by_section(user_id: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for row in list_for_user(user_id):
        out.setdefault(row["section"], []).append(row)
    return out


def all_text(user_id: str) -> str:
    """Every item's content_text joined; this is what gets embedded into profiles.embedding."""
    rows = supabase.table(T).select("content_text").eq("user_id", user_id).execute().data
    return "\n\n".join(r["content_text"] for r in rows if r["content_text"])


def update(user_id: str, item_id: str, **fields) -> dict | None:
    return first(supabase.table(T).update(fields).eq("user_id", user_id).eq("id", item_id).execute().data)


def delete(user_id: str, item_id: str) -> None:
    supabase.table(T).delete().eq("user_id", user_id).eq("id", item_id).execute()


def delete_all(user_id: str) -> None:
    """Wipe before re-importing a resume."""
    supabase.table(T).delete().eq("user_id", user_id).execute()
