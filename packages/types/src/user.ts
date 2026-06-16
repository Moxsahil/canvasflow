import type { UserId, ISODateString, HexColor } from './primitives.js';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  cursorColor: HexColor;
  showCursorsOfOthers: boolean;
  defaultBoardTool: 'select' | 'rectangle' | 'freehand';
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'system',
  cursorColor: '#6366f1' as HexColor,
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
