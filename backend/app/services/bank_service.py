"""Resume bank: tiles CRUD, resume parsing, and the profile embedding used for fit scores."""
from pydantic import ValidationError

from ..db import profiles, resume_items, source_resumes, storage
from . import llm, pdf, tile_data
from .errors import AppError, not_found


def tile_out(row: dict) -> dict:
    """resume_items row -> Tile (text <- content_text, category <- section, data <- content or null)."""
    return {
        "id": row["id"], "category": row["section"], "text": row["content_text"],
        "data": row.get("content") or None,
        "source_resume_id": row.get("source_resume_id"), "created_at": row["created_at"],
    }


def list_tiles(user_id: str) -> list[dict]:
    """Ordered by category order, then created_at."""
    return [tile_out(r) for r in resume_items.list_for_user(user_id)]


def _structured(category: str, data: dict) -> tuple[dict, str]:
    """Validate data for the category -> (clean data, generated text)."""
    try:
        clean = tile_data.coerce(category, data)
    except ValidationError as e:
        raise AppError(422, "BAD_TILE_DATA", f"Invalid {category} fields: {e.errors()[0]['msg']}")
    text = tile_data.render_text(category, clean)
    if not text.strip():
        raise AppError(422, "BAD_TILE_DATA", f"{category} tile needs at least a name/title")
    return clean, text


def create_tile(user_id: str, category: str, text: str | None = None, data: dict | None = None) -> dict:
    """Structured (data -> generated text) or freeform (text only)."""
    if data:
        data, text = _structured(category, data)
    elif not (text or "").strip():
        raise AppError(422, "BAD_TILE_DATA", "A tile needs text or data")
    return tile_out(resume_items.create(user_id, category, text.strip(), data=data))


def update_tile(user_id: str, tile_id: str, category: str | None = None, text: str | None = None,
                data: dict | None = None) -> dict:
    """data -> replace fields + regenerate text; text alone -> freeform (data cleared);
    category change without new data -> data cleared (its shape belongs to the old category)."""
    current = resume_items.get(user_id, tile_id)
    if not current:
        raise not_found("Tile")
    fields: dict = {}
    if category is not None:
        fields["section"] = category
    if data is not None:
        fields["content"], fields["content_text"] = _structured(category or current["section"], data)
    elif text is not None:
        fields["content_text"] = text.strip()
        fields["content"] = {}
    elif category is not None and category != current["section"]:
        fields["content"] = {}
    row = resume_items.update(user_id, tile_id, **fields) if fields else current
    return tile_out(row)


def delete_tile(user_id: str, tile_id: str) -> None:
    resume_items.delete(user_id, tile_id)


def parse_resume(user_id: str, pdf_bytes: bytes | None = None, text: str | None = None) -> list[dict]:
    """PDF bytes or pasted text -> tiles that REPLACE the whole bank (DESIGN_SPEC §6.2)."""
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

    if not extracted:
        raise AppError(422, "EMPTY_RESUME", "Couldn't find any resume entries in that text.")

    # A new upload REPLACES the bank (avoids duplicates). Only wipe after parsing succeeded,
    # so a failed upload never leaves the user with an empty bank.
    resume_items.delete_all(user_id)
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
