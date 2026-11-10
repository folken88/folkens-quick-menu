/**
 * Shaping the Items menu. Pure, so both rules can be tested in node.
 *
 * Josh, 2026-11-01: the shop made a second stack of Potion of True Strike, so
 * the menu listed the potion twice and using the first said "That was the last
 * one." with three more in the other stack. Chat already merged the stacks
 * (AbbreviationResolver records the others as alternates, and the executor
 * picks the stack with stock and counts them all); the menu did not.
 */

/** A stack's quantity: 0 is 0, only a missing or non-numeric value is 1. */
export function quantityOf(system) {
  return Number.isFinite(Number(system?.quantity)) ? Number(system.quantity) : 1;
}

/**
 * One entry per name. The first entry keeps its place and gains the other
 * stacks' ids as `alternates` - the same field the chat resolver sets, so the
 * executor treats a menu use and a chat use alike - and its quantity is the
 * total.
 */
export function mergeStacks(entries) {
  const byName = new Map();
  const merged = [];
  for (const entry of entries ?? []) {
    const key = `${entry.actionType ?? ''}|${(entry.label ?? '').trim().toLowerCase()}`;
    // A charged item (a wand: uses.per set and not 'single') carries its own
    // charges, so two of them are two items, never one stack (10.3).
    const per = entry.uses?.per;
    const stackable = !per || per === 'single';
    const first = byName.get(key);
    if (!stackable || !first || !entry.itemId) {
      if (stackable) byName.set(key, entry);
      merged.push(entry);
      continue;
    }
    first.alternates = [...(first.alternates ?? []), entry.itemId];
    first.quantity = (Number(first.quantity) || 0) + (Number(entry.quantity) || 0);
  }
  return merged;
}

/**
 * What is inside a container. PF1 11.11 keeps a container's contents in
 * `item.items` (a collection of item documents, backed by `system.items`);
 * `system.contents`, which the menu read until 0.17.0, is null there, so no
 * container ever showed - Ser's Liar's Dice Set with its die and cup included.
 */
export function containerContents(item) {
  const col = item?.items;
  if (col) {
    if (Array.isArray(col.contents)) return col.contents;
    if (Array.isArray(col)) return col;
    if (typeof col[Symbol.iterator] === 'function') return Array.from(col);
  }
  const raw = item?.system?.items;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}
