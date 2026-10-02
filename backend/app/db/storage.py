"""Private buckets: `uploads` (original resumes) and `resumes` (generated PDFs). Paths are `{user_id}/{name}`."""
import uuid

from .client import supabase

UPLOADS = "uploads"
RESUMES = "resumes"


def user_path(user_id: str, filename: str | None = None, ext: str = "pdf") -> str:
    return f"{user_id}/{filename or f'{uuid.uuid4()}.{ext}'}"


def upload(bucket: str, path: str, data: bytes, content_type: str = "application/pdf") -> str:
    supabase.storage.from_(bucket).upload(path, data, {"content-type": content_type, "upsert": "true"})
    return path


def download(bucket: str, path: str) -> bytes:
    return supabase.storage.from_(bucket).download(path)


def signed_url(bucket: str, path: str, expires_in: int = 3600) -> str | None:
    res = supabase.storage.from_(bucket).create_signed_url(path, expires_in)
    return res.get("signedURL") or res.get("signedUrl")


def delete(bucket: str, *paths: str) -> None:
    if paths:
        supabase.storage.from_(bucket).remove(list(paths))
