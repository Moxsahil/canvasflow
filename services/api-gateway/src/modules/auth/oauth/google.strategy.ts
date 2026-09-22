import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type StrategyOptions } from 'passport-google-oauth20';
import { parseEnv } from '../../../config/env.js';
import { CookieStateStore } from './cookie-state.store.js';
import type { OAuthIdentity } from './oauth.service.js';

export const GOOGLE_STRATEGY = 'cf-google';

/**
 * A stand-in used only when Google is not configured.
 *
 * passport-oauth2 refuses to construct without a client id, which would stop
 * the whole service booting over a provider a checkout may not need. The guard
 * in front of the route turns that case into a plain message, so nothing ever
 * reaches Google with this value.
 */
const UNCONFIGURED = 'unconfigured';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, GOOGLE_STRATEGY) {
  constructor() {
    const env = parseEnv();

    // `store` is a passport-oauth2 option this strategy inherits; the typings
    // declare it, so everything here stays type-checked.
    const options: StrategyOptions = {
      clientID: env.GOOGLE_CLIENT_ID ?? UNCONFIGURED,
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? UNCONFIGURED,
      // Built from configuration rather than the request's Host header, which
      // a caller writes. It also has to match what is registered with Google
      // character for character, so it cannot be something that varies.
      callbackURL: `${env.API_PUBLIC_URL}/auth/oauth/google/callback`,
      scope: ['openid', 'email', 'profile'],
      store: new CookieStateStore('google', env.NODE_ENV === 'production'),
    };

    super(options);
  }

  /**
   * Normalise Google's profile into the one shape both providers answer in.
   *
   * No database work here. This says who the provider vouched for; deciding
   * which account that is belongs to the service.
   *
   * `email_verified` comes straight from Google's own claim. Google will not
   * release an address it has not confirmed, but the flag is read rather than
   * assumed, so an unverified one is treated as unverified.
   */
  validate(_accessToken: string, _refreshToken: string, profile: Profile): OAuthIdentity {
    const json = profile._json as { email?: string; email_verified?: boolean };

    return {
      provider: 'google',
      providerAccountId: profile.id,
      email: profile.emails?.[0]?.value ?? json.email ?? null,
      emailVerified: json.email_verified === true,
      name: profile.displayName || null,
      image: profile.photos?.[0]?.value ?? null,
      scope: 'openid email profile',
    };
  }
}
