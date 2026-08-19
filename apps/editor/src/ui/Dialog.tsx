import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
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
 * The editor's question-and-answer modal, wrapping the animated alert dialog
 * in components/ui so call sites stay a single element.
 *
 * Radix decides the behaviour here: focus lands on Cancel, focus is trapped,
 * scrolling is locked, and clicking the overlay does *not* dismiss — an alert
 * dialog wants a deliberate answer, which is the right default for a prompt
 * that can discard a board.
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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{children}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {onConfirm && <AlertDialogCancel onClick={onClose}>{cancelLabel}</AlertDialogCancel>}
          <AlertDialogAction destructive={destructive} onClick={onConfirm ?? onClose}>
            {onConfirm ? confirmLabel : 'OK'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
