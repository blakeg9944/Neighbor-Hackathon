"""
OpenAI calls: resume -> tiles, job text -> summary, tiles + job -> layout.
STUB: returns realistic hardcoded data so routes can be wired up (DESIGN_SPEC §7).
Signatures are fixed; the real OpenAI versions will replace the bodies.
"""

# Fixed order used everywhere (DESIGN_SPEC §4.1)
CATEGORIES: tuple[str, ...] = ("education", "coursework", "skills", "experience", "projects", "other")

# Rough one-page budget per section (DESIGN_SPEC §7.1)
BUDGET: dict[str, int] = {"education": 2, "coursework": 1, "skills": 4, "experience": 4, "projects": 3, "other": 2}


def extract_tiles(resume_text: str) -> list[dict]:
    """-> [{"category": Category, "text": str}], text follows DESIGN_SPEC §4.2."""
    return [
        {"category": "education",
         "text": "B.S. Computer Science, State University (Expected May 2026), GPA 3.8"},
        {"category": "coursework",
         "text": "Relevant Coursework: Data Structures, Algorithms, Databases, Machine Learning, Operating Systems"},
        {"category": "skills", "text": "Languages: Python, TypeScript, Java, SQL"},
        {"category": "skills", "text": "Frameworks: React, FastAPI, Node.js, PyTorch"},
        {"category": "skills", "text": "Tools: Git, Docker, AWS, PostgreSQL"},
        {"category": "experience",
         "text": "Software Engineering Intern, Acme Corp (May 2024 – Aug 2024)\n"
                 "• Built a Kafka ingestion service handling 2M events/day\n"
                 "• Reduced p95 API latency by 40% by adding a Redis cache"},
        {"category": "experience",
         "text": "Teaching Assistant, State University CS Department (Jan 2024 – Present)\n"
                 "• Led weekly labs for 40 students in Data Structures\n"
                 "• Wrote autograder tests used across 3 course sections"},
        {"category": "projects",
         "text": "Campus Eats (React, FastAPI, PostgreSQL)\n"
                 "• Food-truck tracker used by 1,200 students in its first month\n"
                 "• Real-time location updates over WebSockets"},
        {"category": "projects",
         "text": "Stock Sentiment Analyzer (Python, PyTorch)\n"
                 "• Fine-tuned a BERT model on 50k financial headlines, 87% accuracy"},
        {"category": "other", "text": "Dean's List, 6 semesters"},
        {"category": "other", "text": "Volunteer Math Tutor, Lincoln High School (2022 – Present)"},
    ]


def summarize_job(job_text: str, url: str) -> dict:
    """-> {"title", "company", "summary", "bullets": list[str] (5–8)}"""
    return {
        "title": "Software Engineer, Backend",
        "company": "Acme Corp",
        "summary": "Acme is hiring a backend engineer to build and scale the data pipelines and APIs "
                   "behind its logistics platform. The role works in Python and Go on AWS, with a focus "
                   "on reliability and performance.",
        "bullets": [
            "Design, build, and operate backend services in Python and Go",
            "Own data pipelines processing millions of events per day",
            "Experience with SQL databases and caching (PostgreSQL, Redis)",
            "Familiarity with AWS and containerized deployments (Docker)",
            "Write tests and participate in code review",
            "B.S. in Computer Science or equivalent experience",
        ],
    }


def select_tiles(job: dict, job_text: str, tiles: list[dict]) -> dict:
    """tiles: [{"id","category","text"}] -> Layout {"sections": {6 keys: [ids]}, "unused": [ids]}

    Stub: keeps each tile in its bank category, first N per BUDGET, rest go to unused.
    """
    sections: dict[str, list[str]] = {c: [] for c in CATEGORIES}
    unused: list[str] = []
    for t in tiles:
        placed = sections.get(t["category"])
        if placed is not None and len(placed) < BUDGET[t["category"]]:
            placed.append(t["id"])
        else:
            unused.append(t["id"])
    return {"sections": sections, "unused": unused}
