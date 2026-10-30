/**
 * Marks the page while focus is being moved from the keyboard.
 *
 * The browser's own :focus-visible also fires when a menu hands focus back to
 * its trigger or a dialog focuses its first button, so a mouse user saw rings
 * they had done nothing to earn. global.css hides the ring unless this is set.
 */
const FOCUS_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

window.addEventListener(
  'keydown',
  (event) => {
    if (FOCUS_KEYS.has(event.key)) document.documentElement.dataset.input = 'keyboard';
  },
  true,
);
const clear = () => {
  delete document.documentElement.dataset.input;
};
window.addEventListener('pointerdown', clear, true);
// Coming back to the window refocuses the last control, which is not the
// keyboard moving focus either.
window.addEventListener('blur', clear);
