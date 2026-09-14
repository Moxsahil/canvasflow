import { redirect } from 'next/navigation';
import { createClient } from '@canvasflow/db';
import { users, verificationTokens } from '@canvasflow/db';
import { eq, and, gt } from 'drizzle-orm';
import { env } from '@/lib/env';
import Link from 'next/link';
import { AuthShell, authStyles } from '@/components/auth/auth-shell';

interface VerifyPageProps {
  searchParams: Promise<{ token?: string; email?: string }>;
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const params = await searchParams;
  const token = params.token;
  const email = params.email;

  if (!token || !email) {
    return (
      <VerifyShell
        title="Invalid link"
        message="This verification link is missing required parameters."
      />
    );
  }

  const db = createClient(env.DATABASE_URL);

  const found = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.token, token),
        gt(verificationTokens.expires, new Date()),
      ),
    )
    .limit(1);

  if (found.length === 0) {
    return (
      <VerifyShell
        title="Link expired or invalid"
        message="Please request a new verification email."
      />
    );
  }

  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email));

  await db
    .delete(verificationTokens)
    .where(and(eq(verificationTokens.identifier, email), eq(verificationTokens.token, token)));

  redirect('/login?verified=1');
}

function VerifyShell({ title, message }: { title: string; message: string }) {
  return (
    <AuthShell
      label="Verification"
      heading={title}
      footer={
        <Link href="/login" className={authStyles.link}>
          Back to sign in
        </Link>
      }
    >
      <p className="text-sm leading-relaxed text-white/55">{message}</p>
    </AuthShell>
  );
}
