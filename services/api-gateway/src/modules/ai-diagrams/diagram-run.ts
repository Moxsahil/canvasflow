import {
  collectDiagram,
  parseDiagramLine,
  type DiagramLineError,
  type Direction,
} from '@canvasflow/canvas-engine';
import { correctionMessage, descriptionMessage } from './diagram-prompt.js';
import {
  DiagramWriterError,
  type DiagramTurn,
  type DiagramWriter,
  type DiagramWriterFailure,
} from './diagram-writer.js';

export interface DiagramRunResult {
  /** Boxes in the finished diagram; none means nothing could be drawn. */
  nodes: number;
  /**
   * Why nothing could be drawn, when that is what happened and it was not the
   * caller leaving: the writer's failure, or `empty` when it answered with no
   * box that could be used.
   */
  failure: DiagramWriterFailure | 'empty' | null;
}

/**
 * Write one diagram, passing each usable line on the moment it is complete.
 *
 * Every line is checked with the same rules the editor applies, so what is
 * passed on is only what will draw. What fails those rules is put back to the
 * writer once, with the reasons, and the replacements follow the first lines.
 * Once only: a second round of corrections costs more than the boxes it might
 * save, and the diagram already drawn is useful without them.
 */
export async function runDiagram(input: {
  writer: DiagramWriter;
  description: string;
  direction?: Direction;
  signal: AbortSignal;
  emit: (line: string) => void;
}): Promise<DiagramRunResult> {
  const { writer, signal, emit } = input;
  const accepted: string[] = [];
  const rejected: DiagramLineError[] = [];
  const turns: DiagramTurn[] = [
    { role: 'user', text: descriptionMessage(input.description, input.direction) },
  ];

  const take = (raw: string) => {
    // Nothing after the caller has gone counts: they never saw it.
    if (signal.aborted) return;
    const line = raw.trim();
    if (line.length === 0) return;
    const parsed = parseDiagramLine(line);
    if (parsed.ok) {
      accepted.push(line);
      emit(line);
    } else if (parsed.error !== null) {
      rejected.push(parsed.error);
    }
    // A line that never became JSON — a stray fence, a sentence, the end of a
    // reply that ran out of room — has nothing in it to correct, and is dropped.
  };

  /** One reply from the writer; returns its full text for the conversation. */
  const pass = async (): Promise<string> => {
    let reply = '';
    let pending = '';
    for await (const chunk of writer.write(turns, signal)) {
      reply += chunk;
      pending += chunk;
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        take(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
      }
    }
    // The reply is over, so whatever is left is a whole last line.
    take(pending);
    return reply;
  };

  let failure: DiagramWriterFailure | null = null;
  let firstReply = '';
  try {
    firstReply = await pass();
  } catch (error) {
    if (signal.aborted) return { nodes: countNodes(accepted), failure: null };
    failure = error instanceof DiagramWriterError ? error.failure : 'unavailable';
  }

  const problems = [...rejected, ...collectDiagram(accepted).errors];
  if (failure === null && problems.length > 0 && !signal.aborted) {
    turns.push(
      { role: 'assistant', text: firstReply },
      { role: 'user', text: correctionMessage(problems) },
    );
    try {
      await pass();
    } catch {
      // The first reply stands on its own; a failed correction only means
      // its rejected lines stay out.
    }
  }

  const nodes = countNodes(accepted);
  return { nodes, failure: nodes > 0 || signal.aborted ? null : (failure ?? 'empty') };
}

function countNodes(lines: readonly string[]): number {
  return collectDiagram(lines).diagram.nodes.length;
}
