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

/**
 * Is this keydown the very same event we just handled?
 *
 * Josh's key log, 2026-10-07: the first backtick after VoiceOver moves focus
 * arrives in the page as TWO keydown events - identical event.timeStamp to the
 * millisecond, both isTrusted, neither a repeat. While the activation key was a
 * toggle, that opened the menu and immediately closed it again, and every arrow
 * afterwards went to a closed menu. That is the whole bug.
 *
 * Making each key do one job is the real fix, so a double press is harmless.
 * This guard is the belt to that braces, and it needs no guessed time window:
 * it matches on the exact same timeStamp, so it can only ever suppress a literal
 * duplicate of the event we just serviced. A genuine second press, however fast,
 * carries a different timeStamp.
 */
export function isDuplicateKeydown(last, event) {
  if (!last || !event) return false;
  if (last.code !== event.code) return false;
  return typeof last.timeStamp === 'number'
    && typeof event.timeStamp === 'number'
    && last.timeStamp === event.timeStamp;
}

/**
 * Stopping speech, the way screen readers do it.
 *
 * Josh, 2026-10-09, asked for a key that cuts the voice off. Two ways in:
 *
 *  - Control pressed and released on its own. That is the convention JAWS,
 *    NVDA and VoiceOver all share, and it works from inside the chat box,
 *    where every other single key is a letter he is typing. It acts on the
 *    release, and only if no other key went down in between, so Ctrl+C, Ctrl+V
 *    and every other chord are left alone.
 *
 *  - S, as in the Poker Dungeon - but only when he is not typing, and only
 *    while the voice is talking or has just stopped. S is also Foundry's
 *    "pan down", and with a token selected it MOVES the token. The grace
 *    window is there so an S pressed just as a sentence ends stops nothing,
 *    rather than walking his character a square without telling him.
 */
export const STOP_GRACE_MS = 1500;

/** Track a lone Control press. Returns the new state and whether to stop now. */
export function loneControl(state, event) {
  const isCtrl = event?.key === 'Control' || event?.code === 'ControlLeft' || event?.code === 'ControlRight';
  if (event?.type === 'keydown') {
    if (isCtrl && !event.repeat && !event.altKey && !event.metaKey && !event.shiftKey) return { armed: true, stop: false };
    if (isCtrl && event.repeat) return { armed: !!state?.armed, stop: false };
    return { armed: false, stop: false };
  }
  if (event?.type === 'keyup' && isCtrl) return { armed: false, stop: !!state?.armed };
  return { armed: !!state?.armed, stop: false };
}

/** Should this keydown be taken as "stop talking"? */
export function isStopSpeechKey(event, { typing = false, speaking = false, msSinceSpeech = Infinity } = {}) {
  if (!event || event.code !== 'KeyS') return false;
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  if (typing) return false;
  return speaking || msSinceSpeech < STOP_GRACE_MS;
}
