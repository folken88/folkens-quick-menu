/**
 * The word after an item's command: /pcmw o uses the potion for someone else.
 * Anything else is refused aloud and nothing is used (10.26, 10.11).
 */
const TAKES_OTHER = new Set(['item', 'item_consume', 'item_activate', 'spell']);

/**
 * @param {string|undefined} args what followed the command
 * @param {string} actionType the resolved action's type
 * @param {string} [label] the action's name, for the refusal
 * @returns {{mode: 'self'|'other'} | {mode: 'invalid', reason: string}}
 */
export function parseItemArgs(args, actionType, label = '') {
  const word = String(args ?? '').trim();
  if (!word) return { mode: 'self' };
  if (!TAKES_OTHER.has(actionType)) {
    return { mode: 'invalid', reason: `${label} takes no options.` };
  }
  const lower = word.toLowerCase();
  if (lower === 'o' || lower === 'other') return { mode: 'other' };
  return { mode: 'invalid', reason: `${word}? Not an option. Say o for someone else.` };
}
