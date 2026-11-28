import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from './api';
import { explain, type Account } from './account';
import { t } from './i18n';
import { C } from './theme';
import { Body, Btn, Header, Mono, Name, Pill, Tag, s } from './ui';

const field = [s.input, { flex: 0 }] as const;

// Sign-in screen, the one way in for new and returning users: a big gift tag with the e-mail, then the
// 6-digit code. See openspec/changes/signin-required (design.md 1)
export function SignIn({ account, onBack, onDone }: { account: Account; onBack?: () => void; onDone?: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'email' | 'code'>('email');
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
      onDone?.();
    }, t('tryAgain'), true);

  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.top + 8} style={{ flex: 1 }}>
      {onBack && <Header onBack={onBack} />}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24, gap: 16 }}>
        <Tag color={C.lemon} style={{ gap: 14, paddingBottom: 24 }}>
          <View style={s.row}>
            <Mono>{t('account')}</Mono>
            <Mono>{step === 'email' ? t('email') : t('code')}</Mono>
          </View>
          <Name>{step === 'email' ? t('signInTitle') : t('codeTitle')}</Name>
          {step === 'email' ? (
            <>
              <Body>{t('signInBody')}</Body>
              <TextInput accessibilityLabel={t('email')} value={email} onChangeText={setEmail} onSubmitEditing={sendCode} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" returnKeyType="send" placeholder="you@example.com" placeholderTextColor={C.mute} style={field} />
              <Btn label={t('sendCode')} disabled={busy || !email.includes('@')} onPress={sendCode} />
            </>
          ) : (
            <>
              <Body>{t('codeSent', { email: email.trim() })}</Body>
              {account.devCode && <Mono accessibilityLabel={t('testCodeLabel')}>{t('testCode', { code: account.devCode })}</Mono>}
              <TextInput
                accessibilityLabel={t('code')}
                value={code}
                onChangeText={(text) => {
                  const next = text.replace(/\D/g, '').slice(0, 6);
                  setCode(next);
                  if (next.length === 6 && next !== code && !busy) confirm(next);
                }}
                onSubmitEditing={() => confirm()}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                placeholderTextColor={C.mute}
                style={field}
              />
              <Btn label={t('signIn')} disabled={busy || code.length !== 6} onPress={() => confirm()} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pill label={t('sendAgain')} onPress={busy ? undefined : sendCode} />
                <Pill
                  label={t('otherEmail')}
                  onPress={() => {
                    setStep('email');
                    setNote(null);
                    setLost(false);
                  }}
                />
              </View>
            </>
          )}
          {note && <Mono style={{ color: C.ink }}>{note}</Mono>}
          {step === 'code' && lost && <Btn label={t('newCode')} disabled={busy} onPress={sendCode} />}
        </Tag>
        <Mono mute style={{ textAlign: 'center' }}>
          {t('signInHint')}
        </Mono>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Account block on the Me screen: who is signed in, the sync state, sign out and delete
export function AccountPanel({ account }: { account: Account }) {
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

  if (!account.session) return null;
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
