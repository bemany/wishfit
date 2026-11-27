import { useState } from 'react';
import { Alert, Platform, TextInput, View } from 'react-native';

import { explain, type Account } from './account';
import { C } from './theme';
import { Body, Btn, Mono, Pill, s } from './ui';

const field = [s.input, { flex: 0 }] as const;

// Account block on the Me screen: sign in with an e-mail code, or signed-in state with sign out and delete
export function AccountPanel({ account }: { account: Account }) {
  const [step, setStep] = useState<'idle' | 'email' | 'code'>('idle');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote(explain(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      await account.requestCode(email);
      setCode('');
      setStep('code');
    }, "I can't send the code right now.");
  const confirm = () =>
    run(async () => {
      await account.verify(email, code);
      setStep('idle');
      setEmail('');
      setCode('');
    }, 'That did not work. Try again.');

  const askDelete = () => {
    const del = () => run(account.deleteAccount, "I can't delete the account right now.");
    const text = 'This deletes your account and the synced data on the server. Your people and wishlist stay on this phone.';
    if (Platform.OS === 'web') {
      if (window.confirm(text)) del();
      return;
    }
    Alert.alert('Delete account?', text, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: del },
    ]);
  };

  if (account.session) {
    return (
      <View style={{ gap: 10 }}>
        <Mono mute>Account</Mono>
        <Body accessibilityLabel="Signed in as">{account.session.email}</Body>
        <Mono mute>{account.syncError ?? (account.syncing ? 'Syncing…' : 'Synced')}</Mono>
        {account.notStored && <Mono mute>Your sign-in could not be saved on this device. You stay signed in until you close the app.</Mono>}
        {note && <Mono style={{ color: C.tomato }}>{note}</Mono>}
        <Btn label="Sign out" secondary disabled={busy} onPress={() => run(account.signOut, 'Could not sign out.')} />
        <Btn label="Delete account" secondary disabled={busy} onPress={askDelete} />
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Mono mute>Account</Mono>
      {step === 'idle' && (
        <>
          <Body style={{ color: C.mute }}>Sign in to keep your people and wishlist on every device.</Body>
          <Btn label="Sign in to sync" secondary onPress={() => setStep('email')} />
        </>
      )}
      {step === 'email' && (
        <>
          <TextInput accessibilityLabel="E-mail" value={email} onChangeText={setEmail} onSubmitEditing={sendCode} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" returnKeyType="send" placeholder="you@example.com" placeholderTextColor={C.mute} style={field} />
          <Btn label="Send code" disabled={busy || !email.includes('@')} onPress={sendCode} />
        </>
      )}
      {step === 'code' && (
        <>
          <Body>We sent a 6-digit code to {email.trim()}.</Body>
          {account.devCode && <Mono accessibilityLabel="Test code">Test mode: your code is {account.devCode}</Mono>}
          <TextInput accessibilityLabel="Code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} onSubmitEditing={confirm} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} placeholder="123456" placeholderTextColor={C.mute} style={field} />
          <Btn label="Sign in" disabled={busy || code.length !== 6} onPress={confirm} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pill label="Send again" onPress={sendCode} />
            <Pill label="Other e-mail" onPress={() => { setStep('email'); setNote(null); }} />
          </View>
        </>
      )}
      {note && <Mono style={{ color: C.tomato }}>{note}</Mono>}
    </View>
  );
}
