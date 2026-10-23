import { parseMindMapLine, mindMapLineOf } from '@canvasflow/canvas-engine';
import { MIND_MAP_EXPAND_MAX, MIND_MAP_MAX_TOPICS } from '@canvasflow/types';
import {
  EXPAND_SYSTEM_PROMPT,
  MIND_MAP_SYSTEM_PROMPT,
  expandMessage,
  mindMapChangeMessage,
  mindMapMessage,
} from './mind-map-prompt.js';
import {
  DiagramWriterError,
  type DiagramWriter,
  type DiagramWriterFailure,
} from './diagram-writer.js';

export interface MindMapRunResult {
  /** Topics passed on; none means nothing could be made. */
  topics: number;
  /** Why nothing could be made, as `runDiagram` says it. */
  failure: DiagramWriterFailure | 'empty' | null;
}

const key = (text: string) => text.trim().toLowerCase();

/**
 * Write a mind map, or ideas for one topic of one, passing each topic on the
 * moment its line is complete.
 *
 * Every line is checked and put right rather than sent back: a map must
 * start from one centre and never step down more than a level at a time, so
 * a line that does is moved up to fit, a second centre becomes a branch of
 * the first, and anything past the most topics a map holds is dropped. Ideas for a topic are all one
 * level, never repeat what is already there or each other, and stop at the
 * most Expand adds. There is no second pass: what arrives is usable as it is.
 */
export async function runMindMap(input: {
  writer: DiagramWriter;
  kind: 'mindmap' | 'expand';
  /** The subject; for `expand`, the topic's own words. */
  description: string;
  /** For a change: the map's lines as they were made. */
  previous?: readonly string[];
  /** For `expand`: the topics from the centre down to it, and those already under it. */
  path?: readonly string[];
  existing?: readonly string[];
  signal: AbortSignal;
  emit: (line: string) => void;
}): Promise<MindMapRunResult> {
  const { writer, kind, signal, emit } = input;
  const expanding = kind === 'expand';
  const seen = new Set((input.existing ?? []).map(key));
  let topics = 0;
  let last = -1;

  const take = (raw: string) => {
    if (signal.aborted) return;
    const topic = parseMindMapLine(raw.trim());
    if (!topic) return;
    if (expanding) {
      if (topics >= MIND_MAP_EXPAND_MAX || seen.has(key(topic.text))) return;
      seen.add(key(topic.text));
      topics += 1;
      emit(mindMapLineOf(0, topic.text));
      return;
    }
    if (topics >= MIND_MAP_MAX_TOPICS) return;
    // The first line is the centre whatever it says; after it, nothing else is.
    const depth = topics === 0 ? 0 : Math.max(1, Math.min(topic.depth, last + 1));
    topics += 1;
    last = depth;
    emit(mindMapLineOf(depth, topic.text));
  };

  const message = expanding
    ? expandMessage(input.description, input.path ?? [], input.existing ?? [])
    : input.previous
      ? mindMapChangeMessage(input.previous, input.description)
      : mindMapMessage(input.description);

  let failure: DiagramWriterFailure | null = null;
  try {
    let pending = '';
    for await (const chunk of writer.write([{ role: 'user', text: message }], signal, {
      system: expanding ? EXPAND_SYSTEM_PROMPT : MIND_MAP_SYSTEM_PROMPT,
    })) {
      pending += chunk;
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        take(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
      }
    }
    take(pending);
  } catch (error) {
    if (signal.aborted) return { topics, failure: null };
    failure = error instanceof DiagramWriterError ? error.failure : 'unavailable';
  }

  return { topics, failure: topics > 0 || signal.aborted ? null : (failure ?? 'empty') };
}
