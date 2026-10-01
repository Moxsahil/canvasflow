import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Invite and account pages must be crawlable to expose their noindex
      // metadata. Authentication, not robots.txt, protects application data.
      disallow: ['/api/'],
    },
    sitemap: 'https://canvasflowapp.com/sitemap.xml',
  };
}
