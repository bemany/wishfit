import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import sampleChat from '../assets/sample.chat.request.json';
import { lastResult, sayOf, type Person, type Recommendation, type Result } from './api';
import { C, F, TAG_COLORS, eur } from './theme';
import { Body, Btn, Bubble, Line, Mono, Name, Pill, Round, Say, Stamp, Stamps, Tag, TopBar, s } from './ui';

const ACTION = { buy: 'Buy now', wait: 'Better wait', alternative: 'Alternative' } as const;
const pad = { paddingHorizontal: 16 };
const metaOf = (p: Person) => `${p.occasion} · ${eur(p.budget)}`;

// 1 People: the stack of tags
export function People({ brand, people, onOpen, onAdd }: { brand: string; people: Person[]; onOpen: (p: Person) => void; onAdd: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={[pad, { gap: 16, paddingBottom: insets.bottom + 24 }]}>
      <TopBar left={<Text style={s.word}>{brand.toLowerCase()}</Text>} right={<Round icon="plus" label="Add someone" ink onPress={onAdd} />} />
      <Text style={s.display}>Who gets a gift next?</Text>
      <View style={{ marginTop: 4 }}>
        {people.map((p, i) => {
          const r = lastResult(p);
          const status = !r ? 'New' : r.status === 'recommendation' ? 'Pick ready' : r.status === 'needs_clarification' ? '1 question' : 'Ideas';
          const last = i === people.length - 1;
          return (
            <Tag key={p.id} color={p.color} label={p.name} onPress={() => onOpen(p)} style={[i > 0 && { marginTop: -64 }, { paddingBottom: last ? 22 : 84 }]}>
              <View style={s.row}>
                <Mono>{metaOf(p)}</Mono>
                <Mono>{status}</Mono>
              </View>
              <Name numberOfLines={1}>{p.name}</Name>
              {r?.top && (
                <Body numberOfLines={1}>
                  {r.top.product_name} · {eur(r.top.total_eur)}
                </Body>
              )}
            </Tag>
          );
        })}
      </View>
      {people.length === 0 && <Body style={{ color: C.mute }}>No tags yet. Add the first person you want to find a gift for.</Body>}
      <Btn label="Add someone" onPress={onAdd} />
      <Mono mute style={{ textAlign: 'center' }}>
        Your tags stay on this phone.
      </Mono>
    </ScrollView>
  );
}

// 2 Add someone
// Also edits an existing tag when `initial` is given
export function AddPerson({ initial, onBack, onDone, onDelete }: { initial?: Person; onBack: () => void; onDone: (p: Omit<Person, 'id' | 'messages' | 'lastResultId'>) => void; onDelete?: () => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initial?.name ?? '');
  const [budget, setBudget] = useState(initial ? String(initial.budget) : '');
  const [occasion, setOccasion] = useState(initial?.occasion ?? '');
  const [color, setColor] = useState(initial?.color ?? TAG_COLORS[0]);
  const [error, setError] = useState(false);

  const submit = () => {
    const budgetEur = Number(budget.replace(',', '.').replace('€', ''));
    if (!name.trim() || !occasion.trim() || !(budgetEur > 0)) return setError(true);
    onDone({ name: name.trim(), occasion: occasion.trim(), budget: budgetEur, color });
  };
  const field = { fontFamily: F.display, color: C.ink, borderBottomWidth: 2, borderColor: C.ink, paddingVertical: 4 };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[pad, { gap: 16, paddingBottom: 16 }]}>
        <TopBar onBack={onBack} title={initial ? `Edit ${initial.name}` : "Add someone"} />
        <Tag color={color} style={{ gap: 14 }}>
          <Mono>{initial ? 'Edit tag' : 'New tag'}</Mono>
          <View style={{ gap: 4 }}>
            <Mono>Name</Mono>
            <TextInput accessibilityLabel="Name" value={name} onChangeText={setName} placeholder="Name" placeholderTextColor="rgba(11,11,12,0.4)" style={[field, { fontSize: 40, letterSpacing: -1.8 }]} />
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Mono>Budget in EUR</Mono>
              <TextInput accessibilityLabel="Budget" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="50" placeholderTextColor="rgba(11,11,12,0.4)" style={[field, { fontSize: 26 }]} />
            </View>
            <View style={{ flex: 1.4, gap: 4 }}>
              <Mono>Occasion</Mono>
              <TextInput accessibilityLabel="Occasion" value={occasion} onChangeText={setOccasion} placeholder="Birthday" placeholderTextColor="rgba(11,11,12,0.4)" style={[field, { fontSize: 26 }]} />
            </View>
          </View>
          <Mono>Budget includes shipping</Mono>
        </Tag>
        <View style={{ gap: 10 }}>
          <Mono mute>Tag colour</Mono>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {TAG_COLORS.map((c) => (
              <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} onPress={() => setColor(c)} style={[s.round, { width: 48, height: 48, backgroundColor: c }]}>
                {c === color && <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.ink }} />}
              </Pressable>
            ))}
          </View>
        </View>
        {error && <Body>I need a name, a budget and an occasion.</Body>}
      </ScrollView>
      <View style={[pad, { paddingTop: 8, paddingBottom: insets.bottom + 12 }]}>
        <Btn label={initial ? 'Save' : 'Continue'} onPress={submit} />
        {onDelete && (
          <Pressable accessibilityRole="button" accessibilityLabel="Remove this tag" onPress={onDelete} style={{ alignItems: 'center', paddingVertical: 14 }}>
            <Mono>Remove this tag</Mono>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const STEPS = ['Understanding', 'Searching idealo', 'Deciding'];
// 4 Searching. No real progress from the backend: the steps simply appear one after another
function Searching() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), 6000);
    return () => clearInterval(timer);
  }, []);
  return (
    <View>
      <Say style={{ paddingBottom: 12 }}>On it. This takes about 20 seconds.</Say>
      {STEPS.slice(0, step + 1).map((label, i) => (
        <Line key={label} title={label} color={i < step ? C.mint : C.lemon} right={i < step ? 'done' : '…'} last={i === step} />
      ))}
    </View>
  );
}

const SignalStamps = ({ rec }: { rec: Recommendation }) =>
  rec.signals.length > 0 ? (
    <Stamps>
      {rec.signals.map((sig, i) => (
        <Stamp key={i} i={i} label={sig.label} value={sig.value} />
      ))}
    </Stamps>
  ) : null;

const PriceRow = ({ rec }: { rec: Recommendation }) => (
  <View style={[s.row, { alignItems: 'flex-end' }]}>
    <Text style={[s.price, { flexShrink: 1 }]} adjustsFontSizeToFit numberOfLines={1}>
      {eur(rec.total_eur)}
    </Text>
    {rec.price_eur != null && (
      <Mono style={{ textAlign: 'right', paddingBottom: 8 }}>
        {eur(rec.price_eur)}
        {'\n'}+ {eur(rec.shipping_eur ?? 0)} shipping
      </Mono>
    )}
  </View>
);

// One agent turn: the spoken line, then the pick as a tag, stamps and alternatives
function Turn({ person, result, onOpen }: { person: Person; result: Result; onOpen: () => void }) {
  const top = result.status === 'recommendation' ? result.top : null;
  return (
    <>
      <Say>{sayOf(result)}</Say>
      {result.status === 'ideas_only' && result.understood && (
        <Stamps>
          {result.understood.candidates.map((c, i) => (
            <Stamp key={i} i={i} label="Idea" value={c.idea} />
          ))}
        </Stamps>
      )}
      {top && (
        <Tag color={person.color} onPress={onOpen} label="Open the pick in detail" style={{ gap: 14, marginTop: 6 }}>
          <View style={s.row}>
            <Mono>For {person.name} · my pick</Mono>
            <Mono>{ACTION[top.action] ?? ''}</Mono>
          </View>
          <Name style={{ fontSize: 30, lineHeight: 32, letterSpacing: -1.2 }}>{top.product_name}</Name>
          <PriceRow rec={top} />
          <SignalStamps rec={top} />
          <Mono>{['Data from idealo', top.merchant, top.delivery_estimate].filter(Boolean).join(' · ')}</Mono>
          <Btn label="See why and where to buy" onPress={onOpen} />
        </Tag>
      )}
      {top && result.alternatives.length > 0 && (
        <View>
          <Mono mute style={{ paddingBottom: 10 }}>
            Also fits
          </Mono>
          {result.alternatives.map((alt, i) => (
            <Line
              key={i}
              color={TAG_COLORS[(i + 2) % TAG_COLORS.length]}
              title={alt.product_name}
              sub={alt.reason}
              right={eur(alt.total_eur)}
              last={i === result.alternatives.length - 1}
              onPress={alt.offer_url ? () => Linking.openURL(alt.offer_url!) : undefined}
            />
          ))}
        </View>
      )}
    </>
  );
}

const QUICK = ['Cheaper', 'Something else', 'They already have it'];
const EXAMPLES = [
  { label: 'WhatsApp chat', text: sampleChat.input_text },
  { label: 'Amazon wishlist', text: 'https://www.amazon.de/hz/wishlist/ls/2JPK0IGRX8OMJ' },
];

// 3 Tell me about X, 4 Searching, 5 Thread and pick: one chat
export function Thread({
  person,
  busy,
  error,
  onBack,
  onSend,
  onOpen,
  onEdit,
}: {
  person: Person;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSend: (text: string) => void;
  onOpen: (r: Result) => void;
  onEdit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [text, setText] = useState('');
  const empty = person.messages.length === 0;
  const answered = !busy && !error && person.messages.at(-1)?.role === 'agent';

  const send = (quick?: string) => {
    const msg = (quick ?? text).trim();
    if (!msg || busy) return;
    setText('');
    onSend(msg);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={pad}>
        <TopBar
          onBack={onBack}
          title={`${person.name} · ${metaOf(person)}`}
          right={
            <Pressable accessibilityRole="button" accessibilityLabel="Edit tag" onPress={onEdit} hitSlop={10} style={{ minWidth: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Mono>Edit</Mono>
            </Pressable>
          }
        />
      </View>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[pad, { gap: 16, paddingTop: 12, paddingBottom: 16 }]}
        // A new answer is read from its first line; everything else follows the bottom
        onContentSizeChange={() => !answered && scroll.current?.scrollToEnd({ animated: true })}
      >
        {empty && (
          <>
            <Tag color={person.color} style={{ gap: 12, paddingBottom: 24 }}>
              <Mono>Nothing on this tag yet</Mono>
              <Name>Tell me about {person.name}.</Name>
              <Body>Paste whatever you have: a wishlist link, a chat, or your own words. I read it and work out what they would love.</Body>
            </Tag>
            <Mono mute>Dictation works too: tap the mic on your keyboard.</Mono>
          </>
        )}
        {person.messages.map((m, i) =>
          m.role === 'user' ? (
            <Bubble key={i} note={m.text.length > 160 ? `${m.text.split('\n').length} lines` : undefined}>
              {m.text}
            </Bubble>
          ) : (
            <View key={i} style={{ gap: 16 }} onLayout={(e) => i === person.messages.length - 1 && scroll.current?.scrollTo({ y: e.nativeEvent.layout.y - 12, animated: true })}>
              <Turn person={person} result={m.result} onOpen={() => onOpen(m.result)} />
            </View>
          ),
        )}
        {busy && <Searching />}
        {error && !busy && <Say>That did not work. {error}</Say>}
      </ScrollView>
      <View style={[pad, { gap: 10, paddingTop: 10, paddingBottom: insets.bottom + 8, backgroundColor: C.paper }]}>
        {!busy && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
            {empty
              ? EXAMPLES.map((e) => <Pill key={e.label} large label={e.label} onPress={() => setText(e.text)} />)
              : QUICK.map((q) => <Pill key={q} large label={q} onPress={() => send(q)} />)}
          </ScrollView>
        )}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <TextInput
            // a multiline input keeps its grown height after clearing, so it is remounted per message
            key={person.messages.length}
            accessibilityLabel="Message"
            multiline
            value={text}
            onChangeText={setText}
            placeholder={empty ? 'Paste a wishlist link, a chat, or describe them' : `Tell me more about ${person.name} …`}
            placeholderTextColor={C.mute}
            style={s.input}
          />
          <Round icon="send" label="Send" ink size={52} onPress={() => send()} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// 6 The pick in detail
export function Detail({ person, result, onBack }: { person: Person | null; result: Result; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const top = result.top;
  if (!top) {
    return (
      <View style={[pad, { gap: 16 }]}>
        <TopBar onBack={onBack} title="No pick yet" />
        <Say>{sayOf(result)}</Say>
      </View>
    );
  }
  const wish = top.wish.toLowerCase();
  const quote = result.understood?.candidates.find((c) => {
    const idea = c.idea.toLowerCase();
    return idea === wish || idea.includes(wish) || wish.includes(idea);
  })?.why;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[pad, { gap: 16, paddingBottom: 16 }]}>
        <TopBar onBack={onBack} title={person ? `For ${person.name} · my pick` : 'My pick'} />
        <Tag color={person?.color ?? C.lemon} style={{ gap: 14, marginTop: 4 }}>
          <Mono>{ACTION[top.action] ?? ''}</Mono>
          <Name style={{ fontSize: 30, lineHeight: 32, letterSpacing: -1.2 }}>{top.product_name}</Name>
          <PriceRow rec={top} />
        </Tag>
        <View style={{ gap: 8 }}>
          <Mono mute>Why this one</Mono>
          <Say style={{ maxWidth: '100%', fontSize: 24, lineHeight: 27 }}>{top.reason}</Say>
          {quote && (
            <View style={[s.bubble, { alignSelf: 'flex-start', borderBottomRightRadius: 22, borderBottomLeftRadius: 4, marginTop: 4 }]}>
              <Mono style={{ color: '#fff', opacity: 0.7 }}>From what you told me</Mono>
              <Body style={{ color: '#fff' }}>{quote}</Body>
            </View>
          )}
        </View>
        {top.signals.length > 0 && (
          <View style={{ gap: 8 }}>
            <Mono mute>The data behind it · idealo</Mono>
            <SignalStamps rec={top} />
          </View>
        )}
        <View>
          <Mono mute style={{ paddingBottom: 10 }}>
            Price
          </Mono>
          <Line title="Price" sub={top.merchant ?? undefined} right={eur(top.price_eur)} />
          <Line title="Shipping" sub={top.delivery_estimate ? `Delivery: ${top.delivery_estimate}` : undefined} right={eur(top.shipping_eur)} color={C.lemon} />
          <Line title="Total" sub={person ? `of ${eur(person.budget)} budget` : undefined} right={eur(top.total_eur)} color={person?.color ?? C.tomato} last />
        </View>
        <Mono mute style={{ textAlign: 'center' }}>
          Decided by {result.model}
        </Mono>
      </ScrollView>
      <View style={[pad, { paddingTop: 8, paddingBottom: insets.bottom + 12 }]}>
        {top.offer_url ? <Btn label={`Open offer · ${eur(top.total_eur)}`} onPress={() => Linking.openURL(top.offer_url!)} /> : <Mono mute style={{ textAlign: 'center' }}>No offer link for this pick</Mono>}
      </View>
    </View>
  );
}
