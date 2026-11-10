import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users, workspaces } from '@canvasflow/db';
import {
  signUpAndIn,
  startGateway,
  type Gateway,
  type TestAccount,
} from '../../testing/gateway.js';
import { addMember, createBoard, createTeam } from '../../testing/seed.js';

/**
 * Who may do what in a team workspace, through the real routes: an outsider
 * learns nothing, a member works on boards but does not run the team, an
 * admin manages members, and only the owner hands the workspace on.
 */

let gateway: Gateway;
let owner: TestAccount;
let admin: TestAccount;
let member: TestAccount;
let outsider: TestAccount;
let workspaceId: string;

beforeAll(async () => {
  gateway = await startGateway();
});

afterAll(async () => {
  await gateway.close();
});

beforeEach(async () => {
  owner = await signUpAndIn(gateway, 'Owner');
  admin = await signUpAndIn(gateway, 'Admin');
  member = await signUpAndIn(gateway, 'Member');
  outsider = await signUpAndIn(gateway, 'Outsider');
  workspaceId = await createTeam(gateway, owner);
  await gateway.db.update(workspaces).set({ plan: 'team' }).where(eq(workspaces.id, workspaceId));
  await addMember(gateway, workspaceId, admin, 'admin');
  await addMember(gateway, workspaceId, member, 'member');
});

const people = (account: TestAccount) =>
  account.client.get<{
    data: { members: Array<{ userId: string; role: string; email: string | null }> };
  }>(`/workspaces/${workspaceId}/people`);

describe('seeing a workspace', () => {
  it('shows its people to members, and does not admit it exists to anyone else', async () => {
    const seen = await people(member);
    expect(seen.status).toBe(200);
    expect(seen.body.data.members.map((m) => m.role).sort()).toEqual(['admin', 'member', 'owner']);

    expect((await people(outsider)).status).toBe(404);
    expect((await outsider.client.get(`/workspaces/${workspaceId}/boards`)).status).toBe(404);
  });

  it('shows addresses to those who run it, and not to members', async () => {
    const asMember = await people(member);
    expect(asMember.body.data.members.every((m) => m.email === null)).toBe(true);
    const asAdmin = await people(admin);
    expect(asAdmin.body.data.members.find((m) => m.userId === member.id)?.email).toBe(member.email);
  });
});

describe('boards in a workspace', () => {
  it('can be made and opened by any member, and by no outsider', async () => {
    const boardId = await createBoard(member, workspaceId, 'Member board');
    expect((await owner.client.get(`/boards/${boardId}`)).status).toBe(200);
    expect((await outsider.client.get(`/boards/${boardId}`)).status).toBe(404);
    expect(
      (await outsider.client.post(`/workspaces/${workspaceId}/boards`, { title: 'Sneaky' })).status,
    ).toBe(404);
  });

  it('may be renamed by a member but deleted only by its owner or an admin', async () => {
    const boardId = await createBoard(owner, workspaceId, 'Owner board');
    expect((await member.client.patch(`/boards/${boardId}`, { title: 'Renamed' })).status).toBe(
      200,
    );
    expect((await member.client.delete(`/boards/${boardId}`)).status).toBe(403);
    expect((await outsider.client.patch(`/boards/${boardId}`, { title: 'Nope' })).status).toBe(404);
    expect((await admin.client.delete(`/boards/${boardId}`)).status).toBe(200);
    // Gone for everyone.
    expect((await owner.client.get(`/boards/${boardId}`)).status).toBe(404);
  });

  it('cannot be changed while archived', async () => {
    const boardId = await createBoard(owner, workspaceId);
    expect((await member.client.put(`/boards/${boardId}/archive`)).status).toBe(403);
    expect((await owner.client.put(`/boards/${boardId}/archive`)).status).toBe(200);
    expect((await member.client.patch(`/boards/${boardId}`, { title: 'Late' })).status).toBe(403);
    expect((await owner.client.delete(`/boards/${boardId}/archive`)).status).toBe(200);
    expect((await member.client.patch(`/boards/${boardId}`, { title: 'Back' })).status).toBe(200);
  });

  it('refuses a change sent from another site', async () => {
    const boardId = await createBoard(owner, workspaceId);
    const reply = await owner.client.patch(
      `/boards/${boardId}`,
      { title: 'Forged' },
      { origin: 'https://evil.example' },
    );
    expect(reply.status).toBe(403);
  });
});

describe('managing members', () => {
  it('lets an admin change a role, and a member change none', async () => {
    const path = `/workspaces/${workspaceId}/members/${member.id}`;
    expect(
      (
        await member.client.patch(`/workspaces/${workspaceId}/members/${admin.id}`, {
          role: 'member',
        })
      ).status,
    ).toBe(403);
    // Nor one's own.
    expect((await member.client.patch(path, { role: 'admin' })).status).toBe(400);
    expect((await outsider.client.patch(path, { role: 'admin' })).status).toBe(404);
    expect((await admin.client.patch(path, { role: 'admin' })).status).toBe(204);

    const after = await people(owner);
    expect(after.body.data.members.find((m) => m.userId === member.id)?.role).toBe('admin');
  });

  it('never makes anyone owner by changing a role, and never demotes the owner', async () => {
    expect(
      (
        await admin.client.patch(`/workspaces/${workspaceId}/members/${member.id}`, {
          role: 'owner',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.client.patch(`/workspaces/${workspaceId}/members/${owner.id}`, {
          role: 'member',
        })
      ).status,
    ).toBe(403);
  });

  it('lets an admin remove a member, who then loses the workspace', async () => {
    const boardId = await createBoard(owner, workspaceId);
    expect(
      (await member.client.delete(`/workspaces/${workspaceId}/members/${admin.id}`)).status,
    ).toBe(403);
    expect(
      (await admin.client.delete(`/workspaces/${workspaceId}/members/${member.id}`)).status,
    ).toBe(200);
    expect((await people(member)).status).toBe(404);
    expect((await member.client.get(`/auth/editor-token?boardId=${boardId}`)).status).toBe(404);
  });

  it('lets a member leave, but not the owner', async () => {
    expect((await member.client.post(`/workspaces/${workspaceId}/leave`)).status).toBe(200);
    expect((await people(member)).status).toBe(404);
    expect(
      (await owner.client.post(`/workspaces/${workspaceId}/leave`)).status,
    ).toBeGreaterThanOrEqual(400);
  });
});

describe('handing the workspace on', () => {
  it('takes an offer from the owner and an acceptance from the person offered', async () => {
    const offer = `/workspaces/${workspaceId}/ownership-offer`;
    expect((await admin.client.post(offer, { userId: member.id })).status).toBe(403);
    expect((await owner.client.post(offer, { userId: 'nobody' })).status).toBe(400);
    expect((await owner.client.post(offer, { userId: admin.id })).status).toBe(204);

    // Only the person offered can accept it.
    expect((await member.client.post(`${offer}/accept`)).status).toBeGreaterThanOrEqual(400);
    expect((await admin.client.post(`${offer}/accept`)).status).toBe(204);

    const after = await people(admin);
    expect(after.body.data.members.find((m) => m.userId === admin.id)?.role).toBe('owner');
    expect(after.body.data.members.find((m) => m.userId === owner.id)?.role).not.toBe('owner');
  });

  it('can be withdrawn before it is accepted', async () => {
    const offer = `/workspaces/${workspaceId}/ownership-offer`;
    expect((await owner.client.post(offer, { userId: admin.id })).status).toBe(204);
    expect((await owner.client.delete(offer)).status).toBe(204);
    expect((await admin.client.post(`${offer}/accept`)).status).toBeGreaterThanOrEqual(400);
  });
});

describe('inviting people', () => {
  const invite = (account: TestAccount, email: string, role?: string) =>
    account.client.post<{ data: { invite: { id: string } } }>(
      `/workspaces/${workspaceId}/invites`,
      { email, ...(role ? { role } : {}) },
    );

  it('is for the owner and admins, with a confirmed address', async () => {
    expect((await invite(member, 'new@example.test')).status).toBe(403);
    expect((await invite(outsider, 'new@example.test')).status).toBe(404);

    const unconfirmed = await invite(owner, 'new@example.test');
    expect(unconfirmed.status).toBe(403);
    expect((unconfirmed.body as { code?: string }).code).toBe('email-not-verified');

    await gateway.db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, owner.id));
    const sent = await invite(owner, 'new@example.test');
    expect(sent.status).toBe(201);
    expect((await invite(owner, 'not an address')).status).toBe(400);
    expect((await invite(owner, 'other@example.test', 'owner')).status).toBe(400);

    // Taken back by an admin; then it is gone.
    const path = `/workspaces/${workspaceId}/invites/${sent.body.data.invite.id}`;
    expect((await member.client.delete(path)).status).toBe(403);
    expect((await admin.client.delete(path)).status).toBe(204);
    expect((await admin.client.delete(path)).status).toBe(404);
  });
});
