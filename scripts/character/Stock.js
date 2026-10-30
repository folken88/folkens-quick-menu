/**
 * Counting what is left across the stacks of one thing. Pure.
 *
 * Josh, 2026-10-29: Ser has two Potion of Cure Light Wounds entries, one at 0
 * and one at 1, and two Phase Spider Jerky entries of 1 each. The command only
 * ever used the first entry, so /pclw said "None left." while she still had a
 * potion. Now a command tries the next stack with the same name, and the count
 * it reads back is the total.
 *
 * Also here: ammunition is read, never spent. The bow already takes an arrow
 * off for every shot, so /arro spending one as well counted each arrow twice.
 */

import { LAST_ONE } from '../executor/UseOutcome.js';

/**
 * How many uses this stack has, or null when it is not the kind of thing that
 * runs out (a wand with no charge data, a weapon).
 */
export function stockOf(item) {
  const sys = item?.system ?? {};
  const uses = sys.uses ?? {};
  const singleUse = item?.isSingleUse ?? (uses.per === 'single');
  if (singleUse) return Number.isFinite(sys.quantity) ? sys.quantity : null;
  if (uses.per && Number.isFinite(uses.max) && uses.max > 0) {
    return Number.isFinite(uses.value) ? uses.value : 0;
  }
  return null;
}

/**
 * The stack to use: the first one that still has something in it. When every
 * stack is empty the first is returned, so PF1 can refuse it and the refusal
 * is heard ("None left.").
 */
export function firstWithStock(items) {
  const list = (items ?? []).filter(Boolean);
  if (!list.length) return null;
  return list.find(item => { const n = stockOf(item); return n === null || n > 0; }) ?? list[0];
}

/** The total across stacks, or null if none of them is countable. */
export function totalStock(items) {
  let total = null;
  for (const item of (items ?? []).filter(Boolean)) {
    const n = stockOf(item);
    if (n === null) continue;
    total = (total ?? 0) + n;
  }
  return total;
}

/** What to say after using one of several same-name stacks. */
export function stockLine(items) {
  const total = totalStock(items);
  if (total === null) return '';
  return total <= 0 ? LAST_ONE : `${total} left.`;
}

function plural(word) {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** "21 arrows left." - reading ammunition without spending any. */
export function ammoReadLine(name, quantity) {
  const n = Number.isFinite(quantity) ? quantity : 0;
  const base = String(name || 'ammunition').trim().toLowerCase();
  return `${n} ${n === 1 ? base : plural(base)} left.`;
}
