import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Easing, Image, KeyboardAvoidingView, Modal, PanResponder, Pressable, ScrollView, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import sampleChat from '../assets/sample.chat.request.json';
import { AccountPanel } from './account-ui';
import { ImportBox, SharePanel, WishList, mergeWishes } from './profile';
import type { Account } from './account';
import { isDate, isPinned, lastResult, sayOf, type Me, type Person, type Product, type Recommendation, type Result } from './api';
import { canOpenSettings, openLink, openSettings, shareText } from './platform';
import { askMicPermission, dictate, speechAvailable } from './speech';
import { getLanguage, locale, t, wishCount, type Key, type Lang } from './i18n';
import { C, F, TAG_COLORS, eur } from './theme';
import { Body, Btn, Bubble, LanguagePicker, Line, Mono, Name, Pill, Round, Say, Stamp, Stamps, Tag, TopBar, s } from './ui';

const ACTION: Record<Recommendation['action'], Key> = { buy: 'actionBuy', wait: 'actionWait', alternative: 'actionAlternative' };
const actionOf = (a: Recommendation['action']) => (ACTION[a] ? t(ACTION[a]) : '');
const pad = { paddingHorizontal: 16 };
// The date field takes DD.MM.YYYY, DD/MM/YYYY or YYYY-MM-DD and keeps YYYY-MM-DD; null when it is no real day
export function parseDate(text: string): string | null {
  const v = text.trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v) ?? /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = m[1].length === 4 ? [+m[1], +m[2], +m[3]] : [+m[3], +m[2], +m[1]];
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const showDate = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return getLanguage() === 'de' ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
};
const metaOf = (p: Person) => `${p.occasion} · ${eur(p.budget)}`;
type OnPin = (item: Product, resultId: string) => void;

// Outlined "Pin", filled "Pinned". Toggles, never navigates
const PinPill = ({ pinned, onPress }: { pinned: boolean; onPress: () => void }) => (
  <Pressable accessibilityRole="button" accessibilityState={{ selected: pinned }} hitSlop={8} onPress={onPress} style={[s.pill, { alignSelf: 'flex-start' }, pinned && { backgroundColor: C.ink }]}>
    <Text style={[s.pillText, pinned && { color: '#fff' }]}>{pinned ? t('pinned') : t('pin')}</Text>
  </Pressable>
);

const SITE = 'https://wishfit.vercel.app';

// A tag can be pushed a little sideways and springs back. Pure play, no action behind it.
// Claims the touch only for clearly horizontal drags, so taps and vertical scrolling stay untouched.
function Wiggle({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const x = useRef(new Animated.Value(0)).current;
  const pan = useRef(
    (() => {
      const home = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, friction: 5, tension: 120 }).start();
      return PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_e, g) => x.setValue(Math.max(-70, Math.min(70, g.dx))),
        onPanResponderRelease: home,
        onPanResponderTerminate: home,
      });
    })(),
  ).current;
  const rotate = x.interpolate({ inputRange: [-70, 70], outputRange: ['-4deg', '4deg'] });
  return (
    <Animated.View {...pan.panHandlers} style={[style, { transform: [{ translateX: x }, { rotate }] }]}>
      {children}
    </Animated.View>
  );
}

// 1 People: the stack of tags
export function People({ brand, people, onOpen, onAdd, onMe, onSnap }: { brand: string; people: Person[]; onOpen: (p: Person) => void; onAdd: () => void; onMe: () => void; onSnap: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={[pad, { gap: 16, paddingBottom: insets.bottom + 24 }]}>
      <TopBar left={<Text style={s.word}>{brand.toLowerCase()}</Text>} right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Round icon="camera" label={t('snapProduct')} onPress={onSnap} />
            <Round icon="me" label={t('me')} onPress={onMe} />
            <Round icon="plus" label={t('addSomeone')} ink onPress={onAdd} />
          </View>
        }
      />
      <Text style={s.display}>{t('whoNext')}</Text>
      <View style={{ marginTop: 4 }}>
        {people.map((p, i) => {
          const r = lastResult(p);
          const status = !r ? t('statusNew') : r.status === 'recommendation' ? t('statusPick') : r.status === 'needs_clarification' ? t('statusQuestion') : t('statusIdeas');
          const last = i === people.length - 1;
          return (
            <Wiggle key={p.id} style={i > 0 && { marginTop: -64 }}>
            <Tag color={p.color} label={p.name} onPress={() => onOpen(p)} style={{ paddingBottom: last ? 22 : 84 }}>
              <View style={s.row}>
                <Mono>
                  {metaOf(p)}
                  {p.pins.length > 0 && ` · ${t('nPinned', { n: p.pins.length })}`}
                </Mono>
                <Mono>{status}</Mono>
              </View>
              <Name numberOfLines={1}>{p.name}</Name>
              {r?.top && (
                <Body numberOfLines={1}>
                  {r.top.product_name} · {eur(r.top.total_eur)}
                </Body>
              )}
            </Tag>
            </Wiggle>
          );
        })}
      </View>
      {people.length === 0 && <Body style={{ color: C.mute }}>{t('noTags')}</Body>}
      <Btn label={t('addSomeone')} onPress={onAdd} />
      <Btn secondary label={t('invite')} onPress={() => shareText(t('inviteText', { url: SITE }))} />
      <Mono mute style={{ textAlign: 'center' }}>
        {t('tagsLocal')}
      </Mono>
    </ScrollView>
  );
}

// 2 Add someone
// Also edits an existing tag when `initial` is given
// `usedColors`: the colours of the other people. They are locked while a free colour remains
export function AddPerson({ initial, usedColors, onBack, onDone, onDelete, onPin }: { initial?: Person; usedColors: string[]; onBack: () => void; onDone: (p: Omit<Person, 'id' | 'messages' | 'lastResultId' | 'pins'>) => void; onDelete?: () => void; onPin?: OnPin }) {
  const [popup, setPopup] = useState<number | null>(null);
  const pins = initial?.pins ?? [];
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initial?.name ?? '');
  const [budget, setBudget] = useState(initial ? String(initial.budget) : '');
  const [occasion, setOccasion] = useState(initial?.occasion ?? '');
  const [date, setDate] = useState(() => showDate(initial?.occasionDate));
  const [badDate, setBadDate] = useState(false);
  const allTaken = TAG_COLORS.every((c) => usedColors.includes(c));
  const [color, setColor] = useState(initial?.color ?? TAG_COLORS.find((c) => !usedColors.includes(c)) ?? TAG_COLORS[0]);
  const [error, setError] = useState(false);

  const submit = () => {
    const budgetEur = Number(budget.replace(',', '.').replace('€', ''));
    const occasionDate = date.trim() ? parseDate(date) : undefined;
    setBadDate(occasionDate === null);
    if (!name.trim() || !occasion.trim() || !(budgetEur > 0)) return setError(true);
    if (occasionDate === null) return;
    // undefined clears a date that was removed
    onDone({ name: name.trim(), occasion: occasion.trim(), budget: budgetEur, color, occasionDate });
  };
  const field = { fontFamily: F.display, color: C.ink, borderBottomWidth: 2, borderColor: C.ink, paddingVertical: 4 };

  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.top + 8} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[pad, { gap: 16, paddingBottom: 16 }]}>
        <TopBar onBack={onBack} title={initial ? t('moreOf', { name: initial.name }) : t('addSomeone')} />
        <Tag color={color} style={{ gap: 14 }}>
          <Mono>{initial ? t('editTag') : t('newTag')}</Mono>
          <View style={{ gap: 4 }}>
            <Mono>{t('name')}</Mono>
            <TextInput accessibilityLabel={t('name')} value={name} onChangeText={setName} placeholder={t('name')} placeholderTextColor="rgba(11,11,12,0.4)" style={[field, { fontSize: 40, letterSpacing: -1.8, lineHeight: 48, height: 60, paddingVertical: 0 }]} />
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Mono>{t('budgetEur')}</Mono>
              <TextInput accessibilityLabel={t('budget')} value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="50" placeholderTextColor="rgba(11,11,12,0.4)" style={[field, { fontSize: 26 }]} />
            </View>
            <View style={{ flex: 1.4, gap: 4 }}>
              <Mono>{t('occasion')}</Mono>
              <TextInput accessibilityLabel={t('occasion')} value={occasion} onChangeText={setOccasion} placeholder={t('birthday')} placeholderTextColor="rgba(11,11,12,0.4)" style={[field, { fontSize: 26 }]} />
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <Mono>{t('date')}</Mono>
            <TextInput accessibilityLabel={t('date')} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" placeholder={t('datePlaceholder')} placeholderTextColor="rgba(11,11,12,0.4)" style={[field, { fontSize: 26 }]} />
          </View>
          <Mono>{t('budgetShipping')}</Mono>
          <Mono>{t('dateHint')}</Mono>
        </Tag>
        <View style={{ gap: 10 }}>
          <Mono mute>{t('tagColour')}</Mono>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {TAG_COLORS.map((c) => {
              const taken = !allTaken && c !== color && usedColors.includes(c);
              return (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={t(taken ? 'colourTaken' : 'colour', { c })}
                  accessibilityState={{ disabled: taken, selected: c === color }}
                  disabled={taken}
                  onPress={() => setColor(c)}
                  style={[s.round, { width: 48, height: 48, backgroundColor: c }, taken && { opacity: 0.3 }]}
                >
                  {c === color && <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.ink }} />}
                  {taken && <View style={{ width: 44, height: 2, backgroundColor: C.ink, transform: [{ rotate: '-45deg' }] }} />}
                </Pressable>
              );
            })}
          </View>
        </View>
        {error && <Body>{t('needFields')}</Body>}
        {badDate && <Body>{t('badDate')}</Body>}
        {initial && onPin && (
          <View>
            <Mono mute style={{ paddingBottom: 10 }}>
              {t('pinned')}
            </Mono>
            {pins.length === 0 && <Body style={{ color: C.mute }}>{t('nothingPinned')}</Body>}
            {pins.map((pin, i) => (
              <Line
                key={pin.pinnedAt}
                left={pin.image_url ? <Thumb uri={pin.image_url} size={44} label={pin.product_name} onPress={() => setPopup(i)} /> : undefined}
                color={initial.color}
                title={pin.product_name}
                sub={[eur(pin.total_eur), pin.merchant].filter(Boolean).join(' · ')}
                right={
                  <Pressable accessibilityRole="button" accessibilityLabel={t('unpinThis', { name: pin.product_name })} hitSlop={8} onPress={() => onPin(pin, pin.resultId)} style={s.pill}>
                    <Text style={s.pillText}>{t('unpin')}</Text>
                  </Pressable>
                }
                last={i === pins.length - 1}
                onPress={() => setPopup(i)}
              />
            ))}
            <ProductPopup items={pins} start={popup} onClose={() => setPopup(null)} />
          </View>
        )}
      </ScrollView>
      <View style={[pad, { paddingTop: 8, paddingBottom: insets.bottom + 12 }]}>
        <Btn label={initial ? t('save') : t('continue')} onPress={submit} />
        {onDelete && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('removeTag')} onPress={onDelete} style={{ alignItems: 'center', paddingVertical: 14 }}>
            <Mono>{t('removeTag')}</Mono>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// Me: my own tag and wishlist. Stays on this phone unless signed in; shared as a profile link
export function MeScreen({ me, account, lang, onLanguage, onChange, onBack }: { me: Me; account: Account; lang: Lang; onLanguage: (lang: Lang) => void; onChange: (me: Me) => void; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [wish, setWish] = useState('');
  const addWish = () => {
    const title = wish.trim();
    if (!title) return;
    onChange({ ...me, wishes: mergeWishes(me.wishes, [{ title, source: 'typed', added_at: Date.now() }]) });
    setWish('');
  };
  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.top + 8} style={{ flex: 1 }}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={[pad, { gap: 16, paddingBottom: insets.bottom + 24 }]}>
        <TopBar onBack={onBack} title={t('me')} />
        <Tag color={me.color} style={{ gap: 8 }}>
          <View style={s.row}>
            <Mono>{t('myTag')}</Mono>
            <Mono>{wishCount(me.wishes.length)}</Mono>
          </View>
          <TextInput
            accessibilityLabel={t('myName')}
            value={me.name}
            onChangeText={(text) => onChange({ ...me, name: text })}
            placeholder={t('yourName')}
            placeholderTextColor="rgba(11,11,12,0.4)"
            style={{ fontFamily: F.display, color: C.ink, fontSize: 40, letterSpacing: -1.8, lineHeight: 48, height: 60, borderBottomWidth: 2, borderColor: C.ink, paddingVertical: 0 }}
          />
        </Tag>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {TAG_COLORS.map((c) => (
            <Pressable key={c} accessibilityRole="button" accessibilityLabel={t('colour', { c })} onPress={() => onChange({ ...me, color: c })} style={[s.round, { width: 48, height: 48, backgroundColor: c }]}>
              {c === me.color && <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.ink }} />}
            </Pressable>
          ))}
        </View>
        <SharePanel me={me} account={account} onChange={onChange} onNeedSignIn={() => scroll.current?.scrollToEnd({ animated: true })} />
        <View style={{ gap: 10 }}>
          <Mono mute>{t('myWishlist')}</Mono>
          <WishList wishes={me.wishes} mine color={me.color} empty={t('noWishes')} onRemove={(i) => onChange({ ...me, wishes: me.wishes.filter((_w, j) => j !== i) })} />
        </View>
        <ImportBox
          onImported={(incoming) => {
            const next = mergeWishes(me.wishes, incoming);
            if (next.length !== me.wishes.length) onChange({ ...me, wishes: next });
            return next.length - me.wishes.length;
          }}
        />
        <View style={{ gap: 8 }}>
          <Mono mute>{t('addWish')}</Mono>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput accessibilityLabel={t('newWish')} value={wish} onChangeText={setWish} onSubmitEditing={addWish} blurOnSubmit={false} returnKeyType="done" placeholder={t('addPlaceholder')} placeholderTextColor={C.mute} style={[s.input, { paddingTop: 0, paddingBottom: 0 }]} />
            <Round icon="plus" label={t('addWishButton')} ink size={52} onPress={addWish} />
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Mono mute>{t('language')}</Mono>
          <LanguagePicker value={lang} onChange={onLanguage} />
        </View>
        <AccountPanel account={account} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const STEPS: Key[] = ['stepUnderstanding', 'stepSearching', 'stepDeciding'];
// 4 Searching. No real progress from the backend: the steps simply appear one after another.
// While waiting, a small tag in the person's colour swings around its hole and the running step's dots bounce.
function Searching({ color }: { color: string }) {
  const [step, setStep] = useState(0);
  const swing = useRef(new Animated.Value(0)).current;
  const dots = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const timer = setInterval(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), 6000);
    let loops: Animated.CompositeAnimation[] = [];
    let gone = false;
    // With reduced motion nothing starts: the tag hangs still and the dots rest
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (gone || reduce) return;
        const to = (toValue: number, duration: number) => Animated.timing(swing, { toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
        loops = [
          // two calm swings, then a quick double wiggle; starts and ends at rest so the loop has no jump
          Animated.loop(Animated.sequence([to(1, 600), to(-1, 1200), to(1, 1200), to(-1, 1200), to(0.5, 150), to(-0.5, 150), to(0.5, 150), to(0, 300)])),
          Animated.loop(Animated.timing(dots, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true })),
        ];
        loops.forEach((l) => l.start());
      })
      .catch(() => {});
    return () => {
      gone = true;
      clearInterval(timer);
      loops.forEach((l) => l.stop());
    };
  }, []);
  const rotate = swing.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] });
  const bounce = (
    <View accessibilityLabel={t('working')} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.ink, transform: [{ translateY: dots.interpolate({ inputRange: [0, 0.05 + i * 0.2, 0.2 + i * 0.2, 0.35 + i * 0.2, 1], outputRange: [0, 0, -6, 0, 0] }) }] }}
        />
      ))}
    </View>
  );
  return (
    <View>
      <Say style={{ paddingBottom: 12 }}>{t('onIt')}</Say>
      {/* the pivot is the hole, 30pt above the tag's centre */}
      <Animated.View
        style={{ alignSelf: 'flex-start', marginLeft: 10, marginBottom: 14, width: 60, height: 80, borderRadius: 14, borderWidth: 2, borderColor: C.ink, backgroundColor: color, transform: [{ translateY: -30 }, { rotate }, { translateY: 30 }] }}
      >
        <View style={[s.hole, { top: 6, width: 12, height: 12 }]} />
      </Animated.View>
      {STEPS.slice(0, step + 1).map((label, i) => (
        <Line key={label} title={t(label)} color={i < step ? C.mint : C.lemon} right={i < step ? t('done') : bounce} last={i === step} />
      ))}
    </View>
  );
}

// Product image: white square with the tag outline. Renders nothing without an image
function Thumb({ uri, size, label, onPress }: { uri: string | null; size: number; label: string; onPress: () => void }) {
  if (!uri) return null;
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('show', { name: label })} onPress={onPress} style={{ width: size, height: size, borderRadius: size > 60 ? 16 : 10, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper, overflow: 'hidden' }}>
      <Image source={{ uri }} resizeMode="contain" style={{ width: size - 4, height: size - 4, backgroundColor: '#f1f1f3' }} />
    </Pressable>
  );
}

// Card inside the popup: screen width minus the gutters and the 2px border on each side
const PAGE = Dimensions.get('window').width - 32 - 4;
// Product popup: swipe sideways through the products of one answer, the pick first
function ProductPopup({ items, start, onClose, pinned, onPin }: { items: Product[]; start: number | null; onClose: () => void; pinned?: (item: Product) => boolean; onPin?: (item: Product) => void }) {
  const [page, setPage] = useState(0);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const pending = useRef<string | null>(null);
  const openPending = () => {
    const url = pending.current;
    pending.current = null;
    if (url) openLink(url);
  };
  useEffect(() => {
    if (start != null) setPage(start);
  }, [start]);
  return (
    <Modal visible={start != null} transparent animationType="fade" onRequestClose={onClose} onDismiss={openPending}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 16 }}>
        {/* the backdrop is a sibling behind the card, so the card's own touches (paging, buttons) never reach it */}
        <Pressable accessibilityLabel={t('close')} onPress={onClose} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(11,11,12,0.55)' }} />
        <View style={{ backgroundColor: C.paper, borderRadius: 28, borderWidth: 2, borderColor: C.ink, overflow: 'hidden' }}>
          <View style={[s.row, { paddingHorizontal: 16, paddingTop: 14 }]}>
            <Mono>{items.length > 1 ? `${page + 1} / ${items.length}` : ''}</Mono>
            <Round icon="close" label={t('close')} onPress={onClose} />
          </View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            ref={scroll}
            // opens on the tapped product; set once on layout so later renders never move the page
            onLayout={() => scroll.current?.scrollTo({ x: (start ?? 0) * PAGE, animated: false })}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / PAGE))}
          >
            {items.map((rec, i) => (
              <View key={i} style={{ width: PAGE, padding: 16, gap: 12 }}>
                {rec.image_url ? (
                  <Image source={{ uri: rec.image_url }} resizeMode="contain" style={{ width: PAGE - 32, height: 280, borderRadius: 16, backgroundColor: '#f1f1f3' }} />
                ) : (
                  <View style={{ width: PAGE - 32, height: 280, borderRadius: 16, backgroundColor: '#f1f1f3', alignItems: 'center', justifyContent: 'center' }}>
                    <Mono mute>{t('noImage')}</Mono>
                  </View>
                )}
                <Name numberOfLines={3} style={{ fontSize: 24, lineHeight: 27, letterSpacing: -0.8 }}>
                  {rec.product_name}
                </Name>
                <Text style={[s.price, { fontSize: 52, lineHeight: 54, letterSpacing: -2.4 }]} adjustsFontSizeToFit numberOfLines={1}>
                  {eur(rec.total_eur)}
                </Text>
                <Mono>{[t('inclShipping'), rec.merchant, rec.delivery_estimate].filter(Boolean).join(' · ')}</Mono>
                {onPin && <PinPill pinned={!!pinned?.(rec)} onPress={() => onPin(rec)} />}
                {rec.offer_url && (
                  <Btn
                    label={t('openOffer')}
                    onPress={() => {
                      // the popup closes first: iOS only presents the browser sheet once the modal is gone
                      pending.current = rec.offer_url;
                      onClose();
                      setTimeout(openPending, 1200); // in case onDismiss does not fire
                    }}
                  />
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
        {'\n'}{t('plusShipping', { price: eur(rec.shipping_eur ?? 0) })}
      </Mono>
    )}
  </View>
);

// One agent turn: the spoken line, then the pick as a tag, stamps and alternatives
function Turn({ person, result, onOpen, onPin }: { person: Person; result: Result; onOpen: () => void; onPin: OnPin }) {
  const toggle = (item: Product) => onPin(item, result.id);
  const top = result.status === 'recommendation' ? result.top : null;
  const [popup, setPopup] = useState<number | null>(null);
  return (
    <>
      {top && <ProductPopup items={[top, ...result.alternatives]} start={popup} onClose={() => setPopup(null)} pinned={(item) => isPinned(person, item)} onPin={toggle} />}
      <Say>{sayOf(result)}</Say>
      {result.status === 'ideas_only' && result.understood && (
        <Stamps>
          {result.understood.candidates.map((c, i) => (
            <Stamp key={i} i={i} label={t('idea')} value={c.idea} />
          ))}
        </Stamps>
      )}
      {top && (
        <Tag color={person.color} onPress={onOpen} label={t('openPick')} style={{ gap: 14, marginTop: 6 }}>
          <View style={s.row}>
            <Mono>{t('forPick', { name: person.name })}</Mono>
            <Mono>{actionOf(top.action)}</Mono>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Name style={{ flex: 1, fontSize: 30, lineHeight: 32, letterSpacing: -1.2 }}>{top.product_name}</Name>
            <Thumb uri={top.image_url} size={96} label={top.product_name} onPress={() => setPopup(0)} />
          </View>
          <PinPill pinned={isPinned(person, top)} onPress={() => toggle(top)} />
          <PriceRow rec={top} />
          <SignalStamps rec={top} />
          <Mono>{[t('dataIdealo'), top.merchant, top.delivery_estimate].filter(Boolean).join(' · ')}</Mono>
          <Btn label={t('seeWhy')} onPress={onOpen} />
        </Tag>
      )}
      {top && result.alternatives.length > 0 && (
        <View>
          <Mono mute style={{ paddingBottom: 10 }}>
            {t('alsoFits')}
          </Mono>
          {result.alternatives.map((alt, i) => (
            <Line
              key={i}
              color={TAG_COLORS[(i + 2) % TAG_COLORS.length]}
              left={alt.image_url ? <Thumb uri={alt.image_url} size={44} label={alt.product_name} onPress={() => setPopup(i + 1)} /> : undefined}
              title={alt.product_name}
              sub={alt.reason}
              right={
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={s.lineTitle}>{eur(alt.total_eur)}</Text>
                  <PinPill pinned={isPinned(person, alt)} onPress={() => toggle(alt)} />
                </View>
              }
              last={i === result.alternatives.length - 1}
              onPress={alt.offer_url ? () => openLink(alt.offer_url!) : undefined}
            />
          ))}
        </View>
      )}
    </>
  );
}

// Dictation follows the app language
const dictationLocale = () => (getLanguage() === 'de' ? 'de-DE' : 'en-US');

const QUICK: Key[] = ['quickCheaper', 'quickElse', 'quickHave'];
const EXAMPLES: { label: Key; text: string }[] = [
  { label: 'exampleChat', text: sampleChat.input_text },
  { label: 'exampleAmazon', text: 'https://www.amazon.de/hz/wishlist/ls/2JPK0IGRX8OMJ' },
];

// 3 Tell me about X, 4 Searching, 5 Thread and pick: one chat
export function Thread({
  person,
  busy,
  error,
  onBack,
  onSend,
  onSnap,
  onOpen,
  onEdit,
  onPin,
  header,
}: {
  person: Person;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSend: (text: string) => void;
  onSnap: () => void;
  onOpen: (r: Result) => void;
  onEdit: () => void;
  onPin: OnPin;
  // shown above the chat, e.g. a friend's shared wishes
  header?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [text, setText] = useState('');
  const empty = person.messages.length === 0;
  const answered = !busy && !error && person.messages.at(-1)?.role === 'agent';

  // Dictation: the recognised text streams into the field behind whatever was typed before
  const [session, setSession] = useState<{ stop: () => Promise<string> } | null>(null);
  const [micNote, setMicNote] = useState<string | null>(null);
  const typed = useRef('');
  const live = useRef(session);
  live.current = session;
  useEffect(() => () => void live.current?.stop().catch(() => {}), []);
  const stopMic = () => {
    const current = session;
    setSession(null);
    current?.stop().catch(() => {});
  };
  const toggleMic = async () => {
    if (session) return stopMic();
    setMicNote(null);
    if ((await askMicPermission()) !== 'granted') return setMicNote('denied');
    typed.current = text.trim() ? `${text.trimEnd()} ` : '';
    const started = await dictate(
      (spoken) => setText(typed.current + spoken),
      (problem) => {
        setSession(null);
        if (problem) setMicNote(problem);
      },
      dictationLocale(),
    );
    if (started) setSession(started);
  };

  const send = (quick?: string) => {
    const msg = (quick ?? text).trim();
    if (!msg || busy) return;
    stopMic();
    setText('');
    onSend(msg);
  };

  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.top + 8} style={{ flex: 1 }}>
      <View style={pad}>
        <TopBar
          onBack={onBack}
          title={`${person.name} · ${metaOf(person)}`}
          right={
            <Pressable accessibilityRole="button" accessibilityLabel={t('more')} onPress={onEdit} hitSlop={10} style={{ minWidth: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Mono>{t('more')}</Mono>
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
        {header}
        {empty && (
          <>
            <Tag color={person.color} style={{ gap: 12, paddingBottom: 24 }}>
              <Mono>{t('nothingYet')}</Mono>
              <Name>{t('tellMe', { name: person.name })}</Name>
              <Body>{t('tellBody')}</Body>
            </Tag>
            <Mono mute>{t('dictationHint')}</Mono>
          </>
        )}
        {person.messages.map((m, i) =>
          m.role === 'user' ? (
            <View key={i} style={{ gap: 8 }}>
              {m.photo && <Image source={{ uri: m.photo }} accessibilityLabel={t('yourPhoto')} style={{ alignSelf: 'flex-end', width: 160, height: 160, borderRadius: 20, borderWidth: 2, borderColor: C.ink }} />}
              <Bubble note={m.text.length > 160 ? t('lines', { n: m.text.split('\n').length }) : undefined}>{m.text}</Bubble>
            </View>
          ) : (
            <View key={i} style={{ gap: 16 }} onLayout={(e) => i === person.messages.length - 1 && scroll.current?.scrollTo({ y: e.nativeEvent.layout.y - 12, animated: true })}>
              <Turn person={person} result={m.result} onOpen={() => onOpen(m.result)} onPin={onPin} />
            </View>
          ),
        )}
        {busy && <Searching color={person.color} />}
        {error && !busy && <Say>{t('failed', { error })}</Say>}
      </ScrollView>
      <View style={[pad, { gap: 10, paddingTop: 10, paddingBottom: insets.bottom + 8, backgroundColor: C.paper }]}>
        {!busy && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
            {empty
              ? EXAMPLES.map((e) => <Pill key={e.label} large label={t(e.label)} onPress={() => setText(e.text)} />)
              : QUICK.map((q) => <Pill key={q} large label={t(q)} onPress={() => send(t(q))} />)}
          </ScrollView>
        )}
        {micNote === 'denied' && canOpenSettings ? (
          <Pressable accessibilityRole="button" onPress={() => openSettings()}>
            <Mono>{t('micSettings')}</Mono>
          </Pressable>
        ) : (
          micNote && <Mono>{micNote === 'denied' ? t('micBrowser') : micNote}</Mono>
        )}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <TextInput
            // a multiline input keeps its grown height after clearing, so it is remounted per message
            key={person.messages.length}
            accessibilityLabel={t('message')}
            multiline
            value={text}
            onChangeText={setText}
            placeholder={empty ? t('placeholderFirst') : t('placeholderMore', { name: person.name })}
            placeholderTextColor={C.mute}
            style={s.input}
          />
          {!busy && <Round icon="camera" label={t('snapProduct')} size={52} onPress={onSnap} />}
          {speechAvailable() && <Round icon="mic" label={session ? t('stopDictation') : t('dictate')} size={52} fill={session ? C.tomato : undefined} onPress={toggleMic} />}
          <Round icon="send" label={t('send')} ink size={52} onPress={() => send()} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

export type Photo = { uri: string; base64: string };

// 7 Snap a product: the camera inside the app, or a photo from the library. Opened from a chat the photo goes to
// that person; opened from People, 8 "which tag?" asks whose it is.
// ponytail: sent at quality 0.4 without resizing (about 1 MB); resize with expo-image-manipulator if uploads get slow
export function Snap({ person, people, onBack, onDone }: { person: Person | null; people: Person[]; onBack: () => void; onDone: (photo: Photo, personId: string) => void }) {
  const insets = useSafeAreaInsets();
  const camera = useRef<React.ComponentRef<typeof CameraView>>(null);
  const [permission, ask] = useCameraPermissions();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) ask();
  }, [permission?.status]);

  const got = (p: { uri: string; base64?: string | null } | null | undefined) => {
    if (!p?.base64) return;
    const shot = { uri: p.uri, base64: p.base64 };
    if (person) onDone(shot, person.id);
    else setPhoto(shot);
  };
  const shoot = () =>
    camera.current
      ?.takePictureAsync({ base64: true, quality: 0.4 })
      .then(got)
      .catch((e) => setNote(t('photoFailed', { error: e?.message ?? e })));
  const upload = () =>
    ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4, base64: true })
      .then((r) => got(r.assets?.[0]))
      .catch((e) => setNote(t('photoNotOpened', { error: e?.message ?? e })));

  if (photo)
    return (
      <ScrollView contentContainerStyle={[pad, { gap: 16, paddingBottom: insets.bottom + 24 }]}>
        <TopBar onBack={() => setPhoto(null)} title={t('fromPhoto')} />
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-end' }}>
          <Image source={{ uri: photo.uri }} accessibilityLabel={t('yourPhoto')} style={{ width: 104, height: 132, borderRadius: 18, borderWidth: 2, borderColor: C.ink, transform: [{ rotate: '-3deg' }] }} />
          <Say style={{ flex: 1 }}>{t('whoseTag')}</Say>
        </View>
        {people.length === 0 && <Body>{t('noTagYet')}</Body>}
        {people.map((p) => (
          <Tag key={p.id} color={p.color} label={t('addToTag', { name: p.name })} onPress={() => onDone(photo, p.id)} style={{ gap: 4 }}>
            <Name>{p.name}</Name>
            <Mono>{metaOf(p)}</Mono>
          </Tag>
        ))}
        <Btn secondary label={t('notIt')} onPress={() => setPhoto(null)} />
      </ScrollView>
    );

  return (
    <View style={[pad, { flex: 1, gap: 16, paddingBottom: insets.bottom + 16 }]}>
      <TopBar onBack={onBack} title={person ? t('snapFor', { name: person.name }) : t('snap')} />
      <Text style={s.display}>{t('seenGood')}</Text>
      <View style={{ flex: 1, borderWidth: 2, borderColor: C.ink, borderRadius: 28, backgroundColor: C.ink, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {permission?.granted && <CameraView ref={camera} facing="back" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />}
        {/* the four lemon corners of the viewfinder */}
        {(['Top', 'Bottom'] as const).flatMap((v) =>
          (['Left', 'Right'] as const).map((h) => (
            <View key={v + h} pointerEvents="none" style={{ position: 'absolute', [v.toLowerCase()]: 28, [h.toLowerCase()]: 28, width: 44, height: 44, borderColor: C.lemon, [`border${v}Width`]: 3, [`border${h}Width`]: 3 }} />
          )),
        )}
        {permission?.granted ? (
          <Text style={[s.say, { color: '#fff', textAlign: 'center', paddingHorizontal: 48, fontSize: 22, lineHeight: 26, opacity: 0.9 }]}>{t('pointAt')}</Text>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => (permission?.canAskAgain || !canOpenSettings ? ask() : openSettings())} style={{ padding: 40 }}>
            <Text style={[s.say, { color: '#fff', textAlign: 'center', fontSize: 22, lineHeight: 26 }]}>{t('cameraOff')}</Text>
          </Pressable>
        )}
      </View>
      {note && <Mono>{note}</Mono>}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>
          <Pill large label={t('uploadPhoto')} onPress={upload} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('takePhoto')} disabled={!permission?.granted} onPress={shoot} style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: C.ink, backgroundColor: C.lemon, alignItems: 'center', justifyContent: 'center', opacity: permission?.granted ? 1 : 0.4 }}>
          <View style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper }} />
        </Pressable>
        <View style={{ flex: 1 }} />
      </View>
    </View>
  );
}

// 6 The pick in detail
export function Detail({ person, result, onBack, onPin }: { person: Person | null; result: Result; onBack: () => void; onPin?: OnPin }) {
  const insets = useSafeAreaInsets();
  const top = result.top;
  const [popup, setPopup] = useState<number | null>(null);
  if (!top) {
    return (
      <View style={[pad, { gap: 16 }]}>
        <TopBar onBack={onBack} title={t('noPick')} />
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
        <TopBar onBack={onBack} title={person ? t('forPick', { name: person.name }) : t('myPick')} />
        <ProductPopup
          items={[top, ...result.alternatives]}
          start={popup}
          onClose={() => setPopup(null)}
          pinned={person ? (item) => isPinned(person, item) : undefined}
          onPin={person && onPin ? (item) => onPin(item, result.id) : undefined}
        />
        {top.image_url && (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('show', { name: top.product_name })} onPress={() => setPopup(0)} style={{ height: 220, borderRadius: 16, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper, overflow: 'hidden' }}>
            <Image source={{ uri: top.image_url }} resizeMode="contain" style={{ width: '100%', height: 216, backgroundColor: '#f1f1f3' }} />
          </Pressable>
        )}
        <Tag color={person?.color ?? C.lemon} style={{ gap: 14, marginTop: 4 }}>
          <View style={s.row}>
            <Mono>{actionOf(top.action)}</Mono>
            {person && onPin && <PinPill pinned={isPinned(person, top)} onPress={() => onPin(top, result.id)} />}
          </View>
          <Name style={{ fontSize: 30, lineHeight: 32, letterSpacing: -1.2 }}>{top.product_name}</Name>
          <PriceRow rec={top} />
        </Tag>
        <View style={{ gap: 8 }}>
          <Mono mute>{t('whyThis')}</Mono>
          <Say style={{ maxWidth: '100%', fontSize: 24, lineHeight: 27 }}>{top.reason}</Say>
          {quote && (
            <View style={[s.bubble, { alignSelf: 'flex-start', borderBottomRightRadius: 22, borderBottomLeftRadius: 4, marginTop: 4 }]}>
              <Mono style={{ color: '#fff', opacity: 0.7 }}>{t('fromYou')}</Mono>
              <Body style={{ color: '#fff' }}>{quote}</Body>
            </View>
          )}
        </View>
        {top.signals.length > 0 && (
          <View style={{ gap: 8 }}>
            <Mono mute>{t('dataBehind')}</Mono>
            <SignalStamps rec={top} />
          </View>
        )}
        <View>
          <Mono mute style={{ paddingBottom: 10 }}>
            {t('price')}
          </Mono>
          <Line title={t('price')} sub={top.merchant ?? undefined} right={eur(top.price_eur)} />
          <Line title={t('shipping')} sub={top.delivery_estimate ? t('delivery', { when: top.delivery_estimate }) : undefined} right={eur(top.shipping_eur)} color={C.lemon} />
          <Line title={t('total')} sub={person ? t('ofBudget', { price: eur(person.budget) }) : undefined} right={eur(top.total_eur)} color={person?.color ?? C.tomato} last />
        </View>
        <Mono mute style={{ textAlign: 'center' }}>
          {t('decidedBy', { model: result.model })}
        </Mono>
      </ScrollView>
      <View style={[pad, { paddingTop: 8, paddingBottom: insets.bottom + 12 }]}>
        {top.offer_url ? <Btn label={t('openOfferPrice', { price: eur(top.total_eur) })} onPress={() => openLink(top.offer_url!)} /> : <Mono mute style={{ textAlign: 'center' }}>{t('noOfferLink')}</Mono>}
      </View>
    </View>
  );
}
