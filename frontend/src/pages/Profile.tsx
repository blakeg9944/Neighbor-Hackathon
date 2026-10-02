import { useEffect, useState, type ReactNode } from "react";
import { Band, Button, ErrorBanner, errorMessage, GroupHeader, MonoLabel, PageTitle, Spinner } from "../components/ui";
import { Api } from "../lib/api";
import type { ApplicationInfo, Profile, Race } from "../lib/types";

type AppKey = keyof ApplicationInfo;
type Option = [value: string, label: string];

const YES_NO: Option[] = [["yes", "Yes"], ["no", "No"]];
const DECLINE: Option = ["decline", "I don't wish to answer"];
const GENDER: Option[] = [["male", "Male"], ["female", "Female"], ["non_binary", "Non-binary"], DECLINE];
const VETERAN: Option[] = [
  ["not_veteran", "I am not a veteran"],
  ["protected_veteran", "I am a protected veteran"],
  ["veteran", "I am a veteran, but not a protected veteran"],
  DECLINE,
];
const RACES: [Race, string][] = [
  ["american_indian_alaska_native", "American Indian or Alaska Native"],
  ["asian", "Asian"],
  ["black_african_american", "Black or African American"],
  ["native_hawaiian_pacific_islander", "Native Hawaiian or Other Pacific Islander"],
  ["white", "White"],
  ["two_or_more", "Two or more races"],
  ["decline", "I don't wish to answer"],
];

const INPUT = "border border-line2 bg-bg px-3 py-[7px] text-ink outline-none focus:border-accent";
const GRID = "grid gap-4 border-b border-line px-5 py-5 sm:grid-cols-2 lg:grid-cols-4 lg:px-7";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [links, setLinks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Api.getMe()
      .then((p) => {
        setProfile({ ...p, application: p.application ?? {} });
        setLinks(p.links.join("\n"));
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (!profile) {
    return error ? (
      <ErrorBanner error={error} />
    ) : (
      <div className="flex justify-center py-12 text-muted">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  const app = profile.application;
  const setApp = (patch: Partial<ApplicationInfo>) => {
    setProfile({ ...profile, application: { ...app, ...patch } });
    setStatus(null);
  };

  const text = (key: AppKey, label: string, opts: { placeholder?: string; type?: string; wide?: boolean } = {}) => (
    <Field label={label} wide={opts.wide}>
      <input
        type={opts.type ?? "text"}
        value={(app[key] as string | null | undefined) ?? ""}
        placeholder={opts.placeholder}
        onChange={(e) => setApp({ [key]: e.target.value || null })}
        className={INPUT}
      />
    </Field>
  );

  const select = (key: AppKey, label: string, options: Option[], wide = false) => (
    <Field label={label} wide={wide}>
      <select
        value={(app[key] as string | null | undefined) ?? ""}
        onChange={(e) => setApp({ [key]: e.target.value || null })}
        className={INPUT}
      >
        <option value="">Not answered</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );

  const toggleRace = (r: Race) => {
    const current = app.race ?? [];
    // "decline" is exclusive with the actual answers.
    const next = current.includes(r)
      ? current.filter((x) => x !== r)
      : r === "decline"
        ? ["decline" as Race]
        : [...current.filter((x) => x !== "decline"), r];
    setApp({ race: next });
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const updated = await Api.updateMe({
        full_name: profile.full_name,
        phone: profile.phone,
        location: profile.location,
        links: links.split("\n").map((l) => l.trim()).filter(Boolean),
        application: app,
      });
      setProfile({ ...updated, application: updated.application ?? {} });
      setStatus("Saved");
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Band>
        <PageTitle
          title="Profile."
          sub="Your contact details and the answers most job applications ask for. Auto-apply uses these to fill in application forms; anything left blank is skipped."
        />
      </Band>

      <GroupHeader right={<span className="text-xs text-muted">Also shown at the top of every generated resume</span>}>
        Contact
      </GroupHeader>
      <div className={GRID}>
        <Field label="Full name">
          <input
            value={profile.full_name ?? ""}
            onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
            className={INPUT}
          />
        </Field>
        <Field label="Email">
          <div className="py-[7px]">{profile.email}</div>
        </Field>
        <Field label="Phone">
          <input
            value={profile.phone ?? ""}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            className={INPUT}
          />
        </Field>
        <Field label="Location (resume header)">
          <input
            value={profile.location ?? ""}
            placeholder="Provo, UT"
            onChange={(e) => setProfile({ ...profile, location: e.target.value })}
            className={INPUT}
          />
        </Field>
        <Field label="Resume header links (one per line)" wide>
          <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={2} className={INPUT} />
        </Field>
      </div>

      <GroupHeader>Links</GroupHeader>
      <div className={GRID}>
        {text("linkedin_url", "LinkedIn URL", { placeholder: "https://linkedin.com/in/…" })}
        {text("github_url", "GitHub URL", { placeholder: "https://github.com/…" })}
        {text("portfolio_url", "Portfolio / website", { placeholder: "https://…" })}
      </div>

      <GroupHeader>Address</GroupHeader>
      <div className={GRID}>
        {text("city", "City")}
        {text("state", "State / province")}
        {text("postal_code", "ZIP / postal code")}
        {text("country", "Country", { placeholder: "United States" })}
      </div>

      <GroupHeader>Education</GroupHeader>
      <div className={GRID}>
        {text("school", "School")}
        {text("degree", "Degree", { placeholder: "Bachelor of Science" })}
        {text("major", "Major")}
        {text("gpa", "GPA")}
        {text("graduation_date", "Graduation date", { type: "month" })}
      </div>

      <GroupHeader>Work eligibility</GroupHeader>
      <div className={GRID}>
        {select("authorized_to_work_us", "Authorized to work in the US?", YES_NO)}
        {select("requires_sponsorship", "Will you need visa sponsorship?", YES_NO)}
        {select("over_18", "Are you 18 or older?", YES_NO)}
        {select("willing_to_relocate", "Willing to relocate?", YES_NO)}
        {text("earliest_start_date", "Earliest start date", { type: "date" })}
        {text("desired_salary", "Desired salary", { placeholder: "e.g. $30/hr or $85,000" })}
      </div>

      <GroupHeader right={<span className="text-xs text-muted">Optional. Only used to fill forms you choose to</span>}>
        Voluntary self-identification
      </GroupHeader>
      <div className={GRID}>
        {text("pronouns", "Pronouns", { placeholder: "e.g. she/her" })}
        {select("gender", "Gender", GENDER)}
        {select("hispanic_latino", "Hispanic or Latino?", [...YES_NO, DECLINE])}
        {select("disability_status", "Do you have a disability?", [...YES_NO, DECLINE])}
        {select("veteran_status", "Veteran status", VETERAN, true)}
        <Field label="Race (select all that apply)" wide>
          <div className="flex flex-col gap-1.5 py-1">
            {RACES.map(([r, label]) => (
              <label key={r} className="flex items-center gap-2">
                <input type="checkbox" checked={(app.race ?? []).includes(r)} onChange={() => toggleRace(r)} />
                {label}
              </label>
            ))}
          </div>
        </Field>
      </div>

      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-line bg-bg px-5 py-3 lg:px-7">
        {status && <MonoLabel>{status}</MonoLabel>}
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <MonoLabel>{label}</MonoLabel>
      {children}
    </label>
  );
}
