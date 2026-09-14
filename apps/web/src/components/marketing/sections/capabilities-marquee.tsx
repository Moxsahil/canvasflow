// Two rows of capability chips scrolling in opposite directions. Each row
// repeats its list three times so the keyframes (in globals.css) can translate
// by exactly one third and loop without a visible seam.
const TOP_ROW = [
  'Infinite Canvas',
  'Freehand Drawing',
  'Shape Snapping',
  'Arrows & Connectors',
  'Frames',
  'Text & Labels',
  'Image Drop',
  'Sticky Notes',
  'Laser Pointer',
  'Follow Mode',
];

const BOTTOM_ROW = [
  'Live Cursors',
  'Presence',
  'Guest Links',
  'Expiring Shares',
  'Viewer Mode',
  'QR Join',
  'PNG Export',
  '.canvasflow Files',
  'Trash & Restore',
  'Board Search',
];

const REPEATS = 3;

export function CapabilitiesMarquee() {
  return (
    <section className="py-0 border-t border-black/[0.06] overflow-hidden select-none">
      <div
        className="flex border-b border-black/[0.06]"
        style={{ animation: 'marqueeLeft 28s linear infinite' }}
      >
        {Array.from({ length: REPEATS }, (_, rep) => (
          <div key={rep} className="flex shrink-0">
            {TOP_ROW.map((cap) => (
              <div
                key={cap}
                className="flex items-center gap-6 px-10 py-5 border-r border-black/[0.06] shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-black/20 shrink-0" />
                <span className="text-sm text-black/45 whitespace-nowrap tracking-wide">{cap}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex" style={{ animation: 'marqueeRight 22s linear infinite' }}>
        {Array.from({ length: REPEATS }, (_, rep) => (
          <div key={rep} className="flex shrink-0">
            {BOTTOM_ROW.map((cap) => (
              <div
                key={cap}
                className="flex items-center gap-6 px-10 py-5 border-r border-black/[0.06] shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-black/12 shrink-0" />
                <span className="text-sm text-black/30 whitespace-nowrap tracking-wide">{cap}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
