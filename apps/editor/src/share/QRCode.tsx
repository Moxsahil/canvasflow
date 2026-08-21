import { useEffect, useState } from 'react';

interface QRCodeProps {
  value: string;
  /** Rendered size in CSS pixels. */
  size?: number;
}

type Matrix = boolean[][];

export function QRCode({ value, size = 132 }: QRCodeProps) {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    import('uqr')
      .then(({ encode }) => {
        if (!active) return;
        setMatrix(encode(value).data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [value]);

  // A missing QR is a missing convenience, not a missing feature — the link
  // itself is right there. Reserve the space so the dialog doesn't jump.
  if (failed) return null;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 8,
        // The quiet zone must be light for the code to scan, in either theme.
        background: '#ffffff',
        padding: 8,
      }}
    >
      {matrix && (
        <svg
          viewBox={`0 0 ${matrix.length} ${matrix.length}`}
          width={size - 16}
          height={size - 16}
          shapeRendering="crispEdges"
          role="img"
          aria-label="QR code for the board link"
        >
          {matrix.flatMap((row, y) =>
            row.map((filled, x) =>
              filled ? (
                <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#101014" />
              ) : null,
            ),
          )}
        </svg>
      )}
    </div>
  );
}
