"use client";

import { Alert, Button, Card, Description, Input, Label, Skeleton, Spinner, TextArea, TextField } from "@heroui/react";
import { TextShimmer } from "@heroui-pro/react/text-shimmer";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { recommend } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { ButtonLink } from "../ui";

const MAX_WISHES = 10;

const AGENT_STEPS = [
  "Wünsche lesen",
  "Produkte bei idealo finden",
  "Preisverlauf und Verfügbarkeit prüfen",
  "Modell entscheidet: kaufen, warten oder Alternative",
];

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
      <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4">
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Dieser Link ist unvollständig</Alert.Title>
            <Alert.Description>Bitte lass dir einen neuen Link schicken.</Alert.Description>
          </Alert.Content>
        </Alert>
        <ButtonLink href="/try" variant="outline">
          Zur Startseite
        </ButtonLink>
      </div>
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
      <section className="mx-auto flex w-full max-w-xl flex-col gap-6" role="status">
        <div className="flex items-center gap-3">
          <Spinner />
          <h1 className="text-2xl font-semibold tracking-tight">
            <TextShimmer>Der Agent prüft deine Wünsche …</TextShimmer>
          </h1>
        </div>
        <p className="text-muted">Das dauert etwa 10 bis 30 Sekunden. Bitte lass die Seite offen.</p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted">
          {AGENT_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <Card aria-hidden>
          <Skeleton className="h-6 w-24 rounded-lg" />
          <Skeleton className="h-5 w-3/4 rounded-lg" />
          <Skeleton className="h-8 w-1/3 rounded-lg" />
        </Card>
      </section>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">
          Hallo{name ? ` ${name}` : ""}, was wünschst du dir?
        </h1>
        <p className="text-muted">
          Anlass: <strong className="font-medium text-foreground">{occasion}</strong>. Jemand möchte dir etwas
          schenken, das du wirklich haben willst. Trag ein paar Wünsche ein. Welcher es wird, bleibt eine
          Überraschung.
        </p>
      </header>

      <Card>
        <Card.Content className="flex flex-col gap-5">
          <div className="flex items-end gap-2">
            <TextField fullWidth variant="secondary" value={draft} onChange={setDraft}>
              <Label>
                Deine Wünsche ({wishes.length}/{MAX_WISHES})
              </Label>
              <Input
                maxLength={200}
                placeholder="Produktname oder Beschreibung"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addWish();
                  }
                }}
              />
            </TextField>
            <Button
              className="shrink-0"
              variant="outline"
              isDisabled={!draft.trim() || wishes.length >= MAX_WISHES}
              onPress={addWish}
            >
              Hinzufügen
            </Button>
          </div>

          {wishes.length > 0 && (
            <ul className="flex flex-col gap-2">
              {wishes.map((wish, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl bg-surface-secondary py-1.5 pl-3 pr-1.5"
                >
                  <span className="min-w-0 break-words">{wish}</span>
                  <Button
                    className="shrink-0"
                    size="sm"
                    variant="ghost"
                    aria-label={`Wunsch „${wish}“ entfernen`}
                    onPress={() => setWishes(wishes.filter((_, j) => j !== i))}
                  >
                    Entfernen
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted">
            Ein genauer Produktname hilft. Eine Beschreibung reicht auch, dann fragt der Agent bei Bedarf nach.
          </p>

          <TextField fullWidth variant="secondary" value={preferences} onChange={setPreferences}>
            <Label>Was du magst (optional)</Label>
            <TextArea maxLength={500} placeholder="z. B. Lieblingsfarbe, Marke, Hobby" rows={2} />
            <Description>Hilft bei der Auswahl von Alternativen.</Description>
          </TextField>

          {error && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{error}</Alert.Title>
              </Alert.Content>
            </Alert>
          )}
        </Card.Content>
        <Card.Footer className="mt-4 flex flex-col gap-2">
          <Button fullWidth onPress={submit}>
            Wünsche abschicken
          </Button>
          <p className="text-center text-sm text-muted">Ohne Anmeldung.</p>
        </Card.Footer>
      </Card>

      <section className="flex flex-col gap-1 text-sm text-muted">
        <h2 className="font-medium text-foreground">Was danach passiert</h2>
        <p>{BRAND} prüft Preise, Preisverlauf und Verfügbarkeit bei idealo.</p>
        <p>Die schenkende Person bekommt eine Empfehlung, die ins Budget passt.</p>
      </section>

      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Du willst auch jemandem etwas schenken?</Card.Title>
          <Card.Description>Erstell deinen eigenen Link in einer Minute.</Card.Description>
        </Card.Header>
        <Card.Footer>
          <ButtonLink href="/try" variant="outline">
            Jetzt selbst jemanden beschenken
          </ButtonLink>
        </Card.Footer>
      </Card>
    </div>
  );
}
