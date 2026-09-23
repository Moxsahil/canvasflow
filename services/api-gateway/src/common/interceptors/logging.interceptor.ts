import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Request, Response } from 'express';
import { tap } from 'rxjs/operators';
import { redactUrl } from '../redact-url.js';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const startedAt = Date.now();
    const { method } = request;
    // The OAuth callback arrives with the authorization code in its query, so
    // the URL of that one request is itself a credential until it is spent.
    const url = redactUrl(request.url);

    return next.handle().pipe(
      tap(() => {
        const elapsed = Date.now() - startedAt;
        this.logger.log(`${method} ${url} -> ${response.statusCode} (${elapsed}ms)`);
      }),
    );
  }
}
