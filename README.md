# trimdcv

Build a bank of resume "tiles" once, then generate a tailored, one-page PDF resume for any job posting, from the website or with one click in the Chrome extension. The extension can also fill in job application forms for you.

Live at **https://trimdcv.com**. (Older code and docs may still say "Resume Adapter", the project's original name.)

> **Start here: [DESIGN_SPEC.md](DESIGN_SPEC.md)** has the full plan: architecture, DB schema, API contract, LLM contracts, page behavior, division of labor, and timeline.
> Claude Code loads it automatically through [CLAUDE.md](CLAUDE.md).

## How it works
1. **Your Resume (bank):** upload your resume (PDF or pasted text). OpenAI splits it into tiles across 6 categories (Education, Relevant Coursework, Skills, Job Experience, Projects, Other). Skills and courses become one tile each. Edit, recategorize, or delete tiles, or add details that didn't fit on your resume.
2. **Profile:** contact info for the resume header, plus optional application answers (links, address, work eligibility, voluntary EEO questions) that auto-apply uses.
3. **Tailor:** paste a job URL on the website, or click the Chrome extension on a job posting and then **Make a Resume**. The backend reads the posting, summarizes it, and picks your most relevant tiles. If the page can't be read, you paste the description instead.
4. **Review:** a three-pane editor. Left: the job's requirements, split into matched and unmatched by what's on this resume. Middle: drag and drop tiles between sections and an "Unused" list, reorder or rename sections, and ✎ a tile's text for this resume only. Right: a live preview of the PDF that auto-fits to one page. Pick a template (Classic, Modern, Compact). **Re-pick tiles** runs the selection again.
5. **Generate PDF:** download it. Every PDF is saved with a timestamp.
6. **Dashboard:** a table of your jobs with a **fit score** (how well your bank matches the job), PDF count, and last generated date. Click a row to open its Review page.
7. **Job Opportunities:** the jobs in the shared pool that best match your bank, ranked by fit.
8. **Auto-apply:** on a job application page, open the extension, pick the saved job, and click **Fill form**. It fills in the fields it's confident about and never clicks Submit. **Download resume** saves the matching PDF so you can attach it, because browsers don't let extensions fill file inputs.

## Tech stack
| Part | Tech |
|---|---|
| Website | React + Vite + TypeScript + Tailwind, `@dnd-kit` |
| Backend | Python FastAPI, OpenAI API (structured outputs + `text-embedding-3-small` for fit scores), ReportLab (PDF), pypdf, httpx + BeautifulSoup |
| Data/Auth | Supabase (Postgres, Storage, Auth with Google) |
| Extension | Chrome Manifest V3 popup + `authBridge.js` content script |
| Hosting | AWS Amplify (frontend), AWS Lightsail + Caddy (backend) |

## Repo layout
```
frontend/                     React website                                    (James)
  src/App.tsx, main.tsx       router + auth guard
  src/pages/                  Login, Dashboard, Bank, Profile, Opportunities, Generate, Review
  src/components/             Layout (sidebar shell), ui.tsx (shared building blocks), PdfModal
  src/components/review/      Review page panes: job points, editor, live preview
  src/lib/                    supabase.ts + auth.tsx (sign-in, session), api.ts, types.ts, mock.ts,
                              templates.ts + preview.ts (live PDF preview), storage.ts (saved prefs)
backend/
  run.py                      starts the API on :8000                          (Wyatt)
  seed_jobs.py, ksl_jobs.txt  bulk-add job URLs to the shared job pool, plus a sample list
  app/
    main.py, routes.py, schemas.py, auth.py                                    (Wyatt)
    db/                       data access per table, filtered by user_id       (Wyatt)
    fonts/                    bundled PDF fonts (Crimson Text, Lato)
    services/
      llm.py, pdf.py                                                           (Blake)
      scraper.py                                                               (Peter)
      job_service.py, bank_service.py, profile_service.py,
      autofill_service.py, layout.py, tile_data.py, errors.py                  route logic
shared/                       resume_templates.json: PDF styles, read by pdf.py and the live preview
ChromeExtension/              popup, config.js (local/production), authBridge.js, icons (Peter)
supabase/                     config.toml + migrations/                        (Wyatt)
deploy/                       Caddyfiles, systemd unit, deploy README          (Blake)
amplify.yml                   Amplify build for frontend/
.github/workflows/            backend auto-deploy on push to `prod`
```

## Team
| Who | Area |
|---|---|
| James | Website (all pages, three-pane Review editor, dashboard) + Google auth setup |
| Peter | Chrome extension (popup, auth bridge, auto-apply), job-page scraping, demo prep + QA |
| Blake | OpenAI (resume parsing, job summary, tile selection, form-field mapping) + PDF rendering, AWS deploy |
| Wyatt | Supabase schema/migrations, storage, FastAPI routes |

[DESIGN_SPEC.md §11](DESIGN_SPEC.md#11-division-of-labor) has detailed tasks. It uses role names: James = website, Peter = extension guy, Blake = openai guy, Wyatt = database guy.

## Local setup

### Prerequisites
Node 20+, Python 3.11+, [Supabase CLI](https://supabase.com/docs/guides/cli), Chrome.

### Environment
Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`, then fill them in (see [DESIGN_SPEC.md §10](DESIGN_SPEC.md#10-configuration)). Get keys from the team. **Never commit `.env` files.**

### Database (Wyatt, once per new migration)
```bash
supabase link --project-ref <project-ref>
supabase db push
```

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Git Bash: source .venv/Scripts/activate   macOS: source .venv/bin/activate
pip install -r requirements.txt
python run.py                   # http://localhost:8000
```
Check: http://localhost:8000/api/health and http://localhost:8000/docs

**Seed the job pool (optional):** Job Opportunities is empty until the shared pool has jobs. From `backend/` with the venv active:
```bash
python seed_jobs.py ksl_jobs.txt
```

### Frontend
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173  (use localhost, not 127.0.0.1)
```
Set `VITE_USE_MOCKS=true` to work without the backend.

### Chrome extension
1. In `ChromeExtension/config.js`, set `CURRENT_ENV` to `"local"` to use your local website and backend. It's `"production"` (trimdcv.com) by default.
2. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `ChromeExtension/` folder. Click the reload icon there after edits.
3. Sign in to the website once. The extension uses that session, and you'll stay signed in.
4. On a job posting, click the extension icon and then **Make a Resume**. On an application form, use **Fill form** and **Download resume**.

## Deployment
| What | Where | How it deploys |
|---|---|---|
| Frontend | https://trimdcv.com (AWS Amplify, [amplify.yml](amplify.yml)) | Amplify builds the `prod` branch |
| Backend | https://api.trimdcv.com (Lightsail, Caddy, uvicorn) | GitHub Action on push to `prod` |

To release, push `main` to `prod`:
```bash
git push origin main:prod
```
See [deploy/README.md](deploy/README.md) for server details and a local rehearsal of the production setup.
