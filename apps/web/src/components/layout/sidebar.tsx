import Link from 'next/link';
import { Heading } from '@canvasflow/ui';

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-white px-4 py-6 lg:block">
      <Link href="/" className="mb-8 block">
        <Heading level={5}>CanvasFlow</Heading>
      </Link>

      <nav>
        <ul className="space-y-1">
          <li>
            <Link
              href="/boards"
              className="block rounded-md px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Boards
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
