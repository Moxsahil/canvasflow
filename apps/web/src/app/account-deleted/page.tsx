import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell, authStyles } from '@/components/auth/auth-shell';
import { erasureTime } from '@/lib/account-deletion';
import { CONTACT } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Your account will be deleted',
  robots: { index: false, follow: false },
};

/**
 * Where the editor sends somebody who has just asked for their account to be
 * deleted. Every session they had has ended, so this is public, and it only
 * repeats what the confirmation email says: when it becomes final, and how to
 * stop it before then.
 */
export default async function AccountDeletedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { until } = await searchParams;

  return (
    <AuthShell label="Account deletion" heading="Your account will be deleted.">
      <div className="space-y-4 text-sm leading-relaxed text-white/55">
        <p>
          We&apos;ll erase your account and everything in it {erasureTime(until)}. We&apos;ve
          emailed you a confirmation.
        </p>
        <p>
          Changed your mind? Write to{' '}
          <a href={`mailto:${CONTACT.support}`} className={authStyles.link}>
            {CONTACT.support}
          </a>{' '}
          before then and we&apos;ll stop it.
        </p>
      </div>
      <Link href="/" className={`${authStyles.submit} mt-6`}>
        Back to CanvasFlow
      </Link>
    </AuthShell>
  );
}
