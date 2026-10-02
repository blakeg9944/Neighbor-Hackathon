import os

from dotenv import load_dotenv
from fastapi import Header, HTTPException
from supabase import Client, create_client

load_dotenv()

# Service-role client: bypasses RLS, so every query must filter by user_id explicitly.
supabase: Client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


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


def signed_url(bucket: str, path: str, expires_in: int = 3600) -> str | None:
    res = supabase.storage.from_(bucket).create_signed_url(path, expires_in)
    return res.get("signedURL") or res.get("signedUrl")
