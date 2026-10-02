# Resume Adapter: Design Spec

> **This document is the source of truth** for every human and AI agent on this project.
> If you change an API shape, DB column, or LLM output format, update this file **in the same commit** and tell the team.
> Hackathon constraint: **live demo in 6 hours**. Prefer simple + working over clever. Anything marked *(stretch)* is optional.

**Team roles** (used throughout): **James** (website), **extension guy**, **openai guy**, **database guy**.

---

## 1. Product summary

Users build a **resume detail bank**: a pool of small "tiles" (one resume entry each) that holds more than fits on one resume. Given a job posting URL, the app picks the relevant tiles, lets the user rearrange them by drag-and-drop, and generates a tailored PDF. A dashboard keeps one card per job with a job summary, the saved layout, and every PDF generated for it.

**Entry points for tailoring**
1. **Chrome extension:** on a job posting, the user clicks the extension icon. A small popup shows the page and a **"Make a Resume"** button. Clicking it opens `http://localhost:5173/generate?url=<posting url>&source=extension`. If signed out, the website prompts for login and resumes generation afterward.
2. **Website:** user pastes a URL into the input on the dashboard or the `/generate` page.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Tile granularity | **One entry per tile** (e.g. a whole job with its bullets). See §4.2 for the text format. |
| Categories | Exactly 6: `education`, `coursework`, `skills`, `experience`, `projects`, `other` |
| Data access | **Everything goes through FastAPI** (`/api/...`). The frontend never queries Supabase tables directly; it uses Supabase only for **auth**. |
| Schema | **Evolve the existing schema** (the `init` migration + the database guy's `app/db/` layer) instead of replacing it. See §5. |
| Supabase | One shared **hosted** project. Migrations are pushed with `supabase db push`. |
| Auth | **Google sign-in only**, through Supabase (set up by **James**). No email/password. Sessions **persist**, so the user stays signed in across visits (§8.4). |
| Extension | Popup with a **"Make a Resume"** button that **opens the website**. The extension makes no API calls and needs no auth of its own; the website authenticates the user before generation. |
| Job text | Backend fetches the URL. If the fetch fails or returns too little text, the UI asks the user to **paste the description**. |
| Tailoring | The LLM **selects and orders** existing tiles and does **not rewrite** them. *(Rewriting is a stretch goal.)* |
| PDF | Rendered **in the backend with ReportLab** (pure Python, works on Windows) and stored in the Supabase `resumes` bucket. |
| Resume upload | **PDF** upload (parsed with `pypdf`) or **pasted plain text**. DOCX *(stretch)*. |
| Dashboard dedupe | One job card per `(user, job url)`. Re-submitting the same URL opens the existing card. |
| X button | **Review page:** X removes the tile from *this* resume only and moves it to the Unused sidebar. **Bank page:** X **permanently deletes** the tile from the bank. |
| Resume header | Name, email, phone, location and links come from the **profile** (editable on the Bank page), not from tiles. |
| Hosting | Demo runs on **localhost**. AWS *(stretch)*. |
| Job matching | **In scope (added):** a **fit score** per job (cosine similarity of the user's whole-bank embedding vs the job's embedding, via the existing `job_fit`/`match_jobs` RPCs) and **recommended jobs** from the global pool. Embeddings use `text-embedding-3-small`. Fit is `null` until both sides are embedded (or with no OpenAI key). |
| Out of scope | RAG / per-tile retrieval. |

---

## 3. Architecture

```
┌──────────────────────┐  "Make a Resume" opens tab      ┌──────────────────────────────┐
│ Chrome extension     │  localhost:5173/generate?url=…  │ Website (React+Vite) :5173   │
│ popup (no API calls) │ ──────────────────────────────▶ │  - Supabase Auth (Google)    │
└──────────────────────┘                                 │  - api() w/ Bearer JWT       │
                                                         └──────────────┬───────────────┘
                                                                        │ JSON / multipart
                                                                        ▼
                                                         ┌──────────────────────────────┐
                                                         │ FastAPI :8000  (/api/...)    │
                                                         │  routes, schemas, db/  (DB)  │
                                                         │  services/llm,pdf (openai)   │
                                                         │  services/scraper.py (ext.)  │
                                                         └───────┬──────────────┬───────┘
                                                                 │ service role │ HTTPS
                                                                 ▼              ▼
                                                     ┌──────────────────┐  ┌────────────┐
                                                     │ Supabase (hosted)│  │ OpenAI API │
                                                     │ Postgres+Storage │  └────────────┘
                                                     └──────────────────┘
```

**Tech stack**
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, React Router, `@dnd-kit/core` + `@dnd-kit/sortable`, `@supabase/supabase-js`
- **Backend:** Python 3.11+, FastAPI, uvicorn, `supabase`, `openai`, `pypdf`, `httpx`, `beautifulsoup4`, `reportlab`, `python-multipart`, `python-dotenv`
- **DB/Storage:** Supabase Postgres + Storage (buckets `uploads`, `resumes`)
- **Extension:** Chrome Manifest V3 popup

**Ports**: frontend `http://localhost:5173`, backend `http://localhost:8000` (`python backend/run.py`).
**Always use `localhost`, never `127.0.0.1`, for the website.** Browsers treat them as different sites, so a login on one isn't visible on the other.

### 3.1 What already exists (as of this spec)
| Path | Status |
|---|---|
| `backend/app/main.py` | FastAPI app + CORS (`*`) + includes `routes.router` |
| `backend/app/routes.py` | FastAPI app routes; `/api/jobs` and `/api/url` use the shared job-creation flow. |
| `backend/app/auth.py` | `get_user_id` dependency (validates the Supabase JWT) |
| `backend/app/db/` | Data-access helpers per table (`profiles`, `source_resumes`, `resume_items`, `jobs`, `generated_resumes`, `storage`), all filtered by `user_id`. Built for the init schema and **need small updates** for §5. |
| `backend/run.py` | `uvicorn app.main:app --reload` on port 8000 |
| `frontend/src/lib/supabase.ts` | Supabase client, `signInWithGoogle`, `api()` helper. No React app yet. |
| `ChromeExtension/` | Popup that opens the website with the active-tab URL; the authenticated frontend submits it to `/api/url`. |
| `supabase/migrations/…_init.sql` | Original schema; §5 adds a second migration on top. |

---

## 4. Domain model

### 4.1 Categories (order is fixed; use it everywhere: UI, LLM, PDF)

| key | Label |
|---|---|
| `education` | Education |
| `coursework` | Relevant Coursework |
| `skills` | Skills |
| `experience` | Job Experience |
| `projects` | Projects |
| `other` | Other |

### 4.2 Tile text convention (important for LLM, UI and PDF)

A tile's `text` is plain text:
- **Line 1 is the heading.** It renders bold in the PDF.
- **Following lines are the body.** Lines starting with `• ` render as bullets; any other line renders as a normal paragraph line.

```
Software Engineering Intern, Acme Corp (May 2024 – Aug 2024)
• Built a Kafka ingestion service handling 2M events/day
• Reduced p95 API latency by 40%
```
```
B.S. Computer Science, State University (Expected May 2026), GPA 3.8
```
```
Languages: Python, TypeScript, Java, SQL
```
**Structured tiles (`data`).** Parsed tiles also carry structured fields per category in `Tile.data`
(stored in `resume_items.content`; models in `backend/app/services/tile_data.py`). When `data` is present,
the backend **generates `text` from it**, so everything that reads `text` keeps working.

| Category | `data` fields | Generated `text` |
|---|---|---|
| education | institution, degree, degree_type, gpa, minor, location, start_date, end_date, details[] | `B.S. Computer Science, State University (Expected May 2026), GPA 3.8` |
| experience | title, organization, location, start_date, end_date, bullets[] | `Title, Org (Start – End)` + `• bullets` |
| projects | name, technologies[], link, date, bullets[] | `Name (Tech, Tech)` + `• bullets` |
| skills | name, group (e.g. "Languages" or null) | `Python` |
| coursework | name, code (or null) | `Data Structures` |
| other | title, organization, date, kind, bullets[] | `Title, Org (Date)` + `• bullets` |

Skills and coursework are **one tile per skill / per course**, so tailoring picks individual items.
The PDF regroups the selected ones: skills by `group` (`Languages: Python, Java`), courses into one line.
Tiles with `data: null` are **freeform** (manual text tiles, older tiles, or any tile whose text was edited).

### 4.3 Layout

A **layout** says which tiles are on a job's resume, in which section, and in what order. A tile may be placed in a section different from its bank category (the layout overrides it for that resume only).

```jsonc
// Layout (write form: tile IDs)
{
  "sections": {
    "education": ["tileId"], "coursework": [], "skills": [],
    "experience": [], "projects": [], "other": []
  },
  "unused": ["tileId"]
}
```
On **read**, the backend returns a `ResolvedLayout`, which has the same shape but full `Tile` objects instead of IDs, and:
- drops IDs of tiles that no longer exist (e.g. deleted from the bank)
- appends to `unused` any bank tiles that are missing from the layout (e.g. added after the layout was made)

---

## 5. Database (Supabase)

**Strategy: keep the existing tables and the `app/db/` helpers, and add one migration on top.** The old tables map onto the vision like this:

| Concept | Table | Notes |
|---|---|---|
| Resume tile | `resume_items` | Tile text is stored in **`content_text`**; category in **`section`**; structured fields (`Tile.data`, §4.2) in **`content`** (`{}` = freeform). `title/organization/start_date/end_date` are unused (null). |
| Job (shared facts about a posting) | `jobs` | Global pool, deduped by `url`. Add `summary`, `bullets`. |
| Dashboard card (a user's job) | `saved_jobs` | One row per (user, job). Add `layout` (the user's saved layout for that job). |
| Generated PDF (history) | `generated_resumes` | One row per PDF: `job_id`, `storage_path`, `content` = layout snapshot, `title` = job title, `created_at` = date stamp. `match_score` unused. |
| Resume header | `profiles` | Add `phone`, `location`, `links`. |
| Original upload | `source_resumes` | unchanged |

**New migration** `supabase/migrations/20261002120000_tiles_redesign.sql` (database guy):
```sql
-- 1. New category set (no real data exists yet, so recreate the enum)
alter table public.resume_items alter column section type text;
drop type public.section_type;
create type public.section_type as enum
  ('education','coursework','skills','experience','projects','other');
alter table public.resume_items
  alter column section type public.section_type using section::public.section_type;

-- 2. Resume header fields
alter table public.profiles
  add column phone text,
  add column location text,
  add column links jsonb not null default '[]'::jsonb;

-- 3. Job overview
alter table public.jobs
  add column summary text,
  add column bullets jsonb not null default '[]'::jsonb;

-- 4. Per-user saved layout for a job
alter table public.saved_jobs
  add column layout jsonb;
```
(If `resume_items` already has test rows with old section values, `delete from public.resume_items;` first.)

**`app/db/` updates (database guy):**
- `resume_items.Section` becomes the 6 new keys.
- `profiles.get` also selects `phone, location, links`.
- Add `jobs` helpers: `get_saved(user_id, job_id)` (with `layout`), `set_layout(user_id, job_id, layout)`, and `list_saved` including `layout`. Keep `jobs.create` URL dedupe.
- Add `generated_resumes.list_for_job(user_id, job_id)`, newest first.
- Embeddings are used for fit scores: `profiles.embedding` is refreshed (background task) after the bank changes; `jobs.embedding` is set when a job is summarized. Helpers: `jobs.fit`, `jobs.saved_fits`, `jobs.match_for_user`, `jobs.get_many`.

**Storage paths** (via `db.storage`)
- Uploaded resumes: bucket `uploads`, `{user_id}/{source_resume_id}.pdf`
- Generated PDFs: bucket `resumes`, `{user_id}/{job_id}/{generated_resume_id}.pdf`
- The frontend gets **signed URLs** (1 h) from `storage.signed_url()`.

The backend uses the service role key (which bypasses RLS), so **every query must filter by `user_id`**. Global `jobs` rows are only reachable through the user's own `saved_jobs` row.

---

## 6. API contract (FastAPI)

- **All routes live under `/api`.**
- All routes except `/api/health` require `Authorization: Bearer <supabase access token>` (`Depends(get_user_id)` from `app/auth.py`).
- **Every route returns JSON** (the frontend `api()` helper calls `res.json()`), so deletes return `{"ok": true}`, not 204.
- Machine-readable errors use `{"detail": {"code": "...", "message": "..."}}`.
- `POST /api/url` accepts `{url, description?}` and returns `JobDetail`, just like `/api/jobs`. It requires auth and is used for extension-originated URLs; signed-out users are redirected to login by the website before it calls the endpoint.

### 6.1 Shared types (TypeScript; mirror exactly in Pydantic `backend/app/schemas.py`)

```ts
type Category = "education" | "coursework" | "skills" | "experience" | "projects" | "other";

interface Profile {
  id: string; full_name: string | null; email: string | null;
  phone: string | null; location: string | null; links: string[];
}

interface Tile {                       // DB: resume_items (text <- content_text, category <- section)
  id: string; category: Category; text: string;  // text is generated from data when data is present
  data: Record<string, unknown> | null;             // structured fields per category (§4.2); null = freeform
  source_resume_id: string | null; created_at: string;
}

interface Layout {                       // write form
  sections: Record<Category, string[]>;  // tile IDs, ordered
  unused: string[];
}
interface ResolvedLayout {               // read form
  sections: Record<Category, Tile[]>;
  unused: Tile[];
}

interface Job {                          // DB: jobs (+ saved_jobs.created_at as created_at)
  id: string; url: string; title: string | null; company: string | null;
  summary: string | null; bullets: string[]; created_at: string;
  fit: number | null;                    // resume-vs-job similarity (~0..1); null until both are embedded
}
interface JobListItem extends Job {
  pdf_count: number; latest_pdf_at: string | null;
}
interface GeneratedPdf {                 // DB: generated_resumes
  id: string; created_at: string; url: string;   // signed URL, valid 1h
}
interface JobDetail extends Job {
  layout: ResolvedLayout;
  pdfs: GeneratedPdf[];                          // newest first; pdfs[0] = most recent
}
```

### 6.2 Endpoints

| Method & path | Body | Returns | Notes |
|---|---|---|---|
| `GET /api/health` | – | `{ok: true}` | no auth |
| `GET /api/me` | – | `Profile` | |
| `PUT /api/me` | `Partial<Profile>` (no id/email) | `Profile` | contact info for the resume header |
| `POST /api/resume/parse` | multipart: `file` (PDF) **or** form field `text` | `{tiles: Tile[]}` | `pdf.pdf_to_text`, then `llm.extract_tiles`, then **replace** the whole bank (all existing tiles, including manual ones, are deleted, but only after parsing succeeds) and return the new tiles. Saved job layouts drop the deleted tiles; already-generated PDFs are unaffected. Stores the PDF in `uploads` + a `source_resumes` row. |
| `GET /api/tiles` | – | `Tile[]` | ordered by category order, then created_at |
| `POST /api/tiles` | `{category, text}` **or** `{category, data}` | `Tile` | manual "add tile"; with `data`, text is generated (422 `BAD_TILE_DATA` if invalid) |
| `PATCH /api/tiles/{id}` | `{category?, text?, data?}` | `Tile` | `data` replaces fields + regenerates text; `text` alone makes the tile freeform (`data` → null); a category change without `data` also clears `data` |
| `DELETE /api/tiles/{id}` | – | `{ok: true}` | **permanent** delete from bank |
| `POST /api/jobs` | `{url: string, description?: string}` | `JobDetail` | See flow §6.3. Slow (10–30 s). |
| `POST /api/url` | `{url: string, description?: string}` | `JobDetail` | Authenticated alias of `/api/jobs` for URLs originating from the extension; website login runs first if needed. |
| `GET /api/jobs` | – | `JobListItem[]` | the user's saved jobs, newest first |
| `GET /api/jobs/{id}` | – | `JobDetail` | 404 if the user has no `saved_jobs` row for it. If the saved layout places **none** of the current bank tiles (bank was replaced by a new upload), tiles are re-picked automatically (slow, one LLM call). |
| `POST /api/jobs/{id}/autoselect` | – | `JobDetail` | **(added)** re-run `llm.select_tiles` against the current bank and overwrite the saved layout. Review page **"Re-pick tiles"** button. 400 `EMPTY_BANK` if the bank is empty. |
| `PUT /api/jobs/{id}/layout` | `Layout` | `{ok: true}` | save review edits |
| `POST /api/jobs/{id}/pdfs` | `Layout` | `GeneratedPdf` | saves layout, renders PDF, uploads, inserts `generated_resumes` row |
| `GET /api/jobs/recommended?limit=10` | – | `Job[]` | **(added)** global-pool jobs ranked by `fit`, excluding ones the user already saved. `created_at` = when the job entered the pool. Empty until embeddings exist. |
| `DELETE /api/jobs/{id}` | – | `{ok: true}` | removes the user's `saved_jobs` row |

### 6.3 `POST /api/jobs` flow
1. If the user already has a `saved_jobs` row for this URL's job **with a layout**, return its `JobDetail` (re-picking tiles first if the layout is stale, as in `GET /api/jobs/{id}`).
2. If the user has 0 tiles, return **400** `{"detail": {"code": "EMPTY_BANK"}}`.
3. Get the job:
   - If the global `jobs` row exists with a `summary`, reuse it (no fetch or LLM call).
   - Otherwise, job text = `description` if provided, else `services.scraper.fetch_job_text(url)`. If that raises or returns < 500 chars, return **422** `{"detail": {"code": "FETCH_FAILED"}}`; the frontend shows a paste box and re-POSTs with `description`.
   - Then `llm.summarize_job(text, url)` returns title, company, summary, bullets. Store them with `jobs.create`/`update` (`description` = text), then `llm.embed` the job for fit scores.
4. `llm.select_tiles(job, text, tiles)` returns a `Layout`. **The backend validates it**: drop unknown IDs, de-duplicate, put every bank tile not placed into `unused`.
5. Upsert `saved_jobs (user_id, job_id, layout)` and return `JobDetail` (`pdfs: []`).

---

## 7. Backend module contracts

Files live in `backend/app/`. **The function signatures below are fixed.** Owners commit **stubs returning realistic hardcoded data within the first 30 minutes** so the routes can be wired up immediately.

```python
# services/scraper.py  (extension guy). Lives next to ScraperService.
def fetch_job_text(url: str) -> str: ...
    # Sync httpx.get, browser User-Agent, follow redirects, 15 s timeout.
    # 1) If a <script type="application/ld+json"> with "@type": "JobPosting" exists, use its
    #    title + hiringOrganization.name + description (HTML-stripped). Greenhouse/Lever/Ashby often have it.
    # 2) Else soup.get_text(" ") after removing script/style/nav/header/footer.
    # Collapse whitespace, truncate to ~15,000 chars. Raise an exception on HTTP errors.

# services/llm.py  (openai guy). Use OpenAI structured outputs (JSON schema / Pydantic).
def extract_tiles(resume_text: str) -> list[dict]: ...
    # -> [{"category": Category, "text": str, "data": dict}]  structured per §4.2; text = render_text(data)
def summarize_job(job_text: str, url: str) -> dict: ...
    # -> {"title": str, "company": str, "summary": str, "bullets": list[str]}  (5–8 bullets)
def select_tiles(job: dict, job_text: str, tiles: list[dict]) -> dict: ...
    # tiles: [{"id","category","text"}] -> Layout dict {"sections": {...6 keys...}, "unused": [...]}
def embed(text: str) -> list[float] | None: ...
    # text-embedding-3-small (1536 dims); None when OPENAI_API_KEY is unset (stub mode)

# services/pdf.py  (openai guy)
def pdf_to_text(data: bytes) -> str: ...            # pypdf, join page texts
def render_resume(profile: dict, sections: dict[str, list[str]]) -> bytes: ...
    # sections: category -> ordered list of tile TEXTS (already resolved), in §4.1 order.
    # Header: full_name (large), then "email | phone | location | links" line.
    # Each non-empty section: label heading + thin rule, then tiles per §4.2
    # (bold first line, "• " lines as bullets). Letter size, ~0.6in margins, aim for 1 page.

# main.py, routes.py (or routes/), schemas.py, db/  (database guy)
```

### 7.1 LLM prompt guidance
- **extract_tiles:** structured output with one list per category (§4.2 fields). Copy fields **verbatim** (whitespace cleanup only); null when absent. **One entry per skill** (split comma lists; `group` = the resume's own label) and **one entry per course** (pulled out of education). Awards, certifications, volunteering, etc. go to `other`. Never invent content.
- **summarize_job:** factual and concise; bullets = the most important requirements/responsibilities.
- **select_tiles:** choose the most relevant tiles and order each section by relevance. Rough one-page budget: education ≤2, coursework ≤6 courses, skills ≤12 skills, experience ≤4, projects ≤3, other ≤2. Skills/courses are individual tiles, so pick the ones relevant to the job. **Only use IDs from the input.** Normally keep tiles in their bank category.
- Model: env `OPENAI_MODEL`, default `gpt-5.6-luna` (structured outputs; no `temperature`, since gpt-5 models reject it).

---

## 8. Frontend (James)

### 8.1 Routes
| Route | Page | Auth |
|---|---|---|
| `/login` | "Continue with Google" button only. After login go to `?next=` (default `/`). | public |
| `/` | **Dashboard**: URL input ("Tailor a resume") + grid of job cards | required |
| `/bank` | **Resume Bank**: upload/paste resume, tile list, add-tile form, profile/contact form | required |
| `/generate?url=` | **Generate**: if `url` is present, auto-start `POST /api/jobs`; shows progress, the paste fallback, and errors | required |
| `/jobs/:id/review` | **Review/Edit**: 6 category sections + right "Unused" sidebar, drag and drop, Generate PDF, PDF preview + download | required |

**Auth guard:** wait for the initial `getSession()` before deciding. If signed out, redirect to `/login?next=<encoded current path+query>`. Google OAuth `redirectTo` = `window.location.origin + next`, so the extension's `?url=` **survives login**. (Update `signInWithGoogle` in `src/lib/supabase.ts` to accept `next`.)

### 8.2 Page behavior

**Resume Bank (`/bank`)**
- Upload zone (PDF) **or** "paste text" textarea, which calls `POST /api/resume/parse` with a spinner.
- Tiles grouped by the 6 categories. Each tile shows its text (keeping line breaks), a **category dropdown** (`PATCH`), and an **X** that **permanently deletes** the tile (`DELETE`, with a confirm prompt). *(stretch: inline text edit)*
- **Add tile:** textarea + category dropdown + Add button (`POST /api/tiles`).
- **Profile/Contact** card: name, phone, location, links (`GET/PUT /api/me`).

**Generate (`/generate`)**
- URL input + button. Auto-runs on mount if `?url=` is present (guard against React StrictMode running it twice).
- Staged loading text while waiting ("Reading job posting…", "Summarizing…", "Picking your best tiles…").
- `FETCH_FAILED`: show "We couldn't read that page; paste the job description" textarea, then re-POST with `description`.
- `EMPTY_BANK`: show a link to `/bank`.
- On success, `navigate('/jobs/:id/review')`.

**Review (`/jobs/:id/review`)**
- Loads `GET /api/jobs/:id`. Main area: 6 section containers in fixed order. Right sidebar: **Unused**.
- `@dnd-kit` multi-container sortable: drag between sections and the sidebar, and reorder within each.
- X on a tile **moves it to Unused** (this resume only; the bank is untouched).
- Buttons: **Save** (`PUT …/layout`) and **Generate PDF** (`POST …/pdfs`). After generating, show the PDF in an `<iframe>` modal with a **Download** button.
- Header: job title/company + link to the posting.

**Dashboard (`/`)**
- "Tailor a resume" URL input, which navigates to `/generate?url=…`.
- Grid of cards (`GET /api/jobs`): title, company, date, and "N PDFs, latest <date>".
- Clicking a card opens a modal with tabs:
  - **Overview:** summary, bullets, posting link
  - **Resume:** "View / Edit resume" button to `/jobs/:id/review`
  - **PDFs:** newest first, date-stamped, latest marked "Latest", each with View/Download

### 8.3 Frontend structure
```
frontend/src/
  main.tsx, App.tsx            router + auth guard
  lib/supabase.ts              (exists) auth + api()
  lib/api.ts                   typed wrappers for every endpoint in §6.2
  lib/types.ts                 types from §6.1 + CATEGORY_ORDER + CATEGORY_LABELS
  lib/mock.ts                  mock implementations; used when VITE_USE_MOCKS=true
  pages/ Login, Dashboard, Bank, Generate, Review
  components/ TileCard, CategorySelect, AddTileForm, JobCard, JobModal, PdfModal, …
```
**`api()` fixes needed:** set `Content-Type: application/json` when `body` is a string (not for `FormData`), and throw an `ApiError {status, detail}` so pages can check `detail.code`.

### 8.4 Staying signed in
- `supabase-js` stores the session in the browser's `localStorage` and **automatically refreshes** the 1-hour access token using the refresh token. Supabase refresh tokens don't expire by default, so a user who signs in once **stays signed in** on that browser until they sign out or clear site data.
- The extension just opens `http://localhost:5173/...` in the same browser, so it **inherits that session** and the user doesn't log in again.
- Requirements:
  - keep `persistSession` and `autoRefreshToken` at their defaults (true)
  - don't enable "time-box user sessions" or the inactivity timeout in the Supabase dashboard
  - always use `localhost`, not `127.0.0.1`
- Show the signed-in user's name/avatar and a **Sign out** button in the nav.


### 8.5 Visual design
Mockup: `design/mockups/6-hybrid.html` (kept local, gitignored). Rules for any new UI:
- **Layout:** left sidebar (New resume, Workspace nav, account) · main column framed by hatched gutters · optional right **Panel** toggled from the top bar (contents TBD). The dashboard lists jobs most-recent-first; there is no "Recent" list in the sidebar.
- **Lists, not cards:** rows separated by 1px hairlines, mono row numbers (`01`), grouped under `GroupHeader` bands (`EDUCATION · 1`). **Square corners everywhere** (no `rounded-*` except status dots).
- **Type:** Geist (UI) + Geist Mono (labels, numbers, timestamps). Small uppercase labels use the `label-mono` utility.
- **Color tokens** (`src/index.css`; use Tailwind classes like `bg-bg text-ink border-line text-accent`, never raw colors). Light or dark **follows the browser/OS setting** (`prefers-color-scheme`); there is no in-app toggle.
  - Light: bg `#ffffff`, accent `#006494`, solid buttons `#003554`.
  - Dark: bg `#051923`, accent `#0582CA`.
- Reuse the building blocks in `src/components/ui.tsx` (`Button`, `Band`, `PageTitle`, `GroupHeader`, `UrlForm`, `IconButton`, `MonoLabel`, `Modal`).

---

## 9. Chrome extension (extension guy)

**Behavior:** clicking the icon opens a small popup:
```
┌──────────────────────────────┐
│ [icon] Resume Adapter        │
│                              │
│ Senior SWE – Acme | Greenhouse│  ← active tab's title (truncated)
│ boards.greenhouse.io         │  ← active tab's hostname
│                              │
│ [     Make a Resume      ]   │  ← primary button
│ Open dashboard               │  ← small link
└──────────────────────────────┘
```
- **Make a Resume** opens `chrome.tabs.create({ url: SITE_URL + "/generate?url=" + encodeURIComponent(tab.url) + "&source=extension" })`, then `window.close()`.
- **Open dashboard** opens `SITE_URL + "/"`.
- If the active tab isn't an `http(s)` page (e.g. `chrome://`), disable the button and show "Open a job posting first".
- `const SITE_URL = "http://localhost:5173";` at the top of `popup.js`.
- **No `fetch` to the backend** and no auth in the extension; the website handles login (§8.4) and calls `/api/url` for extension-originated URLs.
- `manifest.json`: keep `"action": {"default_popup": "popup.html"}` and `"permissions": ["activeTab"]`; **remove `host_permissions`**; update the description.
- Load via `chrome://extensions`, then Developer mode, then "Load unpacked", then select `ChromeExtension/`. Click the reload icon there after edits.

---

## 10. Configuration

**`backend/.env`**
```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```
**`frontend/.env`**
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:8000
VITE_USE_MOCKS=true
```
**Supabase dashboard (James)**
- Auth, URL Configuration: Site URL `http://localhost:5173`; Redirect URLs `http://localhost:5173/**`
- Auth, Providers, Google: enable with the client ID and secret from Google Cloud Console (OAuth client type "Web application"; authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`). Consent screen in "Testing" mode, with all teammates + the demo account added as **test users**.
- Auth, Sessions: leave time-box/inactivity timeout **off**.

**Backend CORS:** the current `allow_origins=["*"]` is fine for the demo (we send a Bearer header, not cookies).
**Never commit `.env` files or the service role key.**

---

## 11. Division of labor

Each person owns specific files. **Don't edit another person's files without asking.** Shared contracts (§4, §6, §7) change only by updating this doc and announcing it.

### James: website + Google auth
**Owns:** `frontend/**`, Supabase Auth/Google Cloud dashboard config
1. Google OAuth + Supabase auth settings (§10). Do this first; it's quick.
2. Scaffold Vite + React + TS + Tailwind + Router in `frontend/` (keep `src/lib/supabase.ts`). Add `lib/types.ts`, `lib/api.ts`, `lib/mock.ts`.
3. Login page, auth guard with `?next=`, session persistence, nav with sign out (§8.1, §8.4).
4. Resume Bank page.
5. Generate page with the paste fallback.
6. Review page (dnd-kit, Save, Generate PDF, PDF modal).
7. Dashboard + job modal (Overview / Resume / PDFs).
8. Visual polish.

### Extension guy: extension + scraping + demo prep
**Owns:** `ChromeExtension/**`, `backend/app/services/scraper.py`, `demo/**`
1. **Popup redesign** (§9): "Make a Resume" opens the website; remove the backend `fetch` and `host_permissions`. About 30–45 min.
2. **`services/scraper.py`**: `fetch_job_text(url) -> str` is implemented (full page text, JSON-LD first, §7). Tune it on real job sites; `/api/jobs` and `/api/url` both use it through the shared job-creation flow.
3. **Demo prep:** collect 3–4 job URLs that scrape cleanly (Greenhouse/Lever/Ashby), save one job description as text for the paste fallback, and put a realistic sample resume PDF in `demo/`.
4. **QA:** from Checkpoint 1 on, run the demo flow end to end on his machine and report bugs to the owner.
5. Own the **demo script** (§13) and run the rehearsals.

### OpenAI guy: LLM + PDF
**Owns:** `backend/app/services/llm.py`, `backend/app/services/pdf.py`, `backend/samples/**`
1. Commit **stubs** for `services/llm.py` and `services/pdf.py` (§7) returning realistic hardcoded data, within 30 min.
2. `llm.extract_tiles`, then `llm.summarize_job`, then `llm.select_tiles` with structured outputs and §7.1 guidance.
3. `pdf.pdf_to_text` (pypdf) and `pdf.render_resume` (ReportLab). Test standalone with sample tiles until the PDF looks good.
4. Test scripts with sample resumes and jobs; tune prompts so tiles follow §4.2 exactly.
5. *(stretch)* Tailored bullet rewriting; DOCX upload.

### Database guy: schema + API routes
**Owns:** `supabase/**`, `backend/app/main.py`, `backend/app/routes.py` (or `routes/`), `backend/app/schemas.py`, `backend/app/db/**`, `backend/app/auth.py`, `backend/run.py`, `backend/requirements.txt`, `backend/.env.example`
1. Write and push the migration in §5; update the `app/db/` helpers.
2. `schemas.py`: Pydantic models mirroring §6.1.
3. **Early:** all `/api` routes from §6.2 wired to the stub `llm`/`pdf`/`scrape` functions, so the website can integrate for real ASAP.
4. Real persistence and logic: tiles CRUD (`text`↔`content_text`), profile, `/resume/parse`, the `/jobs` flow with layout validation (§6.3), resolved layouts (§4.3), `/pdfs` (render, upload, `generated_resumes` row, signed URL).
5. Add `openai`, `pypdf`, `reportlab`, `python-multipart` to `requirements.txt`; add `OPENAI_MODEL` to `.env.example`. Keep `/api/url` as an authenticated alias for extension-originated URLs.

---

## 12. Timeline (T = start of build)

| Time | Milestone |
|---|---|
| T+0:00–0:30 | Everyone reads the spec and creates env files. James: Google OAuth + frontend scaffold. Database guy: migration pushed. OpenAI guy: stubs committed. Extension guy: popup redesign. |
| T+0:30–2:30 | Core build in parallel (against stubs and mocks). Database guy has all routes up on stubs by ~T+1:00. |
| **T+2:30** | **Checkpoint 1:** login, then upload a resume, then real tiles appear in the Bank, end to end. |
| T+2:30–4:00 | Generate, Review, PDF. Dashboard. |
| **T+4:00** | **Checkpoint 2:** popup "Make a Resume", then generate, then review, then PDF download, then the card on the dashboard, end to end. |
| T+4:00–5:00 | Bug fixes, polish, edge cases (fetch failure, empty bank). |
| **T+5:00** | **Feature freeze.** Only bug fixes after this point. Rehearse the demo twice on the demo machine. |
| T+5:00–6:00 | Buffer + demo. |

**Git:** each person works on their own branch and merges to `main` often (at least at every checkpoint). Run `git pull` before starting work and before each merge. Folder ownership keeps conflicts small.

---

## 13. Demo script (target ~3 min; owned by extension guy)
1. Log in with Google.
2. **Bank:** upload the sample resume; tiles appear by category. Change one tile's category, add a new tile ("Volunteer tutor…"), fill in contact info.
3. Open a Greenhouse/Lever job posting in Chrome, click the extension, then **Make a Resume**.
4. The website opens and auto-generates. The **Review** screen shows chosen tiles; drag one in from Unused, X one out.
5. **Generate PDF**, then preview, then download.
6. **Dashboard:** the new job card shows the summary and bullets, PDF history and "View / Edit resume".

**Backup plan:** if a live fetch fails, use the paste-description fallback. Pre-load the demo account with one finished job in case OpenAI is slow.

---

## 14. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Job site blocks fetching (LinkedIn/Indeed) | Paste fallback; demo with Greenhouse/Lever URLs |
| Google OAuth misconfigured | Set it up first and test with every teammate's account; add all test users (incl. the demo account) on the consent screen |
| LLM returns bad IDs/shape | Structured outputs + backend validation (§6.3 step 4) |
| Slow LLM calls (10–30 s) | Staged loading UI; job summary reused per URL; saved jobs return instantly |
| Drag-and-drop complexity | Start from the dnd-kit multi-container sortable example; fallback: "Move to…" dropdown on each tile |
| Integration surprises late | Stubs + mocks from T+0:30; two hard checkpoints |
| PDF overflows one page | Selection budget (§7.1); slightly smaller fonts acceptable |
| `localhost` vs `127.0.0.1` session split | Always use `localhost` for the website and in the extension |

## 15. Stretch goals (only after Checkpoint 2)
Bullet rewriting tailored to the job · inline tile text edit · ~~"Re-run auto-select" button on Review~~ (done) · delete job card · DOCX upload · popup shows "signed in as …" · AWS hosting.
