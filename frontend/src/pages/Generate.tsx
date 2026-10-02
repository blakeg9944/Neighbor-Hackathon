import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Band, Button, ErrorBanner, errorMessage, GroupHeader, PageTitle, Spinner, UrlForm } from "../components/ui";
import { Api } from "../lib/api";
import { ApiError } from "../lib/supabase";

const STAGES = ["Reading job posting", "Summarizing the role", "Picking your best entries", "Laying out your resume"];

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
    setUrl(jobUrl);
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

  return (
    <div>
      <Band>
        <PageTitle
          kicker={fromExtension ? "From the Chrome extension" : "New resume"}
          title="Tailor a resume"
          sub="Paste a job posting link and we'll pick the most relevant entries from Your Resume."
        />
        <UrlForm initial={url} disabled={status === "loading"} onSubmit={(u) => run(u)} />
      </Band>

      {status === "loading" && (
        <>
          <GroupHeader right={<Spinner className="h-3.5 w-3.5 text-accent" />}>Working</GroupHeader>
          {STAGES.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-4 border-b border-line px-5 py-3 lg:px-7 ${i > stage ? "text-muted" : ""}`}
            >
              <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1">{s}</span>
              <span className="label-mono">
                {i < stage ? <span className="text-ok">Done</span> : i === stage ? <span className="text-accent">Running</span> : "Queued"}
              </span>
            </div>
          ))}
          <div className="truncate px-5 py-3 font-mono text-xs text-muted lg:px-7">{url}</div>
        </>
      )}

      {status === "fetch_failed" && (
        <>
          <GroupHeader>We couldn't read that page</GroupHeader>
          <div className="flex flex-col gap-3 border-b border-line px-5 py-5 lg:px-7">
            <p className="text-ink2">Some sites (like LinkedIn) block us. Paste the job description below instead.</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={10}
              placeholder="Paste the full job description…"
              className="border border-line2 bg-bg px-3 py-2 outline-none placeholder:text-muted focus:border-accent"
            />
            <Button
              variant="primary"
              className="self-end"
              disabled={!description.trim()}
              onClick={() => run(url.trim(), description)}
            >
              Continue →
            </Button>
          </div>
        </>
      )}

      {status === "empty_bank" && (
        <div className="border-b border-line bg-accent-bg px-5 py-4 lg:px-7">
          Your Resume is empty.{" "}
          <Link to="/bank" className="font-medium text-accent hover:underline">
            Upload your resume first
          </Link>
          , then try again.
        </div>
      )}

      {status === "error" && <ErrorBanner error={error} />}
    </div>
  );
}
