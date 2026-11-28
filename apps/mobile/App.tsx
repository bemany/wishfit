import './global.css';

import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono/500Medium';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Linking, PanResponder, Platform, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from './src/account';
import { idFromUrl, newerPrices, loadMe, loadPeople, loadResult, recommend, saveMe, savePeople, togglePin, type Me, type Person, type Product, type Result } from './src/api';
import { FriendWishes, ProfileView, applyPrices, fetchPrices, friendColor, friendContext, loadProfile, slugFromUrl, type PublicProfile } from './src/profile';
import { AddPerson, Detail, MeScreen, People, Snap, Thread } from './src/screens';
import { getLanguage, readSettings, setLanguage, t, writeSettings, type Lang } from './src/i18n';
import { Onboarding } from './src/onboarding';
import { onPushOpen } from './src/push';
import { C } from './src/theme';

// Working title, the name vote is still running: change it here only
const BRAND = 'Wishfit';

type View_ = { name: 'people' } | { name: 'me' } | { name: 'add' } | { name: 'edit'; id: string } | { name: 'thread'; id: string } | { name: 'snap'; id: string | null } | { name: 'detail'; result: Result; id: string | null } | { name: 'profile'; slug: string };

export default function App() {
  // On a font error the app still renders, with the system font
  const [loaded, fontError] = useFonts({ BricolageGrotesque_800ExtraBold, InstrumentSans_400Regular, InstrumentSans_600SemiBold, InstrumentSans_700Bold, DMMono_500Medium });
  if (!loaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

const WIDTH = Dimensions.get('window').width;

// Swipe from the left edge to the right = the screen's back button. The screen follows the finger and
// slides out, or springs back when released early.
// ponytail: a 22pt edge strip with PanResponder and Animated, no navigation library, so the white ground shows underneath
function EdgeBack({ x, onBack }: { x: Animated.Value; onBack: () => void }) {
  const back = useRef(onBack);
  back.current = onBack;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dx > 12 && Math.abs(g.dy) < 18,
      onPanResponderMove: (_e, g) => x.setValue(Math.max(0, g.dx)),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > WIDTH / 3 || g.vx > 0.6) back.current();
        else Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
    }),
  ).current;
  return <View {...pan.panHandlers} accessible={false} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 22 }} />;
}

function Root() {
  const insets = useSafeAreaInsets();
  const [people, setPeople] = useState<Person[]>(loadPeople);
  const [me, setMe] = useState<Me>(loadMe);
  const [view, setView] = useState<View_>({ name: 'people' });
  // every screen reads its texts through t(), so a new language re-renders them from here
  const [lang, setLang] = useState<Lang>(getLanguage);
  const [onboarded, setOnboarded] = useState(() => readSettings().onboarded === true);
  // ponytail: one request at a time across all threads
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  // the ref holds the newest list, so parallel changes (an agent answer and an edit) never overwrite each other
  const peopleRef = useRef(people);
  const applyPeople = (f: (all: Person[]) => Person[]) => {
    const next = f(peopleRef.current);
    peopleRef.current = next;
    savePeople(next);
    setPeople(next);
  };
  const account = useAccount(people, me, applyPeople, setMe, peopleRef);
  const meRef = useRef(me);
  meRef.current = me;
  // stamp: false for what the app does by itself (prices), so it never wins a sync over a real edit
  const changeMe = (next: Me, stamp = true) => {
    const stamped = stamp ? { ...next, updatedAt: Date.now() } : next;
    meRef.current = stamped;
    setMe(stamped);
    saveMe(stamped);
  };

  const changeLanguage = (next: Lang) => {
    setLanguage(next);
    setLang(next);
    if (meRef.current.language !== next) changeMe({ ...meRef.current, language: next });
    account.saveLanguage(next);
  };

  // Opening my profile (and importing into it) refreshes prices older than 6 h; one request at a time,
  // 20 wishes a request, so it goes on in rounds (at most 5) until none is left or a new import asks again
  const pricing = useRef(false);
  const pricingAgain = useRef(false);
  useEffect(() => {
    if (view.name !== 'me') return;
    if (pricing.current) return void (pricingAgain.current = true);
    pricing.current = true;
    (async () => {
      for (let round = 0; round < 5; round++) {
        pricingAgain.current = false;
        const checked = await fetchPrices(meRef.current.wishes);
        if (checked.length) changeMe({ ...meRef.current, wishes: applyPrices(meRef.current.wishes, checked) }, false);
        if (!checked.length && !pricingAgain.current) break;
      }
    })()
      .catch(() => {})
      .finally(() => (pricing.current = false));
  }, [view.name, me.wishes.length]);

  const update = (id: string, change: (p: Person) => Person, stamp = true) =>
    applyPeople((all) => all.map((p) => (p.id === id ? { ...change(p), ...(stamp ? { updatedAt: Date.now() } : {}) } : p)));

  const send = async (person: Person, text: string, photo?: { uri: string; base64: string }) => {
    setBusyId(person.id);
    setError(null);
    update(person.id, (p) => ({ ...p, messages: [...p.messages, { role: 'user', text, photo: photo?.uri }] }));
    try {
      const result = await recommend(person, text, photo?.base64, friendContext(person));
      update(person.id, (p) => ({ ...p, lastResultId: result.id, messages: [...p.messages, { role: 'agent', result }] }));
    } catch (e) {
      // An unanswered message does not stay in the thread, only the error line does
      update(person.id, (p) => {
        const last = p.messages.at(-1);
        return last?.role === 'user' && last.text === text ? { ...p, messages: p.messages.slice(0, -1) } : p;
      });
      setError({ id: person.id, text: e instanceof Error ? e.message : t('unknownError') });
    } finally {
      setBusyId(null);
    }
  };

  const pin = (id: string, item: Product, resultId: string) => update(id, (p) => togglePin(p, item, resultId));

  const add = (fields: Omit<Person, 'id' | 'messages' | 'lastResultId' | 'pins'>) => {
    const person: Person = { ...fields, id: `p_${Date.now()}`, messages: [], lastResultId: null, pins: [], updatedAt: Date.now() };
    applyPeople((all) => [person, ...all]);
    setView({ name: 'thread', id: person.id });
  };

  // A shared tag becomes a person; the same tag twice opens the one already there
  const addFriend = (slug: string, profile: PublicProfile) => {
    const known = peopleRef.current.find((p) => p.friendSlug === slug);
    if (known) return setView({ name: 'thread', id: known.id });
    if (meRef.current.share?.slug === slug) return;
    // ponytail: occasion and budget are not on a shared tag; defaults the user can change under More
    add({ name: profile.name.trim() || t('friend'), occasion: t('birthday'), budget: 50, color: friendColor(profile.color, peopleRef.current.map((p) => p.color)), friendSlug: slug, wishes: profile.wishes });
  };

  // Opening a friend's chat reloads their shared tag and the prices on it; 404 keeps the person with a note
  const [goneSlugs, setGoneSlugs] = useState<string[]>([]);
  const openId = view.name === 'thread' ? view.id : null;
  useEffect(() => {
    const friend = peopleRef.current.find((p) => p.id === openId);
    const slug = friend?.friendSlug;
    if (!friend || !slug) return;
    let live = true;
    // a refresh is not an edit: it does not stamp updatedAt
    const setWishes = (f: (w: NonNullable<Person['wishes']>) => NonNullable<Person['wishes']>) => update(friend.id, (p) => ({ ...p, wishes: f(p.wishes ?? []) }), false);
    loadProfile(slug)
      .then(async (profile) => {
        if (!live) return;
        setGoneSlugs((all) => (profile ? all.filter((x) => x !== slug) : all.includes(slug) ? all : [...all, slug]));
        if (!profile) return;
        // the friend's list wins; prices I checked meanwhile stay when theirs are older or missing
        const mine = peopleRef.current.find((p) => p.id === friend.id)?.wishes ?? [];
        const wishes = newerPrices(profile.wishes, mine);
        if (JSON.stringify(wishes) !== JSON.stringify(mine)) setWishes(() => wishes);
        for (let round = 0; round < 5 && live; round++) {
          const checked = await fetchPrices(peopleRef.current.find((p) => p.id === friend.id)?.wishes ?? []);
          if (!live || !checked.length) break;
          setWishes((current) => applyPrices(current, checked));
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [openId]);

  // wishloop://u/{slug} (web: /u/{slug}) opens a shared tag
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const slug = slugFromUrl(window.location.pathname);
    if (slug) setView({ name: 'profile', slug });
  }, []);

  // wishloop://results/{id} opens the pick in detail. Reacts to every URL event, so reopening the same link reloads it too
  useEffect(() => {
    const open = (url?: string | null) => {
      const slug = Platform.OS === 'web' ? null : slugFromUrl(url);
      if (slug) return setView({ name: 'profile', slug });
      const id = idFromUrl(url ?? null);
      if (id) loadResult(id).then((result) => setView({ name: 'detail', result, id: null })).catch(() => {});
    };
    Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => sub.remove();
  }, []);

  // Tapping a notification: the person's chat, otherwise the shared tag it is about
  useEffect(
    () =>
      onPushOpen(({ personId, slug }) => {
        if (personId && peopleRef.current.some((p) => p.id === personId)) return setView({ name: 'thread', id: personId });
        if (slug) setView({ name: 'profile', slug });
      }),
    [],
  );

  const person = 'id' in view ? (people.find((p) => p.id === view.id) ?? null) : null;
  // Screen transitions: forward slides in from the right, back slides out to the right (button and swipe alike)
  const x = useRef(new Animated.Value(0)).current;
  const leaving = useRef(false);
  const viewKey = view.name + ('id' in view ? (view.id ?? '') : '');
  useEffect(() => {
    if (leaving.current) {
      leaving.current = false;
      return;
    }
    if (view.name === 'people') return;
    x.setValue(WIDTH);
    Animated.timing(x, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, [viewKey]);
  const goBack = () => {
    const target: View_ =
      (view.name === 'edit' || view.name === 'snap') && view.id ? { name: 'thread', id: view.id } : view.name === 'detail' && view.id ? { name: 'thread', id: view.id } : { name: 'people' };
    // the web address of a shared tag goes away with it, so a reload lands on the tags
    if (view.name === 'profile' && Platform.OS === 'web') window.history.replaceState(null, '', '/');
    Animated.timing(x, { toValue: WIDTH, duration: 200, useNativeDriver: true }).start(() => {
      leaving.current = true;
      setView(target);
      x.setValue(0);
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top + 8 }}>
      <StatusBar style="dark" />
      <Animated.View style={{ flex: 1, transform: [{ translateX: view.name === 'people' ? 0 : x }] }}>
      {!onboarded ? (
        <Onboarding
          lang={lang}
          signedIn={!!account.session}
          onLanguage={changeLanguage}
          onDone={() => {
            writeSettings({ onboarded: true });
            setOnboarded(true);
          }}
        />
      ) : view.name === 'profile' ? (
        <ProfileView key={view.slug} slug={view.slug} people={people} mine={me.share?.slug === view.slug} onBack={goBack} onAdd={(profile) => addFriend(view.slug, profile)} onOpen={(p) => setView({ name: 'thread', id: p.id })} />
      ) : view.name === 'add' ? (
        <AddPerson usedColors={people.map((p) => p.color)} onBack={goBack} onDone={add} />
      ) : view.name === 'me' ? (
        <MeScreen
          me={me}
          account={account}
          lang={lang}
          onLanguage={changeLanguage}
          onBack={goBack}
          onChange={changeMe}
        />
      ) : view.name === 'edit' && person ? (
        <AddPerson
          key={`edit-${person.id}`}
          initial={person}
          usedColors={people.filter((p) => p.id !== person.id).map((p) => p.color)}
          onBack={goBack}
          onPin={(item, resultId) => pin(person.id, item, resultId)}
          onDone={(fields) => {
            update(person.id, (p) => ({ ...p, ...fields }));
            setView({ name: 'thread', id: person.id });
          }}
          onDelete={() => {
            account.removePerson(person.id);
            setView({ name: 'people' });
          }}
        />
      ) : view.name === 'thread' && person ? (
        <Thread
          key={person.id}
          person={person}
          busy={busyId === person.id}
          error={error?.id === person.id ? error.text : null}
          header={person.friendSlug ? <FriendWishes person={person} gone={goneSlugs.includes(person.friendSlug)} /> : undefined}
          onBack={goBack}
          onSend={(text) => send(person, text)}
          onSnap={() => setView({ name: 'snap', id: person.id })}
          onPin={(item, resultId) => pin(person.id, item, resultId)}
          onOpen={(result) => setView({ name: 'detail', result, id: person.id })}
          onEdit={() => setView({ name: 'edit', id: person.id })}
        />
      ) : view.name === 'snap' ? (
        <Snap
          person={person}
          people={people}
          onBack={goBack}
          onDone={(photo, id) => {
            const to = people.find((p) => p.id === id);
            if (!to) return;
            setView({ name: 'thread', id });
            send(to, t('whatAbout'), photo);
          }}
        />
      ) : view.name === 'detail' ? (
        <Detail
          // A deep-linked result belongs to whoever has it in their thread, if anyone
          person={person ?? people.find((p) => p.messages.some((m) => m.role === 'agent' && m.result.id === view.result.id)) ?? null}
          result={view.result}
          onBack={goBack}
          onPin={person ? (item, resultId) => pin(person.id, item, resultId) : undefined}
        />
      ) : (
        <People brand={BRAND} people={people} onOpen={(p) => setView({ name: 'thread', id: p.id })} onAdd={() => setView({ name: 'add' })} onMe={() => setView({ name: 'me' })} onSnap={() => setView({ name: 'snap', id: null })} />
      )}
      </Animated.View>
      {onboarded && view.name !== 'people' && <EdgeBack x={x} onBack={goBack} />}
    </View>
  );
}
