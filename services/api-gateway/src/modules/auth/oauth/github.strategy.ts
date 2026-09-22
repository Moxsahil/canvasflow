import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type StrategyOptions } from 'passport-github2';
import { parseEnv } from '../../../config/env.js';
import { CookieStateStore } from './cookie-state.store.js';
import type { OAuthIdentity } from './oauth.service.js';

export const GITHUB_STRATEGY = 'cf-github';

/** See the note in google.strategy.ts. */
const UNCONFIGURED = 'unconfigured';

const GITHUB_API = 'https://api.github.com';
const SCOPE = ['read:user', 'user:email'];

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, GITHUB_STRATEGY) {
  private readonly logger = new Logger(GitHubStrategy.name);

  constructor() {
    const env = parseEnv();

    // See the note in google.strategy.ts.
    const options: StrategyOptions = {
      clientID: env.GITHUB_CLIENT_ID ?? UNCONFIGURED,
      clientSecret: env.GITHUB_CLIENT_SECRET ?? UNCONFIGURED,
      callbackURL: `${env.API_PUBLIC_URL}/auth/oauth/github/callback`,
      scope: SCOPE,
      store: new CookieStateStore('github', env.NODE_ENV === 'production'),
    };

    super(options);
  }

  /**
   * Normalise GitHub's profile, and go and ask what the stock reader throws
   * away.
   *
   * GitHub's `/user` carries only the public address and says nothing about
   * whether it is confirmed, while `/user/emails` carries every address with
   * its own `verified` flag. That flag is the whole question here, so the list
   * is always read rather than only as a fallback when there is no public one.
   *
   * A failure to read it is not an error. It leaves the address unconfirmed,
   * and unconfirmed only means the ordinary verification mail goes out.
   */
  async validate(
    accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<OAuthIdentity> {
    const publicEmail = profile.emails?.[0]?.value ?? null;
    const emails = await this.fetchEmails(accessToken);

    // The address this sign-in will actually use, then that address's own
    // flag. Matching the public address first matters: an account may hold
    // several confirmed addresses and one unconfirmed, and the primary one is
    // not necessarily the one being presented.
    const chosen =
      (publicEmail ? emails.find((entry) => entry.email === publicEmail) : undefined) ??
      emails.find((entry) => entry.primary) ??
      emails[0];

    return {
      provider: 'github',
      providerAccountId: String(profile.id),
      email: publicEmail ?? chosen?.email ?? null,
      emailVerified: chosen?.verified === true,
      name: profile.displayName || profile.username || null,
      image: profile.photos?.[0]?.value ?? null,
      scope: SCOPE.join(' '),
    };
  }

  private async fetchEmails(accessToken: string): Promise<GitHubEmail[]> {
    try {
      const response = await fetch(`${GITHUB_API}/user/emails`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'canvasflow',
        },
      });

      if (!response.ok) return [];
      return (await response.json()) as GitHubEmail[];
    } catch (cause) {
      this.logger.warn(`Could not read GitHub addresses: ${String(cause)}`);
      return [];
    }
  }
}
