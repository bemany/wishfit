"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getResult, type Recommendation, type Result } from "@/lib/api";

const eur = (n: number | null) =>
  n == null ? "–" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const ACTION = {
  buy: { label: "Jetzt kaufen", cls: "bg-accent text-white" },
  wait: { label: "Noch warten", cls: "bg-amber-100 text-amber-900" },
  alternative: { label: "Alternative", cls: "bg-stone-200 text-stone-900" },
};

function RecommendationCard({ rec, top }: { rec: Recommendation; top?: boolean }) {
  const action = ACTION[rec.action] ?? { label: rec.action, cls: "bg-stone-200 text-stone-900" };
  return (
    <article className={`card flex flex-col gap-3 ${top ? "border-2 border-accent" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${action.cls}`}>{action.label}</span>
        <span className="text-sm text-stone-500">Wunsch: {rec.wish}</span>
      </div>
      <h3 className={top ? "text-2xl font-bold leading-snug" : "text-lg font-semibold leading-snug"}>
        {rec.product_name}
      </h3>
      <p className={top ? "text-base" : "text-sm text-stone-700"}>{rec.reason}</p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-stone-50 p-3 text-sm">
        <dt className="text-stone-500">Preis</dt>
        <dd className="text-right">{eur(rec.price_eur)}</dd>
        <dt className="text-stone-500">Versand</dt>
        <dd className="text-right">{eur(rec.shipping_eur)}</dd>
        <dt className="font-semibold">Gesamt inkl. Versand</dt>
        <dd className="text-right text-base font-bold">{eur(rec.total_eur)}</dd>
        <dt className="text-stone-500">Händler</dt>
        <dd className="text-right">{rec.merchant ?? "–"}</dd>
        <dt className="text-stone-500">Verfügbarkeit</dt>
        <dd className="text-right">
          {rec.available == null ? "unbekannt" : rec.available ? "lieferbar" : "nicht lieferbar"}
        </dd>
        <dt className="text-stone-500">Lieferzeit</dt>
        <dd className="text-right">{rec.delivery_estimate ?? "–"}</dd>
      </dl>

      {rec.signals.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
            idealo-Daten hinter der Entscheidung
          </p>
          <ul className="flex flex-wrap gap-2">
            {rec.signals.map((s, i) => (
              <li key={i} className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-1.5 text-sm" title={s.type}>
                <span className="text-stone-600">{s.label}:</span> <strong>{s.value}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rec.offer_url && (
        <a className={top ? "btn" : "btn-ghost"} href={rec.offer_url} target="_blank" rel="noopener noreferrer">
          Zum Angebot
        </a>
      )}
    </article>
  );
}

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getResult(id).then(setResult, (err: Error) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <>
        <p className="error">{error}</p>
        <Link href="/" className="btn-ghost">Zur Startseite</Link>
      </>
    );
  }
  if (!result) return <p className="text-stone-500" role="status">Ergebnis wird geladen …</p>;

  return (
    <>
      {result.status === "needs_clarification" && result.uncertainty ? (
        <section className="card flex flex-col gap-3 border-2 border-amber-400 bg-amber-50">
          <span className="self-start rounded-full bg-amber-200 px-3 py-1 text-sm font-semibold text-amber-900">
            Rückfrage
          </span>
          <h1 className="text-2xl font-bold leading-snug">{result.uncertainty.question}</h1>
          <p className="text-sm font-semibold">Warum der Agent unsicher ist:</p>
          <ul className="list-disc space-y-1 pl-5">
            {result.uncertainty.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      ) : (
        <h1 className="text-3xl font-bold leading-tight">Die Empfehlung</h1>
      )}

      {result.top && <RecommendationCard rec={result.top} top />}

      {result.alternatives.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Alternativen</h2>
          {result.alternatives.map((rec, i) => (
            <RecommendationCard key={i} rec={rec} />
          ))}
        </section>
      )}

      <p className="text-sm text-stone-500">
        Entschieden von <span className="font-mono">{result.model}</span> am{" "}
        {new Date(result.created_at).toLocaleString("de-DE")} ·{" "}
        <Link href={`/result/${result.id}/trace`} className="text-accent underline">
          Trace ansehen
        </Link>
      </p>

      <Link href="/" className="btn">Jetzt selbst jemanden beschenken</Link>
    </>
  );
}
