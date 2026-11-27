"use client";

import { Alert, Button, Card, Chip, Description, Form, Input, Label, NumberField, TextArea, TextField } from "@heroui/react";
import { ChatAttachment, ChatAttachmentInput } from "@heroui-pro/react/chat-attachment";
import { PromptSuggestion } from "@heroui-pro/react/prompt-suggestion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { demoRequests, recommend, type RecommendRequest } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { savePerson, usePeople } from "@/lib/people";

const MAX = 20_000;
type Demo = keyof typeof demoRequests;

const EXAMPLES: { demo: Demo; label: string }[] = [
  { demo: "chat", label: "WhatsApp-Chat" },
  { demo: "simple", label: "Wunschliste" },
  { demo: "chaotic", label: "Ungenauer Wunsch" },
];

const STATUS = {
  recommendation: { label: "Empfehlung", color: "success" },
  needs_clarification: { label: "Rückfrage", color: "warning" },
  ideas_only: { label: "Ideen", color: "default" },
} as const;

// Web Speech API, not in TypeScript's DOM lib.
type Recognition = {
  lang: string;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
const speechCtor = () => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
const noSubscribe = () => () => {};

export default function AssistantPage() {
  const router = useRouter();
  const people = usePeople();
  const canDictate = useSyncExternalStore(noSubscribe, () => !!speechCtor(), () => false);
  const canShare = useSyncExternalStore(noSubscribe, () => "share" in navigator, () => false);

  const [name, setName] = useState("");
  const [budget, setBudget] = useState<number | undefined>();
  const [occasion, setOccasion] = useState("");
  const [text, setText] = useState("");
  const [demo, setDemo] = useState<Demo | null>(null);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  const controlsReady = !!name.trim() && !!budget && !!occasion.trim();

  function editText(value: string) {
    setText(value);
    setDemo(null);
  }

  function pickExample(which: Demo) {
    const req = demoRequests[which];
    setName(req.recipient_name ?? "");
    setBudget(req.budget_eur);
    setOccasion(req.occasion);
    setText(req.input_text ?? (req.wishes ?? []).join("\n"));
    setDemo(which);
    setFile(null);
    setNotice("");
  }

  function attach(files: File[]) {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("text/") && !f.name.toLowerCase().endsWith(".txt")) {
      setNotice("Bitte eine Textdatei (.txt) anhängen, zum Beispiel einen WhatsApp-Export.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result);
      editText(content.slice(0, MAX));
      setFile({ name: f.name, size: f.size });
      setNotice(
        content.length > MAX
          ? `Die Datei ist länger als ${MAX.toLocaleString("de-DE")} Zeichen und wurde gekürzt.`
          : "",
      );
    };
    reader.onerror = () => setNotice("Die Datei konnte nicht gelesen werden.");
    reader.readAsText(f);
  }

  function toggleDictation() {
    if (listening) return recognition.current?.stop();
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "de-DE";
    rec.continuous = true;
    rec.onresult = (e) => {
      let said = "";
      for (let i = e.resultIndex; i < e.results.length; i++) said += e.results[i][0].transcript;
      setText((t) => (t && !/\s$/.test(t) ? `${t} ${said.trim()}` : t + said.trim()).slice(0, MAX));
      setDemo(null);
    };
    rec.onend = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() || !budget) return;
    recognition.current?.stop();
    setPending(true);
    setError("");
    const req: RecommendRequest = {
      recipient_name: name.trim(),
      occasion: occasion.trim(),
      budget_eur: budget,
      input_text: text,
    };
    if (demo) {
      // The stored idealo snapshot belongs to the example: keep its wishes and preferences.
      const { wishes, preferences } = demoRequests[demo];
      Object.assign(req, { demo_case: demo, preferences }, wishes && { wishes });
    }
    try {
      const result = await recommend(req);
      savePerson({
        name: req.recipient_name!,
        occasion: req.occasion,
        budget_eur: req.budget_eur,
        id: result.id,
        status: result.status,
        created_at: result.created_at,
        top: result.top?.product_name ?? null,
      });
      router.push(`/result/${result.id}`);
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  function createLink() {
    const params = new URLSearchParams({ name: name.trim(), budget: String(budget), occasion: occasion.trim() });
    const link = `${window.location.origin}/wish?${params}`;
    setMessage(
      `Hallo ${name.trim()}, ich möchte dir etwas schenken, das du dir wirklich wünschst (Anlass: ${occasion.trim()}). Trag hier kurz ein paar Wünsche ein, welcher es wird, bleibt eine Überraschung: ${link}`,
    );
    setCopied(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
      <header className="flex flex-col gap-3 pt-2 sm:pt-6">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl">
          Gib mir irgendetwas über die Person. Ich finde das beste Geschenk in deinem Budget.
        </h1>
      </header>

      <Form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField fullWidth isRequired name="name" value={name} onChange={setName}>
            <Label>Für wen?</Label>
            <Input maxLength={60} placeholder="z. B. Lena" />
          </TextField>
          <NumberField fullWidth isRequired minValue={1} name="budget" value={budget ?? NaN} onChange={(v) => setBudget(Number.isNaN(v) ? undefined : v)}>
            <Label>Budget in Euro</Label>
            <NumberField.Group>
              <NumberField.Input className="num w-full" inputMode="decimal" placeholder="50" />
            </NumberField.Group>
          </NumberField>
          <TextField fullWidth isRequired name="occasion" value={occasion} onChange={setOccasion}>
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

        <ChatAttachmentInput accept=".txt,text/plain" disabled={pending} onFilesSelected={attach}>
          <ChatAttachmentInput.Dropzone
            render={(dropzoneProps) => (
              <div
                {...dropzoneProps}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 shadow-surface focus-within:border-accent data-[dragging]:border-dashed data-[dragging]:border-accent"
              >
                <TextField fullWidth isRequired isDisabled={pending} name="input_text" value={text} onChange={editText}>
                  <Label className="px-1 text-base font-semibold">Was weißt du über die Person?</Label>
                  <TextArea
                    className="max-h-80 min-h-36 resize-none border-0 bg-transparent px-1 shadow-none"
                    maxLength={MAX}
                    placeholder="Wunschliste, WhatsApp-Chat, Notizen, Hobbys – einfach einfügen, Datei hineinziehen oder diktieren."
                    rows={6}
                    variant="secondary"
                  />
                </TextField>
                {file && <ChatAttachment className="self-start" mimeType="text/plain" name={file.name} size={file.size} />}
                <div className="flex flex-wrap items-center gap-2">
                  <ChatAttachmentInput.Trigger
                    render={(triggerProps) => (
                      <Button {...triggerProps} size="sm" variant="outline">
                        Textdatei anhängen
                      </Button>
                    )}
                  />
                  {canDictate && (
                    <Button
                      aria-pressed={listening}
                      isDisabled={pending}
                      size="sm"
                      variant={listening ? "danger-soft" : "outline"}
                      onPress={toggleDictation}
                    >
                      {listening ? "Diktat stoppen" : "Diktieren"}
                    </Button>
                  )}
                  {text.length > MAX * 0.9 && (
                    <span className="num text-xs text-muted" aria-live="polite">
                      {text.length.toLocaleString("de-DE")} / {MAX.toLocaleString("de-DE")}
                    </span>
                  )}
                  <Button className="ml-auto" isPending={pending} type="submit">
                    {pending ? "Agent arbeitet …" : "Geschenk finden"}
                  </Button>
                </div>
              </div>
            )}
          />
        </ChatAttachmentInput>

        {notice && (
          <p className="text-sm text-muted" role="status">
            {notice}
          </p>
        )}
        {pending && <p className="text-sm text-muted">Das kann 10 bis 30 Sekunden dauern.</p>}
        {error && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{error}</Alert.Title>
            </Alert.Content>
          </Alert>
        )}

        <PromptSuggestion>
          <PromptSuggestion.Header>
            <PromptSuggestion.Description>Oder starte mit einem Beispiel</PromptSuggestion.Description>
          </PromptSuggestion.Header>
          <PromptSuggestion.Items>
            {EXAMPLES.map((ex) => (
              <PromptSuggestion.Item
                key={ex.demo}
                aria-pressed={demo === ex.demo}
                isDisabled={pending}
                showEndIcon={false}
                onPress={() => pickExample(ex.demo)}
              >
                {ex.label}
              </PromptSuggestion.Item>
            ))}
          </PromptSuggestion.Items>
        </PromptSuggestion>
      </Form>

      {people.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Deine Personen</h2>
          {people.map(([person, entries]) => (
            <div key={person} className="flex flex-col gap-1">
              <h3 className="font-medium">{person}</h3>
              <ul className="flex flex-col">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 hover:bg-surface-secondary"
                      href={`/result/${entry.id}`}
                    >
                      <Chip color={STATUS[entry.status]?.color} size="sm" variant="soft">
                        {STATUS[entry.status]?.label ?? entry.status}
                      </Chip>
                      <span className="min-w-0 flex-1 basis-40 truncate">{entry.top ?? "Noch keine Empfehlung"}</span>
                      <span className="num text-sm text-muted">
                        {entry.occasion} · {entry.budget_eur} € · {new Date(entry.created_at).toLocaleDateString("de-DE")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Lieber die Person selbst fragen?</Card.Title>
          <Card.Description>
            Du bekommst einen Link, über den die Person ihre Wünsche einträgt. Name, Budget und Anlass kommen von oben.
          </Card.Description>
        </Card.Header>
        {message && (
          <Card.Content>
            <TextField fullWidth value={message} onChange={setMessage}>
              <Label>Nachricht</Label>
              <TextArea rows={5} />
              <Description>Du kannst den Text vor dem Senden anpassen.</Description>
            </TextField>
          </Card.Content>
        )}
        <Card.Footer className="mt-4 flex flex-wrap gap-2">
          <Button isDisabled={!controlsReady} variant={message ? "outline" : "secondary"} onPress={createLink}>
            {message ? "Link neu erstellen" : "Link erstellen"}
          </Button>
          {message && (
            <Button
              onPress={async () => {
                await navigator.clipboard.writeText(message);
                setCopied(true);
              }}
            >
              {copied ? "Kopiert" : "Text kopieren"}
            </Button>
          )}
          {message && canShare && (
            <Button variant="ghost" onPress={() => navigator.share({ text: message }).catch(() => {})}>
              Teilen …
            </Button>
          )}
        </Card.Footer>
      </Card>

      <footer className="text-sm text-muted">
        {BRAND} nutzt Produkt- und Preisdaten von idealo. Die Entscheidung trifft ein Sprachmodell in einem Live-Aufruf; jeder
        Aufruf ist im Trace einsehbar.
      </footer>
    </div>
  );
}
