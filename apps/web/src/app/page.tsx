import { Button, Heading, Text } from '@canvasflow/ui';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 text-center">
      <Heading level={1} className="mb-4">
        CanvasFlow
      </Heading>
      <Text size="lg" tone="secondary" className="mb-8 max-w-xl">
        Homepage
      </Text>
      {/* /open resolves which board to land on and hands off to the editor —
          there is no board list page to send anyone to. */}
      <Link href="/open">
        <Button variant="primary" size="lg">
          Open your canvas
        </Button>
      </Link>
    </main>
  );
}
