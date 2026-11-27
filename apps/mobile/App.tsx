import './global.css';

import { File, Paths } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from 'heroui-native/button';
import { Chip } from 'heroui-native/chip';
import { InputGroup } from 'heroui-native/input-group';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { Input } from 'heroui-native/input';
import { Label } from 'heroui-native/label';
import { Skeleton } from 'heroui-native/skeleton';
import { Spinner } from 'heroui-native/spinner';
import { TextArea } from 'heroui-native/text-area';
import { TextField } from 'heroui-native/text-field';

import sampleChatRequest from './assets/sample.chat.request.json';
import sampleClarification from './assets/sample.clarification.response.json';
import sampleRecommendation from './assets/sample.response.json';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// Working title, the name vote is still running: change it here only
const BRAND = 'Wishfit';

// Mirrors docs/api.md
type Signal = { type: string; label: string; value: string };
type Recommendation = {
  wish: string;
  product_name: string;
  action: 'buy' | 'wait' | 'alternative';
  reason: string;
  price_eur: number | null;
  shipping_eur: number | null;
  total_eur: number | null;
  merchant: string | null;
  offer_url: string | null;
  image_url: string | null;
  available: boolean | null;
  delivery_estimate: string | null;
  signals: Signal[];
};
type Understood = { summary: string; interests: string[]; candidates: { idea: string; why: string }[] };
type Result = {
  id: string;
  status: 'recommendation' | 'needs_clarification' | 'ideas_only';
  understood?: Understood | null;
  top: Recommendation | null;
  alternatives: Recommendation[];
  uncertainty: { reasons: string[]; question: string } | null;
  model: string;
};

const ACTIONS = {
  buy: { label: 'Jetzt kaufen', color: 'success', icon: 'check' },
  wait: { label: 'Besser warten', color: 'warning', icon: 'clock' },
  alternative: { label: 'Alternative', color: 'default', icon: 'swap' },
} as const;

const eur = (n: number | null) =>
  n == null ? '–' : n.toFixed(2).replace('.', ',') + ' €';

// wishloop://results/{id}
export const idFromUrl = (url: string | null) =>
  url?.match(/results\/([^/?#]+)/)?.[1] ?? null;

const tabular = { fontVariant: ['tabular-nums' as const] };

// Icon strokes need real colour values; these mirror the theme in global.css
const INK = '#18181b';
const MUTED = '#71717a';
const ACCENT = '#2947f5';
const TONE = { default: MUTED, accent: ACCENT, success: '#0b6b3c', warning: '#8a4f00', danger: '#b42318' };

const ICONS = {
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  send: 'M12 19V5M5 12l7-7 7 7',
  gift: 'M4 12v8h16v-8M3 8h18v4H3zM12 8v12M12 8S10.5 3.5 8 4.5 9 8 12 8zM12 8s1.5-4.5 4-3.500S15 8 12 8z',
  box: 'M3.5 7.500L12 3l8.5 4.500v9L12 21l-8.5-4.500zM3.5 7.500L12 12l8.5-4.500M12 12v9',
  check: 'M5 12.500l4.5 4.500L19 7.5',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  swap: 'M4 8h15l-3.5-3.500M20 16H5l3.5 3.5',
  question: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.500a2.5 2.5 0 114 2c-1 .700-1.5 1.2-1.5 2.300M12 17v.1',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.1',
  price_history: 'M3 7l6 6 4-4 8 8M21 12v5h-5',
  availability: 'M4 4h16v16H4zM8 12.500l3 3 5.5-6.5',
  budget: 'M3 7h18v11H3zM3 11h18M7 15h3',
  category: 'M3 12.500V4h8.500l9 9-8.5 8.500z',
  offers: 'M12 3l9 4.5-9 4.5-9-4.500zM3 12l9 4.5 9-4.500M3 16.500L12 21l9-4.5',
} as const;
type IconName = keyof typeof ICONS;

function Icon({ name, color = INK, size = 20 }: { name: IconName; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={ICONS[name]} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Round icon tile that leads every card and row
function Avatar({ name, tone = 'default' }: { name: IconName; tone?: keyof typeof TONE }) {
  return (
    <View className="size-11 items-center justify-center rounded-full bg-default">
      <Icon name={name} color={TONE[tone]} />
    </View>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="mt-2 flex-row items-baseline justify-between">
      <Text className="text-lg font-medium text-muted">{title}</Text>
      {hint && <Text className="text-sm text-muted">{hint}</Text>}
    </View>
  );
}

// The idealo data that carries the decision: one tile per signal, always visible
function SignalTiles({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null;
  return (
    <>
      <SectionTitle title="Datensignale von idealo" hint={String(signals.length)} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4" contentContainerClassName="gap-3 px-4">
        {signals.map((sig, i) => (
          <View key={i} className="w-48 gap-3 rounded-3xl bg-surface p-4">
            <Avatar name={sig.type in ICONS ? (sig.type as IconName) : 'box'} tone="accent" />
            <View className="gap-1">
              <Text className="text-sm text-muted">{sig.label}</Text>
              <Text className="text-base font-semibold text-foreground" style={tabular}>
                {sig.value}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function TopCard({ rec }: { rec: Recommendation }) {
  const action = ACTIONS[rec.action] ?? ACTIONS.alternative;
  const sub = [rec.merchant, rec.delivery_estimate && `Lieferung in ${rec.delivery_estimate}`].filter(Boolean).join(' · ');
  return (
    <View className="gap-4 rounded-3xl bg-surface p-5">
      <View className="flex-row items-center gap-3">
        <Avatar name="gift" tone="accent" />
        <View className="flex-1 gap-0.5">
          <Text className="text-lg font-semibold text-foreground">{rec.product_name}</Text>
          {sub !== '' && <Text className="text-sm text-muted">{sub}</Text>}
        </View>
      </View>
      <View className="flex-row items-end justify-between gap-3">
        <View className="gap-1">
          <Text className="text-4xl font-bold text-foreground" style={tabular}>
            {eur(rec.total_eur)}
          </Text>
          <Text className="text-sm text-muted" style={tabular}>
            {eur(rec.price_eur)} + {eur(rec.shipping_eur)} Versand
          </Text>
        </View>
        <Chip variant="soft" color={action.color}>
          <Chip.Label>{action.label}</Chip.Label>
        </Chip>
      </View>
      <Text className="text-base leading-6 text-foreground">{rec.reason}</Text>
      {rec.offer_url && (
        <Button className="min-h-12" onPress={() => Linking.openURL(rec.offer_url!)}>
          <Button.Label maxFontSizeMultiplier={1.6}>Zum Angebot</Button.Label>
        </Button>
      )}
    </View>
  );
}

function AlternativeRow({ rec }: { rec: Recommendation }) {
  const action = ACTIONS[rec.action] ?? ACTIONS.alternative;
  return (
    <Pressable
      className="gap-3 rounded-3xl bg-surface p-4 active:opacity-70"
      disabled={!rec.offer_url}
      accessibilityRole="link"
      onPress={() => rec.offer_url && Linking.openURL(rec.offer_url)}
    >
      <View className="flex-row items-center gap-3">
        <Avatar name={action.icon} tone={action.color} />
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold text-foreground">{rec.product_name}</Text>
          <Text className="text-sm text-muted">{action.label}</Text>
        </View>
        <Text className="text-base font-semibold text-foreground" style={tabular}>
          {eur(rec.total_eur)}
        </Text>
        {rec.offer_url && <Icon name="chevron" color={MUTED} size={18} />}
      </View>
      <Text className="text-sm leading-5 text-muted">{rec.reason}</Text>
      {rec.signals.map((sig, i) => (
        <View key={i} className="flex-row justify-between gap-3">
          <Text className="text-sm text-muted">{sig.label}</Text>
          <Text className="shrink text-right text-sm font-medium text-foreground" style={tabular}>
            {sig.value}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

function Clarification({ result }: { result: Result }) {
  return (
    <>
      <View className="items-center gap-3 px-4 pt-6">
        <View className="size-16 items-center justify-center rounded-full bg-default">
          <Icon name="question" color={TONE.warning} size={28} />
        </View>
        <Text className="text-center text-2xl font-semibold text-foreground">Ich bin mir nicht sicher</Text>
        <Text className="text-center text-base text-muted">Bevor ich etwas empfehle, brauche ich eine Antwort.</Text>
      </View>
      <View className="gap-2 rounded-3xl bg-surface p-5">
        <Text className="text-sm text-muted">Rückfrage</Text>
        <Text className="text-xl font-semibold leading-7 text-foreground">{result.uncertainty?.question}</Text>
      </View>
      <SectionTitle title="Was unklar ist" />
      {result.uncertainty?.reasons.map((r, i) => (
        <View key={i} className="flex-row items-center gap-3 rounded-3xl bg-surface p-4">
          <Avatar name="alert" tone="warning" />
          <Text className="flex-1 text-base leading-6 text-foreground">{r}</Text>
        </View>
      ))}
    </>
  );
}

// What the agent took from the free-text input, shown before any product
function UnderstoodBlock({ understood }: { understood: Understood }) {
  return (
    <>
      <SectionTitle title="Das habe ich verstanden" />
      <View className="gap-4 rounded-3xl bg-surface p-5">
        <Text className="text-base leading-6 text-foreground">{understood.summary}</Text>
        {understood.interests.length > 0 && (
          <View className="flex-row flex-wrap gap-2">
            {understood.interests.map((interest, i) => (
              <Chip key={i} variant="soft" color="accent">
                <Chip.Label>{interest}</Chip.Label>
              </Chip>
            ))}
          </View>
        )}
      </View>
      {understood.candidates.map((c, i) => (
        <View key={i} className="flex-row items-center gap-3 rounded-3xl bg-surface p-4">
          <Avatar name="gift" tone="accent" />
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-semibold text-foreground">{c.idea}</Text>
            <Text className="text-sm leading-5 text-muted">{c.why}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

function ResultView({ result }: { result: Result }) {
  const understood = result.understood ? <UnderstoodBlock understood={result.understood} /> : null;
  if (result.status === 'ideas_only') {
    return (
      <>
        {understood}
        <SectionTitle title="Noch keine Preisdaten" />
        {result.uncertainty?.reasons.map((r, i) => (
          <View key={i} className="flex-row items-center gap-3 rounded-3xl bg-surface p-4">
            <Avatar name="alert" tone="warning" />
            <Text className="flex-1 text-base leading-6 text-foreground">{r}</Text>
          </View>
        ))}
      </>
    );
  }
  if (result.status === 'needs_clarification' || !result.top) {
    return (
      <>
        <Clarification result={result} />
        {understood}
      </>
    );
  }
  return (
    <>
      {understood}
      <SectionTitle title="Top-Empfehlung" />
      <TopCard rec={result.top} />
      <SignalTiles signals={result.top.signals} />
      {result.alternatives.length > 0 && (
        <SectionTitle title="Alternativen" hint={String(result.alternatives.length)} />
      )}
      {result.alternatives.map((rec, i) => (
        <AlternativeRow key={i} rec={rec} />
      ))}
      <Text className="px-1 text-xs text-muted">
        Ergebnis {result.id} · entschieden von {result.model} über die Nebius Token Factory
      </Text>
    </>
  );
}

const STEPS = [
  { label: 'Eingabe verstehen', icon: 'question' },
  { label: 'idealo durchsuchen', icon: 'search' },
  { label: 'Entscheiden', icon: 'gift' },
] as const;

// No real progress from the backend: the steps simply appear one after another
function LoadingSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), 6000);
    return () => clearInterval(timer);
  }, []);
  return (
    <View className="gap-3">
      <View className="items-center gap-2 px-4 py-8">
        <Text className="text-center text-2xl font-semibold text-foreground">Ich suche das beste Geschenk</Text>
        <Text className="text-center text-base text-muted">Das dauert etwa 20 Sekunden.</Text>
      </View>
      {STEPS.slice(0, step + 1).map((s, i) => (
        <View key={i} className="flex-row items-center gap-3 rounded-3xl bg-surface p-4">
          <Avatar name={i < step ? 'check' : s.icon} tone={i < step ? 'success' : 'accent'} />
          <Text className="flex-1 text-base font-semibold text-foreground">{s.label}</Text>
          {i === step && <Spinner size="sm" />}
        </View>
      ))}
    </View>
  );
}

// Everything known about one recipient. `context` grows with every request and follow-up
// and is sent along again next time, so the agent builds on the whole history.
// One-tap follow-ups under a result
const QUICK_REPLIES = ['Günstiger', 'Etwas ganz anderes', 'Das hat die Person schon'];

type Person = { name: string; occasion: string; budget: number; context: string[]; results: Result[] };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// expo-file-system ships with the expo package, so this needs no extra native module
const peopleFile = () => new File(Paths.document, 'people.json');
const loadPeople = (): Person[] => {
  try {
    const file = peopleFile();
    return file.exists ? JSON.parse(file.textSync()) : [];
  } catch {
    return [];
  }
};
const savePeople = (people: Person[]) => {
  try {
    peopleFile().write(JSON.stringify(people));
  } catch {
    // the list still works for this session
  }
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <HeroUINativeProvider>
          <Screen />
        </HeroUINativeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Screen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [occasion, setOccasion] = useState('');
  const [about, setAbout] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [people, setPeople] = useState<Person[]>(loadPeople);
  // Every piece of text sent in the current conversation, earlier context of the person included
  const [thread, setThread] = useState<string[]>([]);
  const [lastAction, setLastAction] = useState<'ask' | 'load'>('load');
  // Follow-up messages typed under a result; each one re-runs the agent with everything said so far
  const [notes, setNotes] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState('');
  const [chat, setChat] = useState(false);

  const [input, setInput] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState('');

  const known = people.find((p) => sameName(p.name, name || 'Ohne Namen'));

  const ask = async (pieces: string[], said: string[]) => {
    const budgetEur = Number(budget.replace(',', '.'));
    if (pieces.length === 0 || !occasion.trim() || !(budgetEur > 0)) {
      setFormError('Bitte gib Budget, Anlass und etwas über die Person an.');
      return;
    }
    setFormError(null);
    setThread(pieces);
    setNotes(said);
    setLastAction('ask');
    setAsking(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // ponytail: no conversation endpoint, so the whole history of the person goes in as one text
          input_text: pieces.join('\n\n'),
          budget_eur: budgetEur,
          occasion: occasion.trim(),
          recipient_name: name.trim() || null,
        }),
      });
      if (!res.ok) {
        const detail = await res
          .json()
          .then((b) => (typeof b?.detail === 'string' ? b.detail : null))
          .catch(() => null);
        setError(detail ?? `Der Server antwortet mit Fehler ${res.status}.`);
      } else {
        const r: Result = await res.json();
        const who = name.trim() || 'Ohne Namen';
        const earlier = people.find((p) => sameName(p.name, who));
        const next = [
          { name: who, occasion: occasion.trim(), budget: budgetEur, context: pieces, results: [r, ...(earlier?.results ?? [])].slice(0, 5) },
          ...people.filter((p) => !sameName(p.name, who)),
        ];
        setPeople(next);
        savePeople(next);
        setResult(r);
        setChat(true);
        setAbout('');
      }
    } catch {
      // network failure or unparsable body
      setError(`Backend nicht erreichbar (${API_URL}).`);
    } finally {
      setAsking(false);
    }
  };

  // New request from the form: what is already known about the person comes first
  const askFromForm = () => ask([...(known?.context ?? []), about.trim()].filter(Boolean), []);

  const openPerson = (p: Person) => {
    setName(p.name);
    setBudget(String(p.budget));
    setOccasion(p.occasion);
    setThread(p.context);
    setNotes([]);
    setError(null);
    setResult(p.results[0] ?? null);
    setChat(true);
  };

  const sendFollowUp = (quick?: string) => {
    const msg = (quick ?? followUp).trim();
    if (!msg) return;
    setFollowUp('');
    ask([...thread, `Nachtrag: ${msg}`], [...notes, msg]);
  };

  const fillExample = () => {
    setName(sampleChatRequest.recipient_name);
    setBudget(String(sampleChatRequest.budget_eur));
    setOccasion(sampleChatRequest.occasion);
    setAbout(sampleChatRequest.input_text);
    setFormError(null);
  };

  const load = async (id: string) => {
    id = id.trim();
    if (!id) return;
    setInput(id);
    setLastId(id);
    setLastAction('load');
    setChat(false);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/results/${encodeURIComponent(id)}`);
      if (res.status === 404) setError(`Ergebnis „${id}“ wurde nicht gefunden.`);
      else if (!res.ok) setError(`Der Server antwortet mit Fehler ${res.status}.`);
      else setResult(await res.json());
    } catch {
      // network failure or unparsable body
      setError(`Backend nicht erreichbar (${API_URL}).`);
    } finally {
      setLoading(false);
    }
  };

  // Back to the form; what was typed stays so it can be adjusted
  const reset = () => {
    setResult(null);
    setError(null);
  };

  const showSample = (sample: unknown) => {
    setError(null);
    setChat(false);
    setResult(sample as Result);
  };

  // React to every URL event, so reopening the same link reloads it too
  useEffect(() => {
    const open = (url?: string | null) => {
      const id = idFromUrl(url ?? null);
      if (id) load(id);
    };
    Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => sub.remove();
  }, []);

  const view = asking ? 'asking' : loading ? 'loading' : error ? 'error' : result ? 'result' : 'form';
  const hasBar = view === 'form' || (view === 'result' && chat);

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <View className="min-h-11 flex-row items-center justify-between px-4 py-2">
        <Text className="text-2xl font-bold text-foreground">{BRAND}</Text>
        {(view === 'result' || view === 'error') && (
          <Button variant="tertiary" isIconOnly className="size-11" accessibilityLabel="Schließen" onPress={reset}>
            <Icon name="close" />
          </Button>
        )}
      </View>
      <ScrollView
        contentContainerClassName="gap-3 px-4 pt-2"
        contentContainerStyle={{ paddingBottom: insets.bottom + (view === 'result' && chat ? 148 : hasBar ? 104 : 24) }}
        keyboardShouldPersistTaps="handled"
      >
        {view === 'form' && (
          <>
            <Text className="pb-1 text-3xl font-bold text-foreground">Für wen suchst du ein Geschenk?</Text>
            <View className="gap-4 rounded-3xl bg-surface p-5">
              <TextField>
                <Label>Für wen?</Label>
                <Input variant="secondary" maxFontSizeMultiplier={1.6} value={name} onChangeText={setName} placeholder="z. B. Mara" />
              </TextField>
              <View className="flex-row gap-3">
                <TextField className="flex-1">
                  <Label>Budget in Euro</Label>
                  <Input
                    variant="secondary"
                    maxFontSizeMultiplier={1.6}
                    keyboardType="decimal-pad"
                    value={budget}
                    onChangeText={setBudget}
                    placeholder="60"
                  />
                </TextField>
                <TextField className="flex-1">
                  <Label>Anlass</Label>
                  <Input variant="secondary" maxFontSizeMultiplier={1.6} value={occasion} onChangeText={setOccasion} placeholder="Geburtstag" />
                </TextField>
              </View>
              <TextField>
                <Label>Was weißt du über die Person?</Label>
                <TextArea
                  variant="secondary"
                  className="max-h-56 min-h-36"
                  maxFontSizeMultiplier={1.6}
                  value={about}
                  onChangeText={setAbout}
                  placeholder="Wunschliste, WhatsApp-Chat oder Notizen einfügen. Oder über das Mikrofon der Tastatur einfach diktieren."
                />
              </TextField>
              {known && (
                <Text className="text-sm text-muted">
                  Über {known.name} weiß ich schon {known.context.length} {known.context.length === 1 ? 'Eintrag' : 'Einträge'}. Was du jetzt schreibst, kommt dazu.
                </Text>
              )}
              {formError && <Text className="text-sm text-danger">{formError}</Text>}
              <Button variant="secondary" className="min-h-11" onPress={fillExample}>
                <Button.Label maxFontSizeMultiplier={1.6}>Beispiel einfügen</Button.Label>
              </Button>
            </View>

            {people.length > 0 && <SectionTitle title="Deine Personen" hint={String(people.length)} />}
            {people.map((p, i) => (
              <Pressable
                key={i}
                className="flex-row items-center gap-3 rounded-3xl bg-surface p-4 active:opacity-70"
                accessibilityRole="button"
                onPress={() => openPerson(p)}
              >
                <Avatar name="gift" tone="accent" />
                <View className="flex-1 gap-0.5">
                  <Text className="text-base font-semibold text-foreground">{p.name}</Text>
                  <Text className="text-sm text-muted" style={tabular}>
                    {p.occasion} · {eur(p.budget)} · {p.context.length} {p.context.length === 1 ? 'Eintrag' : 'Einträge'}
                  </Text>
                </View>
                <Icon name="chevron" color={MUTED} size={18} />
              </Pressable>
            ))}

            <SectionTitle title="Ergebnis per Code öffnen" />
            <InputGroup>
              <InputGroup.Prefix>
                <Icon name="search" color={MUTED} />
              </InputGroup.Prefix>
              <InputGroup.Input
                className="min-h-12"
                maxFontSizeMultiplier={1.6}
                accessibilityLabel="Ergebnis-Code"
                value={input}
                onChangeText={setInput}
                placeholder="Ergebnis-Code, z. B. r_abc123"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={() => load(input)}
              />
            </InputGroup>
            <View className="flex-row gap-2">
              <Button variant="tertiary" size="sm" className="min-h-11 flex-1" onPress={() => showSample(sampleRecommendation)}>
                <Button.Label maxFontSizeMultiplier={1.6}>Beispiel: Empfehlung</Button.Label>
              </Button>
              <Button variant="tertiary" size="sm" className="min-h-11 flex-1" onPress={() => showSample(sampleClarification)}>
                <Button.Label maxFontSizeMultiplier={1.6}>Beispiel: Rückfrage</Button.Label>
              </Button>
            </View>
          </>
        )}

        {view === 'asking' && <LoadingSteps />}
        {view === 'loading' && (
          <View className="gap-3 pt-2">
            <Skeleton className="h-44 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
          </View>
        )}
        {view === 'error' && (
          <View className="items-center gap-3 px-4 pt-10">
            <View className="size-16 items-center justify-center rounded-full bg-default">
              <Icon name="alert" color={TONE.danger} size={28} />
            </View>
            <Text className="text-center text-2xl font-semibold text-foreground">Das hat nicht geklappt</Text>
            <Text className="text-center text-base text-muted">{error}</Text>
            <Button variant="secondary" className="mt-2 min-h-11" onPress={() => (lastAction === 'ask' ? ask(thread, notes) : load(lastId))}>
              <Button.Label maxFontSizeMultiplier={1.6}>Erneut versuchen</Button.Label>
            </Button>
          </View>
        )}
        {view === 'result' && result && (
          <>
            {notes.map((n, i) => (
              <View key={i} className="max-w-[85%] self-end rounded-3xl bg-accent px-4 py-3">
                <Text className="text-base leading-6 text-accent-foreground">{n}</Text>
              </View>
            ))}
            <ResultView result={result} />
          </>
        )}
      </ScrollView>
      {hasBar && (
        <View className="absolute inset-x-0 bottom-0 bg-background px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          {view === 'form' ? (
            <Button size="lg" className="min-h-14" onPress={askFromForm}>
              <Button.Label maxFontSizeMultiplier={1.6}>Geschenk finden</Button.Label>
            </Button>
          ) : (
            <View className="gap-2">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-2">
                {QUICK_REPLIES.map((q) => (
                  <Button key={q} variant="secondary" size="sm" className="min-h-11" onPress={() => sendFollowUp(q)}>
                    <Button.Label maxFontSizeMultiplier={1.6}>{q}</Button.Label>
                  </Button>
                ))}
              </ScrollView>
              <View className="flex-row items-center gap-2">
                <Input
                  className="min-h-12 flex-1"
                  maxFontSizeMultiplier={1.6}
                  accessibilityLabel="Nachricht an den Agenten"
                  value={followUp}
                  onChangeText={setFollowUp}
                  placeholder="Weiter schreiben …"
                  returnKeyType="send"
                  onSubmitEditing={() => sendFollowUp()}
                />
                <Button isIconOnly className="size-12" accessibilityLabel="Senden" onPress={() => sendFollowUp()}>
                  <Icon name="send" color="#ffffff" />
                </Button>
              </View>
            </View>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
