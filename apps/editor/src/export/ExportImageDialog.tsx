import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import {
  frameBounds,
  frameLabel,
  isFrame,
  measureExportSize,
  shapesForFrameExport,
  type ImageSource,
  type Shape,
} from '@canvasflow/canvas-engine';
import { Copy, FileCode2, ImageDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { canvasBackgroundFor } from '../properties/palette';
import { initialsOf } from '@/lib/initials';
import { INPUT, Toggle } from '../settings/settings-ui';
import {
  SurfaceWindow,
  WindowBadge,
  WindowBody,
  WindowButton,
  WindowFooter,
  WindowHeader,
} from '../ui/SurfaceWindow';
import type { SurfaceTheme } from '../ui/surface-palette';
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
  /** Seeds the dark toggle from the theme the editor is already showing. */
  darkTheme: boolean;
  /** The theme on screen — the dialog surface carries its own palette for each. */
  theme: SurfaceTheme;
  /** Decoded bitmaps for the canvas paths. */
  images?: ImageSource;
  /** Original image bytes as data URIs, for the SVG path. */
  resolveImageDataUrls?: (shapes: readonly Shape[]) => Promise<ReadonlyMap<string, string>>;
}

export function ExportImageDialog({
  open,
  onClose,
  shapes,
  selectedShapes,
  boardName,
  darkTheme,
  theme,
  images,
  resolveImageDataUrls,
}: ExportImageDialogProps) {
  const fieldId = useId();
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
    // A frame's name is what the file should be called — naming frames is most
    // of why you would name one at all.
    const [only] = selectedShapes;
    const named = selectedShapes.length === 1 && only && isFrame(only) ? frameLabel(only) : null;
    setName(named ?? boardName);
    setSelectionOnly(selectedShapes.length > 0);
    setDark(darkTheme);
    setError(null);
  }, [open, boardName, darkTheme, selectedShapes]);

  /**
   * The one selected frame, when that is what "only selected" means.
   *
   * Selecting a frame and asking for the selection is already a request to
   * export that frame, so it needs no control of its own — and a frame is the
   * one shape whose own outline is scaffolding rather than artwork, which is
   * why it alone changes what the export covers.
   */
  const exportFrame = useMemo(() => {
    if (!selectionOnly || selectedShapes.length !== 1) return null;
    const [only] = selectedShapes;
    return only && isFrame(only) ? only : null;
  }, [selectionOnly, selectedShapes]);

  const exported = useMemo(() => {
    if (exportFrame) return shapesForFrameExport(exportFrame, shapes);
    return selectionOnly && hasSelection ? selectedShapes : shapes;
  }, [exportFrame, selectionOnly, hasSelection, selectedShapes, shapes]);

  // Cropped to the frame, so the file comes out the size the frame promised
  // however far its contents overhang.
  const region = useMemo(() => (exportFrame ? frameBounds(exportFrame) : undefined), [exportFrame]);

  const settings: ImageExportSettings = useMemo(
    () => ({
      scale,
      withBackground,
      dark,
      embedScene,
      // Resolved against this dialog's own toggle, not the editor's theme:
      // you can export a dark image from a light board, and the background
      // has to follow the checkbox rather than the screen.
      backgroundColor: canvasBackgroundFor(dark ? 'dark' : 'light'),
      region,
    }),
    [scale, withBackground, dark, embedScene, region],
  );

  const dimensions = useMemo(() => {
    // No length check: an export with a region has a size even when nothing is
    // standing in it — an empty frame is a blank image of the frame's size, not
    // nothing at all. Only a scene with neither shapes nor a region has no
    // area, and that is what `measureExportSize` refuses.
    try {
      return measureExportSize(exported, { scale, region });
    } catch {
      return null;
    }
  }, [exported, scale, region]);

  // The preview renders at 1×; only the reported dimensions follow the scale,
  // because a 3× preview would be three times the work for the same picture.
  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    try {
      const { canvas } = renderExportCanvas(exported, { ...settings, scale: 1 }, images);
      const url = canvas.toDataURL('image/png');
      if (!cancelled) setPreview(url);
    } catch {
      if (!cancelled) setPreview(null);
    }
    return () => {
      cancelled = true;
    };
  }, [open, exported, settings, images]);

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
        const { canvas } = renderExportCanvas(exported, settings, images);
        const png = await canvasToPngBlob(canvas);
        // Only the exported shapes go in, so opening the image gives back what
        // the image shows rather than a board that disagrees with it.
        const blob = settings.embedScene
          ? await embedSceneInPng(png, serializeBoardFile(exported))
          : png;
        const result = await saveFile({
          boardName: settings.embedScene ? `${name}.canvasflow` : name,
          data: blob,
          format: 'png',
        });
        if (result.status === 'saved') onClose();
      }),
    [exported, settings, name, onClose, run, images],
  );

  const exportSvg = useCallback(
    () =>
      run(async () => {
        // Bytes are fetched rather than taken from the decoded cache, so a
        // vector stays a vector in the exported file.
        const dataUrls = await resolveImageDataUrls?.(exported);
        const rendered = exportSvgString(exported, settings, dataUrls);
        const svg = settings.embedScene
          ? embedSceneInSvg(rendered, serializeBoardFile(exported))
          : rendered;
        const result = await saveFile({
          boardName: settings.embedScene ? `${name}.canvasflow` : name,
          data: svg,
          format: 'svg',
        });
        if (result.status === 'saved') onClose();
      }),
    [exported, settings, name, onClose, run, resolveImageDataUrls],
  );

  const copyPng = useCallback(
    () =>
      run(async () => {
        const { canvas } = renderExportCanvas(exported, settings, images);
        await copyPngToClipboard(await canvasToPngBlob(canvas));
        onClose();
      }),
    [exported, settings, onClose, run, images],
  );

  // Nothing to export is nothing to measure — see `dimensions`.
  const empty = dimensions === null;
  const titleId = useId();

  return (
    <SurfaceWindow
      open={open}
      theme={theme}
      onClose={onClose}
      width={820}
      labelledBy={titleId}
      data-testid="export-image-dialog"
    >
      <WindowHeader
        titleId={titleId}
        title={boardName}
        description={
          <span className="flex items-center gap-[5px]">
            <ImageDown className="size-[12px]" aria-hidden="true" />
            {empty
              ? 'Nothing on the canvas to export'
              : dimensions
                ? `${dimensions.width.toLocaleString('en-US')} × ${dimensions.height.toLocaleString('en-US')} px`
                : 'Export as an image'}
          </span>
        }
        lead={<WindowBadge tone="accent">{initialsOf(boardName)}</WindowBadge>}
        onClose={onClose}
      />

      {/* Two columns rather than one long scroll: the preview wants height and
          the settings want width. */}
      <WindowBody className="grid-cols-[minmax(0,1fr)_330px] gap-[22px]">
        <div
          className="flex min-h-[330px] items-center justify-center rounded-[12px] border border-[var(--surface-border)] bg-[repeating-conic-gradient(var(--surface-wash)_0%_25%,transparent_0%_50%)] bg-size-[14px_14px] p-[16px]"
          aria-live="polite"
        >
          {preview ? (
            <img
              src={preview}
              alt="Export preview"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-[11.5px] text-[var(--surface-fg-muted)]">
              {empty ? 'Nothing to preview' : 'Preparing preview…'}
            </span>
          )}
        </div>

        <div className="grid min-w-0 content-start gap-[4px]">
          <h3 className="text-[12px] font-semibold">File</h3>
          <div className="flex flex-col">
            <SettingLine title={<label htmlFor={`${fieldId}-name`}>Name</label>}>
              <input
                id={`${fieldId}-name`}
                type="text"
                value={name}
                spellCheck={false}
                onChange={(event) => setName(event.target.value)}
                className={cn(INPUT, 'w-[184px] shrink-0')}
              />
            </SettingLine>
            <SettingLine title="Scale" hint="Multiplies the exported size">
              <ScaleControl value={scale} onChange={setScale} />
            </SettingLine>
          </div>

          <h3 className="mt-[10px] text-[12px] font-semibold">What to include</h3>
          <div className="flex flex-col">
            <SettingLine
              title="Only the selection"
              hint={hasSelection ? 'Just the selected shapes' : 'Nothing is selected'}
              off={!hasSelection}
            >
              <Toggle
                label="Only the selection"
                on={selectionOnly && hasSelection}
                disabled={!hasSelection}
                onChange={setSelectionOnly}
              />
            </SettingLine>
            <SettingLine title="With background" hint="The board colour behind the shapes">
              <Toggle label="With background" on={withBackground} onChange={setWithBackground} />
            </SettingLine>
            <SettingLine title="Dark mode" hint="Export using the dark palette">
              <Toggle label="Dark mode" on={dark} onChange={setDark} />
            </SettingLine>
            <SettingLine title="Embed the scene" hint="The image opens again as a board">
              <Toggle label="Embed the scene" on={embedScene} onChange={setEmbedScene} />
            </SettingLine>
          </div>
        </div>
      </WindowBody>

      <WindowFooter status={error} danger>
        <WindowButton variant="ghost" onClick={onClose}>
          Cancel
        </WindowButton>
        <WindowButton onClick={copyPng} disabled={empty || busy}>
          <Copy aria-hidden="true" />
          Copy
        </WindowButton>
        <WindowButton onClick={exportSvg} disabled={empty || busy}>
          <FileCode2 aria-hidden="true" />
          SVG
        </WindowButton>
        <WindowButton variant="primary" onClick={exportPng} disabled={empty || busy}>
          <ImageDown aria-hidden="true" />
          PNG
        </WindowButton>
      </WindowFooter>
    </SurfaceWindow>
  );
}

/** A setting as one hairline row: its name and hint on the left, the control on the right. */
function SettingLine({
  title,
  hint,
  off = false,
  children,
}: {
  title: ReactNode;
  hint?: string;
  /** Dims the words for a setting that has nothing to act on. */
  off?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[50px] items-center gap-[14px] border-t border-[var(--surface-line)] py-[7px] first:border-t-0">
      <div className={cn('grid min-w-0 flex-1 gap-[2px]', off && 'opacity-55')}>
        <span className="text-[12.5px] font-medium">{title}</span>
        {hint && <span className="text-[11.5px] text-[var(--surface-fg-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * The scale as three segments rather than a menu: the choice is on show, and
 * one click away. The arrow keys move between them, as in any radio group.
 */
function ScaleControl({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Export scale"
      className="inline-flex shrink-0 rounded-[8px] bg-[var(--surface-wash)] p-[2px]"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const index = EXPORT_SCALES.indexOf(value as (typeof EXPORT_SCALES)[number]);
        const next =
          EXPORT_SCALES[
            Math.min(
              EXPORT_SCALES.length - 1,
              Math.max(0, index + (event.key === 'ArrowRight' ? 1 : -1)),
            )
          ];
        if (next === undefined) return;
        onChange(next);
        (
          event.currentTarget.querySelector(`[data-scale="${next}"]`) as HTMLElement | null
        )?.focus();
      }}
    >
      {EXPORT_SCALES.map((choice) => {
        const selected = choice === value;
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-scale={choice}
            onClick={() => onChange(choice)}
            className={cn(
              'h-[26px] min-w-[38px] rounded-[6px] px-[9px] text-[12px] font-medium tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]',
              selected
                ? 'bg-[var(--surface-thumb)] text-[var(--surface-fg)] shadow-[var(--surface-thumb-shadow)]'
                : 'text-[var(--surface-fg-muted)] hover:text-[var(--surface-fg)]',
            )}
          >
            {choice}×
          </button>
        );
      })}
    </div>
  );
}
