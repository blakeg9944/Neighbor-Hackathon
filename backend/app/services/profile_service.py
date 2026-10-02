from ..db import profiles
from .errors import not_found


def get_profile(user_id: str) -> dict:
    profile = profiles.get(user_id)
    if not profile:
        raise not_found("Profile")
    return profile


def update_profile(user_id: str, fields: dict) -> dict:
    """fields: any of full_name, phone, location, links (id/email are not editable)."""
    allowed = {k: v for k, v in fields.items() if k in ("full_name", "phone", "location", "links")}
    if allowed.get("links") is None:
        allowed.pop("links", None)
    return profiles.update(user_id, **allowed) or get_profile(user_id)
