// Typed wrappers for every endpoint in DESIGN_SPEC §6.2.
// With VITE_USE_MOCKS=true every call goes to lib/mock.ts instead of the backend.
import * as mock from "./mock";
import { api } from "./supabase";
import type {
  Category, GeneratedPdf, JobDetail, JobListItem, Layout, Profile, ProfileUpdate, Tile,
} from "./types";

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

const real = {
  getMe: () => api<Profile>("/api/me"),
  updateMe: (p: ProfileUpdate) => api<Profile>("/api/me", json("PUT", p)),

  parseResume: (input: { file?: File; text?: string }) => {
    const form = new FormData();
    if (input.file) form.append("file", input.file);
    if (input.text) form.append("text", input.text);
    return api<{ tiles: Tile[] }>("/api/resume/parse", { method: "POST", body: form });
  },

  listTiles: () => api<Tile[]>("/api/tiles"),
  createTile: (t: { category: Category; text: string }) => api<Tile>("/api/tiles", json("POST", t)),
  updateTile: (id: string, t: { category?: Category; text?: string }) =>
    api<Tile>(`/api/tiles/${id}`, json("PATCH", t)),
  deleteTile: (id: string) => api<{ ok: true }>(`/api/tiles/${id}`, { method: "DELETE" }),

  createJob: (j: { url: string; description?: string }) => api<JobDetail>("/api/jobs", json("POST", j)),
  listJobs: () => api<JobListItem[]>("/api/jobs"),
  getJob: (id: string) => api<JobDetail>(`/api/jobs/${id}`),
  saveLayout: (id: string, layout: Layout) => api<{ ok: true }>(`/api/jobs/${id}/layout`, json("PUT", layout)),
  generatePdf: (id: string, layout: Layout) => api<GeneratedPdf>(`/api/jobs/${id}/pdfs`, json("POST", layout)),
};

export const Api: typeof real = USE_MOCKS ? mock.mockApi : real;
