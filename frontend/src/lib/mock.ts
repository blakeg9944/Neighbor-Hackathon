// Fake backend for VITE_USE_MOCKS=true. Same shapes as DESIGN_SPEC §6; state lives in localStorage.
// Trigger error paths: a job URL containing "fail" returns FETCH_FAILED (unless a description is pasted);
// an empty bank returns EMPTY_BANK.
import { ApiError } from "./supabase";
import {
  CATEGORY_ORDER, emptySections,
  type Category, type GeneratedPdf, type Job, type JobDetail, type JobListItem, type Layout, type Profile,
  type ProfileUpdate, type ResolvedLayout, type Tile,
} from "./types";

interface StoredJob extends Omit<JobDetail, "layout" | "pdfs"> {
  layout: Layout;
  pdfs: { id: string; created_at: string; lines: string[] }[];
}
interface State {
  profile: Profile;
  tiles: Tile[];
  jobs: StoredJob[];
}

const KEY = "resume-adapter-mock-v1";
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

const tile = (category: Category, text: string): Tile => ({
  id: uid(), category, text, data: null, source_resume_id: null, created_at: now(),
});

const SAMPLE_TILES: [Category, string][] = [
  ["education", "B.S. Computer Science, State University (Expected May 2026), GPA 3.8"],
  ["coursework", "Relevant Coursework: Data Structures, Algorithms, Databases, Operating Systems, Machine Learning"],
  ["skills", "Languages: Python, TypeScript, Java, SQL"],
  ["skills", "Frameworks: React, FastAPI, Node.js, PyTorch"],
  ["skills", "Tools: Git, Docker, AWS, PostgreSQL"],
  ["experience", "Software Engineering Intern, Acme Corp (May 2025 – Aug 2025)\n• Built a Kafka ingestion service handling 2M events/day\n• Reduced p95 API latency by 40% by adding Redis caching"],
  ["experience", "Teaching Assistant, State University CS Dept (Jan 2024 – Present)\n• Led weekly labs for 40 students in Data Structures\n• Wrote autograder tests used across 3 course sections"],
  ["experience", "Barista, Bean There Café (2022 – 2023)\n• Trained 5 new hires on POS and opening procedures"],
  ["projects", "Resume Adapter (Hackathon 2026)\n• Chrome extension + React app that tailors resumes to job postings with OpenAI"],
  ["projects", "Campus Eats\n• Full-stack food ordering app (React, FastAPI, Postgres) used by 300+ students"],
  ["projects", "Stock Sentiment Bot\n• Scraped Reddit posts and classified sentiment with a fine-tuned BERT model"],
  ["other", "Dean's List (6 semesters)"],
  ["other", "Volunteer Coding Tutor, Girls Who Code (2023 – Present)"],
];

const seed = (): State => ({
  profile: {
    id: "mock-user", full_name: "Alex Rivera", email: "alex@example.com",
    phone: "(555) 123-4567", location: "Provo, UT", links: ["github.com/alexr", "linkedin.com/in/alexr"],
    application: { linkedin_url: "linkedin.com/in/alexr", authorized_to_work_us: "yes", requires_sponsorship: "no" },
  },
  tiles: SAMPLE_TILES.map(([c, t]) => tile(c, t)),
  jobs: [],
});

let state: State = load();

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  return seed();
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

/** Dev helper: reset mock data (call `resetMocks()` from the console via window). */
export function resetMocks() {
  state = seed();
  save();
}
(window as unknown as { resetMocks: typeof resetMocks }).resetMocks = resetMocks;

const findJob = (id: string) => {
  const job = state.jobs.find((j) => j.id === id);
  if (!job) throw new ApiError(404, "Job not found");
  return job;
};

function resolve(layout: Layout): ResolvedLayout {
  const byId = new Map(state.tiles.map((t) => [t.id, t]));
  const placed = new Set<string>();
  const pick = (ids: string[]) =>
    ids.flatMap((id) => {
      const t = byId.get(id);
      if (!t || placed.has(id)) return [];
      placed.add(id);
      return [t];
    });
  const sections = emptySections<Tile>();
  for (const c of CATEGORY_ORDER) sections[c] = pick(layout.sections[c] ?? []);
  const unused = pick(layout.unused);
  unused.push(...state.tiles.filter((t) => !placed.has(t.id)));
  const overrides = Object.fromEntries(
    Object.entries(layout.overrides ?? {}).filter(([id, text]) => byId.has(id) && text.trim()),
  );
  return { sections, unused, overrides };
}

const BUDGET: Record<Category, number> = { education: 2, coursework: 1, skills: 4, experience: 4, projects: 3, other: 2 };

function autoSelect(jobText: string): Layout {
  const words = new Set(jobText.toLowerCase().match(/[a-z+#.]{3,}/g) ?? []);
  const score = (t: Tile) => (t.text.toLowerCase().match(/[a-z+#.]{3,}/g) ?? []).filter((w) => words.has(w)).length;
  const layout: Layout = { sections: emptySections<string>(), unused: [] };
  for (const c of CATEGORY_ORDER) {
    const ranked = state.tiles.filter((t) => t.category === c).sort((a, b) => score(b) - score(a));
    layout.sections[c] = ranked.slice(0, BUDGET[c]).map((t) => t.id);
    layout.unused.push(...ranked.slice(BUDGET[c]).map((t) => t.id));
  }
  return layout;
}

function toDetail(job: StoredJob): JobDetail {
  const { layout, pdfs, ...rest } = job;
  return {
    ...rest,
    layout: resolve(layout),
    pdfs: [...pdfs].reverse().map((p) => ({ id: p.id, created_at: p.created_at, url: pdfUrl(p.lines) })),
  };
}

function guessJob(url: string) {
  let host = "company";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* not a URL */
  }
  const slug = decodeURIComponent(url.split("/").filter(Boolean).pop() ?? "").replace(/[-_]+/g, " ").replace(/\d+/g, "").trim();
  return {
    title: slug ? slug.replace(/\b\w/g, (m) => m.toUpperCase()) : "Software Engineer",
    company: host.split(".")[0].replace(/\b\w/g, (m) => m.toUpperCase()),
  };
}

const poolJob = (n: number, title: string, company: string, fit: number, bullets: string[]): Job => ({
  id: `pool-${n}`, url: `https://boards.greenhouse.io/${company.toLowerCase().replace(/\W+/g, "")}/jobs/${1000 + n}`,
  title, company, fit, bullets, created_at: now(),
  summary: `${company} is hiring a ${title}. ${bullets[0]}.`,
});
const MOCK_POOL: Job[] = [
  poolJob(1, "Backend Software Engineer", "Acme Corp", 0.56, ["Build Python APIs on AWS", "PostgreSQL and Redis", "Kafka a plus"]),
  poolJob(2, "Full-Stack Engineer Intern", "Campus Labs", 0.52, ["React + TypeScript frontends", "FastAPI services", "Ship features weekly"]),
  poolJob(3, "Data Engineer", "Northwind", 0.47, ["Design ETL pipelines", "SQL and dbt", "Airflow orchestration"]),
  poolJob(4, "ML Engineer Intern", "Lumen AI", 0.45, ["Train PyTorch models", "Deploy inference services", "Experiment tracking"]),
  poolJob(5, "IT Support Specialist", "Wasatch Health", 0.36, ["Help desk tickets", "Windows and Office 365", "Hardware setup"]),
  poolJob(6, "Inside Sales Rep", "Summit Solar", 0.24, ["Outbound calls", "CRM upkeep", "Weekly pay plus commission"]),
];

export const mockApi = {
  async getMe() {
    await delay();
    return state.profile;
  },
  async updateMe(p: ProfileUpdate) {
    await delay();
    state.profile = { ...state.profile, ...p, application: p.application ?? state.profile.application ?? {} };
    save();
    return state.profile;
  },

  async parseResume(input: { file?: File; text?: string }) {
    await delay(1500);
    const text = input.text ?? "";
    const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const created = blocks.length
      ? blocks.map((b) => tile("other", b))
      : SAMPLE_TILES.slice(0, 6).map(([c, t]) => tile(c, t)); // uploaded file: pretend we extracted these
    state.tiles = created; // upload replaces the whole bank (matches backend)
    save();
    return { tiles: created };
  },

  async listTiles() {
    await delay();
    return [...state.tiles].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
    );
  },
  async createTile(t: { category: Category; text: string }) {
    await delay();
    const created = tile(t.category, t.text);
    state.tiles.push(created);
    save();
    return created;
  },
  async updateTile(id: string, t: { category?: Category; text?: string }) {
    await delay(150);
    const found = state.tiles.find((x) => x.id === id);
    if (!found) throw new ApiError(404, "Tile not found");
    Object.assign(found, t);
    save();
    return found;
  },
  async deleteTile(id: string) {
    await delay(150);
    state.tiles = state.tiles.filter((t) => t.id !== id);
    save();
    return { ok: true as const };
  },

  async createJob(j: { url: string; description?: string }) {
    const existing = state.jobs.find((x) => x.url === j.url);
    if (existing) {
      await delay();
      return toDetail(existing);
    }
    await delay(2500);
    if (!state.tiles.length) throw new ApiError(400, { code: "EMPTY_BANK", message: "Your Resume is empty." });
    if (j.url.includes("fail") && !j.description)
      throw new ApiError(422, { code: "FETCH_FAILED", message: "Couldn't read that page." });
    const { title, company } = guessJob(j.url);
    const job: StoredJob = {
      id: uid(), url: j.url, title, company, created_at: now(),
      summary: `${company} is hiring a ${title} to build and ship product features across the stack, working closely with design and product.`,
      bullets: [
        "Build and maintain web services in Python and TypeScript",
        "Design REST APIs and data models in PostgreSQL",
        "Collaborate with product and design on new features",
        "Write tests and participate in code review",
        "B.S. in Computer Science or equivalent experience",
      ],
      layout: autoSelect(`${j.description ?? ""} python typescript react fastapi postgresql sql api`),
      pdfs: [],
    };
    state.jobs.push(job);
    save();
    return toDetail(job);
  },
  async listJobs(): Promise<JobListItem[]> {
    await delay();
    return [...state.jobs].reverse().map((j) => {
      const { layout: _l, pdfs, ...rest } = j;
      return { ...rest, pdf_count: pdfs.length, latest_pdf_at: pdfs.at(-1)?.created_at ?? null };
    });
  },
  async recommendedJobs(limit = 10, offset = 0): Promise<Job[]> {
    await delay(600);
    const saved = new Set(state.jobs.map((j) => j.url));
    return MOCK_POOL.filter((j) => !saved.has(j.url)).slice(offset, offset + limit);
  },
  async getJob(id: string) {
    await delay();
    return toDetail(findJob(id));
  },
  async saveLayout(id: string, layout: Layout) {
    await delay();
    findJob(id).layout = layout;
    save();
    return { ok: true as const };
  },
  async autoselect(id: string) {
    await delay(1500);
    const job = findJob(id);
    if (!state.tiles.length) throw new ApiError(400, { code: "EMPTY_BANK", message: "Your Resume is empty." });
    job.layout = autoSelect(`${job.summary ?? ""} ${job.bullets.join(" ")}`);
    save();
    return toDetail(job);
  },
  async generatePdf(id: string, layout: Layout): Promise<GeneratedPdf> {
    await delay(1500);
    const job = findJob(id);
    job.layout = layout;
    const resolved = resolve(layout);
    const p = state.profile;
    const lines = [p.full_name ?? "", [p.email, p.phone, p.location, ...p.links].filter(Boolean).join(" | "), ""];
    for (const c of CATEGORY_ORDER) {
      if (!resolved.sections[c].length) continue;
      lines.push(c.toUpperCase());
      for (const t of resolved.sections[c]) lines.push(...(resolved.overrides?.[t.id] ?? t.text).split("\n"));
      lines.push("");
    }
    const pdf = { id: uid(), created_at: now(), lines };
    job.pdfs.push(pdf);
    save();
    return { id: pdf.id, created_at: pdf.created_at, url: pdfUrl(lines) };
  },
};

/** Builds a tiny one-page text PDF as a blob URL, so the PDF viewer works without the backend. */
function pdfUrl(lines: string[]): string {
  const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, "-").replace(/([\\()])/g, "\\$1");
  const content = ["BT", "/F1 10 Tf", "14 TL", "50 750 Td", ...lines.map((l) => `(${esc(l)}) '`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return URL.createObjectURL(new Blob([out], { type: "application/pdf" }));
}
