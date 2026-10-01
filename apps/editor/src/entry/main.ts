import { hasAccountSession } from './session';

const webUrl = import.meta.env.VITE_WEB_URL || 'https://canvasflowapp.com';
const apiUrl = import.meta.env.VITE_API_URL;

// Plain HTML already contains working production links. Use the configured
// web host for local development and staging without changing canonicals.
for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-web-path]')) {
  link.href = new URL(link.dataset.webPath!, webUrl).href;
}

// Only a confirmed account session can skip this page. Returning users with
// an expired access cookie can still use /open, which renews their session.
if (apiUrl) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3000);
  void hasAccountSession(apiUrl, controller.signal)
    .then((signedIn) => {
      if (signedIn) window.location.replace(new URL('/open', webUrl).href);
    })
    .finally(() => window.clearTimeout(timeout));
}
