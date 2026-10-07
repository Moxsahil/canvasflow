import Link from 'next/link';
import {
  boards,
  createClient,
  lookupShareLink,
  users,
  wasRemovedFromBoard,
  type ShareLinkRejection,
} from '@canvasflow/db';
import { eq } from 'drizzle-orm';
import { CircleSlash, Clock, Link2Off, Lock, Trash2, type LucideIcon } from 'lucide-react';
import { AuthShell, authStyles } from '@/components/auth/auth-shell';
import { env } from '@/lib/env';
import { currentUser } from '@/lib/auth/session';
import { resumeUrl } from '@/lib/auth/gateway-session';
import { cn } from '@/lib/utils';
import { BoardTile } from './board-tile';
import { JoinForm } from './join-form';

/**
 * The page a share link opens.
 *
 * Public by design — a guest has no session, so this route is exempted from
 * the auth middleware. It reveals the board's title, its tag colour and the
 * name of whoever made the link, and only to someone already holding a valid
 * token.
 *
 * Nothing is granted by loading this page. Access is written when the visitor
 * acts, in the server actions, so a crawler or a link preview cannot consume
 * a single-use invite.
 *
 * Set in the sign-in page's frame: someone without a session goes from here to
 * sign in and straight back, and the two should read as one flow.
 */

const db = createClient(env.DATABASE_URL);

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  const found = await lookupShareLink(db, token);
  if (!found.ok) return <LinkProblem reason={found.reason} />;

  const { link } = found;
  const [[board], [inviter], user] = await Promise.all([
    db
      .select({ title: boards.title, color: boards.color })
      .from(boards)
      .where(eq(boards.id, link.boardId))
      .limit(1),
    db.select({ name: users.name }).from(users).where(eq(users.id, link.createdBy)).limit(1),
    currentUser(),
  ]);

  const boardTitle = board?.title ?? 'Untitled board';
  const sharedBy = inviter?.name ?? null;

  // The link works, but not for someone the owner removed: say so now rather
  // than offer a button that will refuse them.
  if (user && (await wasRemovedFromBoard(db, link.boardId, user.id))) {
    return (
      <AuthShell label="Invitation" heading="You were removed from this board.">
        <BoardTile
          title={boardTitle}
          color={board?.color ?? 'gray'}
          sharedBy={sharedBy}
          access="removed"
        />
        <p className="mt-4 text-sm leading-relaxed text-white/55">
          The link still works, but not for you: the owner removed you from this board. Ask them to
          add you back.
        </p>
        <Link href="/open" className={cn(authStyles.provider, 'mt-5')}>
          Go to your boards
        </Link>
      </AuthShell>
    );
  }

  const access = link.role === 'viewer' ? 'viewer' : 'editor';
  const capability = access === 'viewer' ? 'view' : 'edit';

  return (
    <AuthShell
      label="Invitation"
      heading="You’re invited."
      sub={
        sharedBy
          ? `${sharedBy} invited you to ${capability} a board on CanvasFlow.`
          : `You’ve been invited to ${capability} a board on CanvasFlow.`
      }
    >
      <BoardTile
        title={boardTitle}
        color={board?.color ?? 'gray'}
        sharedBy={sharedBy}
        access={access}
      />
      <div className="mt-6">
        <JoinForm
          token={token}
          allowGuests={link.allowGuests}
          user={user && { name: user.name, email: user.email }}
          // Through the gateway rather than straight to the form: somebody whose
          // access token lapsed while they had this invite open still has a
          // session, and should come back here signed in rather than retype a
          // password. With no session it lands on sign-in with this as `next`.
          signInHref={resumeUrl(`/invite/${token}`)}
        />
      </div>
    </AuthShell>
  );
}

const PROBLEMS: Record<ShareLinkRejection, { heading: string; body: string; icon: LucideIcon }> = {
  'not-found': {
    heading: 'This link isn’t valid.',
    body: 'Check that you copied the whole link, or ask for a new one.',
    icon: CircleSlash,
  },
  revoked: {
    heading: 'This link was turned off.',
    body: 'The board owner stopped sharing with it. Ask them for a new one.',
    icon: Link2Off,
  },
  expired: {
    heading: 'This link has expired.',
    body: 'Links can be set to stop working after a while. Ask the board owner for a new one.',
    icon: Clock,
  },
  exhausted: {
    heading: 'This link has been used up.',
    body: 'It has already let in as many people as it was made for. Ask the board owner for a new one.',
    icon: Lock,
  },
  'board-deleted': {
    heading: 'This board was deleted.',
    body: 'The board this link pointed to no longer exists.',
    icon: Trash2,
  },
};

function LinkProblem({ reason }: { reason: ShareLinkRejection }) {
  const { heading, body, icon: Icon } = PROBLEMS[reason];
  return (
    <AuthShell label="Invitation" heading={heading}>
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/60">
          <Icon size={18} aria-hidden="true" />
        </span>
        <p className="text-sm leading-relaxed text-white/55">{body}</p>
      </div>
      <Link href="/open" className={cn(authStyles.provider, 'mt-5')}>
        Go to your boards
      </Link>
    </AuthShell>
  );
}
