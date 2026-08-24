'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          You&rsquo;ll be able to {capability}{' '}
          <strong className="font-medium text-foreground">{boardTitle}</strong>.
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          className="w-full"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              // A successful join redirects, which throws — so anything that
              // returns here is a failure worth showing.
              const result = await joinAsUser(token);
              if (result?.error) setError(result.error);
            })
          }
        >
          Open board
        </Button>
      </div>
    );
  }

  if (!allowGuests) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          This board is shared with signed-in people only.
        </p>
        <Button asChild className="w-full">
          <Link href={signInHref}>Sign in to continue</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      action={(formData) =>
        startTransition(async () => {
          const result = await joinAsGuest(token, formData);
          if (result?.error) setError(result.error);
        })
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="name" className="font-medium">
          Your name
        </Label>
        <Input
          id="name"
          name="name"
          placeholder="Guest"
          maxLength={40}
          autoFocus
          autoComplete="name"
        />
        <p className="text-xs text-muted-foreground">
          Shown on your cursor so people know who&rsquo;s who.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" className="w-full" loading={pending}>
        Join board
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Have an account?{' '}
        <Link href={signInHref} className="text-foreground underline underline-offset-4">
          Sign in instead
        </Link>
      </p>
    </form>
  );
}
