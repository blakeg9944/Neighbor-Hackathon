import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, ErrorBanner, errorMessage, Spinner } from "../components/ui";
import { Api } from "../lib/api";
import { ApiError } from "../lib/supabase";

const STAGES = ["Reading job posting…", "Summarizing the role…", "Picking your best tiles…", "Almost there…"];

type Status = "idle" | "loading" | "fetch_failed" | "empty_bank" | "error";

export default function Generate() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [url, setUrl] = useState(params.get("url") ?? "");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const autoStarted = useRef(false); // StrictMode runs effects twice in dev
  const fromExtension = params.get("source") === "extension";

  const run = async (jobUrl: string, desc?: string) => {
    setStatus("loading");
    setError(null);
    setStage(0);
    try {
      const request = { url: jobUrl, description: desc };
      const job = fromExtension ? await Api.createJobFromUrl(request) : await Api.createJob(request);
      navigate(`/jobs/${job.id}/review`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "FETCH_FAILED") setStatus("fetch_failed");
      else if (e instanceof ApiError && e.code === "EMPTY_BANK") setStatus("empty_bank");
      else {
        setStatus("error");
        setError(errorMessage(e));
      }
    }
  };

  useEffect(() => {
    const initialUrl = params.get("url");
    if (initialUrl && !autoStarted.current) {
      autoStarted.current = true;
      run(initialUrl);
    }
  }, []);

  useEffect(() => {
    if (status !== "loading") return;
    const id = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 4000);
    return () => clearInterval(id);
  }, [status]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) run(url.trim());
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tailor a resume</h1>
        <p className="mt-1 text-sm text-slate-500">Paste a job posting link and we'll pick your most relevant tiles.</p>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={status === "loading"}
          placeholder="https://boards.greenhouse.io/company/jobs/123"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
        />
        <Button type="submit" disabled={status === "loading"}>
          Make a Resume
        </Button>
      </form>

      {status === "loading" && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white py-12 shadow-sm">
          <Spinner className="h-8 w-8 text-indigo-600" />
          <div className="text-sm font-medium text-slate-700">{STAGES[stage]}</div>
          <div className="max-w-md truncate px-4 text-xs text-slate-400">{url}</div>
        </div>
      )}

      {status === "fetch_failed" && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div>
            <div className="font-medium text-amber-900">We couldn't read that page</div>
            <div className="text-sm text-amber-800">
              Some sites (like LinkedIn) block us. Paste the job description below instead.
            </div>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={10}
            placeholder="Paste the full job description…"
            className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <Button className="self-end" disabled={!description.trim()} onClick={() => run(url.trim(), description)}>
            Continue
          </Button>
        </div>
      )}

      {status === "empty_bank" && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-900">
          Your resume bank is empty.{" "}
          <Link to="/bank" className="font-medium underline">
            Upload your resume first
          </Link>
          , then try again.
        </div>
      )}

      {status === "error" && <ErrorBanner error={error} />}
    </div>
  );
}
