import { Button, Heading, Text } from '@canvasflow/ui';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 text-center">
      <Heading level={1} className="mb-4">
        CanvasFlow
      </Heading>
      <Text size="lg" tone="secondary" className="mb-8 max-w-xl">
        An enterprise-grade collaborative whiteboard. Excalidraw warmth meets Figma collaborative
        meets Notion workspace primitives
      </Text>
      <Link href="/boards">
        <Button variant="primary" size="lg">
          View your boards
        </Button>
      </Link>
    </main>
  );
}
