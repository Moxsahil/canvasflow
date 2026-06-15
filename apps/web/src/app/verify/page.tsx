import { redirect } from 'next/navigation';
import { createClient } from '@canvasflow/db';
import { users, verificationTokens } from '@canvasflow/db';
import { eq, and, gt } from 'drizzle-orm';
import { env } from '@/lib/env';
import { Card, CardContent, CardHeader, CardTitle, Text } from '@canvasflow/ui';
import Link from 'next/link';

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
    <main className="flex min-h-screen items-center justify-center px-4 bg-zinc-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Text tone="secondary">{message}</Text>
          <Link
            href="/login"
            className="mt-4 inline-block text-brand-600 hover:text-brand-700 text-sm font-medium"
          >
            Back to login
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
