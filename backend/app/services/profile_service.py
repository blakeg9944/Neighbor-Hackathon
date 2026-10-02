from ..db import profiles
from .errors import not_found


def get_profile(user_id: str) -> dict:
    profile = profiles.get(user_id)
    if not profile:
        raise not_found("Profile")
    return profile


def update_profile(user_id: str, fields: dict) -> dict:
    """fields: any of full_name, phone, location, links, application (id/email are not editable).
    `application` (ApplicationInfo dict) replaces the stored answers; unanswered fields are dropped."""
    allowed = {k: v for k, v in fields.items() if k in ("full_name", "phone", "location", "links", "application")}
    for key in ("links", "application"):
        if allowed.get(key) is None:
            allowed.pop(key, None)
    if "application" in allowed:
        allowed["application"] = {k: v for k, v in allowed["application"].items() if v not in (None, "", [])}
    return profiles.update(user_id, **allowed) or get_profile(user_id)
