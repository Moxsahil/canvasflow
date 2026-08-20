import { Card, CardContent, CardHeader, CardTitle, Text } from '@canvasflow/ui';
import Link from 'next/link';
import { boards, createClient, lookupShareLink } from '@canvasflow/db';
import { eq } from 'drizzle-orm';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { JoinForm } from './join-form';

/**
 * The page a share link opens.
 *
 * Public by design — a guest has no session, so this route is exempted from
 * the auth middleware. It reveals only the board's title, and only to someone
 * already holding a valid token.
 *
 * Nothing is granted by loading this page. Access is written when the visitor
 * acts, in the server actions, so a crawler or a link preview cannot consume
 * a single-use invite.
 */

const db = createClient(env.DATABASE_URL);

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  const found = await lookupShareLink(db, token);
  if (!found.ok) {
    return (
      <InviteShell title={rejectionTitle(found.reason)} message={rejectionBody(found.reason)} />
    );
  }

  const boardRows = await db
    .select({ title: boards.title })
    .from(boards)
    .where(eq(boards.id, found.link.boardId))
    .limit(1);

  const boardTitle = boardRows[0]?.title ?? 'Untitled board';
  const session = await auth();

  return (
    <InviteShell title="You've been invited">
      <JoinForm
        token={token}
        boardTitle={boardTitle}
        role={found.link.role}
        allowGuests={found.link.allowGuests}
        signedIn={Boolean(session?.user?.id)}
        signInHref={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
      />
    </InviteShell>
  );
}

function rejectionTitle(reason: string): string {
  return reason === 'not-found' ? 'Link not valid' : 'Link no longer works';
}

function rejectionBody(reason: string): string {
  switch (reason) {
    case 'revoked':
      return 'The board owner has turned this link off. Ask them for a new one.';
    case 'expired':
      return 'This link has expired. Ask the board owner for a new one.';
    case 'exhausted':
      return 'This link has already been used the maximum number of times.';
    case 'board-deleted':
      return 'The board this link pointed to has been deleted.';
    default:
      return 'Check that you copied the whole link, or ask for a new one.';
  }
}

function InviteShell({
  title,
  message,
  children,
}: {
  title: string;
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <Text tone="secondary" size="sm">
              {message}
            </Text>
          )}
          {children}
          {!children && (
            <Link href="/boards" className="text-sm underline">
              Go to your boards
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
