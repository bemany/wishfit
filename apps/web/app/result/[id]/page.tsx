"use client";

import { Alert, Card, Chip, Skeleton } from "@heroui/react";
import { NumberValue } from "@heroui-pro/react/number-value";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getResult, type Recommendation, type Result } from "@/lib/api";
import { ButtonLink } from "../../ui";

function Eur({ value, className }: { value: number | null; className?: string }) {
  if (value == null) return <span className={className}>–</span>;
  return <NumberValue className={className} currency="EUR" locale="de-DE" style="currency" value={value} />;
}

const ACTION = {
  buy: { label: "Jetzt kaufen", color: "success" },
  wait: { label: "Besser warten", color: "warning" },
  alternative: { label: "Alternative", color: "default" },
} as const;

function RecommendationCard({ rec, top }: { rec: Recommendation; top?: boolean }) {
  const action = ACTION[rec.action] ?? { label: rec.action, color: "default" as const };
  const meta = [
    rec.merchant,
    rec.delivery_estimate && `Lieferung: ${rec.delivery_estimate}`,
    rec.available == null ? null : rec.available ? "lieferbar" : "nicht lieferbar",
  ].filter(Boolean);

  return (
    <Card className={top ? "border-2 border-accent" : undefined} variant={top ? "default" : "secondary"}>
      <Card.Header className="gap-2">
        {top && <p className="text-sm font-medium text-accent">Top-Empfehlung</p>}
        <Chip className="self-start" color={action.color} variant="soft">
          {action.label}
        </Chip>
        <Card.Title className={top ? "text-2xl leading-snug" : "text-lg leading-snug"}>
          {rec.product_name}
        </Card.Title>
        <Card.Description>Wunsch: {rec.wish}</Card.Description>
      </Card.Header>

      <Card.Content className="flex flex-col gap-4">
        <p className={top ? undefined : "text-sm"}>{rec.reason}</p>

        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Eur
              className={`num font-semibold leading-none ${top ? "text-4xl" : "text-2xl"}`}
              value={rec.total_eur}
            />
            <span className="num text-sm text-muted">
              <Eur value={rec.price_eur} /> + <Eur value={rec.shipping_eur} /> Versand
            </span>
          </div>
          <p className="text-sm text-muted">Gesamtpreis inklusive Versand</p>
          {meta.length > 0 && <p className="text-sm text-muted">{meta.join(" · ")}</p>}
        </div>

        {rec.signals.length > 0 &&
          (top ? (
            <section className="rounded-2xl bg-surface-secondary p-4">
              <h3 className="flex items-baseline justify-between text-sm font-semibold">
                Datensignale von idealo
                <span className="num text-muted">{rec.signals.length}</span>
              </h3>
              <dl className="mt-3 flex flex-col gap-3">
                {rec.signals.map((s, i) => (
                  <div key={i} title={s.type}>
                    <dt className="text-sm text-muted">{s.label}</dt>
                    <dd className="num text-sm font-medium">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm text-muted">Datensignale von idealo</h3>
              <ul className="flex flex-wrap gap-2">
                {rec.signals.map((s, i) => (
                  <li key={i} title={s.type}>
                    <Chip className="h-auto max-w-full whitespace-normal" variant="secondary">
                      <span>
                        {s.label}: <span className="num">{s.value}</span>
                      </span>
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </Card.Content>

      {rec.offer_url && (
        <Card.Footer className="mt-4">
          <ButtonLink fullWidth href={rec.offer_url} variant={top ? "primary" : "outline"}>
            Zum Angebot
          </ButtonLink>
        </Card.Footer>
      )}
    </Card>
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
      <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4">
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{error}</Alert.Title>
          </Alert.Content>
        </Alert>
        <ButtonLink href="/try" variant="outline">
          Zur Startseite
        </ButtonLink>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6" role="status" aria-label="Ergebnis wird geladen">
        <Skeleton className="h-9 w-2/3 rounded-lg" />
        <Card>
          <Skeleton className="h-6 w-28 rounded-lg" />
          <Skeleton className="h-7 w-4/5 rounded-lg" />
          <Skeleton className="h-4 w-full rounded-lg" />
          <Skeleton className="h-4 w-5/6 rounded-lg" />
          <Skeleton className="h-10 w-1/3 rounded-lg" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </Card>
      </div>
    );
  }

  const ideasOnly = result.status === "ideas_only";
  const clarification = (ideasOnly || result.status === "needs_clarification") && result.uncertainty;
  const understood = result.understood;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">
        {ideasOnly ? "Meine Geschenkideen" : clarification ? "Eine Frage, bevor ich empfehle" : "Meine Empfehlung"}
      </h1>

      {understood && (
        <section className="flex flex-col gap-3 rounded-2xl bg-surface-secondary p-4">
          <h2 className="text-sm font-semibold">Das habe ich verstanden</h2>
          <p>{understood.summary}</p>
          {understood.interests.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Interessen">
              {understood.interests.map((interest) => (
                <li key={interest}>
                  <Chip variant="soft">{interest}</Chip>
                </li>
              ))}
            </ul>
          )}
          {understood.candidates.length > 0 && (
            <dl className="flex flex-col gap-3">
              {understood.candidates.map((c, i) => (
                <div key={i}>
                  <dt className="font-medium">{c.idea}</dt>
                  <dd className="text-sm text-muted">{c.why}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      {clarification && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {ideasOnly ? "Für diese Ideen fehlen mir noch Daten" : "Ich bin mir nicht sicher"}
            </Alert.Title>
            <Alert.Description>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {clarification.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <p className="mt-4 text-lg font-semibold leading-snug text-foreground">{clarification.question}</p>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {!ideasOnly && result.top && <RecommendationCard rec={result.top} top />}

      {!ideasOnly && result.alternatives.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Alternativen</h2>
          {result.alternatives.map((rec, i) => (
            <RecommendationCard key={i} rec={rec} />
          ))}
        </section>
      )}

      <p className="text-sm text-muted">
        Entschieden von <span className="num">{result.model}</span> am{" "}
        {new Date(result.created_at).toLocaleString("de-DE")} ·{" "}
        <Link href={`/result/${result.id}/trace`} className="text-accent underline">
          Trace ansehen
        </Link>
      </p>

      <ButtonLink fullWidth href="/try" variant={result.top ? "secondary" : "primary"}>
        Jetzt selbst jemanden beschenken
      </ButtonLink>
    </div>
  );
}
