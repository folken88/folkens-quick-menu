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

/** What an info entry announces: its name and its current count. */
export function menuLabelFor(entry) {
  return `${entry.label}, ${entry.quantity}`;
}

/** The entry for something in a box that cannot be used (read-only). */
export function infoEntry(item) {
  const itemId = item.id ?? item._id;
  const quantity = quantityOf(item.system);
  const entry = {
    id: `item_${itemId}`,
    label: item.name,
    type: 'info',
    actionType: 'item_info',
    itemId,
    quantity,
    originalItem: item,
  };
  entry.menuLabel = menuLabelFor(entry);
  return entry;
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
    if (first.menuLabel !== undefined) first.menuLabel = menuLabelFor(first);
  }
  return merged;
}

/**
 * What is inside a container. PF1 11.11 keeps a container's contents in
 * `item.items` (a collection of item documents, backed by `system.items`);
 * `system.contents`, which the menu read until 0.17.0, is null there, so no
 * container ever showed - Ser's Liar's Dice Set with its die and cup included.
 */
export function containerContents(item, actorItems = []) {
  let own = [];
  const col = item?.items;
  if (col) {
    if (Array.isArray(col.contents)) own = col.contents;
    else if (Array.isArray(col)) own = col;
    else if (typeof col[Symbol.iterator] === 'function') own = Array.from(col);
  }
  if (!own.length) {
    const raw = item?.system?.items;
    if (raw && typeof raw === 'object') own = Object.values(raw);
  }
  // PF1 master stores contents as ordinary actor items flagged with the box id.
  const flagged = (actorItems ?? []).filter(i => item?.id != null && i?.flags?.pf1?.container === item.id);
  const seen = new Set();
  const out = [];
  for (const i of [...own, ...flagged]) {
    const id = i?.id ?? i?._id;
    if (id != null) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(i);
  }
  return out;
}
