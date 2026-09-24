import type { Metadata } from 'next';
import { ResetPasswordClient } from './reset-password-client';

/**
 * A server component so this can be declared: the address bar can hold a live
 * reset token here, and without `no-referrer` any outbound request from this
 * page would put the whole URL into a Referer header. The same protection
 * /verify-email has, backed by the header set in next.config.mjs.
 *
 * Nothing third-party belongs on this page for the same reason.
 */
export const metadata: Metadata = {
  title: 'Choose a new password',
  referrer: 'no-referrer',
};

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
