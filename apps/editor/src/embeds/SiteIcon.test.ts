import { describe, expect, it } from 'vitest';
import { EMBED_PROVIDERS } from '@canvasflow/canvas-engine';
import { hasSiteIcon } from './SiteIcon';

describe('site icons', () => {
  it('has one for every site an embed can come from', () => {
    expect(EMBED_PROVIDERS.filter((site) => !hasSiteIcon(site.id)).map((site) => site.id)).toEqual(
      [],
    );
  });
});
