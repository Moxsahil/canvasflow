import type { DiagramRequest, DiagramStreamEnd, DiagramUsage } from '@canvasflow/types';
import { env } from '../lib/env';

/**
 * Transport for generated diagrams: where the month's count stands, and the
 * stream a diagram arrives in.
 *
 * The gateway answers a request with newline-separated JSON: the diagram's
 * own lines as they are written, then one `{"t":"end"}` line saying how it
 * went. A refusal before anything is written is an ordinary error response
 * instead, carrying a `code` for the cases the panel has something to show.
 */

/** Why the gateway would not start a diagram. */
export interface DiagramRefusal {
  status: number;
  /** `diagram-limit-reached`, `sign-in-required`, `diagrams-unavailable`, or null. */
  code: string | null;
  message: string;
}

export type DiagramStreamOutcome =
  | { kind: 'end'; end: DiagramStreamEnd }
  | { kind: 'refused'; refusal: DiagramRefusal }
  /** The connection closed before the end line: a network drop, not an answer. */
  | { kind: 'cut' };

/**
 * Cuts a stream of text into whole lines.
 *
 * A chunk can end anywhere, mid-line included, so the tail after its last
 * newline waits for the next chunk rather than being read half-written.
 */
export class LineSplitter {
  private pending = '';

  push(chunk: string): string[] {
    this.pending += chunk;
    const lines = this.pending.split('\n');
    this.pending = lines.pop() ?? '';
    return lines.map((line) => line.trim()).filter((line) => line.length > 0);
  }

  /** What is left once the stream is over: a last line with no newline after it. */
  flush(): string[] {
    const rest = this.pending.trim();
    this.pending = '';
    return rest.length > 0 ? [rest] : [];
  }
}

function isStreamEnd(value: unknown): value is DiagramStreamEnd {
  return typeof value === 'object' && value !== null && (value as { t?: unknown }).t === 'end';
}

async function refusalOf(response: Response): Promise<DiagramRefusal> {
  let code: string | null = null;
  let message = `The diagram couldn’t be made (${response.status}).`;
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown };
    if (typeof body.code === 'string') code = body.code;
    if (typeof body.message === 'string') message = body.message;
  } catch {
    // Not the gateway's error shape; the status says enough.
  }
  return { status: response.status, code, message };
}

export async function fetchDiagramUsage(
  token: string,
  boardId: string,
  signal?: AbortSignal,
): Promise<DiagramUsage | DiagramRefusal> {
  const url = new URL('/ai/diagrams/usage', env.VITE_API_URL);
  url.searchParams.set('boardId', boardId);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) return refusalOf(response);
  const { data } = (await response.json()) as { data: DiagramUsage };
  return data;
}

/**
 * Ask for a diagram and hand each of its lines to `onLine` as it arrives.
 *
 * Aborting the signal stops the request, and the gateway gives the diagram
 * back if no box had arrived; the promise then rejects with the abort.
 */
export async function streamDiagram(
  token: string,
  request: DiagramRequest,
  onLine: (line: string) => void,
  signal: AbortSignal,
): Promise<DiagramStreamOutcome> {
  const response = await fetch(`${env.VITE_API_URL}/ai/diagrams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok || !response.body)
    return { kind: 'refused', refusal: await refusalOf(response) };

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const splitter = new LineSplitter();
  let end: DiagramStreamEnd | null = null;

  const take = (line: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (isStreamEnd(parsed)) end = parsed;
    else onLine(line);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    splitter.push(value).forEach(take);
  }
  splitter.flush().forEach(take);
  return end ? { kind: 'end', end } : { kind: 'cut' };
}
