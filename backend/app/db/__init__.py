"""Data-access layer. Usage: `from app.db import resume_items; resume_items.list_for_user(uid)`."""
from . import generated_resumes, jobs, profiles, resume_items, source_resumes, storage
from .client import supabase

__all__ = ["supabase", "profiles", "source_resumes", "resume_items", "jobs", "generated_resumes", "storage"]
