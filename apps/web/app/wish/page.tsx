"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { recommend } from "@/lib/api";

const MAX_WISHES = 10;

export default function WishPage() {
  const router = useRouter();
  const params = useSearchParams();
  const name = params.get("name")?.trim() || "";
  const occasion = params.get("occasion")?.trim() || "";
  const budget = Number(params.get("budget"));

  const [wishes, setWishes] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [preferences, setPreferences] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!occasion || !(budget > 0)) {
    return (
      <>
        <p className="error">Dieser Link ist unvollständig. Bitte lass dir einen neuen Link schicken.</p>
        <Link href="/" className="btn-ghost">Zur Startseite</Link>
      </>
    );
  }

  function addWish() {
    const wish = draft.trim();
    if (!wish || wishes.length >= MAX_WISHES) return;
    setWishes([...wishes, wish]);
    setDraft("");
  }

  async function submit() {
    // A wish still sitting in the input counts too.
    const all = draft.trim() && wishes.length < MAX_WISHES ? [...wishes, draft.trim()] : wishes;
    if (all.length === 0) return setError("Bitte trag mindestens einen Wunsch ein.");
    setLoading(true);
    setError("");
    try {
      const result = await recommend({
        wishes: all,
        budget_eur: budget,
        occasion,
        recipient_name: name || null,
        preferences: preferences.trim() || null,
      });
      router.push(`/result/${result.id}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <section className="card flex flex-col items-center gap-4 py-10 text-center" role="status">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent-soft border-t-accent" />
        <h1 className="text-xl font-semibold">Der Agent prüft deine Wünsche …</h1>
        <p className="text-stone-600">
          Er holt Preise, Preisverlauf und Verfügbarkeit von idealo und entscheidet dann. Das dauert etwa 10 bis 30
          Sekunden. Bitte lass die Seite offen.
        </p>
      </section>
    );
  }

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold leading-tight">Hallo{name ? ` ${name}` : ""}!</h1>
        <p className="mt-2 text-stone-600">
          Jemand möchte dir etwas schenken – Anlass: <strong className="text-stone-900">{occasion}</strong>. Trag
          ein, was du dir wünschst. Unser Agent sucht daraus das beste Geschenk heraus.
        </p>
      </header>

      <section className="card flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="wish">
            Deine Wünsche ({wishes.length}/{MAX_WISHES})
          </label>
          <div className="flex gap-2">
            <input
              className="input"
              id="wish"
              value={draft}
              maxLength={200}
              placeholder="z. B. Powerbank von Anker"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addWish();
                }
              }}
            />
            <button className="btn-ghost shrink-0" type="button" onClick={addWish} disabled={!draft.trim() || wishes.length >= MAX_WISHES}>
              Hinzufügen
            </button>
          </div>
        </div>

        {wishes.length > 0 && (
          <ul className="flex flex-col gap-2">
            {wishes.map((wish, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-3 py-2">
                <span className="break-words">{wish}</span>
                <button
                  type="button"
                  className="shrink-0 text-sm text-stone-600 underline"
                  aria-label={`Wunsch „${wish}“ entfernen`}
                  onClick={() => setWishes(wishes.filter((_, j) => j !== i))}
                >
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        )}

        <div>
          <label className="label" htmlFor="preferences">Vorlieben (optional)</label>
          <textarea
            className="input"
            id="preferences"
            rows={2}
            maxLength={500}
            value={preferences}
            placeholder="Marke, Farbe, was du gern machst …"
            onChange={(e) => setPreferences(e.target.value)}
          />
        </div>

        {error && <p className="error">{error}</p>}
        <button className="btn" type="button" onClick={submit}>Wünsche abschicken</button>
      </section>
    </>
  );
}
