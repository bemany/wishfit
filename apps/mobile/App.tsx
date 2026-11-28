import './global.css';

import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono/500Medium';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Dimensions, Linking, PanResponder, Platform, View } from 'react-native';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminConsole } from './src/admin';
import { noteRef } from './src/attribution';
import { useAccount } from './src/account';
import { SignIn } from './src/account-ui';
import { getSession, idFromUrl, newerPrices, loadMe, loadPeople, loadResult, recommend, saveMe, savePeople, togglePin, type Me, type Person, type Product, type Result } from './src/api';
import { FriendWishes, ProfileView, applyPrices, fetchPrices, friendColor, friendContext, loadProfile, slugFromUrl, type PublicProfile } from './src/profile';
import { AddPerson, Detail, MeScreen, People, Snap, Thread } from './src/screens';
import { getLanguage, readSettings, setLanguage, t, writeSettings, type Lang } from './src/i18n';
import { installTrigger } from './src/install';
import { ImpersonationEnded, ImpersonationStrip } from './src/admin-strip';
import { impersonation } from './src/impersonation';
import { InstallBanner, InstallSheet } from './src/install-ui';
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
  // the admin console lives on the web only (openspec/changes/admin-console); the native app has no /admin
  const admin = Platform.OS === 'web' && !impersonation && /^\/admin(\/|$)/.test(window.location.pathname);
  return (
    <SafeAreaProvider>
      {admin ? <AdminConsole /> : <Root />}
    </SafeAreaProvider>
  );
}

const WIDTH = Dimensions.get('window').width;

// How a screen enters and leaves: slide = iOS push (the screen below drifts back 30 % and darkens),
// zoom = grows out of the top-right "+" button, fade = reduced motion
type Kind = 'slide' | 'zoom' | 'fade';
// critically damped (damping = 2 * sqrt(stiffness * mass)), so it settles without any overshoot
const SPRING = { stiffness: 260, damping: 2 * Math.sqrt(260), mass: 1, overshootClamping: true } as const;

// Swipe from the left edge to the right = the screen's back button. The screen follows the finger and
// slides out, or springs back when released early.
// ponytail: a 22pt edge strip with PanResponder writing the shared value p (1 = screen in place, 0 = gone)
function EdgeBack({ p, onStart, onRelease }: { p: SharedValue<number>; onStart: () => void; onRelease: (done: boolean, velocity: number) => void }) {
  const cb = useRef({ onStart, onRelease });
  cb.current = { onStart, onRelease };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dx > 12 && Math.abs(g.dy) < 18,
      onPanResponderGrant: () => cb.current.onStart(),
      onPanResponderMove: (_e, g) => {
        p.value = 1 - Math.min(1, Math.max(0, g.dx / WIDTH));
      },
      onPanResponderRelease: (_e, g) => cb.current.onRelease(g.dx > WIDTH / 3 || g.vx > 0.6, g.vx),
      onPanResponderTerminate: () => cb.current.onRelease(false, 0),
    }),
  ).current;
  return <View {...pan.panHandlers} accessible={false} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 22 }} />;
}

function Root() {
  const insets = useSafeAreaInsets();
  const [people, setPeople] = useState<Person[]>(loadPeople);
  const [me, setMe] = useState<Me>(loadMe);
  const [view, setViewRaw] = useState<View_>({ name: 'people' });
  // the long-lived effects (links, notifications) call the newest setView, not the one from the first render
  const setViewRef = useRef<(next: View_, zoom?: boolean) => void>(() => {});
  // a deleted person goes once the edit screen has left
  const drafts = useRef<Record<string, string>>({});
  const removeAfter = useRef<string | null>(null);
  const accountRef = useRef<typeof account | null>(null);
  // every screen reads its texts through t(), so a new language re-renders them from here
  const [lang, setLang] = useState<Lang>(getLanguage);
  const [onboarded, setOnboarded] = useState(() => readSettings().onboarded === true);
  // ponytail: one request at a time across all threads
  // the install hint: a banner after the sign-in, the sheet when asked for; /install opens the sheet at once, signed in or not
  const [installBanner, setInstallBanner] = useState(false);
  // never in the admin simulator, which only shows the user's app
  const [installOpen, setInstallOpen] = useState(() => Platform.OS === 'web' && !impersonation && window.location.pathname === '/install');
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
  const meRef = useRef(me);
  meRef.current = me;
  // the account's language comes to this device without being sent back. Not stamped: the language lives in
  // the account settings, and a stamp would let an empty profile on a new device win over the account's
  const adoptLanguage = (next: Lang) => {
    setLanguage(next);
    setLang(next);
    if (meRef.current.language !== next) changeMe({ ...meRef.current, language: next }, false);
  };
  const account = useAccount(people, me, applyPeople, setMe, peopleRef, adoptLanguage);
  accountRef.current = account;
  const signedIn = !!account.session;
  // stamp: false for what the app does by itself (prices), so it never wins a sync over a real edit
  const changeMe = (next: Me, stamp = true) => {
    const stamped = stamp ? { ...next, updatedAt: Date.now() } : next;
    meRef.current = stamped;
    setMe(stamped);
    saveMe(stamped);
  };

  const changeLanguage = (next: Lang) => {
    adoptLanguage(next);
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
      if (!impersonation && installTrigger('recommendation')) setInstallBanner(true);
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

  // Without an account a shared tag is only a preview: "Add as friend" asks to sign in first and adds the
  // friend once the first pull is done, so a friend already in the account is not added twice
  const [askSignIn, setAskSignIn] = useState(false);
  const addAfter = useRef<{ slug: string; profile: PublicProfile } | null>(null);
  const afterSignIn = () => {
    setAskSignIn(false);
    const pending = addAfter.current;
    addAfter.current = null;
    if (pending) account.settled().then(() => addFriend(pending.slug, pending.profile));
  };
  // signed out, account deleted or session lost: the next sign-in starts on the tags, a shared tag stays open
  const wasSignedIn = useRef(signedIn);
  useEffect(() => {
    if (wasSignedIn.current && !signedIn && viewRef.current.name !== 'profile') setViewRaw({ name: 'people' });
    wasSignedIn.current = signedIn;
  }, [signedIn]);

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
    if (slug) setViewRef.current({ name: 'profile', slug });
  }, []);

  // wishloop://results/{id} opens the pick in detail. Reacts to every URL event, so reopening the same link reloads it too
  useEffect(() => {
    const open = (url?: string | null) => {
      const slug = Platform.OS === 'web' ? null : slugFromUrl(url);
      // the inviter, kept until a new account is created (web: attribution.web.ts reads the address)
      if (slug) noteRef(slug);
      if (slug) return setViewRef.current({ name: 'profile', slug });
      const id = idFromUrl(url ?? null);
      if (id) loadResult(id).then((result) => setViewRef.current({ name: 'detail', result, id: null })).catch(() => {});
    };
    Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => sub.remove();
  }, []);

  // Tapping a notification: the person's chat, otherwise the shared tag it is about
  useEffect(
    () =>
      onPushOpen(({ personId, slug }) => {
        // signed out, the person may only come back with the account, so the chat is kept as the target
        if (personId && (!getSession() || peopleRef.current.some((p) => p.id === personId))) return setViewRef.current({ name: 'thread', id: personId });
        if (slug) setViewRef.current({ name: 'profile', slug });
      }),
    [],
  );

  // Screen transitions. p: 1 = the top screen is in place, 0 = it is gone. `under` is the screen shown below it
  // while it moves (forward: where we came from; back: where we go). Without a transition it is null.
  const p = useSharedValue(1);
  const kindSV = useSharedValue<Kind>('slide');
  const viewRef = useRef(view);
  viewRef.current = view;
  const [tr, setTr] = useState<{ under: View_; n: number; dir: 'in' | 'out' | 'drag' } | null>(null);
  const trN = useRef(0);
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  const keyOf = (v: View_) => v.name + ('id' in v ? (v.id ?? '') : '') + (v.name === 'profile' ? v.slug : '');
  const kindFor = (v: View_, zoom?: boolean): Kind => (reduce ? 'fade' : zoom ? 'zoom' : 'slide');
  // forward: the new screen comes in over the current one
  const setView = (next: View_, zoom = false) => {
    // before sign-in the view is only remembered: it opens once the gate lets the app through
    if (!onboarded || !getSession() || keyOf(next) === keyOf(viewRef.current)) return setViewRaw(next);
    kindSV.value = kindFor(next, zoom);
    p.value = 0;
    setTr({ under: viewRef.current, n: ++trN.current, dir: 'in' });
    setViewRaw(next);
  };
  setViewRef.current = setView;
  const flushRemove = () => {
    const id = removeAfter.current;
    removeAfter.current = null;
    if (id) accountRef.current?.removePerson(id);
  };
  const done = (n: number, to?: View_) => {
    if (trN.current !== n) return;
    if (to) setViewRaw(to);
    p.value = 1;
    setTr(null);
    flushRemove();
  };
  // back: the current screen leaves, the target is shown below it and then becomes the screen
  const pop = (target: View_) => {
    if (!onboarded || !getSession()) {
      setViewRaw(target);
      return flushRemove();
    }
    kindSV.value = kindFor(target, viewRef.current.name === 'add');
    setTr({ under: target, n: ++trN.current, dir: 'out' });
  };
  const swipeTarget = useRef<View_>({ name: 'people' });
  const popTarget = (): View_ => {
    const v = viewRef.current;
    return (v.name === 'edit' || v.name === 'snap' || v.name === 'detail') && v.id ? { name: 'thread', id: v.id } : { name: 'people' };
  };
  // start the spring once the screens are mounted
  useEffect(() => {
    if (!tr || tr.dir === 'drag') return;
    const n = tr.n;
    if (tr.dir === 'in') {
      p.value = withSpring(1, SPRING, (finished) => finished && runOnJS(done)(n));
    } else {
      const target = tr.under;
      p.value = withSpring(0, SPRING, (finished) => finished && runOnJS(done)(n, target));
    }
  }, [tr?.n, tr?.dir]);
  const topStyle = useAnimatedStyle(() => {
    const k = kindSV.value;
    if (k === 'fade') return { opacity: p.value, transform: [{ translateX: 0 }, { scale: 1 }] };
    if (k === 'zoom') return { opacity: Math.min(1, p.value * 1.6), transform: [{ translateX: 0 }, { scale: 0.9 + 0.1 * p.value }] };
    return { opacity: 1, transform: [{ translateX: (1 - p.value) * WIDTH }, { scale: 1 }] };
  });
  const underStyle = useAnimatedStyle(() => ({ transform: [{ translateX: kindSV.value === 'slide' ? -0.3 * WIDTH * p.value : 0 }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: (kindSV.value === 'slide' ? 0.1 : kindSV.value === 'zoom' ? 0.06 : 0) * p.value }));
  const goBack = () => {
    // the web address of a shared tag goes away with it, so a reload lands on the tags
    if (view.name === 'profile' && Platform.OS === 'web') window.history.replaceState(null, '', '/');
    pop(popTarget());
  };
  const swipe = {
    onStart: () => {
      kindSV.value = kindFor(popTarget(), viewRef.current.name === 'add');
      swipeTarget.current = popTarget();
      setTr({ under: swipeTarget.current, n: ++trN.current, dir: 'drag' });
    },
    onRelease: (go: boolean, vx: number) => {
      const n = trN.current;
      if (go) {
        if (viewRef.current.name === 'profile' && Platform.OS === 'web') window.history.replaceState(null, '', '/');
        const target = swipeTarget.current;
        p.value = withSpring(0, { ...SPRING, velocity: -vx * 1000 / WIDTH }, (finished) => finished && runOnJS(done)(n, target));
      } else p.value = withSpring(1, SPRING, (finished) => finished && runOnJS(done)(n));
    },
  };

  const renderScreen = (v: View_) => {
    const person = 'id' in v ? (people.find((x) => x.id === v.id) ?? null) : null;
    return (
      v.name === 'profile' ? (
        <ProfileView key={v.slug} slug={v.slug} people={people} mine={me.share?.slug === v.slug} onBack={goBack} onAdd={(profile) => addFriend(v.slug, profile)} onOpen={(p) => setView({ name: 'thread', id: p.id })} />
      ) : v.name === 'add' ? (
        <AddPerson usedColors={people.map((p) => p.color)} onBack={goBack} onDone={add} />
      ) : v.name === 'me' ? (
        <MeScreen
          me={me}
          account={account}
          lang={lang}
          onLanguage={changeLanguage}
          onBack={goBack}
          onChange={changeMe}
        />
      ) : v.name === 'edit' && person ? (
        <AddPerson
          key={`edit-${person.id}`}
          initial={person}
          usedColors={people.filter((p) => p.id !== person.id).map((p) => p.color)}
          onBack={goBack}
          onPin={(item, resultId) => pin(person.id, item, resultId)}
          onDone={(fields) => {
            update(person.id, (p) => ({ ...p, ...fields }));
            pop({ name: 'thread', id: person.id });
          }}
          onDelete={() => {
            removeAfter.current = person.id;
            pop({ name: 'people' });
          }}
        />
      ) : v.name === 'thread' && person ? (
        <Thread
          key={person.id}
          person={person}
          busy={busyId === person.id}
          error={error?.id === person.id ? error.text : null}
          header={person.friendSlug ? <FriendWishes person={person} gone={goneSlugs.includes(person.friendSlug)} /> : undefined}
          draft={drafts.current[person.id]}
          onDraft={(text) => { drafts.current[person.id] = text; }}
          onBack={goBack}
          onSend={(text) => send(person, text)}
          onSnap={() => setView({ name: 'snap', id: person.id })}
          onPin={(item, resultId) => pin(person.id, item, resultId)}
          onOpen={(result) => setView({ name: 'detail', result, id: person.id })}
          onEdit={() => setView({ name: 'edit', id: person.id })}
        />
      ) : v.name === 'snap' ? (
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
      ) : v.name === 'detail' ? (
        <Detail
          // A deep-linked result belongs to whoever has it in their thread, if anyone
          person={person ?? people.find((p) => p.messages.some((m) => m.role === 'agent' && m.result.id === v.result.id)) ?? null}
          result={v.result}
          onBack={goBack}
          onPin={person ? (item, resultId) => pin(person.id, item, resultId) : undefined}
        />
      ) : (
        <People brand={BRAND} people={people} onOpen={(p) => setView({ name: 'thread', id: p.id })} onAdd={() => setView({ name: 'add' }, true)} onMe={() => setView({ name: 'me' })} onSnap={() => setView({ name: 'snap', id: null })} />
      )
    );
  };

  return (
    <View pointerEvents={account.signingOut ? 'none' : 'auto'} style={{ flex: 1, backgroundColor: C.paper, paddingTop: installBanner && !installOpen ? 0 : insets.top + 8 }}>
      <StatusBar style="dark" />
      {impersonation && signedIn && <ImpersonationStrip email={account.session?.email ?? ''} />}
      <InstallBanner open={installBanner && !installOpen} onClose={() => setInstallBanner(false)} onOpenSheet={() => setInstallOpen(true)} />
      {impersonation && !signedIn ? (
        // the simulator's session ended or expired: never the sign-in, the admin's own account stays outside
        <ImpersonationEnded />
      ) : !signedIn && view.name === 'profile' && !askSignIn ? (
        // a shared tag without an account: the preview, before or after the onboarding
        <ProfileView
          key={view.slug}
          slug={view.slug}
          people={people}
          mine={false}
          onBack={() => {
            if (Platform.OS === 'web') window.history.replaceState(null, '', '/');
            setViewRaw({ name: 'people' });
          }}
          onAdd={(profile) => {
            addAfter.current = { slug: view.slug, profile };
            setAskSignIn(true);
          }}
          onOpen={() => setAskSignIn(true)}
        />
      ) : !onboarded ? (
        <Onboarding
          lang={lang}
          account={account}
          onLanguage={changeLanguage}
          onSignedIn={afterSignIn}
          onDone={() => {
            writeSettings({ onboarded: true });
            setOnboarded(true);
            // the install hint only comes once the app is usable, after the sign-in
            if (!impersonation && installTrigger('onboarding')) setInstallBanner(true);
          }}
        />
      ) : !signedIn ? (
        <SignIn
          account={account}
          lang={lang}
          onLanguage={changeLanguage}
          onBack={askSignIn && view.name === 'profile' ? () => { addAfter.current = null; setAskSignIn(false); } : undefined}
          onDone={afterSignIn}
        />
      ) : (
        <View style={{ flex: 1 }}>
          {/* both layers keep their key, so the screen that was below becomes the top one without remounting */}
          {tr && (
            <Reanimated.View key={keyOf(tr.under)} pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, underStyle]}>
              {renderScreen(tr.under)}
            </Reanimated.View>
          )}
          {tr && <Reanimated.View key="dim" pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#000' }, dimStyle]} />}
          <Reanimated.View
            key={keyOf(view)}
            pointerEvents={tr ? 'none' : 'auto'}
            style={[{ flex: 1, backgroundColor: C.paper, shadowColor: '#000', shadowOpacity: tr ? 0.15 : 0, shadowRadius: 10, shadowOffset: { width: -3, height: 0 } }, topStyle]}
          >
            {renderScreen(view)}
          </Reanimated.View>
          {view.name !== 'people' && <EdgeBack p={p} onStart={swipe.onStart} onRelease={swipe.onRelease} />}
        </View>
      )}
      <InstallSheet open={installOpen} onClose={() => { setInstallOpen(false); setInstallBanner(false); }} />
    </View>
  );
}
