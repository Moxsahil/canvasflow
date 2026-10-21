import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { DIAGRAM_SYSTEM_PROMPT } from './diagram-prompt.js';

/** One turn of the conversation that produces a diagram. */
export interface DiagramTurn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Whatever writes a diagram's lines.
 *
 * An interface so the rest of the module can be run against a stand-in: the
 * counting, the correction pass and the refunds are what need testing, and
 * none of them should cost a request to a model.
 */
export interface DiagramWriter {
  /** The reply as it is written, chunk by chunk. Throws a `DiagramWriterError` when there is none. */
  write(turns: readonly DiagramTurn[], signal: AbortSignal): AsyncIterable<string>;
}

/** Why no reply came, in the terms the person is told. */
export type DiagramWriterFailure = 'refused' | 'busy' | 'unavailable';

export class DiagramWriterError extends Error {
  constructor(readonly failure: DiagramWriterFailure) {
    super(`Diagram writer failed: ${failure}`);
  }
}

export const DIAGRAM_WRITER = Symbol('DIAGRAM_WRITER');

/** Fast and inexpensive, which is what a graph of short labels needs. */
const DIAGRAM_MODEL = 'claude-haiku-5-5';

/** Forty boxes and their arrows come to well under this. */
const MAX_TOKENS = 4096;

export class AnthropicDiagramWriter implements DiagramWriter {
  private readonly logger = new Logger(AnthropicDiagramWriter.name);
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    // One retry and a minute: somebody is watching the box fill in, and a
    // request that has not started by then will not be waited for.
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  }

  async *write(turns: readonly DiagramTurn[], signal: AbortSignal): AsyncIterable<string> {
    try {
      const stream = this.client.messages.stream(
        {
          model: DIAGRAM_MODEL,
          max_tokens: MAX_TOKENS,
          // Labels and arrows need no deliberation, and thinking would hold
          // back the first line the person is waiting to see.
          thinking: { type: 'disabled' },
          output_config: { effort: 'low' },
          system: DIAGRAM_SYSTEM_PROMPT,
          messages: turns.map((turn) => ({ role: turn.role, content: turn.text })),
        },
        { signal },
      );

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }

      const message = await stream.finalMessage();
      this.logger.log(
        `Diagram: ${message.usage.input_tokens} in, ${message.usage.output_tokens} out, ${message.stop_reason}`,
      );
      if (message.stop_reason === 'refusal') throw new DiagramWriterError('refused');
    } catch (error) {
      if (error instanceof DiagramWriterError || signal.aborted) throw error;
      if (
        error instanceof Anthropic.RateLimitError ||
        error instanceof Anthropic.InternalServerError
      ) {
        throw new DiagramWriterError('busy');
      }
      if (error instanceof Anthropic.APIError) {
        this.logger.error(
          `Diagram request failed: ${error.status ?? 'no status'} ${error.message}`,
        );
      } else {
        this.logger.error(`Diagram request failed: ${String(error)}`);
      }
      throw new DiagramWriterError('unavailable');
    }
  }
}
