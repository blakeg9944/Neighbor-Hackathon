// Mirrors DESIGN_SPEC §6.1 and backend/app/schemas.py. Change both together.

export type Category = "education" | "coursework" | "skills" | "experience" | "projects" | "other";

export const CATEGORY_ORDER: Category[] = ["education", "coursework", "skills", "experience", "projects", "other"];

export const CATEGORY_LABELS: Record<Category, string> = {
  education: "Education",
  coursework: "Relevant Coursework",
  skills: "Skills",
  experience: "Job Experience",
  projects: "Projects",
  other: "Other",
};

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: string[];
}

export type ProfileUpdate = Partial<Omit<Profile, "id" | "email">>;

export interface Tile {
  id: string;
  category: Category;
  text: string; // generated from `data` when data is present (DESIGN_SPEC §4.2)
  data?: Record<string, unknown> | null; // structured fields per category; null = freeform
  source_resume_id: string | null;
  created_at: string;
}

export interface Layout {
  sections: Record<Category, string[]>;
  unused: string[];
}

export interface ResolvedLayout {
  sections: Record<Category, Tile[]>;
  unused: Tile[];
}

export interface Job {
  id: string;
  url: string;
  title: string | null;
  company: string | null;
  summary: string | null;
  bullets: string[];
  created_at: string;
  fit?: number | null; // resume-vs-job similarity (~0..1); null until both are embedded
}

export interface JobListItem extends Job {
  pdf_count: number;
  latest_pdf_at: string | null;
}

export interface GeneratedPdf {
  id: string;
  created_at: string;
  url: string;
}

export interface JobDetail extends Job {
  layout: ResolvedLayout;
  pdfs: GeneratedPdf[];
}

export const emptySections = <T,>(): Record<Category, T[]> =>
  Object.fromEntries(CATEGORY_ORDER.map((c) => [c, []])) as unknown as Record<Category, T[]>;

export const toLayout = (resolved: ResolvedLayout): Layout => ({
  sections: Object.fromEntries(
    CATEGORY_ORDER.map((c) => [c, resolved.sections[c].map((t) => t.id)]),
  ) as Record<Category, string[]>,
  unused: resolved.unused.map((t) => t.id),
});
