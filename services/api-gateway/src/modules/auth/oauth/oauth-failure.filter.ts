import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { oauthFailureUrl } from './oauth.redirects.js';
import { OAuthSignInError, type OAuthErrorCode } from './oauth.service.js';

/**
 * Send a failed provider sign-in back to the login page.
 *
 * These two routes are browser navigations, not API calls. Everything else in
 * this service answers a failure with JSON, which is right for a caller reading
 * the body and useless to somebody who is looking at a page: a refused callback
 * would leave them staring at a blob of JSON on the API's domain with no way
 * back. A redirect puts them where they started, with a word saying what
 * happened.
 *
 * Catches everything on purpose. A provider can fail in ways this code has not
 * thought of, and the browser's answer has to be the same in all of them.
 */
@Catch()
export class OAuthFailureFilter implements ExceptionFilter {
  private readonly logger = new Logger(OAuthFailureFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    // The callback sets cookies before redirecting, so by the time something
    // fails afterwards the answer is already on its way. Writing a second one
    // would throw over the first.
    if (response.headersSent) return;

    const code = classify(exception);
    this.logger.warn(`OAuth sign-in failed (${code}): ${describe(exception)}`);

    response.redirect(oauthFailureUrl(code));
  }
}

function classify(exception: unknown): OAuthErrorCode {
  if (exception instanceof OAuthSignInError) return exception.code;
  if (
    exception instanceof HttpException &&
    exception.getStatus() === HttpStatus.SERVICE_UNAVAILABLE
  ) {
    return 'not_configured';
  }
  return 'provider_error';
}

function describe(exception: unknown): string {
  return exception instanceof Error ? exception.message : String(exception);
}
