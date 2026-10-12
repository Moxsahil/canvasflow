'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, LoaderCircle } from 'lucide-react';
import type { NotificationKind } from '@canvasflow/types';
import { authStyles } from '@/components/auth/auth-shell';
import { clientEnv } from '@/lib/env.client';
import { cn } from '@/lib/utils';

type State = { kind: 'idle' | 'sending' | 'done' } | { kind: 'failed'; message: string };

/** The one button: turns the switch off through the gateway, then says so. */
export function UnsubscribeButton({
  userId,
  kind,
  token,
  topic,
}: {
  userId: string;
  kind: NotificationKind;
  token: string;
  topic: string;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const unsubscribe = async () => {
    setState({ kind: 'sending' });
    const url = new URL('/notifications/unsubscribe', clientEnv.NEXT_PUBLIC_API_URL);
    url.search = new URLSearchParams({ u: userId, k: kind, t: token }).toString();
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        setState({ kind: 'done' });
        return;
      }
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setState({
        kind: 'failed',
        message:
          res.status === 429
            ? 'Too many tries. Wait a minute and try again.'
            : (body?.message ?? 'That didn’t work. Try again in a moment.'),
      });
    } catch {
      setState({ kind: 'failed', message: 'Couldn’t reach CanvasFlow. Check your connection.' });
    }
  };

  if (state.kind === 'done') {
    return (
      <div>
        <p
          role="status"
          className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5 text-sm leading-relaxed text-white/70"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">
            <Check size={18} aria-hidden="true" />
          </span>
          You won’t get emails about {topic} any more.
        </p>
        <Link href="/open" className={cn(authStyles.provider, 'mt-5')}>
          Go to your boards
        </Link>
      </div>
    );
  }

  const sending = state.kind === 'sending';
  return (
    <div>
      {state.kind === 'failed' && (
        <p role="alert" className="mb-4 text-sm text-red-400">
          {state.message}
        </p>
      )}
      <button
        type="button"
        className={cn(authStyles.submit, 'gap-2')}
        disabled={sending}
        aria-busy={sending}
        onClick={() => void unsubscribe()}
      >
        {sending && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
        Unsubscribe
      </button>
    </div>
  );
}
