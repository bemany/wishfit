"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getTrace, type Trace } from "@/lib/api";

const pre = "overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-stone-900 p-3 font-mono text-xs text-stone-100";
const json = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));

export default function TracePage() {
  const { id } = useParams<{ id: string }>();
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getTrace(id).then(setTrace, (err: Error) => setError(err.message));
  }, [id]);

  return (
    <>
      <Link href={`/result/${id}`} className="text-sm text-accent underline">← Zurück zum Ergebnis</Link>
      <h1 className="text-3xl font-bold leading-tight">Trace</h1>
      {error && <p className="error">{error}</p>}
      {!trace && !error && <p className="text-stone-500" role="status">Trace wird geladen …</p>}

      {trace && (
        <>
          <h2 className="text-xl font-semibold">Modell-Aufrufe ({trace.model_calls.length})</h2>
          {trace.model_calls.map((c, i) => (
            <section key={i} className="card flex flex-col gap-2">
              <p className="font-mono text-sm font-semibold">{c.model}</p>
              <p className="text-xs text-stone-500">
                {c.duration_ms != null && `${c.duration_ms} ms`}
                {c.usage && ` · ${c.usage.prompt_tokens ?? "?"} Prompt-Tokens · ${c.usage.completion_tokens ?? "?"} Antwort-Tokens`}
                {c.started_at && ` · ${new Date(c.started_at).toLocaleString("de-DE")}`}
              </p>
              <p className="label">Eingabe</p>
              {c.input.map((m, j) => (
                <div key={j}>
                  <p className="text-xs font-semibold uppercase text-stone-500">{m.role}</p>
                  <pre className={pre}>{json(m.content)}</pre>
                </div>
              ))}
              <p className="label">Ausgabe</p>
              <pre className={pre}>{json(c.output)}</pre>
            </section>
          ))}

          <h2 className="text-xl font-semibold">idealo-Aufrufe ({trace.idealo_calls.length})</h2>
          {trace.idealo_calls.map((c, i) => (
            <section key={i} className="card flex flex-col gap-2">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{c.tool}</span>
                {c.source && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs">
                    {c.source === "live" ? "live" : "Snapshot"}
                  </span>
                )}
                {c.duration_ms != null && <span className="text-xs text-stone-500">{c.duration_ms} ms</span>}
              </p>
              <p className="label">Argumente</p>
              <pre className={pre}>{json(c.arguments)}</pre>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Ergebnis anzeigen</summary>
                <pre className={`${pre} mt-2`}>{json(c.result)}</pre>
              </details>
            </section>
          ))}
        </>
      )}
    </>
  );
}
