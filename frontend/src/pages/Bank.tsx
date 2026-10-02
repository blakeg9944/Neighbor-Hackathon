import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button, CategoryBadge, CategorySelect, ErrorBanner, errorMessage, Spinner, TileText } from "../components/ui";
import { Api } from "../lib/api";
import { CATEGORY_LABELS, CATEGORY_ORDER, type Category, type Profile, type Tile } from "../lib/types";

export default function Bank() {
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Api.listTiles().then(setTiles).catch((e) => setError(errorMessage(e)));
  }, []);

  const onCategory = async (tile: Tile, category: Category) => {
    setTiles((ts) => ts!.map((t) => (t.id === tile.id ? { ...t, category } : t)));
    try {
      await Api.updateTile(tile.id, { category });
    } catch (e) {
      setError(errorMessage(e));
      setTiles((ts) => ts!.map((t) => (t.id === tile.id ? tile : t)));
    }
  };

  const onDelete = async (tile: Tile) => {
    if (!confirm("Delete this tile from your resume bank? This removes it from every resume.")) return;
    setTiles((ts) => ts!.filter((t) => t.id !== tile.id));
    try {
      await Api.deleteTile(tile.id);
    } catch (e) {
      setError(errorMessage(e));
      setTiles((ts) => [...ts!, tile]);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Resume Bank</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything you've done, in one place. Add more than fits on one resume; we pick the best tiles for each job.
        </p>
      </div>
      <ErrorBanner error={error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <UploadCard onParsed={(created) => setTiles((ts) => [...(ts ?? []), ...created])} />

          {tiles === null ? (
            <div className="flex justify-center py-10 text-slate-400">
              <Spinner />
            </div>
          ) : (
            CATEGORY_ORDER.map((c) => {
              const inCat = tiles.filter((t) => t.category === c);
              return (
                <section key={c}>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {CATEGORY_LABELS[c]} <span className="font-normal normal-case text-slate-400">({inCat.length})</span>
                  </h2>
                  {inCat.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-400">
                      No tiles yet
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {inCat.map((t) => (
                        <div key={t.id} className="group flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <TileText text={t.text} />
                            <button
                              onClick={() => onDelete(t)}
                              title="Delete from bank"
                              className="-mr-1 -mt-1 rounded px-1.5 text-lg leading-none text-slate-300 hover:bg-red-50 hover:text-red-600"
                            >
                              ×
                            </button>
                          </div>
                          <CategorySelect value={t.category} onChange={(cat) => onCategory(t, cat)} className="self-start" />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <AddTileCard onAdded={(t) => setTiles((ts) => [...(ts ?? []), t])} />
          <ProfileCard />
        </aside>
      </div>
    </div>
  );
}

function UploadCard({ onParsed }: { onParsed: (tiles: Tile[]) => void }) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async (input: { file?: File; text?: string }) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { tiles } = await Api.parseResume(input);
      onParsed(tiles);
      setResult(`Added ${tiles.length} tiles to your bank.`);
      setText("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) run({ file });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Import your resume</h2>
        <div className="flex rounded-md bg-slate-100 p-0.5 text-xs">
          {(["file", "text"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1 ${mode === m ? "bg-white font-medium shadow-sm" : "text-slate-500"}`}
            >
              {m === "file" ? "Upload PDF" : "Paste text"}
            </button>
          ))}
        </div>
      </div>

      {busy ? (
        <div className="flex flex-col items-center gap-3 py-8 text-sm text-slate-500">
          <Spinner className="h-6 w-6 text-indigo-600" />
          Extracting your resume into tiles…
        </div>
      ) : mode === "file" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition ${
            dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-indigo-300"
          }`}
        >
          <span className="font-medium text-slate-700">Drop your resume PDF here</span>
          <span className="text-slate-400">or click to browse</span>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) run({ file });
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Paste your resume text here…"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <Button className="self-end" disabled={!text.trim()} onClick={() => run({ text })}>
            Extract tiles
          </Button>
        </div>
      )}
      {result && <p className="mt-3 text-sm text-emerald-700">{result}</p>}
      {error && <div className="mt-3"><ErrorBanner error={error} /></div>}
    </div>
  );
}

function AddTileCard({ onAdded }: { onAdded: (t: Tile) => void }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category>("experience");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      onAdded(await Api.createTile({ category, text: text.trim() }));
      setText("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-900">Add a tile</h2>
      <p className="mb-3 text-xs text-slate-500">
        First line is the heading. Start lines with "• " for bullets.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={"Volunteer Tutor, Girls Who Code (2023 – Present)\n• Taught Python to 20 high schoolers"}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CategorySelect value={category} onChange={setCategory} />
          <CategoryBadge category={category} />
        </div>
        <Button disabled={!text.trim() || busy} onClick={add}>
          Add
        </Button>
      </div>
      {error && <div className="mt-3"><ErrorBanner error={error} /></div>}
    </div>
  );
}

function ProfileCard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [links, setLinks] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    Api.getMe()
      .then((p) => {
        setProfile(p);
        setLinks(p.links.join("\n"));
      })
      .catch((e) => setStatus(errorMessage(e)));
  }, []);

  if (!profile) return null;

  const field = (key: "full_name" | "phone" | "location", label: string) => (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <input
        value={profile[key] ?? ""}
        onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
      />
    </label>
  );

  const save = async () => {
    setStatus("Saving…");
    try {
      const updated = await Api.updateMe({
        full_name: profile.full_name,
        phone: profile.phone,
        location: profile.location,
        links: links.split("\n").map((l) => l.trim()).filter(Boolean),
      });
      setProfile(updated);
      setStatus("Saved");
    } catch (e) {
      setStatus(errorMessage(e));
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 font-semibold text-slate-900">Resume header</h2>
      <p className="mb-3 text-xs text-slate-500">Shown at the top of every generated resume.</p>
      <div className="flex flex-col gap-3">
        {field("full_name", "Full name")}
        <div className="text-xs text-slate-500">
          Email <div className="text-sm text-slate-800">{profile.email}</div>
        </div>
        {field("phone", "Phone")}
        {field("location", "Location")}
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Links (one per line)
          <textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            rows={3}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{status}</span>
          <Button variant="secondary" onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
