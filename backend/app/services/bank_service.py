"""Resume bank: tiles CRUD, resume parsing, and the profile embedding used for fit scores."""
from ..db import profiles, resume_items, source_resumes, storage
from . import llm, pdf
from .errors import AppError, not_found


def tile_out(row: dict) -> dict:
    """resume_items row -> Tile (text <- content_text, category <- section)."""
    return {
        "id": row["id"], "category": row["section"], "text": row["content_text"],
        "source_resume_id": row.get("source_resume_id"), "created_at": row["created_at"],
    }


def list_tiles(user_id: str) -> list[dict]:
    """Ordered by category order, then created_at."""
    return [tile_out(r) for r in resume_items.list_for_user(user_id)]


def create_tile(user_id: str, category: str, text: str) -> dict:
    return tile_out(resume_items.create(user_id, category, text.strip()))


def update_tile(user_id: str, tile_id: str, category: str | None = None, text: str | None = None) -> dict:
    fields = {}
    if category is not None:
        fields["section"] = category
    if text is not None:
        fields["content_text"] = text.strip()
    row = resume_items.update(user_id, tile_id, **fields) if fields else resume_items.get(user_id, tile_id)
    if not row:
        raise not_found("Tile")
    return tile_out(row)


def delete_tile(user_id: str, tile_id: str) -> None:
    resume_items.delete(user_id, tile_id)


def parse_resume(user_id: str, pdf_bytes: bytes | None = None, text: str | None = None) -> list[dict]:
    """PDF bytes or pasted text -> new tiles appended to the bank (DESIGN_SPEC §6.2)."""
    if pdf_bytes:
        try:
            raw_text = pdf.pdf_to_text(pdf_bytes)
        except Exception:
            raise AppError(422, "BAD_PDF", "Couldn't read that PDF. Try pasting the text instead.")
    else:
        raw_text = (text or "").strip()
    if not raw_text:
        raise AppError(422, "EMPTY_RESUME", "No text found. If the PDF is scanned, paste the text instead.")

    source = source_resumes.create(user_id, raw_text)
    if pdf_bytes:
        path = storage.upload(storage.UPLOADS, storage.user_path(user_id, f"{source['id']}.pdf"), pdf_bytes)
        source_resumes.set_storage_path(user_id, source["id"], path)

    try:
        extracted = llm.extract_tiles(raw_text)
    except Exception as e:
        print(f"extract_tiles failed: {e}")
        raise AppError(502, "LLM_FAILED", "Couldn't split the resume into tiles. Please try again.")

    created = resume_items.create_many(user_id, extracted, source_resume_id=source["id"])
    return [tile_out(r) for r in created]


def refresh_profile_embedding(user_id: str) -> None:
    """Run as a background task after the bank changes: re-embed all tile text for fit scores."""
    try:
        vec = llm.embed(resume_items.all_text(user_id))
        if vec:
            profiles.set_embedding(user_id, vec)
    except Exception as e:  # fit scores are best-effort; never break the request
        print(f"profile embedding failed for {user_id}: {e}")
