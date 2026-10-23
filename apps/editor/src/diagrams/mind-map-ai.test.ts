import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTopic, type TopicShape } from '@canvasflow/canvas-engine';
import { expandTopic } from './diagram-client';
import { composeDiagram } from './diagram-kit';

const topic = (depth: number, text: string) => JSON.stringify({ t: 'topic', depth, text });

vi.mock('../lib/env', () => ({ env: { VITE_API_URL: 'http://gateway.test' } }));

function streamOf(lines: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(lines.join('\n'));
      // In two pieces, cut mid-line, as a network delivers it.
      controller.enqueue(bytes.slice(0, 10));
      controller.enqueue(bytes.slice(10));
      controller.close();
    },
  });
  return new Response(body, { status });
}

afterEach(() => vi.unstubAllGlobals());

describe('a mind map from the AI panel', () => {
  it('is made of topics, laid out, in the look it is given', async () => {
    let n = 0;
    const { shapes, icons } = await composeDiagram(
      [topic(0, 'Trip'), topic(1, 'Flights'), topic(2, 'Out'), topic(1, 'Hotels')],
      () => `t${n++}`,
      { mindMap: { mapLayout: 'down', mapLines: 'elbow', topicShape: 'pill' } },
    );
    const topics = shapes.filter(isTopic) as TopicShape[];
    expect(topics.map((t) => t.text)).toEqual(['Trip', 'Flights', 'Out', 'Hotels']);
    expect(icons.size).toBe(0);
    const [root, flights, out] = topics;
    expect(root).toMatchObject({ parentId: null, mapLayout: 'down', mapLines: 'elbow' });
    expect(flights!.parentId).toBe(root!.id);
    expect(out!.parentId).toBe(flights!.id);
    expect(flights!.topicShape).toBe('pill');
    // Laid out: hung down under the centre.
    expect(flights!.y).toBeGreaterThan(root!.y);
  });
});

describe('expandTopic', () => {
  it('asks with the topic, its path and its children, and hands the ideas back together', async () => {
    const fetch = vi.fn(async () =>
      streamOf([
        topic(0, 'Keywords'),
        topic(0, 'Backlinks'),
        JSON.stringify({
          t: 'end',
          ok: true,
          usage: { plan: 'free', used: 3, limit: 10, resetsAt: 'x' },
        }),
      ]),
    );
    vi.stubGlobal('fetch', fetch);
    const outcome = await expandTopic(
      'token',
      { boardId: 'b1', topic: 'SEO', path: ['Launch', 'Marketing'], children: ['Speed'] },
      new AbortController().signal,
    );
    expect(outcome).toMatchObject({ kind: 'ideas', ideas: ['Keywords', 'Backlinks'] });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      boardId: 'b1',
      description: 'SEO',
      kind: 'expand',
      topicPath: ['Launch', 'Marketing'],
      topicChildren: ['Speed'],
    });
  });

  it('passes a refusal on with its code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'diagram-limit-reached', message: 'Used up' }), {
            status: 402,
          }),
      ),
    );
    const outcome = await expandTopic(
      'token',
      { boardId: 'b1', topic: 'SEO', path: [], children: [] },
      new AbortController().signal,
    );
    expect(outcome).toMatchObject({ kind: 'refused', refusal: { code: 'diagram-limit-reached' } });
  });
});
