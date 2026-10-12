/** What a change to someone's place in a workspace was refused for. */
export type MemberRefusal =
  | 'workspace-gone'
  | 'not-allowed'
  | 'not-member'
  | 'owner'
  | 'self'
  | 'no-offer'
  /** The person is not a guest on any of the workspace's boards — or is in the workspace. */
  | 'not-guest';

/** The act the refusal answers, which decides how it is worded. */
export type MemberAction = 'role' | 'remove' | 'leave' | 'offer' | 'withdraw' | 'accept' | 'guest';

export interface DescribedRefusal {
  status: 400 | 403 | 404 | 409;
  message: string;
  /** For the editor, where it does something other than show the sentence. */
  code?: string;
}

/**
 * The answer to a refused change, in words a person can act on. Kept apart
 * from the routes so every wording can be read, and tested, in one place.
 */
export function describeMemberRefusal(
  action: MemberAction,
  reason: MemberRefusal,
): DescribedRefusal {
  switch (reason) {
    case 'workspace-gone':
      return { status: 404, message: 'Workspace not found' };
    case 'not-member':
      return { status: 404, message: 'They’re no longer in this workspace.' };
    case 'not-guest':
      return { status: 404, message: 'They’re no longer a guest on any of its boards.' };
    case 'no-offer':
      return {
        status: 404,
        message:
          action === 'accept'
            ? 'There’s no offer of this workspace waiting for you. It may have been taken back.'
            : 'There’s no offer of this workspace waiting for an answer.',
      };
    case 'not-allowed':
      if (action === 'offer') {
        return { status: 403, message: 'Only the owner can hand the workspace over.' };
      }
      if (action === 'withdraw') {
        return { status: 403, message: 'Only the owner or the person offered it can do that.' };
      }
      return {
        status: 403,
        message: 'Only the owner or an admin can change who is in this workspace.',
      };
    case 'owner':
      if (action === 'leave') {
        return {
          status: 409,
          message: 'Hand the workspace to someone else first. You can leave once they accept.',
          code: 'owner-must-hand-over',
        };
      }
      return {
        status: 403,
        message: 'The owner stays the owner until they hand the workspace over.',
      };
    case 'self':
      if (action === 'offer') {
        return { status: 400, message: 'You’re already the owner.' };
      }
      if (action === 'remove') {
        return { status: 400, message: 'To take yourself out, leave the workspace.' };
      }
      return {
        status: 400,
        message: 'You can’t change your own role. Ask another admin to.',
      };
  }
}
