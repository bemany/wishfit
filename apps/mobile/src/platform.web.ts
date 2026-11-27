// Web variants of src/platform.ts

export const openLink = async (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

// Share sheet where the browser has one, otherwise the text goes to the clipboard
export const shareText = async (message: string) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) await navigator.share({ text: message });
    else await navigator.clipboard.writeText(message);
  } catch {
    // dismissed share sheet or blocked clipboard: nothing to do
  }
};

// A browser has no settings page to jump to
export const canOpenSettings = false;
export const openSettings = () => {};

export const isWeb = true;
