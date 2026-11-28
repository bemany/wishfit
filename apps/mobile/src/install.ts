// Native stub of install.web.ts: the native app is installed from the App Store, there is nothing to offer

export type InstallMode = 'none' | 'prompt' | 'ios-safari' | 'ios-other';
export const useInstallMode = (): InstallMode => 'none';
export const promptInstall = async (): Promise<boolean> => false;
export const snoozeInstall = () => {};
export const installTrigger = (_when: 'onboarding' | 'recommendation'): boolean => false;
