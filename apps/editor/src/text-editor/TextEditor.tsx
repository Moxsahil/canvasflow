import { useEffect, useRef, useState } from 'react';

interface TextEditorProps {
  position: { x: number; y: number };
  onCommit: (text: string) => void;
  onCancel: () => void;
}

export function TextEditor({ position, onCommit, onCancel }: TextEditorProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const commit = () => {
    if (value.trim()) {
      onCommit(value);
    } else {
      onCancel();
    }
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        minWidth: 100,
        minHeight: 24,
        padding: 4,
        margin: 0,
        border: '1px dashed #6366f1',
        background: 'rgba(255, 255, 255, 0.95)',
        font: '20px "Caveat", "Comic Sans MS", system-ui, sans-serif',
        color: '#1e293b',
        resize: 'none',
        outline: 'none',
        overflow: 'hidden',
      }}
      placeholder="Type here..."
    />
  );
}
