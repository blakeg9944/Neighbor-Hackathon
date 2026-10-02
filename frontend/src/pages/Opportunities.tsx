import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Band, Button, ErrorBanner, errorMessage, MonoLabel, Modal, PageTitle, Spinner } from "../components/ui";
import { Api } from "../lib/api";
import type { Job } from "../lib/types";

const PAGE_SIZE = 10;

const fitLabel = (fit: number | null | undefined) => (typeof fit === "number" ? `${Math.round(fit * 100)}%` : "n/a");

export default function Opportunities() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Job | null>(null);

  // Fetch one page at a time; ask for one extra row only to learn whether a next page exists.
  useEffect(() => {
    let stale = false;
    setJobs(null);
    setError(null);
    Api.recommendedJobs(PAGE_SIZE + 1, page * PAGE_SIZE)
      .then((rows) => {
        if (stale) return;
        setJobs(rows.slice(0, PAGE_SIZE));
        setHasMore(rows.length > PAGE_SIZE);
      })
      .catch((e) => !stale && setError(errorMessage(e)));
    return () => {
      stale = true;
    };
  }, [page]);

  const first = page * PAGE_SIZE + 1;

  const tailor = (j: Job) => navigate(`/generate?url=${encodeURIComponent(j.url)}`);

  // Fill the viewport below the 3.5rem app header: title + toolbar + pager stay put, only the list scrolls.
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <Band className="flex-none">
        <PageTitle
          title="Job opportunities."
          sub="The postings closest to your Resume Bank, ranked by how well your whole bank matches each job. Tailor a resume to any of them in one click."
        />
      </Band>

      <div className="flex flex-none items-center border-b border-line px-5 py-3 lg:px-7">
        <span className="font-medium">
          Top matches
          {jobs && jobs.length > 0 && (
            <span className="ml-1 font-mono text-[11px] text-muted">
              {first}–{first + jobs.length - 1}
            </span>
          )}
        </span>
        <MonoLabel className="ml-auto hidden sm:block">Sorted: best fit</MonoLabel>
      </div>

      <ErrorBanner error={error} />
      {jobs === null && !error ? (
        <div className="flex justify-center py-12 text-muted">
          <Spinner className="h-5 w-5" />
        </div>
      ) : jobs && jobs.length === 0 && page === 0 ? (
        <div className="px-5 py-12 text-center text-ink2 lg:px-7">
          No new opportunities yet. Add your resume to the{" "}
          <Link to="/bank" className="text-accent hover:underline">
            Resume Bank
          </Link>{" "}
          so we can match you, or check back once more jobs are in the pool.
        </div>
      ) : (
        jobs && (
          <>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-line bg-panel text-left">
                    <Th className="pl-5 lg:pl-7">#</Th>
                    <Th>Role</Th>
                    <Th>Company</Th>
                    <Th>Fit</Th>
                    <Th className="pr-5 lg:pr-7" />
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j, i) => (
                    <tr
                      key={j.id}
                      onClick={() => setOpen(j)}
                      className="cursor-pointer border-b border-line align-top hover:bg-hover"
                    >
                      <td className="w-px py-3.5 pr-3 pl-5 font-mono text-[11px] whitespace-nowrap text-muted lg:pl-7">
                        {String(first + i).padStart(2, "0")}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="font-medium">{j.title ?? "Untitled job"}</div>
                        {j.bullets.length > 0 && (
                          <div className="line-clamp-1 text-[13px] text-ink2">{j.bullets.slice(0, 3).join(" · ")}</div>
                        )}
                      </td>
                      <td className="px-3 py-3.5">{j.company}</td>
                      <td className="px-3 py-3.5">
                        <FitBar fit={j.fit} />
                      </td>
                      <td className="py-3.5 pr-5 pl-3 text-right whitespace-nowrap lg:pr-7">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            tailor(j);
                          }}
                          className="text-accent hover:underline"
                        >
                          Tailor resume →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(page > 0 || hasMore) && (
              <div className="flex flex-none items-center justify-between border-t border-line px-5 py-3 lg:px-7">
                <Button onClick={() => setPage(page - 1)} disabled={page === 0}>
                  ← Previous
                </Button>
                <MonoLabel>Page {page + 1}</MonoLabel>
                <Button onClick={() => setPage(page + 1)} disabled={!hasMore}>
                  Next →
                </Button>
              </div>
            )}
          </>
        )
      )}

      {open && (
        <Modal
          open
          onClose={() => setOpen(null)}
          title={`${open.title ?? "Job"}${open.company ? ` · ${open.company}` : ""}`}
        >
          <div className="flex flex-col gap-4 overflow-y-auto p-5">
            <MonoLabel>
              Fit <span className="text-ink">{fitLabel(open.fit)}</span>
            </MonoLabel>
            {open.summary && <p className="text-ink2">{open.summary}</p>}
            {open.bullets.length > 0 && (
              <ul className="border-t border-line">
                {open.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3 border-b border-line py-2">
                    <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                    {b}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="primary" onClick={() => tailor(open)}>
                Tailor a resume for this job
              </Button>
              <a href={open.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                View job posting ↗
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FitBar({ fit }: { fit: number | null | undefined }) {
  if (typeof fit !== "number") return <span className="font-mono text-xs text-muted">n/a</span>;
  const width = Math.max(4, fit * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 bg-line">
        <div className="h-full bg-accent" style={{ width: `${width}%` }} />
      </div>
      <span className="font-mono text-xs">{fitLabel(fit)}</span>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`label-mono px-3 py-2.5 font-normal ${className}`}>{children}</th>;
}
