'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button, Input, Text } from '@canvasflow/ui';
import { joinAsGuest, joinAsUser } from './actions';

interface JoinFormProps {
  token: string;
  boardTitle: string;
  role: 'owner' | 'editor' | 'viewer';
  allowGuests: boolean;
  signedIn: boolean;
  /** Where to send someone who chooses to sign in instead. */
  signInHref: string;
}

/**
 * The two ways onto a shared board.
 *
 * A signed-in visitor gets one button. Everyone else is offered the guest path
 * — which is the point of the whole feature — with signing in kept available
 * underneath, because a guest identity is disposable and someone who has an
 * account almost always wants their own.
 */
export function JoinForm({
  token,
  boardTitle,
  role,
  allowGuests,
  signedIn,
  signInHref,
}: JoinFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const capability = role === 'viewer' ? 'view' : 'edit';

  if (signedIn) {
    return (
      <div className="space-y-4">
        <Text tone="secondary" size="sm">
          You&rsquo;ll be able to {capability} <strong>{boardTitle}</strong>.
        </Text>
        {error && (
          <Text tone="danger" size="sm">
            {error}
          </Text>
        )}
        <Button
          className="w-full"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              // A successful join redirects, which throws — so anything that
              // returns here is a failure worth showing.
              const result = await joinAsUser(token);
              if (result?.error) setError(result.error);
            })
          }
        >
          {pending ? 'Opening…' : 'Open board'}
        </Button>
      </div>
    );
  }

  if (!allowGuests) {
    return (
      <div className="space-y-4">
        <Text tone="secondary" size="sm">
          This board is shared with signed-in people only.
        </Text>
        <Link href={signInHref}>
          <Button className="w-full">Sign in to continue</Button>
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      action={(formData) =>
        startTransition(async () => {
          const result = await joinAsGuest(token, formData);
          if (result?.error) setError(result.error);
        })
      }
    >
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Your name
        </label>
        <Input
          id="name"
          name="name"
          placeholder="Guest"
          maxLength={40}
          autoFocus
          autoComplete="name"
        />
        <Text tone="secondary" size="sm">
          Shown on your cursor so people know who&rsquo;s who. You&rsquo;ll be able to {capability}{' '}
          <strong>{boardTitle}</strong>.
        </Text>
      </div>

      {error && (
        <Text tone="danger" size="sm">
          {error}
        </Text>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Joining…' : 'Join board'}
      </Button>

      <Text tone="secondary" size="sm" className="text-center">
        Have an account?{' '}
        <Link href={signInHref} className="underline">
          Sign in instead
        </Link>
      </Text>
    </form>
  );
}
