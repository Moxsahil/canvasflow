'use client';

import { signOut, useSession } from 'next-auth/react';
import { Badge, Button, Text } from '@canvasflow/ui';

export function Topbar() {
  const { data: session } = useSession();

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        <Badge variant="brand">Dev mode</Badge>
        {session?.user && (
          <>
            <Text size="sm" tone="secondary">
              {session.user.name ?? session.user.email}
            </Text>
            <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/' })}>
              Sign out
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
