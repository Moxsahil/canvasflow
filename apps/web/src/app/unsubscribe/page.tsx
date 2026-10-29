import type { Metadata } from 'next';
import Link from 'next/link';
import { MailX } from 'lucide-react';
import { isNotificationKind, NOTIFICATION_EMAIL_TOPICS } from '@canvasflow/types';
import { AuthShell, authStyles } from '@/components/auth/auth-shell';
import { cn } from '@/lib/utils';
import { UnsubscribeButton } from './unsubscribe-button';

/**
 * Where an email's "Turn them off" link lands.
 *
 * Asks before it does anything: a mail scanner that opens every link in a
 * message must not turn somebody's email off. The button posts the link's
 * token to the API gateway, which is what checks it. Mail clients' own
 * unsubscribe buttons skip this page and post to the gateway directly.
 */

export const metadata: Metadata = {
  title: 'Unsubscribe · CanvasFlow',
  robots: { index: false, follow: false },
};

interface UnsubscribePageProps {
  searchParams: Promise<{ u?: string; k?: string; t?: string }>;
}

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const { u, k, t } = await searchParams;

  if (!u || !t || !isNotificationKind(k)) {
    return (
      <AuthShell heading="This link is incomplete.">
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/60">
            <MailX size={18} aria-hidden="true" />
          </span>
          <p className="text-sm leading-relaxed text-white/55">
            Copy the whole link from the email, or choose what CanvasFlow emails you about in
            Settings → Notifications.
          </p>
        </div>
        <Link href="/open" className={cn(authStyles.provider, 'mt-5')}>
          Go to your boards
        </Link>
      </AuthShell>
    );
  }

  const topic = NOTIFICATION_EMAIL_TOPICS[k];
  return (
    <AuthShell
      heading={`Stop emails about ${topic}?`}
      sub="You can turn them back on any time in Settings → Notifications."
    >
      <UnsubscribeButton userId={u} kind={k} token={t} topic={topic} />
    </AuthShell>
  );
}
