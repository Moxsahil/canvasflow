import { describe, expect, it } from 'vitest';
import { MIND_MAP_EXPAND_MAX } from '@canvasflow/types';
import {
  DiagramWriterError,
  type DiagramWriteOptions,
  type DiagramWriter,
} from './diagram-writer.js';
import { runMindMap } from './mind-map-run.js';
import { EXPAND_SYSTEM_PROMPT, MIND_MAP_SYSTEM_PROMPT } from './mind-map-prompt.js';

const topic = (depth: number, text: string) => JSON.stringify({ t: 'topic', depth, text });

/** A writer that answers once from a script, and records how it was asked. */
function scripted(reply: Array<string | Error>): DiagramWriter & {
  asked: { text: string; options: DiagramWriteOptions | undefined }[];
} {
  const asked: { text: string; options: DiagramWriteOptions | undefined }[] = [];
  return {
    asked,
    async *write(turns, _signal, options) {
      asked.push({ text: turns.map((turn) => turn.text).join('\n'), options });
      for (const part of reply) {
        if (part instanceof Error) throw part;
        yield part;
      }
    },
  };
}

async function run(writer: DiagramWriter, input: Partial<Parameters<typeof runMindMap>[0]> = {}) {
  const emitted: string[] = [];
  const result = await runMindMap({
    writer,
    kind: 'mindmap',
    description: 'Trip to Japan',
    signal: new AbortController().signal,
    emit: (line) => emitted.push(line),
    ...input,
  });
  return { ...result, emitted };
}

describe('runMindMap', () => {
  it('passes each topic on as its line completes, across chunks', async () => {
    const whole = [topic(0, 'Trip'), topic(1, 'Flights'), topic(2, 'Out')].join('\n');
    const cut = whole.indexOf('Fli') + 3;
    const writer = scripted([whole.slice(0, cut), whole.slice(cut)]);
    const { topics, failure, emitted } = await run(writer);
    expect(topics).toBe(3);
    expect(failure).toBeNull();
    expect(emitted).toEqual([topic(0, 'Trip'), topic(1, 'Flights'), topic(2, 'Out')]);
    expect(writer.asked[0]!.options?.system).toBe(MIND_MAP_SYSTEM_PROMPT);
    expect(writer.asked[0]!.text).toContain('<subject>\nTrip to Japan\n</subject>');
  });

  it('puts a map right: one centre, never more than a level deeper at a time', async () => {
    const writer = scripted([
      [topic(2, 'Trip'), topic(3, 'Flights'), topic(0, 'Hotels'), 'chatter', '```'].join('\n'),
    ]);
    const { emitted } = await run(writer);
    expect(emitted).toEqual([topic(0, 'Trip'), topic(1, 'Flights'), topic(1, 'Hotels')]);
  });

  it('asks for a change with the map as it was', async () => {
    const writer = scripted([topic(0, 'Trip')]);
    await run(writer, { previous: [topic(0, 'Trip')], description: 'add a budget' });
    expect(writer.asked[0]!.text).toContain('<map>');
    expect(writer.asked[0]!.text).toContain('<change>\nadd a budget\n</change>');
  });

  it('keeps ideas for a topic one level, new, and no more than Expand adds', async () => {
    const ideas = [
      'Keywords',
      'Backlinks',
      'backlinks',
      'Speed',
      'Content',
      'Schema',
      'Local',
      'Extra',
    ];
    const writer = scripted([ideas.map((idea) => topic(1, idea)).join('\n')]);
    const { emitted, topics } = await run(writer, {
      kind: 'expand',
      description: 'SEO',
      path: ['Launch', 'Marketing'],
      existing: ['keywords'],
    });
    expect(topics).toBe(MIND_MAP_EXPAND_MAX);
    expect(emitted[0]).toBe(topic(0, 'Backlinks'));
    expect(emitted.every((line) => line.includes('"depth":0'))).toBe(true);
    expect(writer.asked[0]!.options?.system).toBe(EXPAND_SYSTEM_PROMPT);
    expect(writer.asked[0]!.text).toContain('<path>\nLaunch\nMarketing\n</path>');
  });

  it('says why nothing came: the writer’s reason, or empty', async () => {
    expect((await run(scripted([new DiagramWriterError('busy')]))).failure).toBe('busy');
    expect((await run(scripted(['no topics here']))).failure).toBe('empty');
  });
});
