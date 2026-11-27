// The web app has no push; same exports as push.ts
export type PushTarget = { personId?: string; slug?: string };
export const registerPush = async (): Promise<void> => {};
export const askPush = async (): Promise<boolean> => false;
export const unregisterPush = async (): Promise<void> => {};
export const onPushOpen = (_open: (target: PushTarget) => void): (() => void) => () => {};
