import { clientEnv } from '@/lib/env.client';

/**
 * The editor's own address, which opens a board anyone can draw on without an
 * account. From the environment, so a local build links the local editor; the
 * production build's value is what search engines follow from this site.
 */
export const WHITEBOARD_HREF = new URL('/', clientEnv.NEXT_PUBLIC_EDITOR_URL).toString();
