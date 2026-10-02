import { useState } from "react";
import type { JobDetail, Matches, Requirement } from "../../lib/types";
import { Button, GroupHeader, MonoLabel, Spinner } from "../ui";
import { PaneHeader } from "./EditorPane";

/**
 * Left pane: the posting's requirements, split into Matched (an entry that covers it is on this resume)
 * and Unmatched. Hovering a point highlights the entries behind it; clicking scrolls to them.
 */
export default function JobPointsPane({
  job,
  matches,
  placed,
  unusedIds,
  onHover,
  onJump,
  onAnalyze,
  analyzing,
}: {
  job: JobDetail;
  matches: Matches;
  placed: Set<string>; // tile ids currently in a resume section
  unusedIds: Set<string>; // tile ids in the Unused tray
  onHover: (tileIds: string[] | null) => void;
  onJump: (tileIds: string[]) => void;
  onAnalyze: () => void;
  analyzing: boolean;
}) {
  const [moreSummary, setMoreSummary] = useState(false);
  const reqs = job.requirements ?? [];
  const onResume = (r: Requirement) => (matches[r.id] ?? []).filter((id) => placed.has(id));
  const inUnused = (r: Requirement) => (matches[r.id] ?? []).filter((id) => unusedIds.has(id));
  const matched = reqs.filter((r) => onResume(r).length > 0);
  const unmatched = reqs.filter((r) => onResume(r).length === 0);
  const pct = reqs.length ? Math.round((matched.length / reqs.length) * 100) : 0;

  const point = (r: Requirement, isMatched: boolean) => {
    const ids = isMatched ? onResume(r) : inUnused(r);
    return (
      <div
        key={r.id}
        onMouseEnter={() => onHover(ids.length ? ids : null)}
        onMouseLeave={() => onHover(null)}
        onClick={() => ids.length && onJump(ids)}
        className={`flex gap-2.5 border-b border-line px-4 py-2.5 ${ids.length ? "cursor-pointer hover:bg-hover" : ""}`}
      >
        <span className={`w-3 flex-none pt-px ${isMatched ? "text-ok" : "text-muted"}`}>{isMatched ? "✓" : "○"}</span>
        <div className="min-w-0 flex-1">
          <div className={isMatched ? "" : "text-ink2"}>{r.text}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-2.5">
            {r.kind === "preferred" && <MonoLabel>Preferred</MonoLabel>}
            {isMatched ? (
              <MonoLabel>
                {ids.length} {ids.length === 1 ? "entry" : "entries"}
              </MonoLabel>
            ) : (
              ids.length > 0 && <MonoLabel className="!text-accent">{ids.length} in Unused</MonoLabel>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <PaneHeader title="Job Description Points" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-line px-4 py-3">
          <div className="font-medium">
            {job.title ?? "Job"}
            {job.company && <span className="text-ink2"> · {job.company}</span>}
          </div>
          {job.summary && (
            <p className={`mt-1 text-[13px] text-ink2 ${moreSummary ? "" : "line-clamp-3"}`}>
              {job.summary}{" "}
            </p>
          )}
          <div className="mt-1.5 flex gap-3 text-[13px]">
            {job.summary && (
              <button onClick={() => setMoreSummary((m) => !m)} className="text-muted hover:text-ink">
                {moreSummary ? "Less" : "More"}
              </button>
            )}
            <a href={job.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Job posting ↗
            </a>
          </div>
        </div>

        {reqs.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-4 py-5 text-ink2">
            <p>This job's requirements haven't been analyzed yet.</p>
            <Button onClick={onAnalyze} disabled={analyzing}>
              {analyzing && <Spinner />} Analyze &amp; re-pick
            </Button>
            <p className="text-xs text-muted">This re-picks the entries for this resume too.</p>
          </div>
        ) : (
          <>
            <div className="border-b border-line px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span>
                  <span className="font-medium">{matched.length}</span>
                  <span className="text-ink2"> of {reqs.length} matched</span>
                </span>
                <MonoLabel>{pct}%</MonoLabel>
              </div>
              <div className="mt-2 h-1 bg-line">
                <div className="h-1 bg-accent transition-[width]" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <GroupHeader>Matched · {matched.length}</GroupHeader>
            {matched.length ? matched.map((r) => point(r, true)) : <Empty>Nothing on this resume matches yet.</Empty>}
            <GroupHeader>Unmatched · {unmatched.length}</GroupHeader>
            {unmatched.length ? unmatched.map((r) => point(r, false)) : <Empty>Every requirement is covered.</Empty>}
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <div className="border-b border-line px-4 py-3 text-[13px] text-muted">{children}</div>;
}
