/**
 * Shaping the Items menu. Pure, so both rules can be tested in node.
 *
 * Josh, 2026-11-01: the shop made a second stack of Potion of True Strike, so
 * the menu listed the potion twice and using the first said "That was the last
 * one." with three more in the other stack. Chat already merged the stacks
 * (AbbreviationResolver records the others as alternates, and the executor
 * picks the stack with stock and counts them all); the menu did not.
 */

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
    const first = byName.get(key);
    if (!first || !entry.itemId) { byName.set(key, entry); merged.push(entry); continue; }
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
