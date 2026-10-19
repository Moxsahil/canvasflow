import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { JwtAuthGuard } from '../auth/jwt.guard.js';
import {
  LinkPreviewsService,
  type LinkPreview,
  type PreviewImageUrl,
} from './link-previews.service.js';

/**
 * Previews of links pasted onto a board: the page's title, description, site
 * name and picture.
 *
 * Signed-in callers only, and counted per account. Each new link is a fetch
 * from this server to somebody else's, so the limit is what stops the route
 * being used to hammer a site through us. The link goes in the body rather
 * than the query string, which keeps whatever people paste out of request logs.
 */
@Controller('link-previews')
@UseGuards(JwtAuthGuard, AccountThrottlerGuard)
export class LinkPreviewsController {
  constructor(private readonly previews: LinkPreviewsService) {}

  /** Null data, not a 404, when the page gave nothing to preview: that is an answer. */
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async preview(@Body() body: { url?: unknown }): Promise<{ data: LinkPreview | null }> {
    return { data: await this.previews.preview(body?.url) };
  }

  /**
   * A URL to read a preview picture from, rather than a redirect to one — for
   * the same reason as a board image's: a redirect across origins reaches
   * storage without the caller's origin, and storage then withholds the CORS
   * header the canvas needs to draw it.
   *
   * Any signed-in caller may ask for any picture. A preview is of a public
   * page, and the name is the hash of the picture's bytes, which nobody can
   * guess without already having the picture.
   */
  @Get('images/:name/url')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async imageUrl(@Param('name') name: string): Promise<{ data: PreviewImageUrl }> {
    return { data: await this.previews.imageUrl(name) };
  }
}
