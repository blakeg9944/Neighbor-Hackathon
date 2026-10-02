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

            title = soup.title.string.strip() if soup.title and soup.title.string else "No Title Found"

            meta_desc = soup.find("meta", attrs={"name": "description"})
            description = meta_desc["content"].strip() if meta_desc and meta_desc.get("content") else ""

            h1_tags = [h1.get_text(strip=True) for h1 in soup.find_all("h1")]

            og_image = soup.find("meta", property="og:image")
            image_url = og_image["content"] if og_image and og_image.get("content") else None

            return {
                "title": title,
                "description": description,
                "h1s": h1_tags,
                "image_url": image_url,
                "raw_text_sample": soup.get_text(separator=" ", strip=True)[:300]
            }

        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch URL: HTTP {e.response.status_code}")
        except httpx.RequestError as e:
            raise HTTPException(status_code=400, detail=f"Network error while scraping URL: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Parsing error: {str(e)}")