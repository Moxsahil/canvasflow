import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmailClient } from './verify-email-client';

/**
 * A server component purely so this can be declared: the address bar holds a
 * live token here, and without `no-referrer` any outbound request from this
 * page would put the whole verification URL into a Referer header, handing
 * the token to whatever it was sent to.
 *
 * Nothing third-party belongs on this page for the same reason.
 */
export const metadata: Metadata = {
  title: 'Verify your email',
  referrer: 'no-referrer',
};

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailClient />
    </Suspense>
  );
}
