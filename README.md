# Resume Adapter

Build a bank of resume "tiles" once, then generate a tailored, one-page PDF resume for any job posting, from the website or with one click in the Chrome extension.

> **Start here: [DESIGN_SPEC.md](DESIGN_SPEC.md)** has the full plan: architecture, DB schema, API contract, LLM contracts, page behavior, division of labor, and timeline.
> Claude Code loads it automatically through [CLAUDE.md](CLAUDE.md).

## How it works
1. **Resume Bank:** upload your resume (PDF or pasted text). OpenAI splits it into tiles across 6 categories (Education, Relevant Coursework, Skills, Job Experience, Projects, Other). Change categories, delete tiles, or add details that didn't fit on your resume.
2. **Tailor:** paste a job URL on the website, or on a job posting click the Chrome extension and then **Make a Resume**. The backend reads the posting, summarizes it, and picks your most relevant tiles.
3. **Review:** drag and drop tiles between sections and an "Unused" sidebar.
4. **Generate PDF:** preview and download. Every PDF is saved with a timestamp.
5. **Dashboard:** one card per job with a summary, the saved layout, and PDF history.

## Tech stack
| Part | Tech |
|---|---|
| Website | React + Vite + TypeScript + Tailwind, `@dnd-kit` |
| Backend | Python FastAPI, OpenAI API, ReportLab (PDF), pypdf, httpx + BeautifulSoup |
| Data/Auth | Supabase (Postgres, Storage, Auth with Google) |
| Extension | Chrome Manifest V3 popup |

## Repo layout
```
frontend/                 React website                          (James)
backend/app/
  main.py, routes.py, schemas.py, auth.py, db/                    (database guy)
  llm.py, pdf.py                                                  (openai guy)
  scrape.py                                                       (extension guy)
backend/run.py            starts the API on :8000                (database guy)
ChromeExtension/          Chrome extension popup                 (extension guy)
supabase/                 migrations + config                    (database guy)
demo/                     sample resume, demo job URLs           (extension guy)
```

## Team
| Role | Area |
|---|---|
| James | Website (all pages, drag-and-drop review, dashboard) + Google auth setup |
| Extension guy | Chrome extension popup, job-page scraping, demo prep + QA |
| OpenAI guy | Resume parsing, job summary, tile selection (OpenAI) + PDF rendering |
| Database guy | Supabase schema/migrations, storage, FastAPI routes |

See [DESIGN_SPEC.md §11](DESIGN_SPEC.md#11-division-of-labor) for detailed tasks.

## Local setup

### Prerequisites
Node 20+, Python 3.11+, [Supabase CLI](https://supabase.com/docs/guides/cli), Chrome.

### Environment
Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`, then fill them in (see [DESIGN_SPEC.md §10](DESIGN_SPEC.md#10-configuration)). Get keys from the team. **Never commit `.env` files.**

### Database (database guy, once per new migration)
```bash
supabase link --project-ref <project-ref>
supabase db push
```

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Git Bash: source .venv/Scripts/activate
pip install -r requirements.txt
python run.py                   # http://localhost:8000
```
Check: http://localhost:8000/api/health and http://localhost:8000/docs

### Frontend
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173  (use localhost, not 127.0.0.1)
```
Set `VITE_USE_MOCKS=true` to work without the backend.

### Chrome extension
`chrome://extensions`, then enable **Developer mode**, then **Load unpacked**, then select the `ChromeExtension/` folder. On a job posting, click the extension icon and then **Make a Resume**. Sign in to the website once; you'll stay signed in.
