import { describe, expect, it } from 'vitest';
import { oembedEndpointFor, readOembed } from './oembed.js';

describe('oembedEndpointFor', () => {
  it('asks the site itself, with the link as a query value', () => {
    const endpoint = oembedEndpointFor(new URL('https://youtu.be/dQw4w9WgXcQ?t=5'));
    expect(endpoint?.origin).toBe('https://www.youtube.com');
    expect(endpoint?.searchParams.get('url')).toBe('https://youtu.be/dQw4w9WgXcQ?t=5');
    expect(oembedEndpointFor(new URL('https://example.com/watch'))).toBeNull();
  });
});

describe('readOembed', () => {
  it('reads the title, who made it, the site and the thumbnail', () => {
    const body = Buffer.from(
      JSON.stringify({
        title: 'Never Gonna Give You Up',
        author_name: 'Rick Astley',
        provider_name: 'YouTube',
        thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        html: '<iframe src="https://evil.example/"></iframe>',
      }),
    );
    expect(readOembed(body)).toEqual({
      title: 'Never Gonna Give You Up',
      description: 'Rick Astley',
      siteName: 'YouTube',
      image: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    });
  });

  it('gives nothing for an answer that is not one', () => {
    expect(readOembed(Buffer.from('<html>'))).toBeNull();
    expect(readOembed(Buffer.from('"text"'))).toBeNull();
    expect(
      readOembed(Buffer.from(JSON.stringify({ thumbnail_url: 'javascript:1' })))?.image,
    ).toBeNull();
  });
});
