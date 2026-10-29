import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient, lookupWorkspaceInvite, type InviteRejection } from '@canvasflow/db';
import { CircleSlash, Clock, MailX, Trash2, UserCheck, type LucideIcon } from 'lucide-react';
import { AuthDivider, AuthShell, authStyles } from '@/components/auth/auth-shell';
import { env } from '@/lib/env';
import { currentUser } from '@/lib/auth/session';
import { resumeUrl } from '@/lib/auth/gateway-session';
import { cn } from '@/lib/utils';
import { AcceptForm, SignedInCard } from './accept-form';
import { WorkspaceTile } from './workspace-tile';

/**
 * The page a workspace invitation email opens.
 *
 * Public, like the share-link page beside it: the person invited may have no
 * account yet. It shows the workspace's name, who sent the invitation and the
 * address it was sent to, and only to somebody holding a token that was mailed
 * to that address.
 *
 * Nothing is granted by loading it, so a mail scanner or a link preview that
 * opens the link cannot use it up. Joining happens on the button, and only for
 * the account signed in with the invited address.
 */

export const metadata: Metadata = {
  title: 'Join a workspace · CanvasFlow',
  // A page reached by a private link has nothing to offer a search engine.
  robots: { index: false, follow: false },
};

const db = createClient(env.DATABASE_URL);

interface JoinPageProps {
  params: Promise<{ token: string }>;
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { token } = await params;
  const here = `/join/${token}`;

  const [found, user] = await Promise.all([lookupWorkspaceInvite(db, token), currentUser()]);

  if (!found.ok) {
    // The one problem that is good news: the person it let in, back again.
    if (found.reason === 'accepted' && user && found.acceptedBy === user.id) {
      return (
        <AuthShell
          heading={`You’re in ${found.invite.workspaceName}.`}
          sub="You already accepted this invitation."
        >
          <WorkspaceTile
            name={found.invite.workspaceName}
            invitedBy={found.invite.inviterName}
            role={found.invite.role}
          />
          <div className="mt-6">
            <AcceptForm
              token={token}
              user={{ name: user.name, email: user.email ?? '' }}
              label={`Open ${found.invite.workspaceName}`}
            />
          </div>
        </AuthShell>
      );
    }
    return <InviteProblem reason={found.reason} />;
  }

  const { invite } = found;
  const tile = (
    <WorkspaceTile name={invite.workspaceName} invitedBy={invite.inviterName} role={invite.role} />
  );
  const sub = `${invite.inviterName} invited ${invite.email} to join ${invite.workspaceName} on CanvasFlow.`;

  // Somebody else is signed in here: say whose invitation it is, and offer the
  // way out to the right account without losing this page.
  if (user && user.email?.toLowerCase() !== invite.email) {
    return (
      <AuthShell heading="This invitation isn’t for you." sub={sub}>
        {tile}
        <p className="mt-5 text-sm leading-relaxed text-white/55">
          It was sent to <span className="text-[#fafafa]">{invite.email}</span>, and only that
          account can accept it. You’re signed in as:
        </p>
        <div className="mt-3">
          <SignedInCard
            name={user.name || user.email || 'Your account'}
            email={user.name ? user.email : null}
          />
        </div>
        {/* A form, because ending a session is a POST; `next` brings the
            person back here once they have signed in as the right account. */}
        <form action="/logout" method="post" className="mt-5">
          <input type="hidden" name="next" value={here} />
          <button type="submit" className={authStyles.submit}>
            Switch account
          </button>
        </form>
        <Link href="/open" className={cn(authStyles.provider, 'mt-3')}>
          Go to your boards
        </Link>
      </AuthShell>
    );
  }

  if (user) {
    return (
      <AuthShell heading={`Join ${invite.workspaceName}.`} sub={sub}>
        {tile}
        <div className="mt-6">
          <AcceptForm
            token={token}
            user={{ name: user.name, email: user.email ?? invite.email }}
            label={`Join ${invite.workspaceName}`}
          />
        </div>
      </AuthShell>
    );
  }

  const signup = new URLSearchParams({ next: here, email: invite.email });
  return (
    <AuthShell heading={`Join ${invite.workspaceName}.`} sub={sub}>
      {tile}
      <div className="mt-6">
        <Link href={`/signup?${signup.toString()}`} className={authStyles.submit}>
          Create an account
        </Link>
        <AuthDivider />
        {/* Through the gateway rather than straight to the form: somebody
            whose access token lapsed still has a session, and comes back here
            signed in rather than retyping a password. */}
        <Link href={resumeUrl(here)} className={authStyles.provider}>
          I have an account — sign in
        </Link>
        <p className="mt-4 text-center text-xs text-white/35">
          Use {invite.email}, the address the invitation was sent to.
        </p>
      </div>
    </AuthShell>
  );
}

const PROBLEMS: Record<InviteRejection, { heading: string; body: string; icon: LucideIcon }> = {
  'not-found': {
    heading: 'This invitation isn’t valid.',
    body: 'Check that you opened the whole link. If the invitation was sent again, only the newest email’s link works.',
    icon: CircleSlash,
  },
  revoked: {
    heading: 'This invitation was taken back.',
    body: 'Whoever sent it cancelled it. Ask them to invite you again if you still need to join.',
    icon: MailX,
  },
  expired: {
    heading: 'This invitation has expired.',
    body: 'Invitations work for a week. Ask whoever sent it to send it again.',
    icon: Clock,
  },
  accepted: {
    heading: 'This invitation has been used.',
    body: 'Somebody already joined with it. If that was you, sign in with the invited address to open the workspace.',
    icon: UserCheck,
  },
  'workspace-deleted': {
    heading: 'This workspace was deleted.',
    body: 'The workspace this invitation was for no longer exists.',
    icon: Trash2,
  },
};

function InviteProblem({ reason }: { reason: InviteRejection }) {
  const { heading, body, icon: Icon } = PROBLEMS[reason];
  return (
    <AuthShell heading={heading}>
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
