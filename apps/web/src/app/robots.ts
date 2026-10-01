import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // These endpoints serve application data or token-bearing share links.
      // Crawling rules do not replace authentication or control indexing.
      disallow: ['/api/', '/invite/'],
    },
    sitemap: 'https://canvasflowapp.com/sitemap.xml',
  };
}
