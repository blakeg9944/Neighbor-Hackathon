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

    # Example: Access DB session if needed
    # new_item = Item(url=payload.url)
    # db.add(new_item)
    # await db.commit()

    return {"status": "success", "url": payload.url}