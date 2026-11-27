"use client";

import {
  Alert,
  Button,
  Card,
  Chip,
  Description,
  Form,
  Input,
  Label,
  NumberField,
  TextArea,
  TextField,
} from "@heroui/react";
import { Stepper } from "@heroui-pro/react/stepper";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { demoRequests, recommend } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { ButtonLink } from "./ui";

const STEPS = [
  {
    title: "Du erstellst einen Link",
    text: "Name, Budget und Anlass genügen. Den fertigen Text schickst du per Messenger.",
  },
  {
    title: "Die Person trägt Wünsche ein",
    text: "Produktnamen oder einfach eine Beschreibung.",
  },
  {
    title: "Du bekommst eine Empfehlung",
    text: "Ein bestes Geschenk und Alternativen, jeweils mit Preis inklusive Versand und den Daten dahinter.",
  },
];

const CASES = [
  {
    title: "Ist der Angebotspreis ein echter Deal?",
    text: "Der aktuelle Preis wird mit dem Verlauf der letzten 90 Tage verglichen.",
  },
  {
    title: "Wunsch über dem Budget?",
    text: `Dann schlägt ${BRAND} ein gleichwertiges Produkt aus derselben Kategorie vor.`,
  },
  {
    title: "Ausverkauft?",
    text: "Du bekommst eine Alternative, die rechtzeitig lieferbar ist.",
  },
  {
    title: "Zwei kleine Wünsche?",
    text: `${BRAND} prüft, ob beide zusammen inklusive Versand ins Budget passen.`,
  },
];

const h2 = "text-2xl font-semibold tracking-tight sm:text-3xl";
const lead = "max-w-prose text-lg text-muted";

export default function LandingPage() {
  const router = useRouter();
  const [share, setShare] = useState<{ name: string; link: string } | null>(null);
  const [message, setMessage] = useState("");
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
    setShare({ name, link });
    setMessage(
      `Hallo ${name}, ich möchte dir etwas schenken, das du dir wirklich wünschst (Anlass: ${occasion}). Trag hier kurz ein paar Wünsche ein, welcher es wird, bleibt eine Überraschung: ${link}`,
    );
    setCopied("");
  }

  async function copy(what: "link" | "text") {
    await navigator.clipboard.writeText(what === "link" ? share!.link : message);
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

  const demoButton = (which: "simple" | "chaotic", label: string) => (
    <Button
      size="sm"
      variant="outline"
      isDisabled={!!demo}
      isPending={demo === which}
      onPress={() => runDemo(which)}
    >
      {demo === which ? "Agent arbeitet …" : label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-16 sm:gap-24">
      <header className="grid items-start gap-10 pt-4 md:grid-cols-[1fr_400px] md:pt-10">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">
            Gut schenken, ohne zu raten.
          </h1>
          <p className={lead}>
            Du nennst Budget und Anlass. Die Person trägt ihre Wünsche ein. {BRAND} prüft Preis, Preisverlauf und
            Verfügbarkeit bei idealo und empfiehlt das beste Geschenk, mit Beleg.
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip>Preisverlauf 90 Tage</Chip>
            <Chip>Preis inkl. Versand</Chip>
            <Chip>Verfügbarkeit je Händler</Chip>
          </div>
        </div>

        <div id="start" className="flex scroll-mt-6 flex-col gap-4">
          <Card>
            <Card.Header>
              <Card.Title className="text-xl">Wen möchtest du beschenken?</Card.Title>
              <Card.Description>Du bekommst einen Link, den du der Person schickst.</Card.Description>
            </Card.Header>
            <Form onSubmit={onSubmit}>
              <Card.Content className="flex flex-col gap-4">
                <TextField fullWidth isRequired name="name" variant="secondary">
                  <Label>Name</Label>
                  <Input maxLength={60} placeholder="z. B. Lena" />
                </TextField>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField fullWidth isRequired minValue={1} name="budget" variant="secondary">
                    <Label>Budget in Euro</Label>
                    <NumberField.Group>
                      <NumberField.Input className="num w-full" inputMode="decimal" placeholder="50" />
                    </NumberField.Group>
                  </NumberField>
                  <TextField fullWidth isRequired name="occasion" variant="secondary">
                    <Label>Anlass</Label>
                    <Input list="occasions" maxLength={60} placeholder="z. B. Geburtstag" />
                  </TextField>
                  <datalist id="occasions">
                    <option value="Geburtstag" />
                    <option value="Weihnachten" />
                    <option value="Wichteln" />
                    <option value="Hochzeit" />
                  </datalist>
                </div>
                <p className="text-sm text-muted">Das Budget zählt inklusive Versand.</p>
              </Card.Content>
              <Card.Footer className="mt-4 flex flex-col gap-2">
                <Button fullWidth type="submit">
                  Link erstellen
                </Button>
                <p className="text-center text-sm text-muted">Ohne Anmeldung.</p>
              </Card.Footer>
            </Form>
          </Card>

          {share && (
            <Card aria-live="polite">
              <Card.Header>
                <Chip className="mb-2 self-start" color="success" variant="soft">
                  Link ist fertig
                </Chip>
                <Card.Title className="text-xl">Schick das an {share.name}</Card.Title>
              </Card.Header>
              <Card.Content className="flex flex-col gap-4">
                <TextField fullWidth variant="secondary" value={message} onChange={setMessage}>
                  <Label>Nachricht</Label>
                  <TextArea rows={6} />
                  <Description>Du kannst den Text vor dem Senden anpassen.</Description>
                </TextField>
                <a className="num break-all text-sm text-accent underline" href={share.link}>
                  {share.link}
                </a>
              </Card.Content>
              <Card.Footer className="mt-4 flex flex-wrap gap-2">
                <Button onPress={() => copy("text")}>{copied === "text" ? "Kopiert" : "Text kopieren"}</Button>
                <Button variant="outline" onPress={() => copy("link")}>
                  {copied === "link" ? "Kopiert" : "Nur Link kopieren"}
                </Button>
                {"share" in navigator && (
                  <Button variant="ghost" onPress={() => navigator.share({ text: message }).catch(() => {})}>
                    Teilen …
                  </Button>
                )}
              </Card.Footer>
            </Card>
          )}
        </div>
      </header>

      <section className="flex flex-col gap-8">
        <h2 className={h2}>So funktioniert es</h2>
        <Stepper
          currentStep={-1}
          orientation="vertical"
          size="lg"
          style={
            {
              "--stepper-inactive-border": "var(--color-foreground)",
              "--stepper-inactive-fg": "var(--color-foreground)",
            } as React.CSSProperties
          }
        >
          {STEPS.map((s, i) => (
            <Stepper.Step key={s.title}>
              <Stepper.Indicator />
              <Stepper.Content>
                <Stepper.Title className="text-foreground">{s.title}</Stepper.Title>
                <Stepper.Description className="text-sm text-muted">{s.text}</Stepper.Description>
              </Stepper.Content>
              {i < STEPS.length - 1 && <Stepper.Separator />}
            </Stepper.Step>
          ))}
        </Stepper>
      </section>

      <section className="grid gap-8 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col gap-4">
          <h2 className={h2}>Jede Empfehlung zeigt ihren Beleg</h2>
          <p className={lead}>
            {BRAND} entscheidet anhand der Daten von idealo und sagt dazu, welche es waren.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            Nur mal ansehen? {demoButton("simple", "Demo: einfach")}
          </div>
        </div>
        <dl className="grid gap-5">
          {CASES.map((c) => (
            <div key={c.title}>
              <dt className="font-medium">{c.title}</dt>
              <dd className="text-muted">{c.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className={h2}>Wenn die Daten nicht reichen, fragt {BRAND} nach</h2>
        <p className={lead}>
          Ist ein Wunsch ungenau oder widersprechen sich die Preise, rät {BRAND} nicht. Du siehst, was unklar ist,
          und welche Frage offen ist.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          Beispiel mit Rückfrage: {demoButton("chaotic", "Demo: chaotisch")}
        </div>
        {demo && <p className="text-sm text-muted">Das kann 10 bis 30 Sekunden dauern.</p>}
        {error && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{error}</Alert.Title>
            </Alert.Content>
          </Alert>
        )}
      </section>

      <section className="flex flex-col items-start gap-6">
        <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Wem schenkst du als Nächstes etwas?
        </h2>
        <ButtonLink href="#start">Link erstellen</ButtonLink>
      </section>

      <footer className="text-sm text-muted">
        Produkt- und Preisdaten kommen von idealo. Die Entscheidung trifft ein Sprachmodell in einem Live-Aufruf;
        jeder Aufruf ist im Trace einsehbar.
      </footer>
    </div>
  );
}
