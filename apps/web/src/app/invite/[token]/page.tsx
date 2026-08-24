import Link from 'next/link';
import { boards, createClient, lookupShareLink } from '@canvasflow/db';
import { eq } from 'drizzle-orm';
import { Edit3, Eye, Link2Off } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
 *
 * Wears the same card as the dialog that produced the link: whoever sent it
 * was looking at this exact header a moment ago.
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
    <InviteShell title={boardTitle} role={found.link.role}>
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
  role,
  children,
}: {
  title: string;
  message?: string;
  /** Present only for a link that still works — it decides the whole header. */
  role?: 'owner' | 'editor' | 'viewer';
  children?: React.ReactNode;
}) {
  const PermissionIcon = role === 'viewer' ? Eye : Edit3;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              {role ? (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                  {getInitials(title)}
                </span>
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Link2Off size={20} />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-lg font-semibold">{title}</CardTitle>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                {role ? (
                  <>
                    <PermissionIcon size={14} />
                    You&rsquo;ve been invited to {role === 'viewer' ? 'view' : 'edit'}
                  </>
                ) : (
                  'Shared board link'
                )}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          {children}
          {!children && (
            <Button asChild variant="outline" className="w-full">
              <Link href="/open">Go to your own boards</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
