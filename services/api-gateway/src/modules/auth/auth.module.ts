import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuditService } from './audit.service.js';
import { AuthService } from './auth.service.js';
import { EditorTokenService } from './editor-token.service.js';
import { PasswordService } from './password.service.js';
import { SessionController } from './session.controller.js';
import { SessionRenewalService } from './session-renewal.service.js';
import { SessionService } from './session.service.js';
import { SignInRateLimiter } from './sign-in-rate-limit.service.js';
import { TokenService } from './token.service.js';
import { GitHubStrategy } from './oauth/github.strategy.js';
import { GoogleStrategy } from './oauth/google.strategy.js';
import { OAuthController } from './oauth/oauth.controller.js';
import { OAuthService } from './oauth/oauth.service.js';
import { EmailVerificationModule } from '../email-verification/email-verification.module.js';

@Module({
  // No `session: true`. Passport's own session support exists to keep a signed
  // in user in `req.session`, which this service does not have and does not
  // want: being signed in here is a token and a row, not server memory. The
  // one thing a session would normally hold — the OAuth state — has its own
  // cookie store instead.
  imports: [PassportModule.register({ session: false }), EmailVerificationModule],
  controllers: [AuthController, OAuthController, SessionController],
  providers: [
    AuthService,
    AuditService,
    PasswordService,
    SessionService,
    SignInRateLimiter,
    TokenService,
    OAuthService,
    SessionRenewalService,
    EditorTokenService,
    // Registered unconditionally, even where a provider has no credentials.
    // Constructing one is what tells passport the strategy exists, and the
    // guard in front of each route is what refuses when it is not configured.
    GoogleStrategy,
    GitHubStrategy,
  ],
})
export class AuthModule {}
