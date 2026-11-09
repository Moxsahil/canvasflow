import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { verifyEditorToken } from './verify-token.js';

const SECRET = 'verify-token-tests-secret-00000000000000000';
const sign = (claims: Record<string, unknown>, secret = SECRET) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));
const good = { id: 'u1', boardId: 'b1', workspaceId: 'w1', role: 'editor' };

describe('verifyEditorToken', () => {
  it('maps the web app’s claims onto the payload', async () => {
    expect(
      await verifyEditorToken(
        await sign({ ...good, email: 'a@b.c', name: 'A', sid: 's1' }),
        SECRET,
      ),
    ).toEqual({
      userId: 'u1',
      email: 'a@b.c',
      name: 'A',
      boardId: 'b1',
      workspaceId: 'w1',
      role: 'editor',
      sessionId: 's1',
    });
  });

  it('treats a token without a session as a guest’s', async () => {
    const payload = await verifyEditorToken(await sign(good), SECRET);
    expect(payload).toMatchObject({ sessionId: null, email: '', name: '' });
  });

  it.each([
    ['id', { ...good, id: undefined }, /Missing id/],
    ['boardId', { ...good, boardId: 7 }, /Missing boardId/],
    ['workspaceId', { ...good, workspaceId: null }, /Missing workspaceId/],
    ['role', { ...good, role: 'admin' }, /Invalid role/],
    ['sid', { ...good, sid: 42 }, /Invalid sid/],
  ])('rejects a bad %s claim', async (_name, claims, error) => {
    await expect(verifyEditorToken(await sign(claims), SECRET)).rejects.toThrow(error);
  });

  it('rejects a token signed with another secret, or with alg none', async () => {
    await expect(
      verifyEditorToken(await sign(good, 'some-other-secret-000000000000000000000'), SECRET),
    ).rejects.toThrow(/signature/);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      JSON.stringify(good),
    ).toString('base64url')}.`;
    await expect(verifyEditorToken(unsigned, SECRET)).rejects.toThrow();
  });
});
