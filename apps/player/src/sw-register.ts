/** Production only: the service worker caches the shell, engine chunks and content-hashed pack bundles. */
export function registerSW(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* the player works without it */
    });
  });
}
