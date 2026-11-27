import './global.css';

import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from 'heroui-native/button';
import { Chip } from 'heroui-native/chip';
import { InputGroup } from 'heroui-native/input-group';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { Skeleton } from 'heroui-native/skeleton';

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
type Result = {
  id: string;
  status: 'recommendation' | 'needs_clarification';
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
    </View>
  );
}

function AlternativeRow({ rec }: { rec: Recommendation }) {
  const action = ACTIONS[rec.action] ?? ACTIONS.alternative;
  const signals = rec.signals.map((s) => s.value).join(' · ');
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
      {signals !== '' && (
        <Text className="text-sm font-medium text-foreground" style={tabular}>
          {signals}
        </Text>
      )}
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

function ResultView({ result }: { result: Result }) {
  if (result.status === 'needs_clarification' || !result.top) return <Clarification result={result} />;
  return (
    <>
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
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState('');

  const load = async (id: string) => {
    id = id.trim();
    if (!id) return;
    setInput(id);
    setLastId(id);
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

  const reset = () => {
    setResult(null);
    setError(null);
    setInput('');
  };

  const showSample = (sample: unknown) => {
    setError(null);
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

  const offer = result?.top?.offer_url;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <View className="min-h-11 flex-row items-center justify-between px-4 py-2">
        <Text className="text-2xl font-bold text-foreground">{BRAND}</Text>
        {(result || error) && (
          <Button variant="tertiary" isIconOnly className="size-11" accessibilityLabel="Schließen" onPress={reset}>
            <Icon name="close" />
          </Button>
        )}
      </View>
      <ScrollView
        contentContainerClassName="grow gap-3 px-4 pt-2"
        contentContainerStyle={{ paddingBottom: insets.bottom + (offer ? 104 : 24) }}
        keyboardShouldPersistTaps="handled"
      >
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

        {loading && (
          <View className="gap-3 pt-2">
            <Skeleton className="h-44 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
          </View>
        )}
        {error && (
          <View className="items-center gap-3 px-4 pt-10">
            <View className="size-16 items-center justify-center rounded-full bg-default">
              <Icon name="alert" color={TONE.danger} size={28} />
            </View>
            <Text className="text-center text-2xl font-semibold text-foreground">Das hat nicht geklappt</Text>
            <Text className="text-center text-base text-muted">{error}</Text>
            <Button variant="secondary" className="mt-2 min-h-11" onPress={() => load(lastId)}>
              <Button.Label maxFontSizeMultiplier={1.6}>Erneut versuchen</Button.Label>
            </Button>
          </View>
        )}
        {result && <ResultView result={result} />}
        {!result && !error && !loading && (
          <View className="flex-1 items-center justify-center gap-3 px-4 pb-16">
            <View className="size-16 items-center justify-center rounded-full bg-default">
              <Icon name="gift" color={ACCENT} size={28} />
            </View>
            <Text className="text-center text-2xl font-semibold text-foreground">Noch kein Ergebnis geöffnet</Text>
            <Text className="text-center text-base text-muted">
              Tippe auf deinen Ergebnis-Link oder gib den Code oben ein. Zum Ausprobieren gibt es zwei Beispiele.
            </Text>
            <View className="mt-2 gap-2 self-stretch">
              <Button variant="secondary" className="min-h-12" onPress={() => showSample(sampleRecommendation)}>
                <Button.Label maxFontSizeMultiplier={1.6}>Beispiel: Empfehlung</Button.Label>
              </Button>
              <Button variant="secondary" className="min-h-12" onPress={() => showSample(sampleClarification)}>
                <Button.Label maxFontSizeMultiplier={1.6}>Beispiel: Rückfrage</Button.Label>
              </Button>
            </View>
          </View>
        )}
      </ScrollView>
      {offer && (
        <View className="absolute inset-x-0 bottom-0 bg-background px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <Button size="lg" className="min-h-14" onPress={() => Linking.openURL(offer)}>
            <Button.Label maxFontSizeMultiplier={1.6}>Zum Angebot · {eur(result!.top!.total_eur)}</Button.Label>
          </Button>
        </View>
      )}
    </View>
  );
}
