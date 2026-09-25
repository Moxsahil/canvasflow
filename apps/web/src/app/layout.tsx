import type { Metadata } from 'next';
import {
  Courier_Prime,
  Geist,
  Geist_Mono,
  IBM_Plex_Sans,
  Instrument_Sans,
  Inter,
  JetBrains_Mono,
} from 'next/font/google';
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

// The navigation bar sets everything — wordmark and links alike — in this one
// face. Kept off the page-wide variables so the sections below the bar keep the
// scale they were built on; `.cf-nav` in globals.css is what points the bar's
// `font-sans` at it.
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
});

// Only the pricing block asks for this one, for its small caps and figures.
const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

const fontVariables = [
  inter.variable,
  geist.variable,
  geistMono.variable,
  courierPrime.variable,
  ibmPlexSans.variable,
  instrumentSans.variable,
  jetBrainsMono.variable,
].join(' ');

export const metadata: Metadata = {
  title: 'CanvasFlow — Collaborative Whiteboard',
  description: 'Enterprise collaborative whiteboard platform',
  // One icon for every tab in every theme: the logo sits on its own white
  // square, so it reads on light and dark tab strips alike. The editor serves
  // the same file for its own tabs.
  //
  // Versioned, because browsers hold on to the icon a page last had: a new
  // address is the one thing certain to make them fetch this one. Bump it
  // whenever the icon changes.
  icons: {
    icon: [{ url: '/favicon.ico?v=2', sizes: 'any' }],
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
