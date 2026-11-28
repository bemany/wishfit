// The admin simulator exists on the web only, see impersonation.web.ts
export type Impersonation = { userId: string; prefix: string };
export const impersonation: Impersonation | null = null;
export const clearImpersonation = (_prefix: string) => {};
export const notifyEnded = () => {};
