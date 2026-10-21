import { Module } from '@nestjs/common';
import { parseEnv } from '../../config/env.js';
import { AiDiagramsController } from './ai-diagrams.controller.js';
import { AiDiagramsService } from './ai-diagrams.service.js';
import { AnthropicDiagramWriter, DIAGRAM_WRITER } from './diagram-writer.js';

/**
 * Diagrams generated from a description. Without an Anthropic key the writer
 * is absent and the route says so, while every other route carries on.
 */
@Module({
  controllers: [AiDiagramsController],
  providers: [
    AiDiagramsService,
    {
      provide: DIAGRAM_WRITER,
      useFactory: () => {
        const key = parseEnv().ANTHROPIC_API_KEY;
        return key ? new AnthropicDiagramWriter(key) : null;
      },
    },
  ],
})
export class AiDiagramsModule {}
