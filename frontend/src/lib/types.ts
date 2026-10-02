// Mirrors DESIGN_SPEC §6.1 and backend/app/schemas.py. Change both together.

export type TemplateId = "classic" | "modern" | "compact";

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

export type YesNo = "yes" | "no";
export type Race =
  | "american_indian_alaska_native" | "asian" | "black_african_american"
  | "native_hawaiian_pacific_islander" | "white" | "two_or_more" | "decline";

/** Generic job-application answers (auto-apply). All optional; missing/null = not answered. */
export interface ApplicationInfo {
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  school?: string | null;
  degree?: string | null;
  major?: string | null;
  graduation_date?: string | null; // "YYYY-MM"
  gpa?: string | null;
  authorized_to_work_us?: YesNo | null;
  requires_sponsorship?: YesNo | null;
  over_18?: YesNo | null;
  willing_to_relocate?: YesNo | null;
  earliest_start_date?: string | null; // "YYYY-MM-DD"
  desired_salary?: string | null;
  pronouns?: string | null;
  gender?: "male" | "female" | "non_binary" | "decline" | null;
  hispanic_latino?: YesNo | "decline" | null;
  race?: Race[];
  veteran_status?: "not_veteran" | "protected_veteran" | "veteran" | "decline" | null;
  disability_status?: YesNo | "decline" | null;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: string[];
  application: ApplicationInfo;
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

/** One requirement/qualification from the job posting (left pane of the editor). */
export interface Requirement {
  id: string; // "r1", "r2", ...
  text: string;
  kind: "required" | "preferred";
}

/** Requirement id -> ids of bank tiles that demonstrate it (computed by the AI when entries are picked). */
export type Matches = Record<string, string[]>;

/** Tile id -> text edited for ONE resume only. The bank tile keeps its own text. */
export type Overrides = Record<string, string>;

export interface Layout {
  sections: Record<Category, string[]>;
  unused: string[];
  overrides?: Overrides;
  order?: Category[]; // section order for this resume (missing categories fall back to CATEGORY_ORDER)
  matches?: Matches; // omit to keep the saved matches
  template?: TemplateId;
  labels?: Partial<Record<Category, string>>; // per-resume section names
}

export interface ResolvedLayout {
  sections: Record<Category, Tile[]>; // tiles carry their bank text; apply `overrides` for display
  unused: Tile[];
  overrides?: Overrides;
  order?: Category[];
  matches?: Matches;
  template?: TemplateId;
  labels?: Partial<Record<Category, string>>;
}

export interface Job {
  id: string;
  url: string;
  title: string | null;
  company: string | null;
  summary: string | null;
  bullets: string[];
  created_at: string;
  fit?: number | null; // calibrated resume-vs-job match, 0..1 (show as %); null until both are embedded
  requirements?: Requirement[]; // empty for jobs not analyzed yet (Re-pick analyzes them)
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
  overrides: resolved.overrides ?? {},
  order: normalizeOrder(resolved.order),
  matches: resolved.matches ?? {},
  template: resolved.template,
  labels: resolved.labels ?? {},
  sections: Object.fromEntries(
    CATEGORY_ORDER.map((c) => [c, resolved.sections[c].map((t) => t.id)]),
  ) as Record<Category, string[]>,
  unused: resolved.unused.map((t) => t.id),
});

/** Valid, de-duplicated section order with any missing categories appended in default order. */
export const normalizeOrder = (order?: Category[] | null): Category[] => {
  const kept = [...new Set((order ?? []).filter((c) => CATEGORY_ORDER.includes(c)))];
  return [...kept, ...CATEGORY_ORDER.filter((c) => !kept.includes(c))];
};
