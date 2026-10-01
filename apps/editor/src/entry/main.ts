// A host using an SPA fallback can serve index.html for a board link. Load
// that board in place so its id and token survive instead of looping via /open.
if (window.location.pathname.startsWith('/boards/')) {
  void import('../main');
} else {
  // Normally the server redirects the root before serving HTML. Keep a silent
  // fallback for static hosts; /open restores the session and selects a board.
  const webUrl = import.meta.env.VITE_WEB_URL || 'https://canvasflowapp.com';
  window.location.replace(new URL('/open', webUrl).href);
}
