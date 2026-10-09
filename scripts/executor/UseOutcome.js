/**
 * Reading what PF1 actually did when we asked it to use something. Pure.
 *
 * The bug this exists for: PF1's use() does not throw when it refuses. Out of
 * charges, out of potions, out of ammo - it hands back a small number and shows
 * an on-screen notice. The module then went on to say "activated", "consumed",
 * "sent to chat" or "cast", so a blind player was told the opposite of what
 * happened. Josh, 2026-10-09: scrolls of Fog Cloud and Teleport with quantity 0
 * showed "You don't have any more of that item" and said "sent to chat".
 *
 * The numbers are PF1's own ActionUse status codes, read from pf1.js on f1.
 */

/** PF1 ActionUse refusal codes, and what to say for each. */
export const PF1_USE_REFUSALS = Object.freeze({
  1: 'No permission.',      // NO_ACTOR_PERM
  2: 'Disabled.',           // DISABLED
  3: 'None left.',          // INSUFFICIENT_QUANTITY
  4: 'No charges.',         // INSUFFICIENT_CHARGES
  5: 'No ammo.',            // MISSING_AMMO
  6: 'No ammo.',            // INSUFFICIENT_AMMO
  7: 'Not allowed.',        // DISALLOWED_ACTION_TYPE
});

/**
 * @param {*} result whatever item.use() resolved to
 * @returns {{ok: boolean, reason: string|null}}
 *
 * Only a known refusal code, or an explicit false (a hook cancelled the use),
 * counts as failure. Anything else - a chat message, an ActionUse, undefined -
 * is treated as success, because claiming a failure that did not happen would
 * be its own kind of wrong.
 */
export function useOutcome(result) {
  if (result === false) return { ok: false, reason: 'Cancelled.' };
  if (typeof result === 'number' && PF1_USE_REFUSALS[result]) {
    return { ok: false, reason: PF1_USE_REFUSALS[result] };
  }
  return { ok: true, reason: null };
}

/**
 * How many uses are left, after a successful use. Josh, 2026-10-09: the Rod of
 * Metamagic Quicken (3 a day) and the Guards of the Silent People (2 a day)
 * only said "sent to chat" - he wants "2 of 3 left".
 *
 * Read from the item AFTER the use, so it is the new number, not the old one.
 *
 * @returns {string} "2 of 3 left." / "4 left." / "" when there is nothing to count
 */
export function usesLeftLine(item) {
  const sys = item?.system ?? {};
  const uses = sys.uses ?? {};

  // Uses per day, week, or charges - a real limited resource.
  if (uses.per && Number.isFinite(uses.max) && uses.max > 0) {
    const left = Number.isFinite(uses.value) ? uses.value : 0;
    return `${left} of ${uses.max} left.`;
  }

  // Single-use physical things - potions, scrolls - are counted by quantity.
  const singleUse = item?.isSingleUse ?? (uses.per === 'single');
  if (singleUse && Number.isFinite(sys.quantity)) {
    return `${sys.quantity} left.`;
  }

  return '';
}
