import './global.css';

import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono/500Medium';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Linking, PanResponder, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { idFromUrl, loadMe, loadPeople, loadResult, recommend, saveMe, savePeople, type Me, type Person, type Result } from './src/api';
import { AddPerson, Detail, MeScreen, People, Thread } from './src/screens';
import { C } from './src/theme';

// Working title, the name vote is still running: change it here only
const BRAND = 'Wishfit';

type View_ = { name: 'people' } | { name: 'me' } | { name: 'add' } | { name: 'edit'; id: string } | { name: 'thread'; id: string } | { name: 'detail'; result: Result; id: string | null };

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
  // ponytail: one request at a time across all threads
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  const update = (id: string, change: (p: Person) => Person) =>
    setPeople((all) => {
      const next = all.map((p) => (p.id === id ? change(p) : p));
      savePeople(next);
      return next;
    });

  const send = async (person: Person, text: string) => {
    setBusyId(person.id);
    setError(null);
    update(person.id, (p) => ({ ...p, messages: [...p.messages, { role: 'user', text }] }));
    try {
      const result = await recommend(person, text);
      update(person.id, (p) => ({ ...p, lastResultId: result.id, messages: [...p.messages, { role: 'agent', result }] }));
    } catch (e) {
      // An unanswered message does not stay in the thread, only the error line does
      update(person.id, (p) => {
        const last = p.messages.at(-1);
        return last?.role === 'user' && last.text === text ? { ...p, messages: p.messages.slice(0, -1) } : p;
      });
      setError({ id: person.id, text: e instanceof Error ? e.message : 'Unknown error.' });
    } finally {
      setBusyId(null);
    }
  };

  const add = (fields: Omit<Person, 'id' | 'messages' | 'lastResultId'>) => {
    const person: Person = { ...fields, id: `p_${Date.now()}`, messages: [], lastResultId: null };
    const next = [person, ...people];
    setPeople(next);
    savePeople(next);
    setView({ name: 'thread', id: person.id });
  };

  // wishloop://results/{id} opens the pick in detail. Reacts to every URL event, so reopening the same link reloads it too
  useEffect(() => {
    const open = (url?: string | null) => {
      const id = idFromUrl(url ?? null);
      if (id) loadResult(id).then((result) => setView({ name: 'detail', result, id: null })).catch(() => {});
    };
    Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => sub.remove();
  }, []);

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
      view.name === 'edit' ? { name: 'thread', id: view.id } : view.name === 'detail' && view.id ? { name: 'thread', id: view.id } : { name: 'people' };
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
      {view.name === 'add' ? (
        <AddPerson usedColors={people.map((p) => p.color)} onBack={goBack} onDone={add} />
      ) : view.name === 'me' ? (
        <MeScreen
          me={me}
          onBack={goBack}
          onChange={(next) => {
            setMe(next);
            saveMe(next);
          }}
        />
      ) : view.name === 'edit' && person ? (
        <AddPerson
          key={`edit-${person.id}`}
          initial={person}
          usedColors={people.filter((p) => p.id !== person.id).map((p) => p.color)}
          onBack={goBack}
          onDone={(fields) => {
            update(person.id, (p) => ({ ...p, ...fields }));
            setView({ name: 'thread', id: person.id });
          }}
          onDelete={() => {
            const next = people.filter((p) => p.id !== person.id);
            setPeople(next);
            savePeople(next);
            setView({ name: 'people' });
          }}
        />
      ) : view.name === 'thread' && person ? (
        <Thread
          key={person.id}
          person={person}
          busy={busyId === person.id}
          error={error?.id === person.id ? error.text : null}
          onBack={goBack}
          onSend={(text) => send(person, text)}
          onOpen={(result) => setView({ name: 'detail', result, id: person.id })}
          onEdit={() => setView({ name: 'edit', id: person.id })}
        />
      ) : view.name === 'detail' ? (
        <Detail
          // A deep-linked result belongs to whoever has it in their thread, if anyone
          person={person ?? people.find((p) => p.messages.some((m) => m.role === 'agent' && m.result.id === view.result.id)) ?? null}
          result={view.result}
          onBack={goBack}
        />
      ) : (
        <People brand={BRAND} people={people} onOpen={(p) => setView({ name: 'thread', id: p.id })} onAdd={() => setView({ name: 'add' })} onMe={() => setView({ name: 'me' })} />
      )}
      </Animated.View>
      {view.name !== 'people' && <EdgeBack x={x} onBack={goBack} />}
    </View>
  );
}
