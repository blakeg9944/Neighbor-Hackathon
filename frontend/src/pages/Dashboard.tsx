import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import PdfModal, { pdfFilename } from "../components/PdfModal";
import { Button, ErrorBanner, errorMessage, formatDate, Modal, Spinner } from "../components/ui";
import { Api } from "../lib/api";
import type { GeneratedPdf, JobDetail, JobListItem } from "../lib/types";

export default function Dashboard() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [jobs, setJobs] = useState<JobListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    Api.listJobs().then(setJobs).catch((e) => setError(errorMessage(e)));
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) navigate(`/generate?url=${encodeURIComponent(url.trim())}`);
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-8 text-white shadow-lg">
        <h1 className="text-2xl font-semibold">Tailor a resume</h1>
        <p className="mt-1 text-sm text-indigo-100">Paste a job posting link, or use the Chrome extension on any job page.</p>
        <form onSubmit={onSubmit} className="mt-5 flex max-w-2xl gap-2">
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://boards.greenhouse.io/company/jobs/123"
            className="flex-1 rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <Button type="submit" className="!bg-white !text-indigo-700 hover:!bg-indigo-50">
            Make a Resume
          </Button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Your resumes</h2>
        <ErrorBanner error={error} />
        {jobs === null ? (
          !error && (
            <div className="flex justify-center py-10 text-slate-400">
              <Spinner />
            </div>
          )
        ) : jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
            No resumes yet. Make sure your{" "}
            <Link to="/bank" className="font-medium text-indigo-600 underline">
              Resume Bank
            </Link>{" "}
            is filled in, then paste a job link above.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => setOpenId(j.id)}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
              >
                <div className="font-semibold text-slate-900">{j.title ?? "Untitled job"}</div>
                <div className="text-sm text-slate-500">{j.company}</div>
                <div className="mt-auto flex items-center justify-between pt-3 text-xs text-slate-400">
                  <span>{formatDate(j.created_at)}</span>
                  <span>
                    {j.pdf_count
                      ? `${j.pdf_count} PDF${j.pdf_count > 1 ? "s" : ""} · latest ${formatDate(j.latest_pdf_at!)}`
                      : "No PDF yet"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {openId && <JobModal jobId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

type Tab = "overview" | "resume" | "pdfs";

function JobModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [viewing, setViewing] = useState<GeneratedPdf | null>(null);

  useEffect(() => {
    Api.getJob(jobId).then(setJob).catch((e) => setError(errorMessage(e)));
  }, [jobId]);

  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["resume", "Resume"],
    ["pdfs", `PDFs${job ? ` (${job.pdfs.length})` : ""}`],
  ];

  return (
    <>
      <Modal
        open={!viewing}
        onClose={onClose}
        title={job ? `${job.title ?? "Job"}${job.company ? ` · ${job.company}` : ""}` : "Loading…"}
      >
        <div className="flex gap-1 border-b border-slate-200 px-5">
          {tabs.map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                tab === t ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="p-5">
          <ErrorBanner error={error} />
          {!job && !error && (
            <div className="flex justify-center py-8 text-slate-400">
              <Spinner />
            </div>
          )}
          {job && tab === "overview" && (
            <div className="flex flex-col gap-4 text-sm">
              <p className="text-slate-700">{job.summary}</p>
              {job.bullets.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-slate-600">
                  {job.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
              <a href={job.url} target="_blank" rel="noreferrer" className="break-all text-indigo-600 hover:underline">
                View job posting ↗
              </a>
            </div>
          )}
          {job && tab === "resume" && (
            <div className="flex flex-col items-start gap-3 text-sm text-slate-600">
              <p>
                {Object.values(job.layout.sections).reduce((n, s) => n + s.length, 0)} tiles on this resume,{" "}
                {job.layout.unused.length} unused. Review and rearrange them, then generate a new PDF.
              </p>
              <Button onClick={() => navigate(`/jobs/${job.id}/review`)}>View / Edit resume</Button>
            </div>
          )}
          {job && tab === "pdfs" && (
            <div className="flex flex-col gap-2">
              {job.pdfs.length === 0 && <p className="text-sm text-slate-500">No PDFs generated yet.</p>}
              {job.pdfs.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {formatDate(p.created_at)}
                    {i === 0 && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Latest</span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setViewing(p)} className="text-indigo-600 hover:underline">
                      View
                    </button>
                    <a href={p.url} download={pdfFilename(job.title, job.company)} className="text-indigo-600 hover:underline">
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
      <PdfModal
        pdf={viewing}
        filename={pdfFilename(job?.title ?? null, job?.company ?? null)}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
