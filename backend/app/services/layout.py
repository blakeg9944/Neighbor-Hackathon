"""Layout validation and resolution (DESIGN_SPEC §4.3, §6.3 step 4)."""
from .llm import CATEGORIES
from .pdf import DEFAULT_TEMPLATE, LABELS, TEMPLATES
from .tile_data import pdf_lines

MAX_LABEL = 40


def normalize_layout(layout: dict | None, tiles: list[dict]) -> dict:
    """Drop unknown IDs, de-duplicate, append every unplaced bank tile to unused.
    `overrides` ({tile id: text}) are per-resume text edits; kept only for known tiles with non-empty text.
    `order` is this resume's section order: valid categories first (deduped), then any missing ones in default order.
    `template` is one of shared/resume_templates.json; `labels` are per-resume section names (defaults dropped)."""
    layout = layout or {}
    known = {t["id"] for t in tiles}
    seen: set[str] = set()

    def keep(ids) -> list[str]:
        out = []
        for i in ids or []:
            if i in known and i not in seen:
                seen.add(i)
                out.append(i)
        return out

    sections = {c: keep((layout.get("sections") or {}).get(c)) for c in CATEGORIES}
    unused = keep(layout.get("unused"))
    unused += [t["id"] for t in tiles if t["id"] not in seen]
    overrides = {
        i: text for i, text in (layout.get("overrides") or {}).items()
        if i in known and isinstance(text, str) and text.strip()
    }
    order = list(dict.fromkeys(c for c in (layout.get("order") or []) if c in CATEGORIES))
    order += [c for c in CATEGORIES if c not in order]
    matches = {
        str(rid): [i for i in dict.fromkeys(ids) if i in known]
        for rid, ids in (layout.get("matches") or {}).items() if isinstance(ids, list)
    }
    template = layout.get("template") if layout.get("template") in TEMPLATES else DEFAULT_TEMPLATE
    labels = {
        c: label.strip()[:MAX_LABEL] for c, label in (layout.get("labels") or {}).items()
        if c in CATEGORIES and isinstance(label, str) and label.strip() and label.strip() != LABELS[c]
    }
    return {"sections": sections, "unused": unused, "overrides": overrides, "order": order, "matches": matches,
            "template": template, "labels": labels}


def resolve_layout(layout: dict | None, tiles: list[dict]) -> dict:
    """Layout of IDs -> ResolvedLayout of full Tile dicts."""
    norm = normalize_layout(layout, tiles)
    by_id = {t["id"]: t for t in tiles}
    return {
        "sections": {c: [by_id[i] for i in ids] for c, ids in norm["sections"].items()},
        "unused": [by_id[i] for i in norm["unused"]],
        "overrides": norm["overrides"],
        "order": norm["order"],
        "matches": norm["matches"],
        "template": norm["template"],
        "labels": norm["labels"],
    }


def section_entries(layout: dict, tiles: list[dict]) -> dict[str, list]:
    """Normalized layout -> {category: [entry, ...]} in print order, for pdf.render_resume.
    Skill/course tiles are regrouped into text lines ("Languages: Python, Java"). Other structured tiles become
    {"category", "data"} (laid out with right-aligned dates); freeform tiles stay text. A per-resume override
    replaces the tile's text and makes it freeform for this PDF."""
    overrides = layout.get("overrides") or {}
    by_id = {t["id"]: ({**t, "text": overrides[t["id"]], "data": None} if t["id"] in overrides else t) for t in tiles}
    order = layout.get("order") or list(layout["sections"])  # dict order = PDF section order
    out: dict[str, list] = {}
    for c in order:
        placed = [by_id[i] for i in layout["sections"].get(c, []) if i in by_id]
        if c in ("skills", "coursework"):
            out[c] = pdf_lines(c, placed)
        else:
            # The tile's own category decides the layout (a project dragged into Experience still reads as a project).
            out[c] = [{"category": t["category"], "data": t["data"]} if t.get("data") else t["text"] for t in placed]
    return out
