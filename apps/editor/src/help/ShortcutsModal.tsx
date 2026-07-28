import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { SHORTCUTS, type ShortcutEntry } from './shortcuts-registry';
import { formatShortcutKeys } from './platform';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onClose]);

  useEffect(() => {
    if (open) modalRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 900,
          maxWidth: '92vw',
          maxHeight: '85vh',
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid #e4e4e7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            id="shortcuts-title"
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: '#18181b',
            }}
          >
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              color: '#71717a',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f4f4f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — three columns */}
        <div
          style={{
            padding: '24px 28px',
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 32,
          }}
        >
          {SHORTCUTS.map((category) => (
            <div key={category.title}>
              <h3
                style={{
                  margin: '0 0 16px 0',
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#18181b',
                }}
              >
                {category.title}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {category.entries.map((entry) => (
                  <ShortcutRow key={entry.keys + entry.description} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ entry }: { entry: ShortcutEntry }) {
  const primaryKeys = formatShortcutKeys(entry.keys);
  const altKeys = entry.altKeys ? formatShortcutKeys(entry.altKeys) : null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minHeight: 28,
        fontSize: 13,
        color: '#3f3f46',
      }}
    >
      <span style={{ flex: 1 }}>{entry.description}</span>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <KeyPills keys={primaryKeys} />
        {altKeys && (
          <>
            <span style={{ fontSize: 11, color: '#a1a1aa', fontStyle: 'italic' }}>or</span>
            <KeyPills keys={altKeys} />
          </>
        )}
      </div>
    </div>
  );
}

function KeyPills({ keys }: { keys: string[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {keys.map((k, i) => (
        <kbd
          key={i}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 11,
            padding: '2px 6px',
            minWidth: 20,
            textAlign: 'center',
            background: '#f4f4f5',
            borderRadius: 4,
            border: '1px solid #e4e4e7',
            color: '#3f3f46',
            whiteSpace: 'nowrap',
            lineHeight: 1.4,
          }}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
