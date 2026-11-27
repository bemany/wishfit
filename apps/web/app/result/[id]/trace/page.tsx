"use client";

import { Alert, Card, Chip, Skeleton } from "@heroui/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getTrace, type Trace } from "@/lib/api";

const pre = "num overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-surface-secondary p-3 text-xs";
const label = "text-sm font-medium";
const json = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));

export default function TracePage() {
  const { id } = useParams<{ id: string }>();
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getTrace(id).then(setTrace, (err: Error) => setError(err.message));
  }, [id]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <Link href={`/result/${id}`} className="text-sm text-accent underline">
        ← Zurück zum Ergebnis
      </Link>
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">Trace</h1>
      {error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{error}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
      {!trace && !error && (
        <div className="flex flex-col gap-3" role="status" aria-label="Trace wird geladen">
          <Skeleton className="h-6 w-1/2 rounded-lg" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      )}

      {trace && (
        <>
          <h2 className="text-xl font-semibold tracking-tight">Modell-Aufrufe ({trace.model_calls.length})</h2>
          {trace.model_calls.map((c, i) => (
            <Card key={i}>
              <Card.Header>
                {c.step && (
                  <Chip className="self-start" size="sm" variant="soft">
                    Schritt: {c.step}
                  </Chip>
                )}
                <Card.Title className="num">{c.model}</Card.Title>
                <Card.Description className="num text-xs">
                  {c.duration_ms != null && `${c.duration_ms} ms`}
                  {c.usage &&
                    ` · ${c.usage.prompt_tokens ?? "?"} Prompt-Tokens · ${c.usage.completion_tokens ?? "?"} Antwort-Tokens`}
                  {c.started_at && ` · ${new Date(c.started_at).toLocaleString("de-DE")}`}
                </Card.Description>
              </Card.Header>
              <Card.Content className="flex flex-col gap-2">
                <p className={label}>Eingabe</p>
                {c.input.map((m, j) => (
                  <div key={j} className="flex flex-col gap-1">
                    <p className="text-xs text-muted">{m.role}</p>
                    <pre className={pre}>{json(m.content)}</pre>
                  </div>
                ))}
                <p className={label}>Ausgabe</p>
                <pre className={pre}>{json(c.output)}</pre>
              </Card.Content>
            </Card>
          ))}

          <h2 className="text-xl font-semibold tracking-tight">idealo-Aufrufe ({trace.idealo_calls.length})</h2>
          {trace.idealo_calls.map((c, i) => (
            <Card key={i}>
              <Card.Header className="flex-row flex-wrap items-center gap-2">
                <Card.Title className="num">{c.tool}</Card.Title>
                {c.source && (
                  <Chip color={c.source === "live" ? "success" : "default"} size="sm" variant="soft">
                    {c.source === "live" ? "live" : "Snapshot"}
                  </Chip>
                )}
                {c.duration_ms != null && <span className="num text-xs text-muted">{c.duration_ms} ms</span>}
              </Card.Header>
              <Card.Content className="flex flex-col gap-2">
                <p className={label}>Argumente</p>
                <pre className={pre}>{json(c.arguments)}</pre>
                {/* ponytail: native <details>, the result payload can be large and is rarely needed */}
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Ergebnis anzeigen</summary>
                  <pre className={`${pre} mt-2`}>{json(c.result)}</pre>
                </details>
              </Card.Content>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
