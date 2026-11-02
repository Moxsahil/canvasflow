import type { Metadata } from 'next';
import { NotFoundView } from './not-found-view';

export const metadata: Metadata = {
  title: 'Page not found — CanvasFlow',
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundView />;
}
