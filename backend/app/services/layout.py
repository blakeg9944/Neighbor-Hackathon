"""Layout validation and resolution (DESIGN_SPEC §4.3, §6.3 step 4)."""
from .llm import CATEGORIES


def normalize_layout(layout: dict | None, tiles: list[dict]) -> dict:
    """Drop unknown IDs, de-duplicate, append every unplaced bank tile to unused."""
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
    return {"sections": sections, "unused": unused}


def resolve_layout(layout: dict | None, tiles: list[dict]) -> dict:
    """Layout of IDs -> ResolvedLayout of full Tile dicts."""
    norm = normalize_layout(layout, tiles)
    by_id = {t["id"]: t for t in tiles}
    return {
        "sections": {c: [by_id[i] for i in ids] for c, ids in norm["sections"].items()},
        "unused": [by_id[i] for i in norm["unused"]],
    }


def section_texts(layout: dict, tiles: list[dict]) -> dict[str, list[str]]:
    """Normalized layout -> {category: [tile text, ...]} for pdf.render_resume."""
    by_id = {t["id"]: t for t in tiles}
    return {c: [by_id[i]["text"] for i in ids if i in by_id] for c, ids in layout["sections"].items()}
