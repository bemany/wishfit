import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import sampleClarification from './assets/sample.clarification.response.json';
import sampleRecommendation from './assets/sample.response.json';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

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
  buy: { label: 'Kaufen', color: '#15803d' },
  wait: { label: 'Warten', color: '#b45309' },
  alternative: { label: 'Alternative', color: '#1d4ed8' },
};

const eur = (n: number | null) =>
  n == null ? '–' : n.toFixed(2).replace('.', ',') + ' €';

// wishloop://results/{id}
export const idFromUrl = (url: string | null) =>
  url?.match(/results\/([^/?#]+)/)?.[1] ?? null;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function Card({ rec, top }: { rec: Recommendation; top?: boolean }) {
  const action = ACTIONS[rec.action] ?? { label: rec.action, color: '#444' };
  return (
    <View style={[s.card, top && s.cardTop]}>
      <Text style={[s.badge, { backgroundColor: action.color }]}>{action.label}</Text>
      <Text style={s.product}>{rec.product_name}</Text>
      <Text style={s.muted}>Wunsch: {rec.wish}</Text>
      <Text style={s.reason}>{rec.reason}</Text>
      <Row label="Preis" value={eur(rec.price_eur)} />
      <Row label="Versand" value={eur(rec.shipping_eur)} />
      <Row label="Gesamt" value={eur(rec.total_eur)} />
      <Row label="Händler" value={rec.merchant ?? '–'} />
      <Row
        label="Verfügbarkeit"
        value={rec.available == null ? 'unbekannt' : rec.available ? 'verfügbar' : 'nicht verfügbar'}
      />
      <Row label="Lieferung" value={rec.delivery_estimate ?? '–'} />
      <View style={s.chips}>
        {rec.signals.map((sig, i) => (
          <Text key={i} style={s.chip}>
            {sig.label}: {sig.value}
          </Text>
        ))}
      </View>
      {rec.offer_url && (
        <Pressable style={s.button} onPress={() => Linking.openURL(rec.offer_url!)}>
          <Text style={s.buttonText} maxFontSizeMultiplier={1.6}>Zum Angebot</Text>
        </Pressable>
      )}
    </View>
  );
}

function ResultView({ result }: { result: Result }) {
  if (result.status === 'needs_clarification' || !result.top) {
    return (
      <View style={s.card}>
        <Text style={[s.badge, { backgroundColor: '#b45309' }]}>Rückfrage</Text>
        <Text style={s.product}>Wir sind uns noch nicht sicher</Text>
        {result.uncertainty?.reasons.map((r, i) => (
          <Text key={i} style={s.reason}>
            • {r}
          </Text>
        ))}
        <Text style={s.question}>{result.uncertainty?.question}</Text>
      </View>
    );
  }
  return (
    <>
      <Text style={s.section}>Top-Empfehlung</Text>
      <Card rec={result.top} top />
      {result.alternatives.length > 0 && <Text style={s.section}>Alternativen</Text>}
      {result.alternatives.map((rec, i) => (
        <Card key={i} rec={rec} />
      ))}
      <Text style={s.muted}>
        Ergebnis {result.id} · Modell {result.model}
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
      const id = idFromUrl(url);
      if (id) load(id);
    };
    Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>wishloop</Text>
        <Text style={s.muted}>Geschenk-Empfehlung ansehen</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            maxFontSizeMultiplier={1.6}
            value={input}
            onChangeText={setInput}
            placeholder="Ergebnis-ID, z. B. r_abc123"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => load(input)}
          />
          <Pressable style={s.button} onPress={() => load(input)}>
            <Text style={s.buttonText} maxFontSizeMultiplier={1.6}>Laden</Text>
          </Pressable>
        </View>
        <View style={s.inputRow}>
          <Pressable style={s.secondary} onPress={() => showSample(sampleRecommendation)}>
            <Text style={s.secondaryText} maxFontSizeMultiplier={1.6}>Beispiel: Empfehlung</Text>
          </Pressable>
          <Pressable style={s.secondary} onPress={() => showSample(sampleClarification)}>
            <Text style={s.secondaryText} maxFontSizeMultiplier={1.6}>Beispiel: Rückfrage</Text>
          </Pressable>
        </View>

        {loading && <ActivityIndicator style={s.spinner} />}
        {error && (
          <View style={[s.card, s.errorCard]}>
            <Text style={s.product}>Das hat nicht geklappt</Text>
            <Text style={s.reason}>{error}</Text>
            <Pressable style={s.button} onPress={() => load(lastId)}>
              <Text style={s.buttonText} maxFontSizeMultiplier={1.6}>Erneut versuchen</Text>
            </Pressable>
          </View>
        )}
        {result && <ResultView result={result} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f5f1' },
  content: { padding: 16, paddingTop: 56, gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: '#111' },
  muted: { color: '#666', fontSize: 13 },
  section: { fontSize: 18, fontWeight: '700', color: '#111', marginTop: 8 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondary: {
    flex: 1,
    borderColor: '#111',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryText: { color: '#111', fontWeight: '600', fontSize: 13, textAlign: 'center' },
  spinner: { marginTop: 24 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 8 },
  cardTop: { borderColor: '#15803d', borderWidth: 2 },
  errorCard: { borderColor: '#b91c1c', borderWidth: 1 },
  badge: {
    alignSelf: 'flex-start',
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  product: { fontSize: 18, fontWeight: '700', color: '#111' },
  reason: { fontSize: 15, lineHeight: 21, color: '#222' },
  question: { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { color: '#666', fontSize: 14 },
  rowValue: { color: '#111', fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    backgroundColor: '#eef2ff',
    color: '#1e3a8a',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
