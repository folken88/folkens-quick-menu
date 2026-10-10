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

  // PF1 11.11 hands the refusal back wrapped: { err, code: 3 }. Found live on
  // f1, 2026-10-10 - B-Dang at quantity 0 posted no card and returned exactly
  // that, and 0.15.0, which only knew the bare number, called it a success.
  // Both forms are accepted.
  const code = typeof result === 'number' ? result
    : (result && typeof result === 'object' && typeof result.code === 'number' && 'err' in result) ? result.code
    : null;
  if (code !== null && PF1_USE_REFUSALS[code]) {
    return { ok: false, reason: PF1_USE_REFUSALS[code] };
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

  // Single-use physical things - potions, scrolls - are counted by quantity.
  // Checked first: PF1 gives them uses { per: 'single', max: 1 } as well, and
  // read as a per-day item that came out "0 of 1 left." for a stack of 143
  // (found live on f1, 2026-10-10).
  const singleUse = item?.isSingleUse ?? (uses.per === 'single');
  if (singleUse) {
    return Number.isFinite(sys.quantity) ? `${sys.quantity} left.` : '';
  }

  // Uses per day, week, or charges - a real limited resource.
  if (uses.per && Number.isFinite(uses.max) && uses.max > 0) {
    const left = Number.isFinite(uses.value) ? uses.value : 0;
    return `${left} of ${uses.max} left.`;
  }

  return '';
}
