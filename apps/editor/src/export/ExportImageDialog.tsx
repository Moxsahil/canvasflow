import { useCallback, useEffect, useMemo, useState } from 'react';
import { measureExportSize, type Shape } from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  canvasToPngBlob,
  copyPngToClipboard,
  EXPORT_SCALES,
  exportSvgString,
  renderExportCanvas,
  type ImageExportSettings,
} from '../file/export-image';
import { saveFile } from '../file/save-file';
import { serializeBoardFile } from '../file/board-file';
import { embedSceneInPng, embedSceneInSvg } from '../file/scene-metadata';

interface ExportImageDialogProps {
  open: boolean;
  onClose: () => void;
  /** Everything on the board. */
  shapes: readonly Shape[];
  /** The current selection, offered as "only selected". */
  selectedShapes: readonly Shape[];
  boardName: string;
  canvasBackground: string;
  /** Seeds the dark toggle from the theme the editor is already showing. */
  darkTheme: boolean;
  portalContainer: HTMLElement | null;
}

export function ExportImageDialog({
  open,
  onClose,
  shapes,
  selectedShapes,
  boardName,
  canvasBackground,
  darkTheme,
  portalContainer,
}: ExportImageDialogProps) {
  const hasSelection = selectedShapes.length > 0;

  const [name, setName] = useState(boardName);
  const [selectionOnly, setSelectionOnly] = useState(hasSelection);
  const [withBackground, setWithBackground] = useState(true);
  const [dark, setDark] = useState(darkTheme);
  const [scale, setScale] = useState<number>(1);
  const [embedScene, setEmbedScene] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed each time the dialog opens: the selection and theme may both have
  // changed since it was last used.
  useEffect(() => {
    if (!open) return;
    setName(boardName);
    setSelectionOnly(selectedShapes.length > 0);
    setDark(darkTheme);
    setError(null);
  }, [open, boardName, darkTheme, selectedShapes.length]);

  const exported = useMemo(
    () => (selectionOnly && hasSelection ? selectedShapes : shapes),
    [selectionOnly, hasSelection, selectedShapes, shapes],
  );

  const settings: ImageExportSettings = useMemo(
    () => ({ scale, withBackground, dark, embedScene, backgroundColor: canvasBackground }),
    [scale, withBackground, dark, embedScene, canvasBackground],
  );

  const dimensions = useMemo(() => {
    if (exported.length === 0) return null;
    try {
      return measureExportSize(exported, { scale });
    } catch {
      return null;
    }
  }, [exported, scale]);

  // The preview renders at 1×; only the reported dimensions follow the scale,
  // because a 3× preview would be three times the work for the same picture.
  useEffect(() => {
    if (!open || exported.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    try {
      const { canvas } = renderExportCanvas(exported, { ...settings, scale: 1 });
      const url = canvas.toDataURL('image/png');
      if (!cancelled) setPreview(url);
    } catch {
      if (!cancelled) setPreview(null);
    }
    return () => {
      cancelled = true;
    };
  }, [open, exported, settings]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That export failed.');
    } finally {
      setBusy(false);
    }
  }, []);

  const exportPng = useCallback(
    () =>
      run(async () => {
        const { canvas, darkApplied } = renderExportCanvas(exported, settings);
        if (settings.dark && !darkApplied) {
          throw new Error("This browser can't render a dark export.");
        }
        const png = await canvasToPngBlob(canvas);
        // Only the exported shapes go in, so opening the image gives back what
        // the image shows rather than a board that disagrees with it.
        const blob = settings.embedScene
          ? await embedSceneInPng(png, serializeBoardFile(exported, canvasBackground))
          : png;
        const result = await saveFile({
          boardName: settings.embedScene ? `${name}.canvasflow` : name,
          data: blob,
          format: 'png',
        });
        if (result.status === 'saved') onClose();
      }),
    [exported, settings, name, canvasBackground, onClose, run],
  );

  const exportSvg = useCallback(
    () =>
      run(async () => {
        const rendered = exportSvgString(exported, settings);
        const svg = settings.embedScene
          ? embedSceneInSvg(rendered, serializeBoardFile(exported, canvasBackground))
          : rendered;
        const result = await saveFile({
          boardName: settings.embedScene ? `${name}.canvasflow` : name,
          data: svg,
          format: 'svg',
        });
        if (result.status === 'saved') onClose();
      }),
    [exported, settings, name, canvasBackground, onClose, run],
  );

  const copyPng = useCallback(
    () =>
      run(async () => {
        const { canvas } = renderExportCanvas(exported, settings);
        await copyPngToClipboard(await canvasToPngBlob(canvas));
        onClose();
      }),
    [exported, settings, onClose, run],
  );

  const empty = exported.length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent container={portalContainer} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Export image</DialogTitle>
          <DialogDescription>
            {empty
              ? 'There is nothing on the canvas to export.'
              : dimensions
                ? `${dimensions.width} × ${dimensions.height} px`
                : null}
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex min-h-[9rem] items-center justify-center rounded-(--border-radius-lg) border border-(--default-border-color) bg-[repeating-conic-gradient(var(--color-surface-low)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-3"
          aria-live="polite"
        >
          {preview ? (
            <img
              src={preview}
              alt="Export preview"
              className="max-h-[16rem] max-w-full object-contain"
            />
          ) : (
            <span className="text-[0.8125rem] text-(--keybinding-color)">
              {empty ? 'Nothing to preview' : 'Preparing preview…'}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-(--keybinding-color)">File name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-9 rounded-(--border-radius-md) border border-(--default-border-color) bg-transparent px-2.5 text-[0.8125rem] text-(--text-primary-color) focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Only selected"
              checked={selectionOnly && hasSelection}
              disabled={!hasSelection}
              onChange={setSelectionOnly}
            />
            <Toggle label="Background" checked={withBackground} onChange={setWithBackground} />
            <Toggle label="Dark mode" checked={dark} onChange={setDark} />
            <Toggle label="Embed scene" checked={embedScene} onChange={setEmbedScene} />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-(--keybinding-color)">Scale</span>
            <div className="flex gap-1" role="radiogroup" aria-label="Export scale">
              {EXPORT_SCALES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={scale === choice}
                  onClick={() => setScale(choice)}
                  className={cn(
                    'h-7 rounded-(--border-radius-md) border px-2.5 text-xs font-medium transition-colors focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none',
                    scale === choice
                      ? 'border-(--button-active-border) bg-(--color-surface-primary-container) text-(--color-on-primary-container)'
                      : 'border-(--default-border-color) hover:bg-(--button-hover-bg)',
                  )}
                >
                  {choice}×
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-[0.8125rem] text-(--color-danger)">{error}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ActionButton onClick={copyPng} disabled={empty || busy} variant="secondary">
            Copy to clipboard
          </ActionButton>
          <ActionButton onClick={exportSvg} disabled={empty || busy} variant="secondary">
            SVG
          </ActionButton>
          <ActionButton onClick={exportPng} disabled={empty || busy} variant="primary">
            PNG
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'h-8 rounded-(--border-radius-md) border px-3 text-xs font-medium transition-colors focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none',
        disabled && 'cursor-default opacity-45',
        checked
          ? 'border-(--button-active-border) bg-(--color-surface-primary-container) text-(--color-on-primary-container)'
          : 'border-(--default-border-color) hover:bg-(--button-hover-bg)',
      )}
    >
      {label}
    </button>
  );
}

function ActionButton({
  onClick,
  disabled,
  variant,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  variant: 'primary' | 'secondary';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex min-h-9 items-center justify-center rounded-(--border-radius-md) px-3.5 text-[0.8125rem] font-medium transition-[transform,filter] duration-200 hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none',
        variant === 'primary'
          ? 'bg-(--color-surface-primary-container) text-(--color-on-primary-container) hover:brightness-[0.97]'
          : 'border border-(--default-border-color) hover:bg-(--button-hover-bg)',
      )}
    >
      {children}
    </button>
  );
}
