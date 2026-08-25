import { useEffect, useState, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  /** Omit to get a single dismiss button — the shape an alert takes. */
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Paints the confirm button as a warning, for actions that discard work. */
  destructive?: boolean;
  onClose: () => void;
}

/**
 * The editor's question-and-answer modal: what tells you a link was copied, and
 * what asks before a file replaces the board.
 *
 * Built as the dialogs the sidebar opens are — a Card carried by a dialog
 * stripped to nothing, so the card itself is the surface — because the two sets
 * open over the same canvas and have to read as one application.
 *
 * Radix decides the behaviour: focus lands on the dismissing button, focus is
 * trapped, scrolling is locked, and clicking the overlay does *not* dismiss —
 * an alert dialog wants a deliberate answer, which is the right default for a
 * prompt that can discard a board.
 */
export function Dialog({
  open,
  title,
  children,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onClose,
}: DialogProps) {
  // Portalled into the editor root rather than <body>: every colour in the
  // dialog is a token declared on `.cf-editor`, and the dark theme is an
  // attribute on it. Resolved after mount, since the element doesn't exist
  // on the first render.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>('.cf-editor'));
  }, []);

  return (
    <AlertDialog
      open={open}
      container={container}
      onOpenChange={(next) => {
        // Radix reports Escape and programmatic closes through here; the only
        // close this component owns is "cancel".
        if (!next) onClose();
      }}
    >
      <AlertDialogContent className="w-[min(100%-2rem,32rem)] gap-0 rounded-none border-0 bg-transparent p-0 text-foreground shadow-none">
        <Card className="w-full">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              {/* Only the destructive prompt is badged, and it is the same
                  warning the delete dialog wears. An alert that only reports
                  something has nothing for an icon to add. */}
              {destructive && (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-destructive-solid/12 text-destructive-solid">
                  <TriangleAlert className="size-5" aria-hidden="true" />
                </span>
              )}
              <AlertDialogTitle className="min-w-0 flex-1 text-lg font-semibold text-foreground">
                {title}
              </AlertDialogTitle>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            <AlertDialogDescription className="max-w-none text-sm leading-relaxed text-muted-foreground">
              {children}
            </AlertDialogDescription>

            <div className="flex justify-end gap-2">
              {onConfirm ? (
                <>
                  {/* Closing is Radix's, through onOpenChange — which is also
                      how Escape and the confirm button get back here. */}
                  <AlertDialogCancel asChild>
                    <Button type="button" variant="ghost">
                      {cancelLabel}
                    </Button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button
                      type="button"
                      onClick={onConfirm}
                      className={cn(
                        destructive &&
                          'bg-destructive-solid text-white hover:bg-destructive-solid/90 focus-visible:ring-destructive-solid',
                      )}
                    >
                      {confirmLabel}
                    </Button>
                  </AlertDialogAction>
                </>
              ) : (
                // An alert has one button, and it dismisses — so it is the
                // cancel, which is also what Radix moves focus to on open.
                <AlertDialogCancel asChild>
                  <Button type="button">OK</Button>
                </AlertDialogCancel>
              )}
            </div>
          </CardContent>
        </Card>
      </AlertDialogContent>
    </AlertDialog>
  );
}
