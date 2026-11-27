"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { demoRequests, recommend } from "@/lib/api";

export default function GiverPage() {
  const router = useRouter();
  const [share, setShare] = useState<{ link: string; text: string } | null>(null);
  const [copied, setCopied] = useState("");
  const [demo, setDemo] = useState<"simple" | "chaotic" | null>(null);
  const [error, setError] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name")).trim();
    const occasion = String(f.get("occasion")).trim();
    const params = new URLSearchParams({ name, budget: String(f.get("budget")), occasion });
    const link = `${window.location.origin}/wish?${params}`;
    setShare({
      link,
      text: `Hallo ${name}, ich möchte dir etwas schenken, das du dir wirklich wünschst (Anlass: ${occasion}). Trag hier kurz deine Wünsche ein, den Rest erledigt Wishloop: ${link}`,
    });
    setCopied("");
  }

  async function copy(what: "link" | "text") {
    await navigator.clipboard.writeText(share![what]);
    setCopied(what);
  }

  async function runDemo(which: "simple" | "chaotic") {
    setDemo(which);
    setError("");
    try {
      const result = await recommend(demoRequests[which]);
      router.push(`/result/${result.id}`);
    } catch (err) {
      setError((err as Error).message);
      setDemo(null);
    }
  }

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold leading-tight">Schenk, was wirklich gewünscht wird.</h1>
        <p className="mt-2 text-stone-600">
          Du gibst Name, Budget und Anlass an und teilst den Link. Die beschenkte Person trägt ihre Wünsche ein,
          unser Agent findet mit idealo-Daten das beste Geschenk im Budget.
        </p>
      </header>

      <form onSubmit={onSubmit} className="card flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="name">Wen möchtest du beschenken?</label>
          <input className="input" id="name" name="name" required maxLength={60} placeholder="z. B. Lena" />
        </div>
        <div>
          <label className="label" htmlFor="budget">Budget in Euro (inklusive Versand)</label>
          <input className="input" id="budget" name="budget" type="number" inputMode="decimal" min="1" step="any" required placeholder="50" />
        </div>
        <div>
          <label className="label" htmlFor="occasion">Anlass</label>
          <input className="input" id="occasion" name="occasion" required maxLength={60} placeholder="z. B. Geburtstag" list="occasions" />
          <datalist id="occasions">
            <option value="Geburtstag" />
            <option value="Weihnachten" />
            <option value="Wichteln" />
            <option value="Hochzeit" />
          </datalist>
        </div>
        <button className="btn" type="submit">Link erstellen</button>
      </form>

      {share && (
        <section className="card flex flex-col gap-3 border-accent/40" aria-live="polite">
          <h2 className="text-lg font-semibold">Dein Link ist fertig</h2>
          <a href={share.link} className="break-all text-sm text-accent underline">{share.link}</a>
          <p className="rounded-xl bg-accent-soft p-3 text-sm">{share.text}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" type="button" onClick={() => copy("text")}>
              {copied === "text" ? "Kopiert ✓" : "Text kopieren"}
            </button>
            <button className="btn-ghost" type="button" onClick={() => copy("link")}>
              {copied === "link" ? "Kopiert ✓" : "Nur Link kopieren"}
            </button>
            {"share" in navigator && (
              <button
                className="btn-ghost"
                type="button"
                onClick={() => navigator.share({ text: share.text }).catch(() => {})}
              >
                Teilen …
              </button>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2 text-sm text-stone-600">
        <p>Nur mal ansehen? Zwei feste Beispiele:</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost text-sm" type="button" disabled={!!demo} onClick={() => runDemo("simple")}>
            {demo === "simple" ? "Agent arbeitet …" : "Demo: einfach"}
          </button>
          <button className="btn-ghost text-sm" type="button" disabled={!!demo} onClick={() => runDemo("chaotic")}>
            {demo === "chaotic" ? "Agent arbeitet …" : "Demo: chaotisch"}
          </button>
        </div>
        {demo && <p>Das kann 10 bis 30 Sekunden dauern.</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </>
  );
}
