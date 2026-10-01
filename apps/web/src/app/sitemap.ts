import type { MetadataRoute } from 'next';

/** Public content pages on the production host, including in preview builds. */
export default function sitemap(): MetadataRoute.Sitemap {
  // Add standalone public pages here as they launch. Account flows, invite
  // tokens, API routes, and homepage section anchors do not belong in a sitemap.
  // Omit lastModified until each page has a reliable content-update timestamp.
  return [
    { url: 'https://canvasflowapp.com/' },
    { url: 'https://canvasflowapp.com/terms' },
    { url: 'https://canvasflowapp.com/privacy' },
  ];
}
