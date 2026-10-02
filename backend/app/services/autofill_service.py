"""Auto-apply (DESIGN_SPEC §9.1): map a live application form's fields to values.

No browser automation here — the extension extracts the fields from (and fills) the tab itself;
this just does the one LLM call using the job's saved layout + the user's profile.
"""
from ..db import jobs, profiles
from . import llm
from .bank_service import list_tiles
from .errors import not_found
from .job_service import job_out
from .layout import normalize_layout, section_texts


def map_fields_for_job(user_id: str, job_id: str, fields: list[dict]) -> dict:
    saved = jobs.get_saved(user_id, job_id)
    if not saved:
        raise not_found("Job")
    tiles = list_tiles(user_id)
    layout = normalize_layout(saved.get("layout"), tiles)
    resume_text = "\n".join(line for lines in section_texts(layout, tiles).values() for line in lines)
    mapping = llm.map_fields(fields, profiles.get(user_id) or {}, resume_text, job_out(saved))
    return {"mapping": mapping}
