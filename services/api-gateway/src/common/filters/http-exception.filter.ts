import {
  Catch,
  ExceptionFilter,
  Logger,
  HttpException,
  HttpStatus,
  ArgumentsHost,
} from '@nestjs/common';

import type { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  path: string;
  timestamp: string;
}
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as { message?: string; error?: string };
        message = obj.message ?? message;
        error = obj.error ?? error;
      }
    } else if (exception instanceof Error) {
      message: exception.message;
      error: exception.name;
    }

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${status}`, exception);
    } else {
      this.logger.debug(`${request.method} ${request.url} ${request.url}
        ${status}${message}`);
    }

    const payload: ErrorResponse = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(payload);
  }
}
