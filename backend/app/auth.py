from fastapi import Header, HTTPException

from .db.client import supabase


def get_user_id(authorization: str = Header(...)) -> str:
    """FastAPI dependency: validates the Supabase JWT from `Authorization: Bearer <token>`."""
    token = authorization.removeprefix("Bearer ").strip()
    try:
        res = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not res or not res.user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return res.user.id
