import { useCallback, useEffect, useId, useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { initialsOf } from '@/lib/initials';
import { SurfaceDialog, useSurfacePortal } from '../ui/SurfaceDialog';
import {
  SURFACE_INPUT_CLASS,
  SurfaceButton,
  SurfaceCard,
  SurfaceGroupLabel,
  SurfaceHint,
  SurfaceRow,
  SurfaceRowText,
  SurfaceToggle,
} from '../ui/surface-ui';
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
  /** The scale menu still portals; its colours come from `.cf-editor`. */
  portalContainer: HTMLElement | null;
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
  portalContainer,
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
        const { canvas, darkApplied } = renderExportCanvas(exported, settings, images);
        if (settings.dark && !darkApplied) {
          throw new Error("This browser can't render a dark export.");
        }
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

  return (
    <SurfaceDialog
      open={open}
      theme={theme}
      title={boardName}
      subtitle={
        <span className="flex items-center gap-[5px]">
          <ImageDown size={12} aria-hidden="true" />
          {empty
            ? 'Nothing on the canvas to export'
            : dimensions
              ? `${dimensions.width} × ${dimensions.height} px`
              : 'Export as an image'}
        </span>
      }
      leading={
        <span className="flex size-[42px] items-center justify-center rounded-full bg-[var(--surface-accent)] text-[13px] font-medium text-[var(--surface-on-accent)]">
          {initialsOf(boardName)}
        </span>
      }
      width={820}
      onClose={onClose}
      footer={
        <>
          <div className="flex-1" />
          <SurfaceButton variant="ghost" onClick={onClose}>
            Cancel
          </SurfaceButton>
          <SurfaceButton onClick={copyPng} disabled={empty || busy}>
            <Copy size={13} />
            Copy
          </SurfaceButton>
          <SurfaceButton onClick={exportSvg} disabled={empty || busy}>
            <FileCode2 size={13} />
            SVG
          </SurfaceButton>
          <SurfaceButton variant="primary" onClick={exportPng} disabled={empty || busy}>
            <ImageDown size={13} />
            PNG
          </SurfaceButton>
        </>
      }
    >
      {/* Two columns rather than one long scroll: the preview wants height and
          the settings want width, and stacking them made a dialog you had to
          scroll to find the export buttons in. */}
      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-[18px]">
        <div className="flex min-w-0 flex-col gap-[8px]">
          <SurfaceGroupLabel>Preview</SurfaceGroupLabel>
          <div
            className="flex min-h-[300px] flex-1 items-center justify-center rounded-[12px] border border-[var(--surface-border)] bg-[repeating-conic-gradient(var(--surface-raised)_0%_25%,transparent_0%_50%)] bg-size-[14px_14px] p-[10px]"
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
        </div>

        <div className="flex min-w-0 flex-col gap-[8px]">
          <SurfaceGroupLabel>File</SurfaceGroupLabel>
          <SurfaceCard>
            <SurfaceRow>
              <SurfaceRowText title="Name" />
              <input
                id={`${fieldId}-name`}
                type="text"
                value={name}
                aria-label="File name"
                onChange={(event) => setName(event.target.value)}
                className={cn(SURFACE_INPUT_CLASS, 'w-[184px] shrink-0')}
              />
            </SurfaceRow>
            <SurfaceRow>
              <SurfaceRowText title="Scale" hint="Multiplies the exported size" />
              <ScaleField value={scale} onChange={setScale} fallbackContainer={portalContainer} />
            </SurfaceRow>
          </SurfaceCard>

          <SurfaceGroupLabel>What to include</SurfaceGroupLabel>
          <SurfaceCard>
            <SurfaceRow>
              <SurfaceRowText
                title="Only the selection"
                hint={hasSelection ? 'Just the selected shapes' : 'Nothing is selected'}
              />
              <SurfaceToggle
                label="Only the selection"
                on={selectionOnly && hasSelection}
                onChange={(next) => hasSelection && setSelectionOnly(next)}
              />
            </SurfaceRow>
            <SurfaceRow>
              <SurfaceRowText title="With background" hint="The board colour behind the shapes" />
              <SurfaceToggle
                label="With background"
                on={withBackground}
                onChange={setWithBackground}
              />
            </SurfaceRow>
            <SurfaceRow>
              <SurfaceRowText title="Dark mode" hint="Export using the dark palette" />
              <SurfaceToggle label="Dark mode" on={dark} onChange={setDark} />
            </SurfaceRow>
            <SurfaceRow>
              <SurfaceRowText title="Embed the scene" hint="The image opens again as a board" />
              <SurfaceToggle label="Embed the scene" on={embedScene} onChange={setEmbedScene} />
            </SurfaceRow>
          </SurfaceCard>

          {error && <SurfaceHint tone="danger">{error}</SurfaceHint>}
        </div>
      </div>
    </SurfaceDialog>
  );
}

/**
 * The scale menu, as its own component so `useSurfacePortal` runs *inside* the
 * dialog. Read from the dialog's own level it would answer null, and the menu
 * would open on <body> beneath the overlay — visible to the DOM, invisible to
 * whoever clicked it.
 */
function ScaleField({
  value,
  onChange,
  fallbackContainer,
}: {
  value: number;
  onChange: (next: number) => void;
  fallbackContainer: HTMLElement | null;
}) {
  const surfacePortal = useSurfacePortal();
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger className="h-[34px] w-[92px] text-xs" aria-label="Export scale">
        <SelectValue />
      </SelectTrigger>
      <SelectContent container={surfacePortal ?? fallbackContainer}>
        {EXPORT_SCALES.map((choice) => (
          <SelectItem key={choice} value={String(choice)}>
            {choice}×
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
