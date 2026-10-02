"""Bulk-add job postings to the global job pool (used by recommended jobs / fit scores).

Usage (from backend/, venv active):
    python seed_jobs.py urls.txt [--workers 4]
    python seed_jobs.py --reembed          # re-embed every job already in the pool (after changing embed_job)

urls.txt: one job posting URL per line. Blank lines and lines starting with # are ignored.
Each URL is scraped, summarized, and embedded, the same way POST /api/jobs does it,
but it isn't added to anyone's dashboard. URLs already in the pool with a summary are skipped
(their embedding is filled in if it's missing). Safe to re-run.
"""
import argparse
import sys
from concurrent.futures import ThreadPoolExecutor

from app.db import jobs, supabase
from app.services import llm
from app.services.job_service import MIN_JOB_TEXT, embed_job
from app.services.scraper import fetch_job_text


def _has_embedding(job_id: str) -> bool:
    return bool(supabase.table("jobs").select("id").eq("id", job_id).not_.is_("embedding", "null").execute().data)


def seed_one(url: str) -> tuple[str, str]:
    """-> (status, message). status: added | embedded | skipped | failed"""
    try:
        existing = jobs.get_by_url(url)
        if existing and existing.get("summary"):
            if _has_embedding(existing["id"]):
                return "skipped", existing.get("title") or ""
            embed_job(existing)
            return "embedded", existing.get("title") or ""

        text = fetch_job_text(url)
        if len(text) < MIN_JOB_TEXT:
            return "failed", f"only {len(text)} chars of text (page blocked or needs JS?)"
        info = llm.summarize_job(text, url)
        if existing:
            job = jobs.update(existing["id"], description=text, **info)
        else:
            job = jobs.create(None, text, url=url, **info)  # created_by = null: seeded, not a user's job
        embed_job(job)
        return "added", f"{job.get('title')} @ {job.get('company')}"
    except Exception as e:
        return "failed", f"{type(e).__name__}: {e}"


def read_urls(path: str) -> list[str]:
    with open(path, encoding="utf-8-sig") as f:
        lines = [line.strip() for line in f]
    urls = [line for line in lines if line and not line.startswith("#")]
    return list(dict.fromkeys(urls))  # de-duplicate, keep order


def reembed_all(workers: int) -> None:
    pool = supabase.table("jobs").select("id, title, company, summary, bullets").execute().data
    print(f"Re-embedding {len(pool)} jobs...")
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        list(ex.map(embed_job, pool))
    print("Done.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Bulk-add job URLs to the global job pool.")
    parser.add_argument("file", nargs="?", help="text file with one job URL per line")
    parser.add_argument("--reembed", action="store_true", help="re-embed every job already in the pool")
    parser.add_argument("--workers", type=int, default=4, help="URLs processed in parallel (default 4)")
    args = parser.parse_args()
    if args.reembed:
        return reembed_all(args.workers)
    if not args.file:
        parser.error("give a URL file, or --reembed")

    urls = read_urls(args.file)
    if not urls:
        sys.exit(f"No URLs found in {args.file}")
    if llm.USE_STUBS:
        print("WARNING: OPENAI_API_KEY is not set; jobs get stub summaries and no embeddings.\n")
    print(f"Seeding {len(urls)} URLs with {args.workers} workers...\n")

    counts: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        for i, (url, (status, msg)) in enumerate(zip(urls, pool.map(seed_one, urls)), 1):
            counts[status] = counts.get(status, 0) + 1
            print(f"[{i}/{len(urls)}] {status.upper():8} {url}\n           {msg}")

    print("\nDone: " + ", ".join(f"{n} {s}" for s, n in counts.items()))


if __name__ == "__main__":
    main()
