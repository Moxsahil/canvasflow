import { describe, expect, it } from 'vitest';
import type { CaptureResult } from 'posthog-js';
import { analyticsAvailable, pageKind, scrubEvent, track } from './analytics';

describe('pageKind', () => {
  it('names the kind of page, never the board or a token', () => {
    expect(pageKind('/boards/76086868-9307-4ac0-8f63-b0d31a843bf1')).toBe('/boards/:id');
    expect(pageKind('/join/AbCdEfGhIjKlMnOpQrStUvWx')).toBe('/join/:token');
    expect(pageKind('/')).toBe('/');
  });
});

describe('scrubEvent', () => {
  it('takes every address and referrer off the event and the person', () => {
    const event = {
      uuid: 'u',
      event: 'board_opened',
      properties: {
        $current_url: 'https://app.canvasflowapp.com/boards/x?shapes=a,b',
        $pathname: '/boards/x',
        $host: 'app.canvasflowapp.com',
        $referrer: 'https://canvasflowapp.com/join/secret',
        $referring_domain: 'canvasflowapp.com',
        utm_source: 'mail',
        $browser: 'Chrome',
        $device_type: 'Desktop',
        tool: 'arrow',
      },
      $set: { $current_url: 'x', $browser: 'Chrome' },
      $set_once: { $initial_current_url: 'x', $initial_referrer: 'y', $initial_browser: 'Chrome' },
    } as unknown as CaptureResult;

    const scrubbed = scrubEvent(event)!;
    expect(Object.keys(scrubbed.properties).sort()).toEqual(['$browser', '$device_type', 'tool']);
    expect(scrubbed.$set).toEqual({ $browser: 'Chrome' });
    expect(scrubbed.$set_once).toEqual({ $initial_browser: 'Chrome' });
  });
});

describe('track', () => {
  it('does nothing while analytics is off, and is off in tests', () => {
    expect(analyticsAvailable()).toBe(false);
    expect(() => track('board_opened')).not.toThrow();
  });
});
