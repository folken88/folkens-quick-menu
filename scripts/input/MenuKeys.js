/**
 * Which keystrokes the open Quick Menu is entitled to consume. Pure, so the
 * rule can be tested in node - this is the exact logic that made the menu look
 * dead to Josh, so it should not live only inside an event handler.
 */

/** Every key the open menu responds to. Kept in step with handleMenuKeydown. */
export const MENU_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown',
  'Enter', 'NumpadEnter', 'Escape', 'Backspace',
  'KeyF', 'KeyP', 'KeyU', 'KeyR', 'Slash',
  'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
  'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4',
  'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
]);

/**
 * True only when the menu both uses this key and no modifier is held.
 *
 * 0.9.0 instead swallowed every unmodified key and passed Ctrl/Alt/Cmd through,
 * reasoning that a screen reader drives on Ctrl+Option. Josh, 2026-10-07:
 * VoiceOver's modifier is configurable - his is Caps Lock, because Pro Tools has
 * claimed Ctrl+Option - so there is no chord we can reliably hand back.
 *
 * Claiming only what we use needs no guess about anyone's setup, and it stops
 * the menu eating Tab, letters, function keys and anything else the browser,
 * Foundry or an assistive tool has bound.
 *
 * The one case this cannot solve: if a screen reader passes a plain arrow key
 * through to the page as part of its own chord, it is indistinguishable from the
 * player pressing that arrow. Nothing in the page can tell those apart.
 */
export function menuClaimsKey(event) {
  if (!event) return false;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  return MENU_KEYS.has(event.code);
}
