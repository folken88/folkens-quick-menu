/**
 * Which item updates change a command's code. A rename moves it (8.40: /ggp
 * to /gree) and so does identification (1.1: the real name replaces the
 * unidentified one). Quantity, uses and active flips never do, so they must
 * not trigger a rebuild. Pure, so it is testable in node.
 */
import { spellOut } from './AbbreviationGenerator.js';

export function itemChangeNeedsRebuild(changed) {
  if (!changed || typeof changed !== 'object') return false;
  return changed.name !== undefined
    || changed.system?.identified !== undefined
    || changed.system?.unidentified?.name !== undefined;
}

/**
 * What to say when a rename or identification gave an item a new command.
 * The code is remembered by name, so a renamed item is a new key: it is never
 * reported as moved, and Josh's /ggp became /gree in silence (8.40). Compare
 * the item's code before and after the rebuild instead. Null when there is
 * nothing new to say: the code did not change, the item has no code, or the
 * rebuild already said it.
 */
export function renameAnnouncement({ name, before, after, alreadySpoken } = {}) {
  if (!after || after === before || alreadySpoken) return null;
  return `${name} is now slash ${spellOut(after)}.`;
}
