import type { Metadata } from 'next';
import { Courier_Prime, Geist, Geist_Mono, IBM_Plex_Sans, Inter } from 'next/font/google';
import { Providers } from '@/providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

// The marketing page's own type scale. Kept off `--font-sans`/`--font-mono` so
// the signed-in pages keep Inter; `.cf-landing` in globals.css points the
// `font-sans`/`font-mono`/`font-pixel` utilities at these for the home page.
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

const courierPrime = Courier_Prime({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-courier-prime',
});

// The home page's headline face, set through the variable rather than by name
// so it resolves to the hashed family next/font actually emits.
const ibmPlexSans = IBM_Plex_Sans({
  weight: ['300', '400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-ibm-plex-sans',
});

const fontVariables = [
  inter.variable,
  geist.variable,
  geistMono.variable,
  courierPrime.variable,
  ibmPlexSans.variable,
].join(' ');

export const metadata: Metadata = {
  title: 'CanvasFlow — Collaborative Whiteboard',
  description: 'Enterprise collaborative whiteboard platform',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="min-h-screen bg-white text-zinc-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
