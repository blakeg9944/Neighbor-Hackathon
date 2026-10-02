import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

# Service-role client: bypasses RLS, so every query in this package filters by user_id explicitly.
supabase: Client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def first(rows: list[dict]) -> dict | None:
    return rows[0] if rows else None
