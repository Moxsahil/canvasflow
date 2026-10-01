import type { Metadata } from 'next';

export const SITE_URL = 'https://canvasflowapp.com';
export const APP_URL = 'https://app.canvasflowapp.com';
export const SITE_DESCRIPTION =
  'CanvasFlow is an online whiteboard for brainstorming, diagrams and team collaboration. Draw on an infinite canvas, work together in real time and share your boards.';

/** Only deliberate public content pages opt into indexing. */
export function publicPageMetadata(title: string, description: string, path: string): Metadata {
  const url = new URL(path, SITE_URL).href;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      siteName: 'CanvasFlow',
      title,
      description,
      url,
      images: [
        {
          url: `${SITE_URL}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: 'CanvasFlow — Online whiteboard for teams',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}/opengraph-image`],
    },
  };
}
