import { createContext, useContext } from 'react';
import type { PresenceTheme } from '@canvasflow/canvas-engine';
import type { CommentAuthor } from './comment-model';

/**
 * What every part of a thread needs from the board around it, handed down once
 * rather than through each panel to each composer inside it.
 */
export interface CommentEnvironment {
  /** The editor root. What opens from a comment portals into it for its theme. */
  readonly container: HTMLElement | null;
  /** Who can be named with an @ on this board. */
  readonly people: readonly CommentAuthor[];
  /** Photos by user id, for the people who have one. */
  readonly photos: Readonly<Record<string, string>>;
  readonly theme: PresenceTheme;
}

const CommentEnvironmentContext = createContext<CommentEnvironment>({
  container: null,
  people: [],
  photos: {},
  theme: 'light',
});

export const CommentEnvironmentProvider = CommentEnvironmentContext.Provider;

export function useCommentEnvironment(): CommentEnvironment {
  return useContext(CommentEnvironmentContext);
}
