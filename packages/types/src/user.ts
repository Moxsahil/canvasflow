import type { UserId, ISODateString } from './primitives.js';

export const CURSOR_COLORS = [
  'red',
  'orange',
  'amber',
  'lime',
  'green',
  'teal',
  'sky',
  'blue',
  'fuchsia',
  'pink',
] as const;

export type CursorColor = (typeof CURSOR_COLORS)[number];

export function isCursorColor(value: unknown): value is CursorColor {
  return typeof value === 'string' && (CURSOR_COLORS as readonly string[]).includes(value);
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  cursorColor: CursorColor | null;
  showCursorsOfOthers: boolean;
  defaultBoardTool: 'select' | 'rectangle' | 'freehand';
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'system',
  cursorColor: null,
  showCursorsOfOthers: true,
  defaultBoardTool: 'select',
};

export interface User {
  id: UserId;
  email: string;
  name: string;
  avatarUrl: string | null;
  preferences: UserPreferences;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  lastSeenAt: ISODateString | null;
}
