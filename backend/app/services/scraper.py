# app/services/scraper.py
import json
import re

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


# --- Sync full-text fetch used by POST /api/jobs (DESIGN_SPEC §7 fetch_job_text) ---
MAX_CHARS = 15_000


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _find_job_posting(data) -> dict | None:
    """Search JSON-LD (dict, list, or @graph) for a JobPosting object."""
    if isinstance(data, list):
        for item in data:
            if found := _find_job_posting(item):
                return found
    elif isinstance(data, dict):
        types = data.get("@type")
        if types == "JobPosting" or (isinstance(types, list) and "JobPosting" in types):
            return data
        if "@graph" in data:
            return _find_job_posting(data["@graph"])
    return None


def _from_json_ld(soup: BeautifulSoup) -> str | None:
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            posting = _find_job_posting(json.loads(tag.string or ""))
        except (json.JSONDecodeError, TypeError):
            continue
        if not posting:
            continue
        org = posting.get("hiringOrganization") or {}
        company = org.get("name") if isinstance(org, dict) else str(org)
        description = BeautifulSoup(posting.get("description") or "", "html.parser").get_text(" ")
        parts = [posting.get("title"), company, description]
        return _clean("\n".join(p for p in parts if p))
    return None


def fetch_job_text(url: str) -> str:
    """Sync fetch -> JSON-LD JobPosting if present, else visible page text. Raises on HTTP errors."""
    res = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=15.0)
    res.raise_for_status()
    soup = BeautifulSoup(res.text, "html.parser")

    text = _from_json_ld(soup)
    if not text or len(text) < 500:
        for el in soup(["script", "style", "noscript", "nav", "header", "footer", "svg"]):
            el.decompose()
        page_text = _clean(soup.get_text(" "))
        text = page_text if len(page_text) > len(text or "") else text
    return (text or "")[:MAX_CHARS]
