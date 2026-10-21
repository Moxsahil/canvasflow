import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DIAGRAM_MAX_NODES, DIAGRAM_PROMPT_MAX, DIAGRAM_REFINE_MAX_LINES } from '@canvasflow/types';
import { readRequest } from './ai-diagrams.service.js';

describe('readRequest', () => {
  it('trims the description and keeps the board and direction', () => {
    expect(readRequest({ boardId: 'b', description: '  login flow  ', direction: 'LR' })).toEqual({
      boardId: 'b',
      description: 'login flow',
      direction: 'LR',
      detailed: false,
    });
  });

  it('leaves the direction to the writer when none is asked for', () => {
    expect(readRequest({ boardId: 'b', description: 'login flow' })).toEqual({
      boardId: 'b',
      description: 'login flow',
      detailed: false,
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
