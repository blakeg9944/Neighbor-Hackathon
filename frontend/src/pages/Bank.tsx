import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  Band, Button, CategorySelect, ErrorBanner, errorMessage, GroupHeader, IconButton, MonoLabel, PageTitle, Spinner, TileEditor,
  TileText,
} from "../components/ui";
import { Api } from "../lib/api";
import { CATEGORY_LABELS, CATEGORY_ORDER, type Category, type Profile, type Tile } from "../lib/types";

export default function Bank() {
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  /** Bank edits are permanent: they change this entry everywhere it's used (unless a resume overrides it). */
  const onEditSave = async (tile: Tile, text: string) => {
    setEditingId(null);
    if (text === tile.text) return;
    setTiles((ts) => ts!.map((t) => (t.id === tile.id ? { ...t, text } : t)));
    try {
      const saved = await Api.updateTile(tile.id, { text });
      setTiles((ts) => ts!.map((t) => (t.id === tile.id ? saved : t)));
    } catch (e) {
      setError(errorMessage(e));
      setTiles((ts) => ts!.map((t) => (t.id === tile.id ? tile : t)));
    }
  };

  const onDelete = async (tile: Tile) => {
    if (!confirm("Delete this entry from Your Resume? This removes it from every tailored resume.")) return;
    setTiles((ts) => ts!.filter((t) => t.id !== tile.id));
    try {
      await Api.deleteTile(tile.id);
    } catch (e) {
      setError(errorMessage(e));
      setTiles((ts) => [...ts!, tile]);
    }
  };

  let n = 0; // running row number across groups

  return (
    <div>
      <ImportBand
        existingCount={tiles?.length ?? 0}
        onParsed={(created) => setTiles(created)} /* upload replaces the whole bank (matches backend) */
      />
      <AddRow onAdded={(t) => setTiles((ts) => [...(ts ?? []), t])} />
      <ErrorBanner error={error} />

      {tiles === null && !error ? (
        <div className="flex justify-center py-12 text-muted">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        CATEGORY_ORDER.map((c) => {
          const inCat = (tiles ?? []).filter((t) => t.category === c);
          return (
            <section key={c}>
              <GroupHeader>
                {CATEGORY_LABELS[c]} · {inCat.length}
              </GroupHeader>
              {inCat.length === 0 && <div className="border-b border-line px-5 py-3 text-muted lg:px-7">No entries yet</div>}
              {inCat.map((t) => (
                <div key={t.id} className="flex items-start gap-3 border-b border-line px-5 py-3 hover:bg-hover lg:px-7">
                  <span className="w-5 flex-none pt-0.5 font-mono text-[11px] text-muted">
                    {String(++n).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    {editingId === t.id ? (
                      <TileEditor
                        initial={t.text}
                        onSave={(text) => onEditSave(t, text)}
                        onCancel={() => setEditingId(null)}
                        note="Saves to Your Resume permanently."
                      />
                    ) : (
                      <TileText text={t.text} />
                    )}
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    <CategorySelect value={t.category} onChange={(cat) => onCategory(t, cat)} />
                    <IconButton onClick={() => setEditingId(t.id)} title="Edit entry" disabled={editingId === t.id}>
                      ✎
                    </IconButton>
                    <IconButton onClick={() => onDelete(t)} title="Delete from Your Resume">
                      ✕
                    </IconButton>
                  </div>
                </div>
              ))}
            </section>
          );
        })
      )}

      <ProfileSection />
    </div>
  );
}

function ImportBand({ existingCount, onParsed }: { existingCount: number; onParsed: (tiles: Tile[]) => void }) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async (input: { file?: File; text?: string }) => {
    // The backend replaces the whole bank on import, including hand-added entries.
    if (
      existingCount > 0 &&
      !confirm(`Importing replaces everything in Your Resume (${existingCount} entries, including ones you added by hand). Continue?`)
    )
      return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { tiles } = await Api.parseResume(input);
      onParsed(tiles);
      setResult(`Imported ${tiles.length} entries.`);
      setText("");
      setPasting(false);
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
    <Band className={dragging ? "bg-accent-bg" : ""}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <PageTitle
          title="Your Resume"
          sub="Every entry you might put on a resume. Add more than fits on one page; we pick the best ones for each job."
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="solid" disabled={busy} onClick={() => fileInput.current?.click()}>
            ↑ Upload PDF
          </Button>
          <Button disabled={busy} onClick={() => setPasting((p) => !p)}>
            {pasting ? "Cancel" : "Paste text"}
          </Button>
          <MonoLabel className="ml-1">or drop a PDF here</MonoLabel>
          {busy && (
            <span className="ml-2 flex items-center gap-2 text-ink2">
              <Spinner className="h-3.5 w-3.5 text-accent" /> Extracting your resume…
            </span>
          )}
          {result && !busy && <span className="ml-2 text-ok">{result}</span>}
        </div>
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
        {pasting && !busy && (
          <div className="mt-4 flex max-w-3xl flex-col gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Paste your resume text here…"
              className="border border-line2 bg-bg px-3 py-2 outline-none placeholder:text-muted focus:border-accent"
            />
            <Button variant="primary" className="self-end" disabled={!text.trim()} onClick={() => run({ text })}>
              Extract entries
            </Button>
          </div>
        )}
        {error && (
          <div className="mt-4">
            <ErrorBanner error={error} />
          </div>
        )}
      </div>
    </Band>
  );
}

function AddRow({ onAdded }: { onAdded: (t: Tile) => void }) {
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
    <div className="border-b border-line bg-panel px-5 py-3.5 lg:px-7">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={text.includes("\n") ? 3 : 1}
          placeholder="Add an entry: first line is the heading, then '• ' lines for bullets (Shift+Enter for a new line)"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && text.trim()) {
              e.preventDefault();
              add();
            }
          }}
          className="min-w-0 flex-1 resize-y border border-line2 bg-bg px-3 py-[7px] outline-none placeholder:text-muted focus:border-accent"
        />
        <div className="flex gap-2">
          <CategorySelect value={category} onChange={setCategory} className="h-[34px]" />
          <Button variant="primary" disabled={!text.trim() || busy} onClick={add}>
            Add
          </Button>
        </div>
      </div>
      {error && (
        <div className="mt-2">
          <ErrorBanner error={error} />
        </div>
      )}
    </div>
  );
}

function ProfileSection() {
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

  const input = "border border-line2 bg-bg px-3 py-[7px] text-ink outline-none focus:border-accent";
  const field = (key: "full_name" | "phone" | "location", label: string) => (
    <label className="flex flex-col gap-1">
      <MonoLabel>{label}</MonoLabel>
      <input
        value={profile[key] ?? ""}
        onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
        className={input}
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
    <section id="profile">
      <GroupHeader right={<span className="text-xs text-muted">Shown at the top of every generated resume</span>}>
        Resume header
      </GroupHeader>
      <div className="grid gap-4 border-b border-line px-5 py-5 sm:grid-cols-2 lg:grid-cols-4 lg:px-7">
        {field("full_name", "Full name")}
        <div className="flex flex-col gap-1">
          <MonoLabel>Email</MonoLabel>
          <div className="py-[7px]">{profile.email}</div>
        </div>
        {field("phone", "Phone")}
        {field("location", "Location")}
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <MonoLabel>Links (one per line)</MonoLabel>
          <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={2} className={input} />
        </label>
        <div className="flex items-end justify-end gap-3">
          {status && <span className="text-xs text-muted">{status}</span>}
          <Button onClick={save}>Save header</Button>
        </div>
      </div>
    </section>
  );
}
