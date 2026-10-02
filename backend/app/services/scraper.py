# app/services/scraper.py
import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

class ScraperService:
    @staticmethod
    async def scrape_url(target_url: str) -> dict:
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
                response = await client.get(target_url, headers=HEADERS)
                response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            # Remove non-visible tags like script and style blocks before extracting text
            for element in soup(["script", "style", "noscript", "header", "footer"]):
                element.decompose()

            # Extract full page text without length limit
            full_text = soup.get_text(separator=" ", strip=True)

            return {
                "title": soup.title.string.strip() if soup.title and soup.title.string else "No Title",
                "full_text": full_text,  # Complete page text
                "html_length": len(response.text)
            }

        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch URL: HTTP {e.response.status_code}")
        except httpx.RequestError as e:
            raise HTTPException(status_code=400, detail=f"Network error while scraping URL: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Parsing error: {str(e)}")