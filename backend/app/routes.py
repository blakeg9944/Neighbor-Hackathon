"""
This will hold the endpoints
"""

# app/routes.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl

router = APIRouter()

class URLRequest(BaseModel):
    url: str  # or HttpUrl for strict URL validation

@router.post("/api/url")
async def receive_url(payload: URLRequest):
    if not payload.url:
        raise HTTPException(status_code=400, detail="No URL provided")

    print(f"Received URL: {payload.url}")

    # Example: save to Supabase via the db layer (app/db/). Add
    # `user_id: str = Depends(get_user_id)` (from app.auth) to the signature, then:
    # from app.db import jobs
    # job = jobs.create(user_id, description, url=payload.url)
    # jobs.save(user_id, job["id"])

    return {"status": "success", "url": payload.url}