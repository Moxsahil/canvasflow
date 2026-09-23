import {
  Catch,
  type ExceptionFilter,
  Logger,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
} from '@nestjs/common';

import type { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  path: string;
  timestamp: string;
  /**
   * How long to wait, when the refusal is about pace rather than credentials.
   *
   * Repeated in the body as well as the `Retry-After` header because the apps
   * calling this are on other origins, and a browser will not let them read a
   * header that CORS has not been told to expose.
   */
  retryAfterSeconds?: number;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let retryAfterSeconds: number | undefined;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'InternalServerError';

    // Only an HttpException carries text meant for whoever called. Anything
    // else keeps the generic message above: a raw error's wording is written
    // by whatever threw it, and forwarding it hands out hostnames, column
    // names and driver internals. That detail goes to the log instead.
    if (exception instanceof HttpException) {
      status = exception.getStatus();

      // Derived from the status first, so an exception that does not name a
      // label still gets an honest one. Nest's own exceptions carry the field
      // and overwrite this a few lines down; a thrown throttler answers with a
      // bare string instead, which used to leave a 429 reading
      // "InternalServerError".
      error = labelFor(status);

      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as { message?: string; error?: string; retryAfterSeconds?: number };
        message = obj.message ?? message;
        error = obj.error ?? error;
        if (typeof obj.retryAfterSeconds === 'number') retryAfterSeconds = obj.retryAfterSeconds;
      }
    }

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${status}`, describe(exception));
    } else {
      this.logger.debug(`${request.method} ${request.url} -> ${status} ${message}`);
    }

    const payload: ErrorResponse = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    };

    // The header as well, for anything reading this that is not a browser on
    // another origin — a proxy, a log, curl.
    if (retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }

    response.status(status).json(payload);
  }
}

/**
 * A readable name for a status code.
 *
 * Spaced words, because that is the form Nest's own exceptions already use for
 * this field, and one response should not label two refusals in two styles.
 */
function labelFor(status: number): string {
  const name = HttpStatus[status];
  if (typeof name !== 'string') return 'Error';

  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Render a thrown value for the log.
 *
 * AggregateError is why this exists. Node throws one when every address a
 * hostname resolves to fails to connect, and its own message is empty: the
 * causes live in `errors`, which printing the stack drops. Without this, a
 * database that could not be reached reads in the log as one bare word.
 */
function describe(exception: unknown): string {
  if (exception instanceof AggregateError) {
    const causes = exception.errors
      .map((cause: unknown) =>
        cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause),
      )
      .join('; ');
    return `AggregateError(${exception.errors.length}): ${causes}\n${exception.stack ?? ''}`;
  }
  if (exception instanceof Error) {
    return exception.stack ?? `${exception.name}: ${exception.message}`;
  }
  return String(exception);
}
