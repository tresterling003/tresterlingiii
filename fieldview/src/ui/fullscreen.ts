/** User-initiated fullscreen with vendor fallbacks. Returns false if unavailable. */
export async function requestFullscreen(el: HTMLElement): Promise<boolean> {
  const anyEl = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return true;
    }
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
      return true;
    }
    if (anyEl.webkitRequestFullscreen) {
      await anyEl.webkitRequestFullscreen();
      return true;
    }
  } catch (e) {
    console.warn('Fullscreen request failed', e);
  }
  alert('Fullscreen is not available here. Use your browser’s fullscreen shortcut instead: F11 (Windows/Linux) or Ctrl+Cmd+F (Mac).');
  return false;
}
