import { describe, expect, it } from 'vitest';
import { runDiagram } from './diagram-run.js';
import { DiagramWriterError, type DiagramTurn, type DiagramWriter } from './diagram-writer.js';

const node = (id: string, kind = 'rectangle') =>
  JSON.stringify({ t: 'node', id, kind, text: id.toUpperCase() });
const edge = (from: string, to: string) => JSON.stringify({ t: 'edge', from, to });
const meta = JSON.stringify({ t: 'meta', direction: 'TB' });

/**
 * A writer that answers each turn from a script: a list of chunks, or an error
 * to throw after any chunks before it. Records what it was asked.
 */
function scripted(
  ...replies: Array<Array<string | Error>>
): DiagramWriter & { asked: DiagramTurn[][] } {
  const asked: DiagramTurn[][] = [];
  return {
    asked,
    async *write(turns) {
      asked.push(turns.map((turn) => ({ ...turn })));
      const reply = replies[asked.length - 1] ?? [];
      for (const part of reply) {
        if (part instanceof Error) throw part;
        yield part;
      }
    },
  };
}

async function run(writer: DiagramWriter, signal = new AbortController().signal) {
  const emitted: string[] = [];
  const result = await runDiagram({
    writer,
    description: 'Sign in flow',
    signal,
    emit: (line) => emitted.push(line),
  });
  return { ...result, emitted };
}

describe('runDiagram', () => {
  it('passes each line on whole, however the reply is cut into chunks', async () => {
    const reply = `${meta}\n${node('a')}\n${node('b')}\n${edge('a', 'b')}`;
    const writer = scripted([reply.slice(0, 7), reply.slice(7, 50), reply.slice(50)]);

    const { emitted, nodes, failure } = await run(writer);

    expect(emitted).toEqual([meta, node('a'), node('b'), edge('a', 'b')]);
    expect(nodes).toBe(2);
    expect(failure).toBeNull();
    // Nothing wrong, so nothing to correct.
    expect(writer.asked).toHaveLength(1);
  });

  it('puts the description inside tags, as the subject rather than instructions', async () => {
    const writer = scripted([node('a')]);
    await run(writer);
    expect(writer.asked[0]![0]).toEqual({
      role: 'user',
      text: '<description>\nSign in flow\n</description>',
    });
  });

  it('drops lines that never became JSON without asking for them again', async () => {
    const writer = scripted(['```json\n', `${node('a')}\n`, 'Here is your diagram.\n', '```']);
    const { emitted } = await run(writer);
    expect(emitted).toEqual([node('a')]);
    expect(writer.asked).toHaveLength(1);
  });

  it('sends what was wrong back once, and passes the replacements on', async () => {
    const broken = JSON.stringify({ t: 'node', id: 'c', kind: 'hexagon', text: 'C' });
    const writer = scripted(
      [`${node('a')}\n${broken}\n${edge('a', 'ghost')}\n`],
      [`${node('c')}\n${node('ghost')}\n`],
      [node('never')],
    );

    const { emitted, nodes } = await run(writer);

    expect(writer.asked).toHaveLength(2);
    const correction = writer.asked[1]!;
    expect(correction.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user']);
    expect(correction[2]!.text).toContain('hexagon');
    expect(correction[2]!.text).toContain('ghost');
    expect(emitted).toEqual([node('a'), edge('a', 'ghost'), node('c'), node('ghost')]);
    expect(nodes).toBe(3);
  });

  it('keeps the first reply when the correction fails', async () => {
    const writer = scripted(
      [`${node('a')}\n${edge('a', 'ghost')}\n`],
      [new DiagramWriterError('busy')],
    );
    const { nodes, failure } = await run(writer);
    expect(nodes).toBe(1);
    expect(failure).toBeNull();
  });

  it('reports why when the writer fails before any box', async () => {
    const { nodes, failure } = await run(scripted([new DiagramWriterError('refused')]));
    expect(nodes).toBe(0);
    expect(failure).toBe('refused');
  });

  it('calls a reply with no usable box empty', async () => {
    const { nodes, failure } = await run(scripted(['I cannot help with that.']));
    expect(nodes).toBe(0);
    expect(failure).toBe('empty');
  });

  it('counts no box that arrives after the caller has left', async () => {
    const controller = new AbortController();
    const writer: DiagramWriter = {
      async *write() {
        yield `${node('a')}\n`;
        controller.abort();
        yield `${node('b')}\n`;
      },
    };
    const { emitted, nodes } = await run(writer, controller.signal);
    expect(emitted).toEqual([node('a')]);
    expect(nodes).toBe(1);
  });

  it('blames nobody when the caller has left', async () => {
    const controller = new AbortController();
    const writer: DiagramWriter = {
      // eslint-disable-next-line require-yield
      async *write() {
        controller.abort();
        throw new Error('aborted');
      },
    };
    const { nodes, failure } = await run(writer, controller.signal);
    expect(nodes).toBe(0);
    expect(failure).toBeNull();
  });
});
