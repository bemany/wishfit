import './global.css';

import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Alert } from 'heroui-native/alert';
import { Button } from 'heroui-native/button';
import { Card } from 'heroui-native/card';
import { Chip } from 'heroui-native/chip';
import { Input } from 'heroui-native/input';
import { Label } from 'heroui-native/label';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { Skeleton } from 'heroui-native/skeleton';
import { Spinner } from 'heroui-native/spinner';
import { Surface } from 'heroui-native/surface';
import { TextField } from 'heroui-native/text-field';

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
  buy: { label: 'Jetzt kaufen', color: 'success' },
  wait: { label: 'Besser warten', color: 'warning' },
  alternative: { label: 'Alternative', color: 'default' },
} as const;

const eur = (n: number | null) =>
  n == null ? '–' : n.toFixed(2).replace('.', ',') + ' €';

// wishloop://results/{id}
export const idFromUrl = (url: string | null) =>
  url?.match(/results\/([^/?#]+)/)?.[1] ?? null;

const tabular = { fontVariant: ['tabular-nums' as const] };

// The idealo data that carries the decision: always visible, never collapsed
function Signals({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null;
  return (
    <Surface variant="secondary" className="gap-2 rounded-2xl p-3">
      <Text className="text-xs font-medium text-muted">Datensignale von idealo · {signals.length}</Text>
      {signals.map((sig, i) => (
        <View key={i} className="gap-0.5 border-t border-border pt-2">
          <Text className="text-xs text-muted">{sig.label}</Text>
          <Text className="text-sm font-semibold text-foreground" style={tabular}>
            {sig.value}
          </Text>
        </View>
      ))}
    </Surface>
  );
}

function RecCard({ rec, top }: { rec: Recommendation; top?: boolean }) {
  const action = ACTIONS[rec.action] ?? { label: rec.action, color: 'default' as const };
  const meta = [
    rec.merchant,
    rec.delivery_estimate && `Lieferung in ${rec.delivery_estimate}`,
    rec.available == null ? null : rec.available ? 'verfügbar' : 'nicht verfügbar',
  ].filter(Boolean);
  return (
    <Card className={top ? 'gap-3 border-2 border-accent' : 'gap-3'}>
      {top && <Text className="text-xs font-medium text-muted">Top-Empfehlung</Text>}
      <Chip variant="soft" color={action.color} size="sm" className="self-start">
        <Chip.Label>{action.label}</Chip.Label>
      </Chip>
      <View className="gap-1">
        <Text className="text-lg font-semibold text-foreground">{rec.product_name}</Text>
        <Text className="text-xs text-muted">Wunsch: {rec.wish}</Text>
      </View>
      <Text className="text-base leading-6 text-foreground">{rec.reason}</Text>
      <View className="gap-0.5">
        <Text className={top ? 'text-3xl font-bold text-foreground' : 'text-2xl font-bold text-foreground'} style={tabular}>
          {eur(rec.total_eur)}
        </Text>
        <Text className="text-xs text-muted" style={tabular}>
          {eur(rec.price_eur)} + {eur(rec.shipping_eur)} Versand
        </Text>
        {meta.length > 0 && <Text className="text-xs text-muted">{meta.join(' · ')}</Text>}
      </View>
      <Signals signals={rec.signals} />
      {rec.offer_url && (
        <Button
          variant={top ? 'primary' : 'secondary'}
          className="min-h-11"
          onPress={() => Linking.openURL(rec.offer_url!)}
        >
          <Button.Label maxFontSizeMultiplier={1.6}>Zum Angebot</Button.Label>
        </Button>
      )}
    </Card>
  );
}

function ResultView({ result }: { result: Result }) {
  if (result.status === 'needs_clarification' || !result.top) {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content className="gap-2">
          <Alert.Title>Ich bin mir nicht sicher</Alert.Title>
          {result.uncertainty?.reasons.map((r, i) => (
            <Alert.Description key={i}>• {r}</Alert.Description>
          ))}
          <Text className="text-lg font-semibold text-foreground">{result.uncertainty?.question}</Text>
        </Alert.Content>
      </Alert>
    );
  }
  return (
    <>
      <RecCard rec={result.top} top />
      {result.alternatives.length > 0 && (
        <Text className="mt-2 text-xl font-semibold text-foreground">Alternativen</Text>
      )}
      {result.alternatives.map((rec, i) => (
        <RecCard key={i} rec={rec} />
      ))}
      <Text className="text-xs text-muted">
        Ergebnis {result.id} · entschieden von {result.model} über die Nebius Token Factory
      </Text>
    </>
  );
}

export default function App() {
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <SafeAreaView className="flex-1 bg-background">
          <StatusBar style="dark" />
          <ScrollView contentContainerClassName="gap-3 p-4 pt-14" keyboardShouldPersistTaps="handled">
            <Text className="text-xl font-bold text-foreground">{BRAND}</Text>
            <Text className="text-3xl font-bold text-foreground">Das beste Geschenk im Budget, mit Beleg.</Text>
            <TextField>
              <Label>Ergebnis-Code</Label>
              <View className="flex-row items-center gap-2">
                <Input
                  className="min-h-11 flex-1"
                  maxFontSizeMultiplier={1.6}
                  value={input}
                  onChangeText={setInput}
                  placeholder="z. B. r_abc123"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={() => load(input)}
                />
                <Button className="min-h-11" onPress={() => load(input)}>
                  <Button.Label maxFontSizeMultiplier={1.6}>Öffnen</Button.Label>
                </Button>
              </View>
            </TextField>
            <View className="flex-row gap-2">
              <Button variant="secondary" size="sm" className="min-h-11 flex-1" onPress={() => showSample(sampleRecommendation)}>
                <Button.Label maxFontSizeMultiplier={1.6}>Beispiel: Empfehlung</Button.Label>
              </Button>
              <Button variant="secondary" size="sm" className="min-h-11 flex-1" onPress={() => showSample(sampleClarification)}>
                <Button.Label maxFontSizeMultiplier={1.6}>Beispiel: Rückfrage</Button.Label>
              </Button>
            </View>

            {loading && (
              <View className="gap-3 pt-2">
                <View className="flex-row items-center gap-2">
                  <Spinner size="sm" />
                  <Text className="text-sm text-muted">Ergebnis wird geladen …</Text>
                </View>
                <Skeleton className="h-40 rounded-2xl" />
              </View>
            )}
            {error && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content className="gap-2">
                  <Alert.Title>Das hat nicht geklappt</Alert.Title>
                  <Alert.Description>{error}</Alert.Description>
                  <Button variant="secondary" className="min-h-11 self-start" onPress={() => load(lastId)}>
                    <Button.Label maxFontSizeMultiplier={1.6}>Erneut versuchen</Button.Label>
                  </Button>
                </Alert.Content>
              </Alert>
            )}
            {result && <ResultView result={result} />}
          </ScrollView>
        </SafeAreaView>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
