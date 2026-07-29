interface ShortcutsHintProps {
  onClick: () => void;
}

/**
 * Small hint in the bottom-right corner reminding the user
 * that ? opens the shortcuts modal. Positioned to mirror the
 * ZoomPanel in the bottom-left.
 */
export function ShortcutsHint({ onClick }: ShortcutsHintProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        background: 'white',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        fontSize: 12,
        color: '#71717a',
        zIndex: 10,
      }}
    >
      <span>Press</span>
      <kbd
        onClick={onClick}
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 11,
          padding: '2px 8px',
          background: '#f4f4f5',
          borderRadius: 4,
          border: '1px solid #e4e4e7',
          color: '#3f3f46',
          cursor: 'pointer',
          transition: 'background 100ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#e4e4e7';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#f4f4f5';
        }}
      >
        ?
      </kbd>
      <span>for shortcuts</span>
    </div>
  );
}
