import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from '../i18n';
import { EmbedView } from './EmbedView';
import '../styles/global.css';

/**
 * The embed page: a board shown inside another site, at /embed/{id}.
 *
 * A page of its own rather than a route in the editor, so that nothing of the
 * editor — its sign-in, its sync, the guard that refuses to run inside a
 * frame — comes with it, and the hosting header that keeps every other page
 * out of frames can leave this one alone.
 */
const embedId = decodeURIComponent(
  window.location.pathname.replace(/^\/embed\/?/, '').split('/')[0] ?? '',
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <EmbedView embedId={embedId} />
    </I18nProvider>
  </React.StrictMode>,
);
