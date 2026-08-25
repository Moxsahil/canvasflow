import { useEffect, useId, useState, type ReactNode } from 'react';
import { Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the thing being deleted, e.g. `Delete "Marketing"?`. */
  title: string;
  /** Inline content only — it renders inside the description paragraph. */
  description: ReactNode;
  /**
   * The exact text that has to be typed before the action unlocks. Omit for a
   * plain confirmation.
   *
   * Reserved for deletes that take more than the one thing named with them: a
   * workspace carries every board in it, and copying its name out is the
   * moment where you notice which workspace you are actually on.
   */
  confirmText?: string;
  confirmLabel: string;
  busy: boolean;
  /** The last refusal from the server, if there was one. */
  error: string | null;
  onConfirm: () => void;
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  container: HTMLElement | null;
}

/**
 * The last word before something is deleted.
 *
 * Built as the share, rename and manage dialogs are — a Card carried by a
 * dialog stripped to nothing, so the card itself is the surface — because all
 * of them open from the same sidebar and have to read as one application.
 *
 * The shell underneath is the alert dialog rather than the ordinary one, which
 * is what makes clicking the overlay *not* dismiss it: the difference is in the
 * behaviour, not in how it looks.
 *
 * It confirms rather than deletes: the caller does the work and keeps the
 * dialog open if the server refuses, so a failure is read here rather than
 * disappearing with the dialog that asked.
 */
export function DeleteWarningDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  confirmLabel,
  busy,
  error,
  onConfirm,
  container,
}: DeleteWarningDialogProps) {
  const fieldId = useId();
  const [typed, setTyped] = useState('');

  // Cleared on every open, so a name copied out for one workspace can't still
  // be sitting in the field when the dialog reopens on another.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  // Compared case-insensitively on trimmed text: this is a "did you read the
  // name" check, not a spelling test, and a name with a capital in an awkward
  // place shouldn't make the button unreachable.
  const confirmed =
    confirmText === undefined || typed.trim().toLowerCase() === confirmText.trim().toLowerCase();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange} container={container}>
      <AlertDialogContent className="w-[min(100%-2rem,32rem)] gap-0 rounded-none border-0 bg-transparent p-0 text-foreground shadow-none">
        <Card className="w-full">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-destructive-solid/12 text-destructive-solid">
                <TriangleAlert className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <AlertDialogTitle className="truncate text-lg font-semibold text-foreground">
                  {title}
                </AlertDialogTitle>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Trash2 size={14} />
                  This can’t be undone
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            <AlertDialogDescription className="max-w-none text-sm leading-relaxed text-muted-foreground">
              {description}
            </AlertDialogDescription>

            {confirmText !== undefined && (
              <div className="flex flex-col gap-4">
                <Label htmlFor={fieldId} className="font-medium">
                  Type <span className="font-semibold">{confirmText}</span> to confirm
                </Label>
                {/* No placeholder: it would be the name being asked for, in
                    grey, which reads as a field already filled in. */}
                <Input
                  id={fieldId}
                  value={typed}
                  autoComplete="off"
                  onChange={(event) => setTyped(event.target.value)}
                />
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              {/* Focus lands here when the dialog opens, which is the point of
                  the alert dialog: the button that discards is never the one
                  under the first keystroke. */}
              <AlertDialogCancel asChild>
                <Button type="button" variant="ghost" disabled={busy}>
                  Cancel
                </Button>
              </AlertDialogCancel>
              <Button
                type="button"
                // Radix would close the dialog for us here. The delete is a
                // round trip that can be refused, so closing is the caller's to
                // do once the server has actually agreed — which is why this
                // stays an ordinary button rather than AlertDialogAction.
                disabled={busy || !confirmed}
                loading={busy}
                leftIcon={<Trash2 aria-hidden="true" />}
                onClick={onConfirm}
                className="bg-destructive-solid text-white hover:bg-destructive-solid/90 focus-visible:ring-destructive-solid"
              >
                {busy ? 'Deleting…' : confirmLabel}
              </Button>
            </div>
          </CardContent>
        </Card>
      </AlertDialogContent>
    </AlertDialog>
  );
}
