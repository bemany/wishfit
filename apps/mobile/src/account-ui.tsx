import { useState } from 'react';
import { Alert, Platform, TextInput, View } from 'react-native';

import { ApiError } from './api';
import { explain, type Account } from './account';
import { t } from './i18n';
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
  // the answer to verify never arrived; the server may have used the code up already
  const [lost, setLost] = useState(false);

  const run = async (fn: () => Promise<void>, fallback: string, verifying = false) => {
    setBusy(true);
    setNote(null);
    setLost(false);
    try {
      await fn();
    } catch (e) {
      if (verifying && e instanceof ApiError && e.status === 0) {
        setNote(t('connectionLost'));
        setLost(true);
      } else setNote(explain(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      await account.requestCode(email);
      setCode('');
      setStep('code');
    }, t('cantSendCode'));
  // the number pad has no return key and can cover the button, so six digits sign in by themselves
  const confirm = (value = code) =>
    run(async () => {
      await account.verify(email, value);
      setStep('idle');
      setEmail('');
      setCode('');
    }, t('tryAgain'), true);

  const askDelete = () => {
    const del = () => run(account.deleteAccount, t('cantDelete'));
    const text = t('deleteText');
    if (Platform.OS === 'web') {
      if (window.confirm(text)) del();
      return;
    }
    Alert.alert(t('deleteAsk'), text, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deleteAccount'), style: 'destructive', onPress: del },
    ]);
  };

  if (account.session) {
    return (
      <View style={{ gap: 10 }}>
        <Mono mute>{t('account')}</Mono>
        <Body accessibilityLabel={t('signedInAs')}>{account.session.email}</Body>
        <Mono mute>{account.syncError ?? (account.syncing ? t('syncing') : t('synced'))}</Mono>
        {account.notStored && <Mono mute>{t('notStored')}</Mono>}
        {note && <Mono style={{ color: C.tomato }}>{note}</Mono>}
        <Btn label={t('signOut')} secondary disabled={busy} onPress={() => run(account.signOut, t('cantSignOut'))} />
        <Btn label={t('deleteAccount')} secondary disabled={busy} onPress={askDelete} />
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Mono mute>{t('account')}</Mono>
      {step === 'idle' && (
        <>
          <Body style={{ color: C.mute }}>{t('signInPitch')}</Body>
          <Btn label={t('signInSync')} secondary onPress={() => setStep('email')} />
        </>
      )}
      {step === 'email' && (
        <>
          <TextInput accessibilityLabel={t('email')} value={email} onChangeText={setEmail} onSubmitEditing={sendCode} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" returnKeyType="send" placeholder="you@example.com" placeholderTextColor={C.mute} style={field} />
          <Btn label={t('sendCode')} disabled={busy || !email.includes('@')} onPress={sendCode} />
        </>
      )}
      {step === 'code' && (
        <>
          <Body>{t('codeSent', { email: email.trim() })}</Body>
          {account.devCode && <Mono accessibilityLabel={t('testCodeLabel')}>{t('testCode', { code: account.devCode })}</Mono>}
          <TextInput accessibilityLabel={t('code')} value={code} onChangeText={(t) => {
              const next = t.replace(/\D/g, '').slice(0, 6);
              setCode(next);
              if (next.length === 6 && next !== code && !busy) confirm(next);
            }}
            onSubmitEditing={() => confirm()} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} placeholder="123456" placeholderTextColor={C.mute} style={field} />
          <Btn label={t('signIn')} disabled={busy || code.length !== 6} onPress={() => confirm()} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pill label={t('sendAgain')} onPress={sendCode} />
            <Pill label={t('otherEmail')} onPress={() => { setStep('email'); setNote(null); }} />
          </View>
        </>
      )}
      {note && <Mono style={{ color: C.tomato }}>{note}</Mono>}
      {step === 'code' && lost && <Btn label={t('newCode')} disabled={busy} onPress={sendCode} />}
    </View>
  );
}
