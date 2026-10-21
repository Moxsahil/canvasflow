import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DIAGRAM_PROMPT_MAX } from '@canvasflow/types';
import { readRequest } from './ai-diagrams.service.js';

describe('readRequest', () => {
  it('trims the description and keeps the board and direction', () => {
    expect(readRequest({ boardId: 'b', description: '  login flow  ', direction: 'LR' })).toEqual({
      boardId: 'b',
      description: 'login flow',
      direction: 'LR',
    });
  });

  it('leaves the direction to the writer when none is asked for', () => {
    expect(readRequest({ boardId: 'b', description: 'login flow' })).toEqual({
      boardId: 'b',
      description: 'login flow',
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

  it('refuses a direction other than TB or LR', () => {
    expect(() => readRequest({ description: 'login flow', direction: 'RL' })).toThrow(
      BadRequestException,
    );
  });
});
