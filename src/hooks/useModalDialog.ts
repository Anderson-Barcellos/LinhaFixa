import { useEffect, useLayoutEffect, useRef } from 'react';

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useModalDialog(options: {
  open: boolean;
  onEscape?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onEscapeRef = useRef(options.onEscape);
  useLayoutEffect(() => {
    onEscapeRef.current = options.onEscape;
  }, [options.onEscape]);

  useEffect(() => {
    if (!options.open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter(element => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
    (focusable()[0] ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [options.open]);

  return dialogRef;
}
