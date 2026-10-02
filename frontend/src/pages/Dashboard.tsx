import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Band, ErrorBanner, errorMessage, formatStamp, MonoLabel, PageTitle, Spinner, UrlForm,
} from "../components/ui";
import { Api } from "../lib/api";
import type { JobListItem } from "../lib/types";

type Filter = "all" | "pdf" | "draft";

export default function Dashboard() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    Api.listJobs().then(setJobs).catch((e) => setError(errorMessage(e)));
  }, []);

  // Most recent first, regardless of what order the API returns.
  const sorted = useMemo(
    () => [...(jobs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [jobs],
  );
  const counts = {
    all: sorted.length,
    pdf: sorted.filter((j) => j.pdf_count > 0).length,
    draft: sorted.filter((j) => j.pdf_count === 0).length,
  };
  const visible = sorted.filter((j) => filter === "all" || (filter === "pdf" ? j.pdf_count > 0 : j.pdf_count === 0));
  const showFit = sorted.some((j) => typeof j.fit === "number");

  const tabs: [Filter, string][] = [["all", "All"], ["pdf", "With PDF"], ["draft", "Drafts"]];

  return (
    <div>
      <Band>
        <PageTitle
          title="Tailor a resume."
          sub="Paste a job link, or click Make a Resume in the Chrome extension. We pick the most relevant entries from Your Resume, then you fine-tune the order."
        />
        <UrlForm onSubmit={(url) => navigate(`/generate?url=${encodeURIComponent(url)}`)} />
      </Band>

      <div className="flex items-center border-b border-line px-5 lg:px-7">
        {tabs.map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`-mb-px border-b-2 px-3.5 py-3 ${
              filter === f ? "border-ink font-medium text-ink" : "border-transparent text-ink2 hover:text-ink"
            }`}
          >
            {label}
            <span className="ml-1 font-mono text-[11px] text-muted">{counts[f]}</span>
          </button>
        ))}
        <MonoLabel className="ml-auto hidden sm:block">Sorted: most recent</MonoLabel>
      </div>

      <ErrorBanner error={error} />
      {jobs === null && !error ? (
        <div className="flex justify-center py-12 text-muted">
          <Spinner className="h-5 w-5" />
        </div>
      ) : visible.length === 0 ? (
        <div className="px-5 py-12 text-center text-ink2 lg:px-7">
          {sorted.length === 0 ? (
            <>
              No resumes yet. Fill in your{" "}
              <Link to="/bank" className="text-accent hover:underline">
                Your Resume
              </Link>
              , then paste a job link above.
            </>
          ) : (
            "Nothing in this filter."
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line bg-panel text-left">
                <Th className="pl-5 lg:pl-7">#</Th>
                <Th>Role</Th>
                <Th>Company</Th>
                {showFit && <Th>Fit</Th>}
                <Th>PDFs</Th>
                <Th>Last generated</Th>
                <Th>Status</Th>
                <Th className="pr-5 lg:pr-7" />
              </tr>
            </thead>
            <tbody>
              {visible.map((j) => (
                <tr
                  key={j.id}
                  onClick={() => navigate(`/jobs/${j.id}/review`)}
                  className="cursor-pointer border-b border-line align-top hover:bg-hover"
                >
                  <td className="w-px py-3.5 pr-3 pl-5 font-mono text-[11px] whitespace-nowrap text-muted lg:pl-7">
                    {String(sorted.length - sorted.indexOf(j)).padStart(3, "0")}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="font-medium">{j.title ?? "Untitled job"}</div>
                    {j.bullets.length > 0 && (
                      <div className="line-clamp-1 text-[13px] text-ink2">{j.bullets.slice(0, 3).join(" · ")}</div>
                    )}
                  </td>
                  <td className="px-3 py-3.5">{j.company}</td>
                  {showFit && (
                    <td className="px-3 py-3.5 font-mono text-xs">
                      {typeof j.fit === "number" ? `${Math.round(j.fit * 100)}%` : <span className="text-muted">n/a</span>}
                    </td>
                  )}
                  <td className="px-3 py-3.5 font-mono text-xs">{j.pdf_count}</td>
                  <td className="px-3 py-3.5 font-mono text-xs whitespace-nowrap">
                    {j.latest_pdf_at ? formatStamp(j.latest_pdf_at) : <span className="text-muted">n/a</span>}
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="label-mono inline-flex items-center gap-1.5 !text-ink2">
                      <span className={`h-1.5 w-1.5 rounded-full ${j.pdf_count ? "bg-accent" : "bg-line2"}`} />
                      {j.pdf_count ? "Ready" : "Draft"}
                    </span>
                  </td>
                  <td className="py-3.5 pr-5 pl-3 text-right whitespace-nowrap lg:pr-7">
<span className="text-accent">{j.pdf_count ? "Edit" : "Review"} →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`label-mono px-3 py-2.5 font-normal ${className}`}>{children}</th>;
}
