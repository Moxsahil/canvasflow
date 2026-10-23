/**
 * The diagrams drawn on a board, kept in this browser so the panel still has
 * them after it closes or the page reloads.
 *
 * Only here: the gateway keeps no description and no diagram, and this list
 * is the person's own, on their own device. A hundred per board, newest last,
 * kept in IndexedDB — a diagram's lines can run to a hundred kilobytes and
 * local storage holds a few megabytes in all. Where IndexedDB cannot be
 * opened, local storage holds the newest ten as before.
 *
 * Diagrams are grouped into chats: a request starts one, a refine or a second
 * try joins the chat of the diagram it came from.
 */

export interface DiagramEntry {
  id: string;
  /** What was asked: the description, or for a change, the change. */
  description: string;
  /** The diagram's lines, exactly as they streamed in. */
  lines: string[];
  createdAt: number;
  /** The entry this one changed, when it was a change. */
  changeOf?: string;
  /** How long it took to draw, in ms. */
  took?: number;
  /** Lines the fix-up pass corrected, when there was one. */
  fixed?: number;
  /** Thumbs up or down, when it was rated. */
  reaction?: 'up' | 'down';
  /** The chat it belongs to; the id of the chat's first entry for older ones. */
  chatId?: string;
  /** The shapes its last insert placed on the board. */
  inserted?: string[];
  /** A mind map rather than a diagram; its lines are topics. */
  kind?: 'mindmap';
}

/** One conversation: its diagrams, oldest first, and when it last moved. */
export interface DiagramChat {
  id: string;
  /** What the chat is called: its first request. */
  title: string;
  entries: DiagramEntry[];
  updatedAt: number;
}

export const HISTORY_LIMIT = 100;
/** What local storage keeps where IndexedDB is not to be had. */
export const LOCAL_HISTORY_LIMIT = 10;

const keyFor = (boardId: string) => `cf.diagrams.${boardId}`;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is DiagramEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.description === 'string' &&
    typeof entry.createdAt === 'number' &&
    Array.isArray(entry.lines) &&
    entry.lines.every((line) => typeof line === 'string') &&
    (entry.changeOf === undefined || typeof entry.changeOf === 'string') &&
    (entry.took === undefined || typeof entry.took === 'number') &&
    (entry.fixed === undefined || typeof entry.fixed === 'number') &&
    (entry.reaction === undefined || entry.reaction === 'up' || entry.reaction === 'down') &&
    (entry.chatId === undefined || typeof entry.chatId === 'string') &&
    (entry.kind === undefined || entry.kind === 'mindmap') &&
    (entry.inserted === undefined ||
      (Array.isArray(entry.inserted) && entry.inserted.every((id) => typeof id === 'string')))
  );
}

const entriesIn = (value: unknown, limit: number): DiagramEntry[] =>
  Array.isArray(value) ? value.filter(isEntry).slice(-limit) : [];

/** The list as local storage holds it: where it used to live, and the fallback. */
export function readHistory(boardId: string, store: Storage | null = storage()): DiagramEntry[] {
  try {
    const raw = store?.getItem(keyFor(boardId));
    if (!raw) return [];
    return entriesIn(JSON.parse(raw) as unknown, LOCAL_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function writeHistory(
  boardId: string,
  entries: readonly DiagramEntry[],
  store: Storage | null = storage(),
): void {
  try {
    store?.setItem(keyFor(boardId), JSON.stringify(entries.slice(-LOCAL_HISTORY_LIMIT)));
  } catch {
    // Full or blocked storage costs the list after a reload, nothing more.
  }
}

const DB_NAME = 'canvasflow:diagrams';
const STORE = 'boards';

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('No IndexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open diagram storage'));
  }).catch((error: unknown) => {
    // Private windows and blocked storage refuse; the next call tries again.
    opening = null;
    throw error;
  });
  return opening;
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Diagram storage failed'));
  });
}

/**
 * A board's diagrams. The first time a board is read here, what local storage
 * held for it moves over, and local storage lets go of it.
 */
export async function loadHistory(
  boardId: string,
  store: Storage | null = storage(),
): Promise<DiagramEntry[]> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return readHistory(boardId, store);
  }
  try {
    const found: unknown = await settle(db.transaction(STORE).objectStore(STORE).get(boardId));
    if (found !== undefined) return entriesIn(found, HISTORY_LIMIT);
    const moved = readHistory(boardId, store);
    if (moved.length > 0) {
      await settle(db.transaction(STORE, 'readwrite').objectStore(STORE).put(moved, boardId));
      try {
        store?.removeItem(keyFor(boardId));
      } catch {
        // Left behind; it is not read again once the board has a list here.
      }
    }
    return moved;
  } catch {
    return readHistory(boardId, store);
  }
}

export async function saveHistory(
  boardId: string,
  entries: readonly DiagramEntry[],
  store: Storage | null = storage(),
): Promise<void> {
  try {
    const db = await openDb();
    await settle(
      db
        .transaction(STORE, 'readwrite')
        .objectStore(STORE)
        .put(entries.slice(-HISTORY_LIMIT), boardId),
    );
  } catch {
    writeHistory(boardId, entries, store);
  }
}

/** The list with one more at the end, the oldest dropped past the limit. */
export function withEntry(entries: readonly DiagramEntry[], entry: DiagramEntry): DiagramEntry[] {
  return [...entries, entry].slice(-HISTORY_LIMIT);
}

/**
 * Every entry with its chat. Kept ones have it already; older ones join the
 * chat of the entry they changed, and a first request starts its own.
 */
export function withChats(entries: readonly DiagramEntry[]): DiagramEntry[] {
  const chatOf = new Map<string, string>();
  return entries.map((entry) => {
    const chatId =
      entry.chatId ?? (entry.changeOf ? chatOf.get(entry.changeOf) : undefined) ?? entry.id;
    chatOf.set(entry.id, chatId);
    return entry.chatId === chatId ? entry : { ...entry, chatId };
  });
}

/** The chats, the one that moved last first. */
export function chatsOf(entries: readonly DiagramEntry[]): DiagramChat[] {
  const chats = new Map<string, DiagramChat>();
  for (const entry of entries) {
    const id = entry.chatId ?? entry.id;
    const chat = chats.get(id);
    if (chat) {
      chat.entries.push(entry);
      chat.updatedAt = Math.max(chat.updatedAt, entry.createdAt);
    } else {
      chats.set(id, { id, title: entry.description, entries: [entry], updatedAt: entry.createdAt });
    }
  }
  return [...chats.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * The version an entry is set against: the one it changed, or else the one
 * before it in its chat.
 */
export function previousVersion(
  entry: DiagramEntry,
  entries: readonly DiagramEntry[],
): DiagramEntry | undefined {
  if (entry.changeOf) {
    const changed = entries.find((item) => item.id === entry.changeOf);
    if (changed) return changed;
  }
  const chat = entries.filter((item) => item.chatId === entry.chatId);
  const at = chat.findIndex((item) => item.id === entry.id);
  return at > 0 ? chat[at - 1] : undefined;
}
