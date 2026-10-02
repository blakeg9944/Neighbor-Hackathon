"""
This will hold the endpoints
"""

# app/routes.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl

router = APIRouter()

class URLRequest(BaseModel):
    url: str  # or HttpUrl for strict URL validation

# app/routes.py
@router.post("/api/url")
async def receive_url(payload: URLRequest):
    # Process the URL or create a DB entry with an ID
    item_id = 123 
    
    return {
        "status": "success",
        "url": payload.url,
        "redirect_url": f"http://localhost:3000/" # Change this so that it matches the frontend URL
    }