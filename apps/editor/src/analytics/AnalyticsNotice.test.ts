import { describe, expect, it } from 'vitest';
import { TERMS_VERSION } from '@canvasflow/types';
import type { Profile } from '../profile/profile-api';
import { needsAnalyticsNotice } from './AnalyticsNotice';

const asked: Profile = {
  id: 'u',
  name: 'Ada',
  email: 'ada@example.com',
  avatarUrl: null,
  isGuest: false,
  cursorColor: null,
  avatarVersion: null,
  avatarUploaded: false,
  emailVerified: true,
  termsVersion: TERMS_VERSION,
  analytics: null,
};

describe('needsAnalyticsNotice', () => {
  it('asks a signed-in account that has not answered', () => {
    expect(needsAnalyticsNotice(asked)).toBe(true);
  });

  it('does not ask again once there is an answer, either way', () => {
    expect(needsAnalyticsNotice({ ...asked, analytics: true })).toBe(false);
    expect(needsAnalyticsNotice({ ...asked, analytics: false })).toBe(false);
  });

  it('never asks a guest, or before the profile has loaded', () => {
    expect(needsAnalyticsNotice({ ...asked, isGuest: true })).toBe(false);
    expect(needsAnalyticsNotice(null)).toBe(false);
  });

  it('waits for the email and terms notices, and for a web app that can save the answer', () => {
    expect(needsAnalyticsNotice({ ...asked, emailVerified: false })).toBe(false);
    expect(needsAnalyticsNotice({ ...asked, termsVersion: null })).toBe(false);
    expect(needsAnalyticsNotice({ ...asked, analytics: undefined })).toBe(false);
  });
});
