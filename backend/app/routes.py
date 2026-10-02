"""
This will hold the endpoints
"""

# app/api/url_routes.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.scraper import ScraperService

router = APIRouter(prefix="/api", tags=["URL Processing"])

class URLRequest(BaseModel):
    url: str

@router.post("/url")
async def receive_and_scrape_url(payload: URLRequest):
    if not payload.url:
        raise HTTPException(status_code=400, detail="No URL provided")

    # Delegate scraping logic to the service directory
    scraped_data = await ScraperService.scrape_url(payload.url)

    return {
        "status": "success",
        "url": payload.url,
        "scraped_data": scraped_data,
        "redirect_url": "http://localhost:8000/docs"
    }