import type { Metadata } from 'next';
import { Geist, Geist_Mono, Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

// The marketing page's own type scale. Kept off `--font-sans`/`--font-mono` so
// the signed-in pages keep Inter; `.cf-landing` in globals.css points the
// `font-sans`/`font-mono` utilities at these for the home page.
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

// The small rule-and-name labels (`cf-eyebrow`) are set in this.
const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

const fontVariables = [
  inter.variable,
  geist.variable,
  geistMono.variable,
  jetBrainsMono.variable,
].join(' ');

// What search results and link previews show for the site. "Online whiteboard"
// is the phrase people search for, so it is in both.
const title = 'CanvasFlow — Collaborative Online Whiteboard for Teams';
const description =
  'CanvasFlow is an enterprise-grade online whiteboard. Sketch diagrams, wireframes and flowcharts on an infinite canvas and work on them together in real time.';

export const metadata: Metadata = {
  // What the image addresses below resolve against. Link previews need a full
  // address, and preview builds point at the live site like the sitemap does.
  metadataBase: new URL('https://canvasflowapp.com'),
  title,
  description,
  // One icon for every tab in every theme: the logo sits on its own white
  // square, so it reads on light and dark tab strips alike. The editor serves
  // the same file for its own tabs.
  //
  // Versioned, because browsers hold on to the icon a page last had: a new
  // address is the one thing certain to make them fetch this one. Bump it
  // whenever the icon changes.
  //
  // The SVG is the same mark drawn as a vector, for browsers that prefer one;
  // the Apple icon is what iOS puts on the home screen.
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', sizes: 'any' },
      { url: '/brand/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/brand/apple-touch-icon.png',
  },
  // The card WhatsApp, X, Slack and LinkedIn show when somebody pastes a link.
  openGraph: {
    type: 'website',
    siteName: 'CanvasFlow',
    title,
    description,
    url: '/',
    images: [{ url: '/brand/og.png', width: 1200, height: 630, alt: 'CanvasFlow' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/brand/og.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen bg-white text-zinc-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
