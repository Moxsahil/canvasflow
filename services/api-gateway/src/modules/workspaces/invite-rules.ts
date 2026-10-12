import type { CreateInviteOutcome } from '@canvasflow/db';

type CreateRefusal = Extract<CreateInviteOutcome, { ok: false }>['reason'];

/**
 * What somebody inviting is told when it cannot be done, with a code where the
 * editor does something other than show the sentence.
 */
export function describeCreateRefusal(
  reason: CreateRefusal,
  email: string,
): { status: 404 | 409; message: string; code?: string } {
  switch (reason) {
    case 'workspace-gone':
      return { status: 404, message: 'Workspace not found' };
    case 'already-member':
      return { status: 409, message: `${email} is already in this workspace.` };
    case 'already-invited':
      return {
        status: 409,
        message: `${email} is already invited. Send it again from the list below.`,
        code: 'already-invited',
      };
    case 'too-many':
      return {
        status: 409,
        message:
          'This workspace has as many open invitations as it can hold. Take back some that nobody answered first.',
      };
  }
}
