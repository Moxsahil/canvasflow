import { Badge } from '@canvasflow/ui';

export function Topbar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        <Badge variant="brand">Dev mode</Badge>
      </div>
    </header>
  );
}
