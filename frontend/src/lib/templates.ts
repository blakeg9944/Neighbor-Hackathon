// Resume templates shared with the backend PDF renderer (backend/app/services/pdf.py), so the live
// preview and the downloaded PDF use the same fonts, sizes, spacing and fit limits.
import config from "../../../shared/resume_templates.json";
import type { TemplateId } from "./types";

export interface TemplateConfig {
  label: string;
  css_font: string;
  margins: { x: number; y: number }; // inches
  base_size: number; // points
  leading: number;
  entry_gap: number;
  bullet_indent: number;
  name: { size: number; align: "left" | "center" | "right"; color: string };
  contact: { size: number; align: "left" | "center" | "right"; space_after: number };
  section: {
    size: number;
    caps: boolean;
    tracking: number;
    color: string;
    rule: number;
    space_before: number;
    space_after: number;
  };
}

export const TEMPLATES = config.templates as Record<TemplateId, TemplateConfig>;
export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];
export const DEFAULT_TEMPLATE = config.default as TemplateId;
/** Text/spacing scale limits for auto-fit, and the fill ratio below which a resume counts as "short". */
export const FIT = config.fit as { min: number; max: number; short_below: number };
