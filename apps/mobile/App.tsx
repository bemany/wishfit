import './global.css';

import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono/500Medium';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { idFromUrl, loadPeople, loadResult, recommend, savePeople, type Person, type Result } from './src/api';
import { AddPerson, Detail, People, Thread } from './src/screens';
import { C } from './src/theme';

// Working title, the name vote is still running: change it here only
const BRAND = 'Wishfit';

type View_ = { name: 'people' } | { name: 'add' } | { name: 'thread'; id: string } | { name: 'detail'; result: Result; id: string | null };

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

function Root() {
  const insets = useSafeAreaInsets();
  const [people, setPeople] = useState<Person[]>(loadPeople);
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

  return (
    <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top + 8 }}>
      <StatusBar style="dark" />
      {view.name === 'add' ? (
        <AddPerson onBack={() => setView({ name: 'people' })} onDone={add} />
      ) : view.name === 'thread' && person ? (
        <Thread
          key={person.id}
          person={person}
          busy={busyId === person.id}
          error={error?.id === person.id ? error.text : null}
          onBack={() => setView({ name: 'people' })}
          onSend={(text) => send(person, text)}
          onOpen={(result) => setView({ name: 'detail', result, id: person.id })}
        />
      ) : view.name === 'detail' ? (
        <Detail
          // A deep-linked result belongs to whoever has it in their thread, if anyone
          person={person ?? people.find((p) => p.messages.some((m) => m.role === 'agent' && m.result.id === view.result.id)) ?? null}
          result={view.result}
          onBack={() => setView(view.id ? { name: 'thread', id: view.id } : { name: 'people' })}
        />
      ) : (
        <People brand={BRAND} people={people} onOpen={(p) => setView({ name: 'thread', id: p.id })} onAdd={() => setView({ name: 'add' })} />
      )}
    </View>
  );
}
