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
import { resolveCanvasBackground } from '../properties/palette';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { initialsOf } from '@/lib/initials';
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
  canvasBackground,
  darkTheme,
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
      backgroundColor: resolveCanvasBackground(canvasBackground, dark ? 'dark' : 'light'),
      region,
    }),
    [scale, withBackground, dark, embedScene, canvasBackground, region],
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
          ? await embedSceneInPng(png, serializeBoardFile(exported, canvasBackground))
          : png;
        const result = await saveFile({
          boardName: settings.embedScene ? `${name}.canvasflow` : name,
          data: blob,
          format: 'png',
        });
        if (result.status === 'saved') onClose();
      }),
    [exported, settings, name, canvasBackground, onClose, run, images],
  );

  const exportSvg = useCallback(
    () =>
      run(async () => {
        // Bytes are fetched rather than taken from the decoded cache, so a
        // vector stays a vector in the exported file.
        const dataUrls = await resolveImageDataUrls?.(exported);
        const rendered = exportSvgString(exported, settings, dataUrls);
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
    [exported, settings, name, canvasBackground, onClose, run, resolveImageDataUrls],
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
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        container={portalContainer}
        showClose={false}
        aria-describedby={undefined}
        className="w-[min(100%-2rem,32rem)] border-0 bg-transparent p-0 shadow-none"
      >
        <DialogTitle className="sr-only">Export image</DialogTitle>

        <Card className="w-full max-w-lg">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary text-sm font-medium text-primary-foreground">
                    {initialsOf(boardName)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-lg font-semibold">{boardName}</CardTitle>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <ImageDown size={14} />
                  {empty
                    ? 'Nothing on the canvas to export'
                    : dimensions
                      ? `${dimensions.width} × ${dimensions.height} px`
                      : 'Export as an image'}
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <Label className="font-medium">Preview</Label>
              <div
                className="flex min-h-36 items-center justify-center rounded-ele border border-border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-size-[16px_16px] p-3"
                aria-live="polite"
              >
                {preview ? (
                  <img
                    src={preview}
                    alt="Export preview"
                    className="max-h-64 max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {empty ? 'Nothing to preview' : 'Preparing preview…'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <Label htmlFor={`${fieldId}-name`} className="font-medium">
                File
              </Label>
              {/* Name and scale on one row, as the share card pairs the link
                  with what the people joining by it may do. */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    id={`${fieldId}-name`}
                    value={name}
                    aria-label="File name"
                    className="h-9"
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div>
                  <Select value={String(scale)} onValueChange={(value) => setScale(Number(value))}>
                    <SelectTrigger className="h-9 text-xs" aria-label="Export scale">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent container={portalContainer}>
                      {EXPORT_SCALES.map((choice) => (
                        <SelectItem key={choice} value={String(choice)}>
                          {choice}×
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <ExportOption
                  label="Only the selection"
                  checked={selectionOnly && hasSelection}
                  disabled={!hasSelection}
                  onChange={setSelectionOnly}
                />
                <ExportOption
                  label="With background"
                  checked={withBackground}
                  onChange={setWithBackground}
                />
                <ExportOption label="Dark mode" checked={dark} onChange={setDark} />
                <ExportOption
                  label="Embed the scene, so the image opens as a board"
                  checked={embedScene}
                  onChange={setEmbedScene}
                />
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-9" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={copyPng}
                disabled={empty || busy}
              >
                <Copy size={14} />
                Copy to clipboard
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={exportSvg}
                disabled={empty || busy}
              >
                <FileCode2 size={14} />
                SVG
              </Button>
              <Button size="sm" className="h-9" onClick={exportPng} disabled={empty || busy}>
                <ImageDown size={14} />
                PNG
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

/** One of the export's booleans, in the share card's checkbox idiom. */
function ExportOption({
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
    <label
      className={cn(
        'flex items-center gap-2 text-xs text-muted-foreground',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-primary"
      />
      {label}
    </label>
  );
}
