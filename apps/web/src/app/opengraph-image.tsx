import { ImageResponse } from 'next/og';

export const alt = 'CanvasFlow — Online whiteboard for teams';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#f5f4f0',
        color: '#111',
        padding: '64px 72px',
      }}
    >
      <div style={{ display: 'flex', fontSize: 30, letterSpacing: '-1px' }}>CanvasFlow</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div
          style={{
            display: 'flex',
            fontSize: 80,
            letterSpacing: '-4px',
            lineHeight: 1.05,
            maxWidth: 900,
          }}
        >
          An online whiteboard for your next idea.
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#555' }}>
          Brainstorm. Draw diagrams. Work together.
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid #ccc', paddingTop: 24, fontSize: 22 }}>
        canvasflowapp.com
      </div>
    </div>,
    size,
  );
}
