import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import {
  countryName,
  describeDevice,
  locationFromEdgeHeaders,
  requestOrigin,
} from './request-origin.js';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/131.0.0.0`;
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

describe('describeDevice', () => {
  it.each([
    [CHROME_WINDOWS, 'Chrome on Windows'],
    [EDGE_WINDOWS, 'Edge on Windows'],
    [SAFARI_MAC, 'Safari on macOS'],
    [FIREFOX_LINUX, 'Firefox on Linux'],
    [CHROME_IPHONE, 'Chrome on iOS'],
    [CHROME_ANDROID, 'Chrome on Android'],
  ])('names %s', (ua, expected) => {
    expect(describeDevice(ua)).toBe(expected);
  });

  it('says nothing for a missing or meaningless header', () => {
    expect(describeDevice(undefined)).toBeNull();
    expect(describeDevice('curl/8.5.0')).toBeNull();
  });
});

describe('countryName', () => {
  it('names a real country code', () => {
    expect(countryName('IN')).toBe('India');
    expect(countryName('us')).toBe('United States');
  });

  it("handles the edge's own non-country codes", () => {
    expect(countryName('XX')).toBeNull();
    expect(countryName('T1')).toBe('the Tor network');
  });

  it('ignores anything that is not a two-letter code', () => {
    expect(countryName('<script>')).toBeNull();
    expect(countryName('ZZ')).toBeNull();
  });
});

describe('locationFromEdgeHeaders', () => {
  it('names the city, region and country when the edge sends all three', () => {
    expect(
      locationFromEdgeHeaders({
        'cf-ipcity': 'New Delhi',
        'cf-region': 'Delhi',
        'cf-ipcountry': 'IN',
      }),
    ).toBe('New Delhi, Delhi, India');
  });

  it('falls back to the country alone', () => {
    expect(locationFromEdgeHeaders({ 'cf-ipcountry': 'IN' })).toBe('India');
  });

  it('does not repeat itself', () => {
    expect(
      locationFromEdgeHeaders({
        'cf-ipcity': 'Singapore',
        'cf-region': 'Singapore',
        'cf-ipcountry': 'SG',
      }),
    ).toBe('Singapore');
  });

  it('decodes a percent-encoded name and strips control characters', () => {
    expect(locationFromEdgeHeaders({ 'cf-ipcity': 'S%C3%A3o%20Paulo', 'cf-ipcountry': 'BR' })).toBe(
      'São Paulo, Brazil',
    );
    expect(locationFromEdgeHeaders({ 'cf-ipcity': 'Evil\u0007City' })).toBe('EvilCity');
  });

  it('says nothing when there is nothing to say', () => {
    expect(locationFromEdgeHeaders({})).toBeNull();
    expect(locationFromEdgeHeaders({ 'cf-ipcountry': 'XX' })).toBeNull();
  });
});

describe('requestOrigin', () => {
  const request = {
    headers: { 'user-agent': CHROME_WINDOWS, 'cf-ipcountry': 'IN', 'cf-ipcity': 'Mumbai' },
  } as unknown as Request;

  it('uses the edge location headers when the edge is trusted', () => {
    expect(requestOrigin(request, { trustEdgeHeaders: true }).location).toBe('Mumbai, India');
  });

  it('ignores the edge location headers when anybody could have sent them', () => {
    expect(requestOrigin(request, { trustEdgeHeaders: false }).location).toBeNull();
  });
});
