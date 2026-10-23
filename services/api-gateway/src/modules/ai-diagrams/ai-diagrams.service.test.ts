import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  DIAGRAM_MAX_NODES,
  DIAGRAM_PROMPT_MAX,
  DIAGRAM_REFINE_MAX_LINES,
  MIND_MAP_CONTEXT_MAX,
} from '@canvasflow/types';
import { readRequest } from './ai-diagrams.service.js';

describe('readRequest', () => {
  it('trims the description and keeps the board and direction', () => {
    expect(readRequest({ boardId: 'b', description: '  login flow  ', direction: 'LR' })).toEqual({
      boardId: 'b',
      description: 'login flow',
      direction: 'LR',
      detailed: false,
      kind: 'diagram',
    });
  });

  it('leaves the direction to the writer when none is asked for', () => {
    expect(readRequest({ boardId: 'b', description: 'login flow' })).toEqual({
      boardId: 'b',
      description: 'login flow',
      detailed: false,
      kind: 'diagram',
    });
  });

  it('refuses a description too short or too long to be one', () => {
    expect(() => readRequest({ description: ' a ' })).toThrow(BadRequestException);
    expect(() => readRequest({ description: 'x'.repeat(DIAGRAM_PROMPT_MAX + 1) })).toThrow(
      BadRequestException,
    );
    expect(() => readRequest({ description: 42 })).toThrow(BadRequestException);
    expect(() => readRequest(null)).toThrow(BadRequestException);
  });

  it('reads a detailed request, and refuses anything but true or false', () => {
    expect(readRequest({ boardId: 'b', description: 'big system', detailed: true }).detailed).toBe(
      true,
    );
    expect(() => readRequest({ description: 'big system', detailed: 'yes' })).toThrow(
      BadRequestException,
    );
  });

  it('takes a long description, as long as the limit', () => {
    const long = 'x'.repeat(DIAGRAM_PROMPT_MAX);
    expect(readRequest({ description: long }).description).toHaveLength(DIAGRAM_PROMPT_MAX);
  });

  it('refuses a direction other than TB or LR', () => {
    expect(() => readRequest({ description: 'login flow', direction: 'RL' })).toThrow(
      BadRequestException,
    );
  });

  describe('a diagram sent back to be changed', () => {
    const box = (id: string) => JSON.stringify({ t: 'node', id, kind: 'rectangle', text: id });

    it('keeps only its valid diagram lines', () => {
      const request = readRequest({
        description: 'add a trial step',
        previous: [
          ' {"t":"meta","direction":"TB"} ',
          box('a'),
          'not json',
          '{"t":"node","id":"x","kind":"hexagon","text":"X"}',
        ],
      });
      expect(request.previous).toEqual(['{"t":"meta","direction":"TB"}', box('a')]);
    });

    it('refuses one with no box, or more boxes than a diagram has', () => {
      expect(() => readRequest({ description: 'add a step', previous: ['{"t":"meta"}'] })).toThrow(
        BadRequestException,
      );
      const big = Array.from({ length: DIAGRAM_MAX_NODES + 1 }, (_, i) => box(`n${i}`));
      expect(() => readRequest({ description: 'add a step', previous: big })).toThrow(
        BadRequestException,
      );
    });

    it('refuses one that is not a list of short strings before reading it', () => {
      expect(() => readRequest({ description: 'add a step', previous: 'lines' })).toThrow(
        BadRequestException,
      );
      expect(() => readRequest({ description: 'add a step', previous: [] })).toThrow(
        BadRequestException,
      );
      expect(() => readRequest({ description: 'add a step', previous: [box('a'), 7] })).toThrow(
        BadRequestException,
      );
      expect(() =>
        readRequest({ description: 'add a step', previous: [box('a') + ' '.repeat(400)] }),
      ).toThrow(BadRequestException);
      expect(() =>
        readRequest({
          description: 'add a step',
          previous: Array(DIAGRAM_REFINE_MAX_LINES + 1).fill(box('a')),
        }),
      ).toThrow(BadRequestException);
    });
  });
});

describe('readRequest for mind maps', () => {
  const topic = (depth: number, text: string) => JSON.stringify({ t: 'topic', depth, text });

  it('reads a mind map, and an expand with its path and children', () => {
    expect(readRequest({ boardId: 'b', description: 'trip to Japan', kind: 'mindmap' }).kind).toBe(
      'mindmap',
    );
    const expand = readRequest({
      boardId: 'b',
      description: 'SEO',
      kind: 'expand',
      topicPath: ['Launch', '  Marketing  '],
      topicChildren: ['Keywords'],
    });
    expect(expand).toMatchObject({
      kind: 'expand',
      description: 'SEO',
      topicPath: ['Launch', 'Marketing'],
      topicChildren: ['Keywords'],
    });
  });

  it('takes a topic of one short word to expand, but not an empty one', () => {
    expect(readRequest({ description: 'AI', kind: 'expand' }).description).toBe('AI');
    expect(() => readRequest({ description: ' ', kind: 'expand' })).toThrow(BadRequestException);
  });

  it('refuses an unknown kind, a change to an expand, and context it cannot read', () => {
    expect(() => readRequest({ description: 'trip', kind: 'poem' })).toThrow(BadRequestException);
    expect(() =>
      readRequest({ description: 'SEO', kind: 'expand', previous: [topic(0, 'x')] }),
    ).toThrow(BadRequestException);
    expect(() => readRequest({ description: 'SEO', kind: 'expand', topicPath: 'Launch' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      readRequest({
        description: 'SEO',
        kind: 'expand',
        topicChildren: Array.from({ length: MIND_MAP_CONTEXT_MAX + 1 }, () => 'x'),
      }),
    ).toThrow(BadRequestException);
  });

  it('keeps only the topic lines of a mind map sent back to be changed', () => {
    const request = readRequest({
      description: 'add a budget branch',
      kind: 'mindmap',
      previous: [topic(0, 'Trip'), 'not a topic', topic(1, 'Flights')],
    });
    expect(request.previous).toEqual([topic(0, 'Trip'), topic(1, 'Flights')]);
    expect(() =>
      readRequest({ description: 'change', kind: 'mindmap', previous: ['nothing usable'] }),
    ).toThrow(BadRequestException);
  });
});
