/** A failed or expired session check must leave the public entry usable. */
export async function hasAccountSession(apiUrl: string, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/users/me`, {
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { data?: { id?: unknown; isGuest?: unknown } };
    return (
      typeof body.data?.id === 'string' && body.data.id.length > 0 && body.data.isGuest === false
    );
  } catch {
    return false;
  }
}
