'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Text, Card, CardContent, CardHeader, CardTitle } from '@canvasflow/ui';
import { safeRedirect } from '@/lib/safe-redirect';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirect(searchParams.get('next'), '/boards');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCredentialsSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Invalid email or password');
    } else if (result?.ok) {
      router.push(next);
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 bg-zinc-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to CanvasFlow</CardTitle>
          <Text tone="secondary" size="sm" className="mt-1">
            Welcome back
          </Text>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => signIn('google', { callbackUrl: next })}
            >
              Continue with Google
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => signIn('github', { callbackUrl: next })}
            >
              Continue with GitHub
            </Button>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-zinc-500">or</span>
            </div>
          </div>

          <form onSubmit={handleCredentialsSignIn} className="space-y-3">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <Text size="sm" tone="danger">
                {error}
              </Text>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <Text size="sm" tone="secondary" className="text-center mt-4">
            Don't have an account?{' '}
            <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700">
              Sign up
            </Link>
          </Text>
        </CardContent>
      </Card>
    </main>
  );
}
