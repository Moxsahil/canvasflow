'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Button, Input, Text, Card, CardContent, CardHeader, CardTitle } from '@canvasflow/ui';
import { signup } from '@/features/auth/actions/signup';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signup({ name, email, password });
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? 'Signup failed');
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 bg-zinc-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
          </CardHeader>
          <CardContent>
            <Text tone="secondary">
              We sent a verification link to <strong>{email}</strong>. Click it to activate your
              account.
            </Text>
            <Text size="sm" tone="muted" className="mt-4">
              Didn&apos;t receive it? Check your spam folder.
            </Text>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 bg-zinc-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <Text tone="secondary" size="sm" className="mt-1">
            Get started with CanvasFlow
          </Text>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => signIn('google', { callbackUrl: '/boards' })}
            >
              Continue with Google
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => signIn('github', { callbackUrl: '/boards' })}
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

          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />

            {error && (
              <Text size="sm" tone="danger">
                {error}
              </Text>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <Text size="sm" tone="secondary" className="text-center mt-4">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </Text>
        </CardContent>
      </Card>
    </main>
  );
}
